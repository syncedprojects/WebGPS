socket = io.connect(socketIOLocation, conn_options);

var this_users_global_curr_room = previous_user_room_id;

/* save user's current room in the database in case of a possible server crash or for future logins */
var save_user_current_room = function(user_id, room_id, is_owner) {

    $.ajax({
        method: 'POST',
        url: '/save-user-current-room',
        dataType: 'JSON',
        data: {
            user_id: user_id,
            room_id: room_id,
            is_owner: is_owner
        },
        success: function(ajax_data) {
            if (ajax_data.result == 'success') {
                this_users_global_curr_room = room_id;
            }
        }
    });
};

var update_statuses = function(jquery_dom_element, members) {

    for (var key in members) {
        if (members.hasOwnProperty(key)) {
            jquery_dom_element.find('tbody').find('tr#' + members[key]).find('td.conn_status').html('<span class="text-success">Connected</span>');
        }
    }
    $("[data-toggle='tooltip']").tooltip();
};

var update_inbox_count = function(type_of_op) {

    var inbox_messages_div = $('div.inbox_messages');
    var msg_count = inbox_messages_div.find('span.badge').text();
    var new_msg_count = parseInt(msg_count);

    if (type_of_op == 'increment') {
        inbox_messages_div.find('span.badge').text((++new_msg_count));
    }
    else if (type_of_op == 'decrement') {
        inbox_messages_div.find('span.badge').text((--new_msg_count));
    }
};

