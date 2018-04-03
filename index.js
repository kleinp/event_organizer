var fs = require('fs');
var decomment = require('decomment');
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http, { wsEngine: 'ws' });
var bcrypt = require('bcrypt');

// Serve the html folder
app.use(express.static('html'));

/****************************************/

// load configuration files into memory
var settings = JSON.parse(decomment(fs.readFileSync('json/settings.json', 'utf8')));
var teams = JSON.parse(decomment(fs.readFileSync('json/teams.json', 'utf8')));
var roles = JSON.parse(decomment(fs.readFileSync('json/roles.json', 'utf8')));
var categories_db = JSON.parse(decomment(fs.readFileSync('json/categories.json', 'utf8')));

// console.log(settings);
// console.log(teams);
// console.log(roles);
// console.log(categories);

// these variables are generated on startup, or loaded separately
var passwords = {};
var pw_hashes = {};
var db = {};

// load 'database' into memory or create new one
var create_new_db = true;
if (fs.existsSync('json/db.json')) {
  db = JSON.parse(decomment(fs.readFileSync('json/db.json', 'utf8')));
  create_new_db = false;
}

if (create_new_db) {
  console.log('generating db');
  var num_teams = teams.length;
  // for all teams
  for (var t = 0; t < num_teams; t++) {

    // generate a list of categories, with default state and a blank events array
    var ctgs = {};
    var categories = Object.keys(categories_db);
    categories.forEach(category => {
      var tmp = {
        "state": Object.keys(categories_db[category]['states'])[0],
        "events": []
      }
      ctgs[category] = tmp;
    });

    // also set team name, school and any notes
    db[teams[t]['number']] = {
      "name": teams[t]['name'],
      "school": teams[t]['school'],
      "notes": teams[t]['notes'],
      "categories": ctgs
    };
  }

  // console.log(db);
}

// load/generate passwords
if (settings['generate passwords']) {
  console.log('Settings file requests new passwords be generated');
  generate_passwords();
} else {
  if (fs.existsSync('json/passwords.json')) {
    console.log('Loading existing passwords file');
    passwords = JSON.parse(decomment(fs.readFileSync('json/passwords.json', 'utf8')));
    generate_password_hashes();
    console.log('Admin password: ', passwords['Admin']);
  } else {
    console.log('No passwords file found, generating one');
    generate_passwords();
  }
}

// socket connection to web interface
io.on('connection', function (socket) {

  // on connection, send the current db and list of roles
  console.log('a user connected');

  // log disconnects
  socket.on('disconnect', function () {
    console.log('user disconnected');
  });

  // password check
  // emit event to that browser if ok or bad
  // see https://socket.io/docs/client-api/#socket-emit-eventname-args-ack
  socket.on('pw check', (role, pw, response) => {
    if (bcrypt.compareSync(pw, pw_hashes[role])) {
      response(roles[role]['permissions']);
    }
  });

  // push roles
  socket.on('get roles', (response) => {
    response(roles);
  });

  // push categories
  socket.on('get categories', (response) => {
    response(categories);
  });

  // push database
  socket.on('get db', (response) => {
    response([db, categories_db]);
  });

  // update to 'database'
  // event contains {timestamp, username, text}

  socket.on('add team event', (user, team, category, new_state, event_text) => {

    console.log(user, team, category, new_state, event_text);
    var now = Date.now();

    // if event text is given, add it to the database prior to state change
    if (event_text) {
      var new_event =
        {
          "ts": now,
          "user": user,
          "text": event_text
        };

      // add event to list
      db[team]['categories'][category]['events'].unshift(new_event);
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
      db[team]['categories'][category]['events'].unshift(new_event);
      // emit event to all connected browsers with new event data
      io.emit('new team event', team, category, new_state, new_event);
    }

    // console.log(JSON.stringify(db));

  });
});

// Start up the server and listen on port
http.listen(3000, function () {
  console.log('listening on *:3000');
});

// Generates new passwords and saves them to JSON file
function generate_passwords() {
  fs.open('json/passwords.json', 'w', (err, fd) => {
    
    if (err) {
      console.log('Error opening passwords.json for writing');
      return;
    }

    console.log('Generating passwords for roles');
    passwords = {};

    // load dictionary of password words
    var pw_dict = JSON.parse(decomment(fs.readFileSync('json/pwdict.json', 'utf8')));
    var keys = Object.keys(roles);
    var num_roles = keys.length;

    for (var i = 0; i < num_roles; i++) {
      var pw_plain = pw_dict[Math.round(Math.random() * 100)] + ' ' + Math.round(Math.random() * 50);
      passwords[keys[i]] = pw_plain;
    }

    fs.writeSync(fd, JSON.stringify(passwords));
    fs.closeSync(fd);

    generate_password_hashes();
    console.log('Admin password: ', passwords['Admin']);
  });
}

function generate_password_hashes() {

  var keys = Object.keys(roles);
  var num_roles = keys.length;

  for (var i = 0; i < num_roles; i++) {
    var pw_hash = bcrypt.hashSync(passwords[keys[i]], 10);
    pw_hashes[keys[i]] = pw_hash;
  }
}