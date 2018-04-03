$(document).on('pagecreate', '#overview', (event) => {

    var sock = io();
    var live_db = {};
    var categories_db = {};
    var current_team = null;
    var current_category = null;

    // read username cookie
    var user_info = Cookies.getJSON('user_info');

    // if the user doesn't have the user info cookie, kick them
    // back to login page
    // if (user_info == undefined) {
    //     window.location.href = 'index.html';
    // }

    $('#user_display').html('<strong>User:</strong> ' + user_info['user_name']);
    $('#role_display').html('<strong>Role:</strong> ' + user_info['user_role']);

    // Handle log out button
    $('#log_out').on('click', () => {
        Cookies.remove('user_info');
        window.location.href = 'index.html';
    });

    // request intial DB to generate table
    sock.emit('get db', (db) => {

        live_db = db[0];
        categories_db = db[1];
        var teams = Object.keys(live_db);

        var html = '';

        // generate header row
        html += '<tr><th>Team #</th>';
        var categories = Object.keys(categories_db);
        categories.forEach(category => {
            html += '<th>' + category + '</th>';
        });
        html += '/<tr>';

        // generate team rows
        teams.forEach(team => {
            html += '<tr id="team_' + team + '">';
            html += generate_team_row(team);
            html += '</tr>';
        });

        // set html of table
        $('#summary_table').html(html);

    });

    function generate_team_row(team) {

        var html = '';
        var categories = Object.keys(categories_db);
        var allGreen = true;
        categories.forEach(category => {
            var categoryColor = categories_db[category]['states'][live_db[team]['categories'][category]['state']];
            if (categoryColor != 'green') {
                allGreen = false;
            }
            html += '<td class="' + categoryColor + '_table">' + live_db[team]['categories'][category]['state'] + '</td>';
        });

        // add the team number, make green if all other columns are green
        if (allGreen) {
            html = '<th class="green_table">' + team + '</th>' + html;
        } else {
            html = '<th>' + team + '</th>' + html;
        }

        return (html);
    }

    // attach click handler for each row
    $(document).on('click', '#summary_table tr', function () {
        var team = $(this).attr('id').split('_')[1];
        current_team = team;
        prepare_team_details_page();
        $(':mobile-pagecontainer').pagecontainer('change', '#team_page', { transition: 'slide' });
    });

    // handle new events
    sock.on('new team event', (team, category, new_state, new_event) => {
        console.log('[new event]', team, category, new_state, new_event);

        // update the local database
        // update state if not null
        if (new_state) {
            live_db[team]['categories'][category]['state'] = new_state;
        }
        // there is always a new event
        live_db[team]['categories'][category]['events'].unshift(new_event);

        // generate event line
        html = generate_event_line(new_event);

        console.log('#state_' + team + '_' + category.replace(' ', '_'));

        $('#events_' + team + '_' + category.replace(' ', '_')).prepend(html);
        $('#state_' + team + '_' + category.replace(' ', '_')).html('<strong>State: </strong>' + new_state);
        $('#team_' + team).html(generate_team_row(team));
    });

    // prepare team detail page
    function prepare_team_details_page() {
        var t = current_team;
        // header
        $('#team_number').html('Team ' + t);
        // body
        var html = '<ul data-role="listview" class="ui-listview">';
        // box with team name, school, general notes
        html += '<li class="ui-li-static ui-body-inherit">';
        html += '<h3>Information</h3>';
        html += '<p><strong>Team name: </strong>' + live_db[t]['name'] + '</p>';
        html += '<p><strong>School: </strong>' + live_db[t]['school'] + '</p>';
        html += '<p><strong>Notes: </strong>' + live_db[t]['notes'] + '</p>';
        html += '</li>';
        // boxes for each category

        var categories = Object.keys(categories_db);
        categories.forEach(category => {
            var c = category.replace(' ', '_');
            html += '<li class="ui-li-static ui-body-inherit">';
            html += '<h3>' + category + '</h3>';
            // Only incude a button if the user has permission to change this field
            if (parseInt(user_info.user_permission, 2) & parseInt(categories_db[category]['permission'], 2)) {
                html += '<button id="cat_' + c + '" class="ui-btn ui-btn-right ui-shadow ui-corner-all ui-btn-inline ui-mini" id="test">Update</button>';
            }
            html += '<p id="state_' + t + '_' + c + '">';
            html += '<strong>State: </strong>' + live_db[t]['categories'][category]['state'] + '</p>';
            html += '<p><strong>Events: </strong></p>'; 22
            html += '<div id="events_' + t + '_' + c + '" class="wrapped">'
            var events = live_db[t]['categories'][category]['events'];
            events.forEach(event => {
                html += generate_event_line(event);
            });
            html += '</div></li>';
        });

        html += '</ul>';

        $('#team_details').html(html);
    }

    function generate_event_line(event) {
        html = '';
        html += '<p>';
        var ts = new Date(event['ts']);
        html += '<strong>' + ts.toLocaleTimeString('en-US', { hour12: false }) + ' (' + event['user'] + '): </strong>';
        html += event['text'];
        html += '</p>';
        return (html);
    }

    $(document).on('click', '[id^=cat_]', function () {
        current_category = $(this).attr('id').slice(4).replace('_', ' ');
        prepare_category_details_page();
        $(':mobile-pagecontainer').pagecontainer('change', '#category_page', { transition: 'slide' });
        $('#state_select').selectmenu('refresh');
    });

    function prepare_category_details_page() {

        var c = current_category;
        var t = current_team;

        // header
        $('#team_number_category').html('Team ' + t);
        $('#category_header').html(c);

        // clear form
        $('#event_text').val('');
        $('#state_select').html('');

        var states = Object.keys(categories_db[c]['states']);
        for (var i = 0; i < states.length; i++) {
            $('#state_select').append('<option value="' + states[i] + '">' + states[i] + '</option>')
        }
        $('#state_select').val(live_db[t]['categories'][c]['state']);
    }

    $('#update_category').on('click', () => {

        var new_state = null;
        var state = $('#state_select').val();
        var comments = $('#event_text').val();

        // check if state changed
        if (live_db[current_team]['categories'][current_category]['state'] != state) {
            new_state = state;
        }

        console.log(new_state, comments);

        sock.emit('add team event',
            user_info['user_name'],
            current_team,
            current_category,
            new_state,
            comments);

        $(':mobile-pagecontainer').pagecontainer('change', '#team_page', { transition: 'slide', reverse: true });
    });



});