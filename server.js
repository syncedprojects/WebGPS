var https = require('https');
var fs = require('fs');

var options = {
    key: fs.readFileSync('/home/eldor/ssl-certs/server/my-server.key.pem'),
    cert: fs.readFileSync('/home/eldor/ssl-certs/server/my-server.crt.pem'),
    rejectUnauthorized: false
};

var app = https.createServer(options, function(req, res) {
    /* GPS server created! */
});

var io = require('socket.io').listen(app);
var port = 3700;
app.listen(port);

console.log('Listening on port: #' + port);

var default_room_name = 'Web';
// object for holding rooms data
var rooms = {};
rooms[0] = {};
rooms[0].id = '0';
rooms[0].name = default_room_name;
rooms[0].owner_id = '0';

io.sockets.on('connection', function(client) {

    /* request to join after possible server crash or user login */
    client.on('request_to_join', function(data) {

        // set the user id and name
        client.user_id = data.user_id;
        client.user_name = data.user_name;

        /* client is connecting to default server room */
        if (data.previous_user_room_id == '0') {
            client.join(rooms[0].id);
            client.connected_room_id = rooms[0].id;
            client.emit('joined_default_server_room', {
                user_id: data.user_id,
                room_id: rooms[0].id,
                room_name: rooms[0].name,
                msg: 'You have joined the group [' + rooms[0].name + ']'
            });
        }
        /* client is connecting to a room other than default server's one */
        else {
            client.join(data.previous_user_room_id);
            client.connected_room_id = data.previous_user_room_id;
            if (typeof rooms[data.previous_user_room_id] === typeof undefined) {

                rooms[data.previous_user_room_id] = {};
                rooms[data.previous_user_room_id].id = data.previous_user_room_id;
                rooms[data.previous_user_room_id].name = data.previous_user_room_name;
                rooms[data.previous_user_room_id].members = {};
            }
            if (data.is_owner == '1') {
                rooms[data.previous_user_room_id].owner_id = data.user_id;
            }
            rooms[data.previous_user_room_id].members[data.user_id] = data.user_id;
            io.sockets.in(rooms[data.previous_user_room_id].id).emit('joined_previous_room', {
                user_id: data.user_id,
                room_id: data.previous_user_room_id,
                room_name: data.previous_user_room_name,
                is_owner: data.is_owner == '1' ? 'yes' : 'no',
                user_name: data.user_name,
                previous_user_room_name: data.previous_user_room_name,
                members: rooms[data.previous_user_room_id].members
            });
        }
    });

    client.on('request_to_create_room', function(data) {

        if (typeof rooms[data.room_id] === typeof undefined) {

            rooms[data.room_id] = {};
            rooms[data.room_id].id = data.room_id;
            rooms[data.room_id].name = data.room_name;
            rooms[data.room_id].owner_id = data.owner_id;

            client.emit('room_created', { room_data: rooms[data.room_id], user_name: data.user_name });
        }
    });

    client.on('request_to_join_the_owner', function(data) {

        client.leave(data.previous_room.id);

        if (data.previous_room.id != rooms[0].id && typeof rooms[data.previous_room.id] !== typeof undefined) {

            /* this to-be-deleted member could be the owner of the group, so take necessary actions */
            if (data.user_id == rooms[data.previous_room.id].owner_id) {

                // owner is destroying the previous room, broadcast to other members
                // about the room being destroyed and join them to default '0' (zero) server room
                client.broadcast.to(rooms[data.previous_room.id].id).emit('the_owner_destroyed_the_room_and_created_new_one', {
                    msg: 'The owner [' + data.user_name + '] has destroyed the group.',
                    destroyed_room_id: rooms[data.previous_room.id].id
                });
                // delete the room along with all the data (including members)
                delete rooms[data.previous_room.id];
            }
            else {
                // a member has left the room after having created their own
                client.broadcast.to(rooms[data.previous_room.id].id).emit('member_left_the_room', {
                    msg: '[' + data.user_name + '] has left the group.',
                    member_id: data.user_id
                });
                delete rooms[data.previous_room.id].members[data.user_id];
            }
        }

        client.join(data.new_room_id);
        client.connected_room_id = data.new_room_id;
        rooms[data.new_room_id].members = {};
        rooms[data.new_room_id].members[data.user_id] = data.user_id;
        client.emit('the_owner_joined_the_room', {
            owner_id: data.user_id,
            new_room_id: rooms[data.new_room_id].id,
            new_room_name: rooms[data.new_room_id].name,
            msg: 'You have joined the group [' + rooms[data.new_room_id].name + ']'
        });
    });

    client.on('request_to_join_the_default_room', function(data) {

        client.leave(data.destroyed_room_id);
        client.join(rooms[0].id);
        client.connected_room_id = rooms[0].id;
        client.emit('joined_the_default_room', {
            user_id: data.user_id,
            room_id: rooms[0].id,
            room_name: rooms[0].name,
            msg: 'You have joined the group [' + rooms[0].name + ']'
        });
    });

    client.on('request_to_find_the_guest', function(data) {

        io.sockets.emit('find_the_guest', data);
    });

    client.on('request_to_join_the_guest', function(data) {

        // a member has left the room after being invited to another
        client.leave(data.previous_guest_room.id);

        if (data.previous_guest_room.is_owner == '0') {

            // no need to send messages to the default server room
            if (data.previous_guest_room.id != rooms[0].id) {

                client.broadcast.to(rooms[data.previous_guest_room.id].id).emit('member_left_the_room', {
                    msg: '[' + data.guest_user_name + '] has left the group.',
                    member_id: data.guest_id
                });
            }
            /* user's previous room could be the default server room, so check it for 'undefined' */
            if (typeof rooms[data.previous_guest_room.id] !== typeof undefined
                &&
                typeof rooms[data.previous_guest_room.id].members !== typeof undefined
                &&
                typeof rooms[data.previous_guest_room.id].members[data.guest_id] !== typeof undefined) {

                // delete this member
                delete rooms[data.previous_guest_room.id].members[data.guest_id];
            }
        }
        else if (data.previous_guest_room.is_owner == '1') {

            if (data.previous_guest_room.id != rooms[0].id && typeof rooms[data.previous_guest_room.id] !== typeof undefined) {

                // owner is destroying the previous room, broadcast to other members
                // about the room being destroyed and join them to default '0' (zero) server room
                client.broadcast.to(rooms[data.previous_guest_room.id].id).emit('the_owner_destroyed_the_room_and_joined_new_one', {
                    msg: 'The owner [' + data.user_name + '] has destroyed the group.',
                    destroyed_room_id: rooms[data.previous_guest_room.id].id
                });
                // delete the room along with all the data (including members)
                delete rooms[data.previous_guest_room.id];
            }
        }

        client.join(data.new_room.id);
        client.connected_room_id = data.new_room.id;
        // as we are joining a guest, we can be sure that this room's 'members' object is declared somewhere already
        rooms[data.new_room.id].members[data.guest_id] = data.guest_id;

        io.sockets.in(rooms[data.new_room.id].id).emit('the_guest_joined_the_room', {
            owner_id: data.owner_id,
            guest_id: data.guest_id,
            guest_user_name: data.guest_user_name,
            new_room_id: rooms[data.new_room.id].id,
            new_room_name: rooms[data.new_room.id].name,
            this_message_id: data.this_message_id,
            members: rooms[data.new_room.id].members
        });
    });

    client.on('request_to_remove_the_guest', function(data) {

        // as we are removing a guest, we can be sure that this room's 'members' object is declared somewhere already
        /* precaution for offline users, as script may not reach 'guest_requests_to_leave_the_room' callback */
        delete rooms[data.room.id].members[data.guest_id];

        client.broadcast.to(data.room.id).emit('broadcast_the_request_to_remove_the_guest', data);
    });

    client.on('guest_requests_to_leave_the_room', function(data) {

        if (data.room.id == rooms[0].id) {
            return false;
        }
        
        client.leave(data.room.id);
        if (typeof rooms[data.room.id].members[data.guest_id] !== typeof undefined) {
            delete rooms[data.room.id].members[data.guest_id];
        }
        client.join(rooms[0].id);
        client.connected_room_id = rooms[0].id;
        client.broadcast.to(rooms[data.room.id].id).emit('member_left_the_room', {
            msg: '[' + data.guest_user_name + '] has left the group.',
            member_id: data.guest_id
        });
        client.emit('joined_the_default_room', {
            user_id: data.guest_id,
            room_id: rooms[0].id,
            room_name: rooms[0].name,
            msg: 'You have joined the group [' + rooms[0].name + ']'
        });
    });

    client.on('the_owner_requests_to_leave_the_room', function(data) {

        io.sockets.in(rooms[data.room.id].id).emit('broadcast_the_owner_requests_to_leave_the_room', data);
        // delete the room along with all the data (including members)
        if (typeof undefined !== typeof rooms[data.room.id]) {
            delete rooms[data.room.id];
        }
    });

    client.on('disconnect', function() {

        if (client.connected_room_id != rooms[0].id) {
            io.sockets.in(client.connected_room_id).emit('member_disconnected', { 'msg': '[' + client.user_name + '] has left the GPS service.', 'member_id': client.user_id });
        }
    });

    client.on('request_to_broadcast_geolocation', function(data) {

        /* no need to broadcast information to default server room */
        if (client.connected_room_id != rooms[0].id) {
            io.sockets.in(client.connected_room_id).emit('broadcast_geolocation',  data);
        }
    });
});