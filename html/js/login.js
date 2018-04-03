$(document).on('pagecreate', () => {

    var sock = io();

    sock.emit('get roles', (response) => {
        Object.keys(response).forEach(role => {
            $('#roles').append('<option value="' + role + '">' + role + '</option>');
        });
        $('#roles').selectmenu('refresh');
    });

    $('#submit').on('click', () => {

        var role = $('#roles').val();
        var name = $('#name').val();
        var pw = $('#pw').val();

        if (name.length < 2) {
            $('#name').val('');
            return;
        }

        sock.emit('pw check', role, pw, (response) => {
            if (response) {
                // if password correct, save cookie and go to main page
                $('#notify').html('Valid!');
                Cookies.set('user_info', {
                    user_name: name,
                    user_role: role,
                    user_permission: response,
                    user_pw: pw
                }, { expires: 1});
                window.location.href = 'main.html';
                return false;
            } else {
                // notify user password was incorrect
                $('#notify').html('Incorrect Password. Try again!');
                setTimeout(() => {
                    $('#notify').html('Please log in to continue');
                }, 1500);
                $('#pw').val('');
            }
        });
    });
});

