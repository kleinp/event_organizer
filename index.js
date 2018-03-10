var fs = require('fs');
var decomment = require('decomment');
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var bcrypt = require('bcrypt');

// Serve the html folder
app.use(express.static('html'));

/****************************************/

// load settings file into memory
var settings = JSON.parse(decomment(fs.readFileSync('settings.json', 'utf8')));
var teams = JSON.parse(decomment(fs.readFileSync('teams.json', 'utf8')));

// load 'database' into memory or create new one
var create_new_db = true;
var db = {};
if (fs.existsSync('db.json')) {
  db = fs.readFileSync('db.json', 'utf8');
  create_new_db = false;
}

if (create_new_db) {
  console.log('generating db');
  var num_teams = teams.length;
  var num_categories = settings['categories'].length;
  // for all teams
  for (var t = 0; t < num_teams; t++) {

    // generate a list of categories, with default state and a blank events array
    var categories = {};
    for (var c = 0; c < num_categories; c++) {
      var category = {
        "state": settings['categories'][c]['states'][0],
        "events": []
      }
      categories[settings['categories'][c]['name']] = category;
    }

    // also set team name, school and any notes
    db[teams[t]['number']] = {
      "name": teams[t]['name'],
      "school": teams[t]['school'],
      "notes": teams[t]['notes'],
      "categories": categories
    };
  }
}

// generate passwords for all roles and write to file. Save hashes for comparison
var passwords = {};
fs.open(settings['misc']['role password file'], 'w', (err, fd) => {
  if (err) {
    console.log('Error generating passwords');
    return;
  }

  console.log('Generating passwords for roles');

  // load dictionary of password words
  var pw_dict = JSON.parse(decomment(fs.readFileSync('pwdict.json', 'utf8')));
  var num_roles = settings['roles'].length;

  for (var i = 0; i < num_roles; i++) {
    var pw_plain = pw_dict[Math.round(Math.random() * 100)] + '_' + Math.round(Math.random() * 50);
    var pw_hash = bcrypt.hashSync(pw_plain[i], 10);
    fs.writeSync(fd, '------------------------------------------------------\n');
    fs.writeSync(fd, settings['roles'][i]['name'] + ': ' + pw_plain + '\n');
    passwords[settings['roles'][i]['name']] = pw_hash;
  }
  fs.writeSync(fd, '------------------------------------------------------\n');
  fs.closeSync(fd);
});

// socket connection to web interface
io.on('connection', function (socket) {

  // on connection, send the current db and list of roles
  console.log('a user connected');
  socket.emit('db', db);
  socket.emit('roles', settings['roles']);

  // log disconnects
  socket.on('disconnect', function () {
    console.log('user disconnected');
  });

  // password check
  // emit event to that browser if ok or bad
  // see https://socket.io/docs/client-api/#socket-emit-eventname-args-ack
  socket.on('pw check', (username, pw, response) => {
    response(bcrypt.compareSync(pw, passwords[username]));
  });

  // update to 'database'
  // event contains {timestamp, username, text}
  socket.on('add team event', (user, team, category, new_state, event_text) => {

    var now = new Date();

    // if event text is given, add it to the database prior to state change
    if (event_text) {
      var new_event =
        {
          "ts": now,
          "user": user,
          "text": event_text
        };

      // add event to list
      db[team]['categories'][category]['events'].push(new_event);
      // emit event to all connected browsers with new event data
      io.emit('new team event', team, category, null, new_event);
    }

    // if state is changed, update state field and add event that state has changed
    if (new_state) {
      // change state
      db[team]['categories'][category]['state'] = new_state;
      var new_event =
        {
          "ts": now,
          "user": user,
          "text": "State changed to " + new_state
        };

      // add event to list
      db[team]['categories'][category]['events'].push(new_event);
      // emit event to all connected browsers with new event data
      io.emit('new team event', team, category, new_state, new_event);
    }

    console.log(JSON.stringify(db));

  });
});

// Start up the server and listen on port
http.listen(3000, function () {
  console.log('listening on *:3000');
});