$(document).on('ready', function(e) {

    var users_table_panel = $('.users-table-panel');
    var users_table_panel_table = users_table_panel.find('table');
    var administer_group_panel = $('.administer-group-panel');
    var inbox_messages_list = $('.inbox_messages').find('.panel-body').find('ul');
    var group_administer_status = $('.group_administer_status');

    socket.on('connect', function() {

        /* request to join after login, possible server crash or page refresh */
        socket.emit('request_to_join', {
            user_id: current_user_id,
            user_name: current_user_name,
            previous_user_room_id: previous_user_room_id,
            previous_user_room_name: previous_user_room_name,
            is_owner: is_owner
        });

        // if the browser supports html5 geolocation feature ...
        if (navGeoLoc) {

            var options = {
                enableHighAccuracy: true,
                timeout: Infinity,
                maximumAge: 0
            };

            watchId = navGeoLoc.watchPosition(getPosition, showError, options);
        }
    });

    var getPosition = function(pos) {

        myGlobalPos = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            acc: pos.coords.accuracy,
            alt: pos.coords.altitude,
            altAcc: pos.coords.altitudeAccuracy,
            hdng: pos.coords.heading,
            spd: pos.coords.speed
        };
    };

    var stopWatch = function() {

        if (watchId) {
            navGeoLoc.clearWatch(watchId);
            watchId = null;
        }
    };

    var showError = function(error) {

        switch(error.code) {

            case error.PERMISSION_DENIED:
                console.log('PERMISSION_DENIED');
                break;
            case error.POSITION_UNAVAILABLE:
                console.log('POSITION_UNAVAILABLE');
                break;
            case error.TIMEOUT:
                console.log('TIMEOUT');
                break;
            case error.UNKNOWN_ERR:
                console.log('UNKNOWN_ERR');
                break;
            default :
                break;
        }
    };

    setInterval(function() {

        if (this_users_global_curr_room == '0') {

            /* plot single marker and do NOT send geolocation data, ONLY this user will see the marker */
            if (typeof my_map_marker !== typeof undefined && typeof google !== typeof undefined) {

                my_map_marker.setMap(null);
                my_map_marker.setPosition({lat: myGlobalPos.lat, lng: myGlobalPos.lng});
                my_map_marker.setAnimation(google.maps.Animation.DROP);
                my_map_marker.setMap(map);
            }
        }
        else {

            if (myGlobalPos !== undefined) {

                // emit position information to the server periodically with a 5 second interval
                socket.emit('request_to_broadcast_geolocation', {
                    user_id: current_user_id,
                    user_name: current_user_name,
                    posLatitude: myGlobalPos.lat,
                    posLongitude: myGlobalPos.lng,
                    posAccuracy: myGlobalPos.acc,
                    posAltitude: myGlobalPos.alt,
                    posAltitudeAccuracy: myGlobalPos.altAcc,
                    posHeading: myGlobalPos.hdng,
                    posSpeed: myGlobalPos.spd
                });
            }

            // plot map markers periodically with a 5 second interval
            for (var key in markers) {

                if (markers.hasOwnProperty(key) && markers[key] !== undefined && typeof google !== typeof undefined) {

                    markers[key].marker_object.setMap(null);
                    markers[key].marker_object.setPosition(usersGlobalPositions[key]);
                    markers[key].marker_object.setAnimation(google.maps.Animation.DROP);
                    markers[key].marker_object.setMap(map);
                }
            }
        }

    }, 5000);

    socket.on('broadcast_geolocation', function (data) {

        if (data) {

            usersGlobalPositions[data.user_id] = {lat: data.posLatitude, lng: data.posLongitude};
            // create user's map marker if their marker has not yet been created
            if (markers[data.user_id] === undefined && typeof google !== typeof undefined) {

                markers[data.user_id] = {};

                markers[data.user_id].queue_number = ++member_count;

                markers[data.user_id].marker_object = new google.maps.Marker({

                    title: data.user_name,
                    icon: media_url + '/number_' + markers[data.user_id].queue_number + '.png'
                });
            }
        } else {
            // There is a problem
        }
    });

    socket.on('joined_default_server_room', function(data) {

        /* load user data from database */
        $.ajax({
            method: 'POST',
            url: '/get-user-row-html',
            dataType: 'JSON',
            data: {
                user_id: data.user_id
            },
            success: function(ajax_data) {

                users_table_panel_table.find('span#group_name').text(data.room_name);
                users_table_panel_table.find('tbody').html(ajax_data.user_row_html);
                users_table_panel.find('.group_status').text(data.msg);

                /* no need to update database record if user's previous room was default server room */
                // save_user_current_room(data.user_id, data.room_id, 'no');

                /* create the single map marker of this user */
                if (my_map_marker === undefined && typeof google !== typeof undefined) {

                    my_map_marker = new google.maps.Marker({

                        title: current_user_name,
                        /* select first image as we're not sending the marker information to server */
                        icon: media_url + '/number_' + '1' + '.png'
                    });
                }
                member_count = 0;
            }
        });
    });

    socket.on('joined_previous_room', function(data) {

        if (data.user_id == current_user_id) {

            /* load group members from database */
            $.ajax({
                method: 'POST',
                url: '/get-group-members-rows-html',
                dataType: 'JSON',
                data: {
                    room_id: data.room_id
                },
                success: function(ajax_data) {
                    users_table_panel_table.find('span#group_name').text(data.room_name);
                    users_table_panel_table.find('tbody').html(ajax_data.users_rows_html);
                    users_table_panel.find('.group_status').text('You have joined the group [' + data.previous_user_room_name + '].');

                    update_statuses(users_table_panel_table, data.members);
                }
            });
        } else {

            /* load user data from database */
            $.ajax({
                method: 'POST',
                url: '/get-user-row-html',
                dataType: 'JSON',
                data: {
                    user_id: data.user_id
                },
                success: function(ajax_data) {

                    /* member duplication precaution */
                    if (users_table_panel_table.find('tbody').find('tr#' + data.user_id).length == 0) {

                        users_table_panel_table.find('tbody').append(ajax_data.user_row_html);
                    }
                    users_table_panel.find('.group_status').text('[' + data.user_name + '] has joined the group.');

                    update_statuses(users_table_panel_table, data.members);
                }
            });
        }
    });

    $(document).on(volatileEventName, '.administer-group-panel #toggle_room_btn', function(e) {

        e.preventDefault();
        var new_room_name = administer_group_panel.find('#room_name');
        new_room_name.css('border-color', '#CCCCCC');

        if (new_room_name.val() == '') {
            new_room_name.css('border-color', '#C9302C');
            return false;
        }

        /* get unix timestamp */
        $.ajax({
            method: 'POST',
            url: '/get-unix-timestamp',
            dataType: 'JSON',
            beforeSend: function() {
                $('#ajax_loader_div').show();
            },
            success: function(ajax_data) {
                /* new room name supplied correctly, so let's continue with creation... */
                /* it's a better idea to create the room if there is a CONSTANT internet connection */
                /* in this case, let's create it first in the server and then, if confirmed, in the database */
                socket.emit('request_to_create_room', {
                    room_id: current_user_id + '_' + ajax_data.timestamp,
                    user_name: current_user_name,
                    room_name: new_room_name.val(),
                    owner_id: current_user_id
                });
            },
            complete: function() {
                setTimeout(function() {
                    $('#ajax_loader_div').fadeOut();
                }, 500);
            }
        });
    });

    socket.on('room_created', function(data) {

        /* new room data is available, let's create it in the database */
        if (data) {

            $.ajax({
                method: 'POST',
                url: '/create-room',
                dataType: 'JSON',
                data: {
                    room_data: data.room_data
                },
                beforeSend: function() {
                    $('#ajax_loader_div').show();
                },
                success: function(ajax_data) {

                    if (ajax_data.result == 'success') {

                        group_administer_status.html('<span class="text-success">The group has been successfully created.</span>');
                        $.ajax({
                            method: 'POST',
                            url: '/get-user-current-room',
                            dataType: 'JSON',
                            data: {
                                user_id: data.room_data.owner_id
                            },
                            success: function(ajax_data) {

                                administer_group_panel.find('#room_name').val('');
                                socket.emit('request_to_join_the_owner', {
                                    user_id: data.room_data.owner_id,
                                    user_name: data.user_name,
                                    previous_room: ajax_data.room_id,
                                    new_room_id: data.room_data.id
                                });
                            }
                        });
                    }
                    else {
                        group_administer_status.html('<span class="text-danger">Could not create the group. Please, try again.</span>');
                    }
                },
                complete: function() {
                    setTimeout(function() {
                        $('#ajax_loader_div').fadeOut();
                    }, 500);
                }
            });
        }
    });

    socket.on('the_owner_joined_the_room', function(data) {

        /* load user data from database */
        $.ajax({
            method: 'POST',
            url: '/get-user-row-html',
            dataType: 'JSON',
            data: {
                user_id: data.owner_id
            },
            success: function(ajax_data) {

                users_table_panel_table.find('span#group_name').text(data.new_room_name);
                users_table_panel_table.find('tbody').html(ajax_data.user_row_html);
                users_table_panel.find('.group_status').text(data.msg);

                save_user_current_room(data.owner_id, data.new_room_id, 'yes');
            }
        });
    });

    socket.on('the_owner_destroyed_the_room_and_created_new_one', function(data) {

        users_table_panel.find('.group_status').text(data.msg + ' Now you will join the default group.');
        setTimeout(function() {
            socket.emit('request_to_join_the_default_room', {
                user_id: current_user_id,
                user_name: current_user_name,
                destroyed_room_id: data.destroyed_room_id
            });
        }, 5000);
    });

    socket.on('joined_the_default_room', function(data) {

        /* load user data from database */
        $.ajax({
            method: 'POST',
            url: '/get-user-row-html',
            dataType: 'JSON',
            data: {
                user_id: data.user_id
            },
            success: function(ajax_data) {

                users_table_panel_table.find('span#group_name').text(data.room_name);
                users_table_panel_table.find('tbody').html(ajax_data.user_row_html);
                users_table_panel.find('.group_status').text(data.msg);

                save_user_current_room(data.user_id, data.room_id, 'no');

                /* create the single map marker of this user */
                if (my_map_marker === undefined && typeof google !== typeof undefined) {

                    my_map_marker = new google.maps.Marker({

                        title: current_user_name,
                        /* select first image as we're not sending the marker information to server */
                        icon: media_url + '/number_' + '1' + '.png'
                    });
                }
                member_count = 0;
            }
        });
    });

    socket.on('member_left_the_room', function(data) {

        if (markers[data.member_id] !== undefined) {
            markers[data.member_id].setMap(null);
            delete markers[data.member_id];
        }
        /* decrement users' count of the room */
        if (member_count > 0) {
            member_count--;
        }
        users_table_panel_table.find('tbody').find('tr#' + data.member_id).remove();
        users_table_panel.find('.group_status').text(data.msg);
    });

    $(document).on(volatileEventName, '.invite_guest', function(e) {

        e.preventDefault();
        var this_guest = $(this).find('span').attr('id');

        /* cannot invite themselves */
        if (this_guest == current_user_id) {
            return false;
        }

        $.ajax({
            method: 'POST',
            /* save the record about the invitation in the database */
            /* precaution for offline guests */
            url: '/send-invitation-to-guest-to-join-owners-current-room',
            dataType: 'JSON',
            data: {
                user_id: current_user_id,
                guest_id: this_guest
            },
            beforeSend: function() {
                $('#ajax_loader_div').show();
            },
            success: function(ajax_data) {

                if (ajax_data.response == 'owner_does_not_own_group') {
                    show_universal_modal('<p style="color: red">Error</p>', 'You do not own a group, please, create one.');
                }
                else if (ajax_data.response == 'guest_is_in_group_already') {
                    show_universal_modal('<p style="color: red">Error</p>', 'This user is already in your group.');
                }
                /* yes, user is the owner of the group, send invitation */
                else if (ajax_data.response == 'success') {

                    socket.emit('request_to_find_the_guest', {
                        owner_id: current_user_id,
                        guest_id: this_guest,
                        room: ajax_data.room,
                        socket_join_invitation_html: ajax_data.socket_join_invitation_html
                    });
                }
            },
            complete: function() {
                setTimeout(function() {
                    $('#ajax_loader_div').fadeOut();
                }, 500);
            }
        });
    });

    socket.on('find_the_guest', function(data) {

        // if invited user is this user then we've found them and let's go on
        if (data.guest_id == current_user_id) {

            inbox_messages_list.find('li.no_inbox_messages').remove();
            inbox_messages_list.append('<li class="inbox_message">' + data.socket_join_invitation_html + '</li>');
            update_inbox_count('increment');
        }
    });

    $(document).on(volatileEventName, 'span.accept_join_invitation', function(e) {

        var this_message_id = $(this).closest('li').find('span.message_id').attr('id');
        $.ajax({
            method: 'POST',
            url: '/get-user-current-room',
            dataType: 'JSON',
            data: {
                user_id: current_user_id
            },
            beforeSend: function() {
                $('#ajax_loader_div').show();
            },
            success: function(ajax_data) {

                $.ajax({
                    method: 'POST',
                    url: '/get-message-data',
                    dataType: 'JSON',
                    data: {
                        message_id: this_message_id
                    },
                    beforeSend: function() {
                        $('#ajax_loader_div').show();
                    },
                    success: function(ajax_message_data) {

                        if (ajax_message_data) {

                            socket.emit('request_to_join_the_guest', {
                                owner_id: ajax_message_data.owner_id,
                                guest_id: ajax_message_data.guest_id || current_user_id,
                                guest_user_name: current_user_name,
                                new_room: ajax_message_data.room, // the room to be joined to
                                previous_guest_room: ajax_data.room_id,
                                this_message_id: this_message_id
                            });
                        }
                    },
                    complete: function() {
                        setTimeout(function() {
                            $('#ajax_loader_div').fadeOut();
                        }, 500);
                    }
                });
            },
            complete: function() {
                setTimeout(function() {
                    $('#ajax_loader_div').fadeOut();
                }, 500);
            }
        });
    });

    $(document).on(volatileEventName, 'span.deny_join_invitation', function(e) {

        var this_message_id = $(this).closest('li').find('span.message_id').attr('id');
        $.ajax({
            method: 'POST',
            url: '/deny-join-invitation',
            dataType: 'JSON',
            data: {
                message_id: this_message_id
            },
            success: function(ajax_data) {
                if (ajax_data.response == 'success') {
                    inbox_messages_list.find('li').find('span.message_id#' + this_message_id).closest('li').remove();
                    if (inbox_messages_list.find('li').length == 0) {
                        inbox_messages_list.append('<li class="no_inbox_messages">No inbox messages.</li>');
                    }
                    update_inbox_count('decrement');
                }
            }
        });
    });

    socket.on('the_guest_joined_the_room', function(data) {

        if (data.guest_id == current_user_id) {

            /* load group members from database */
            $.ajax({
                method: 'POST',
                url: '/get-group-members-rows-html',
                dataType: 'JSON',
                data: {
                    room_id: data.new_room_id,
                    guest_id: data.guest_id
                },
                success: function(ajax_data) {
                    users_table_panel_table.find('span#group_name').text(data.new_room_name);
                    users_table_panel_table.find('tbody').html(ajax_data.users_rows_html);
                    users_table_panel.find('.group_status').text('You have joined the group [' + data.new_room_name + ']');

                    inbox_messages_list.find('li').find('span.message_id#' + data.this_message_id).closest('li').remove();
                    if (inbox_messages_list.find('li').length == 0) {
                        inbox_messages_list.append('<li class="no_inbox_messages">No inbox messages.</li>');
                    }

                    save_user_current_room(data.guest_id, data.new_room_id, 'no');

                    update_statuses(users_table_panel_table, data.members);

                    update_inbox_count('decrement');
                }
            });
        } else {

            /* load user data from database */
            $.ajax({
                method: 'POST',
                url: '/get-user-row-html',
                dataType: 'JSON',
                data: {
                    user_id: data.guest_id
                },
                success: function(ajax_data) {

                    /* member duplication precaution */
                    if (users_table_panel_table.find('tbody').find('tr#' + data.guest_id).length == 0) {

                        users_table_panel_table.find('tbody').append(ajax_data.user_row_html);
                    }
                    users_table_panel.find('.group_status').text('[' + data.guest_user_name + '] has joined the group.');

                    update_statuses(users_table_panel_table, data.members);
                }
            });
        }
    });

    /* remove the selected guest from group */
    $(document).on(volatileEventName, '.remove_user_from_group', function(e) {

        e.preventDefault();
        //
        var selected_guest_id = $(this).closest('tr').attr('id');
        var selected_guest_username = $(this).closest('tr').find('td.username').text();

        $.ajax({
            method: 'POST',
            url: '/get-user-current-room',
            dataType: 'JSON',
            data: {
                user_id: current_user_id
            },
            beforeSend: function() {
                $('#ajax_loader_div').show();
            },
            success: function(ajax_data) {

                var prev_ajax_data_room_id = ajax_data.room_id;
                /* save the record about the removal in the database */
                /* precaution for offline guests */
                $.ajax({
                    method: 'POST',
                    url: '/remove-guest-from-room',
                    dataType: 'JSON',
                    data: {
                        guest_id: selected_guest_id
                    },
                    beforeSend: function() {
                        $('#ajax_loader_div').show();
                    },
                    success: function(ajax_data) {

                        if (ajax_data.response == 'success') {

                            users_table_panel_table.find('tbody').find('tr#' + selected_guest_id).remove();
                            socket.emit('request_to_remove_the_guest', {
                                owner_id: current_user_id,
                                guest_id: selected_guest_id,
                                guest_user_name: selected_guest_username,
                                room: prev_ajax_data_room_id
                            });
                        }
                    },
                    complete: function() {
                        setTimeout(function() {
                            $('#ajax_loader_div').fadeOut();
                        }, 500);
                    }
                });
            },
            complete: function() {
                setTimeout(function() {
                    $('#ajax_loader_div').fadeOut();
                }, 500);
            }
        });
    });

    socket.on('broadcast_the_request_to_remove_the_guest', function(data) {

        if (data.guest_id == current_user_id) {

            socket.emit('guest_requests_to_leave_the_room', data);
        }
    });

    /* leave the group */
    $(document).on(volatileEventName, '#leave_current_room', function(e) {

        e.preventDefault();
        //
        $.ajax({
            method: 'POST',
            url: '/get-user-current-room',
            dataType: 'JSON',
            data: {
                user_id: current_user_id
            },
            beforeSend: function() {
                $('#ajax_loader_div').show();
            },
            success: function(ajax_data) {

                if (ajax_data.room_id.id == '0') {
                    return false;
                }
                // leave the group as a guest
                if (ajax_data.is_owner == '0') {

                    socket.emit('guest_requests_to_leave_the_room', {
                        guest_id: current_user_id,
                        guest_user_name: current_user_name,
                        room: ajax_data.room_id
                    });
                }
                // leave the group as the owner
                else if (ajax_data.is_owner == '1') {

                    var prev_ajax_data_room_id = ajax_data.room_id;
                    /* save the record about the leaving in the database */
                    /* precaution for offline guests */
                    $.ajax({
                        method: 'POST',
                        url: '/destroy-room',
                        dataType: 'JSON',
                        data: {
                            room_id: ajax_data.room_id.id
                        },
                        beforeSend: function() {
                            $('#ajax_loader_div').show();
                        },
                        success: function(ajax_data) {

                            if (ajax_data.response == 'success') {

                                socket.emit('the_owner_requests_to_leave_the_room', {
                                    owner_id: current_user_id,
                                    owner_user_name: current_user_name,
                                    room: prev_ajax_data_room_id
                                });
                            }
                        },
                        complete: function() {
                            setTimeout(function() {
                                $('#ajax_loader_div').fadeOut();
                            }, 500);
                        }
                    });
                }
            },
            complete: function() {
                setTimeout(function() {
                    $('#ajax_loader_div').fadeOut();
                }, 500);
            }
        });
    });

    socket.on('broadcast_the_owner_requests_to_leave_the_room', function(data) {

        if (data.owner_id == current_user_id) {

            socket.emit('request_to_join_the_default_room', {
                user_id: current_user_id,
                destroyed_room_id: data.room.id
            });
        }
        else {

            users_table_panel.find('.group_status').text('The owner has left the group. Now you will join the default group.');
            setTimeout(function() {
                socket.emit('request_to_join_the_default_room', {
                    user_id: current_user_id,
                    destroyed_room_id: data.room.id
                });
            }, 5000);
        }
    });

    socket.on('the_owner_destroyed_the_room_and_joined_new_one', function(data) {

        users_table_panel.find('.group_status').text(data.msg + ' Now you will join the default group.');
        setTimeout(function() {
            socket.emit('request_to_join_the_default_room', {
                user_id: current_user_id,
                user_name: current_user_name,
                destroyed_room_id: data.destroyed_room_id
            });
        }, 5000);
    });

    socket.on('member_disconnected', function(data) {

        if (data.member_id == current_user_id) {

            // remove this user's single map marker from the map
            if (my_map_marker !== undefined) {
                my_map_marker.setMap(null);
                delete my_map_marker;
            }

            // stop watching for position on disconnection
            stopWatch();
        }
        else {
            // remove disconnected user's map marker from the list of the room's (group's)
            if (markers[data.member_id] !== undefined) {
                markers[data.member_id].setMap(null);
                delete markers[data.member_id];
            }
            /* decrement users' count of the room */
            if (member_count > 0) {
                member_count--;
            }
        }

        users_table_panel_table.find('tbody').find('tr#' + data.member_id).find('td.conn_status').html('<span class="text-danger">Disconnected</span>');
        users_table_panel.find('.group_status').text(data.msg);
    });
});