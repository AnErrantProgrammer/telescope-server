var express = require('express');
var app = express();
var port = process.env.PORT || 5000;
var http = require('http').Server(app);
var io = require('socket.io')(http);
var uuidv1 = require('uuid/v1');
var sessions = {};
var _ = require('lodash');

var path = require('path');

app.use('/scripts',express.static('scripts'));
app.use('/images',express.static('images'));
app.use('/styles',express.static('styles'));

app.use('/vs', express.static(path.join(__dirname, 'node_modules/monaco-editor/min/vs/')));

app.get('/', function(req, res) {
    res.sendFile(process.cwd() + '/editor.html');
});

var EVENTS = {
    CONNECTION: 'connection',
    ADD_DOC: 'add doc',
    CHANGE_DOC: 'change doc',
    CHANGE_SELECTION: 'change selection',
    CREATE_SESSION: 'create session',
    ECHO: 'echo',
    ECHO_SESSION: 'echo session',
    JOIN_SESSION: 'join session',
    SET_NAME: 'set name',
    SET_SESSION: 'set session',
    REJECT_JOIN: 'reject join',
    SET_DOC_ID: 'set doc id',
    USER_JOINED: 'joined',
    LEAVE_SESSION: 'leave session'
};



io.on(EVENTS.CONNECTION, function(socket) {
    var session = null;
    var name = '';

    socket.on(EVENTS.CREATE_SESSION, function() {
        session = uuidv1();
        sessions[session] = {
            counter: 0,
            files: [],
            users: [name]
        };
        socket.join(session);
        socket.emit(EVENTS.SET_SESSION, {
            session: session
        });
    });

    socket.on(EVENTS.ECHO_SESSION, function() {
        socket.emit(EVENTS.ECHO, {
            text: session
        });
    });

    socket.on(EVENTS.JOIN_SESSION, function(data) {
        session = data.session;

        if (typeof sessions[session] === 'undefined') {
            socket.emit(EVENTS.REJECT_JOIN);
        } else {
            socket.join(session);
            socket.broadcast.to(session).emit(EVENTS.USER_JOINED, {
                name: name
            });

            socket.emit(EVENTS.SET_SESSION, {
                session: session
            });

            _.each(sessions[session].files, function(file) {
                socket.emit(EVENTS.ADD_DOC, file);
            });

            _.each(sessions[session].users, function(user) {
                socket.emit(EVENTS.USER_JOINED, {name: user});
            });

            sessions[session].users.push(name);
            sessions[session].users = _.uniq(sessions[session].users);
        }

    });

    socket.on(EVENTS.CHANGE_SELECTION, function(data){
        if (session) {
            socket.broadcast.to(session).emit(EVENTS.CHANGE_SELECTION, {
                name: name,
                selections: data.selections,
                fileId: data.fileId,
                fileName: data.fileName
            });
        }        
    });

    socket.on(EVENTS.SET_NAME, function(data) {
        if(typeof data.name !=='undefined'){
            name = data.name.replace(/[^\w]/img, "");

            if (session) {
                socket.broadcast.to(session).emit(EVENTS.SET_NAME, {
                    name: name
                });
            }
        }
    });

    socket.on(EVENTS.ADD_DOC, function(data) {
        if (session) {
            data.fileId = uuidv1();
            sessions[session].files.push(data);
            socket.broadcast.to(session).emit(EVENTS.ADD_DOC, data);
            socket.emit(EVENTS.SET_DOC_ID, data);
        }
    });

    socket.on(EVENTS.LEAVE_SESSION, function() {
        sessions[session].users = _.remove(sessions[session].users, function(user){
            return user == name
        });

        sessions[session].users.length == 0;
        sessions[session] = null;
        delete sessions[session];
        
        session = false;

        socket.leave(session);
    });

    socket.on(EVENTS.CHANGE_DOC, function(data) {
        if (session) {
            var doc = _.find(sessions[session].files, function(o) {
                return o.fileId == data.fileId;
            });

            if (doc) {
                doc.text = editString(doc.text, data.changeEvent);
                data.number = sessions[session].counter++;
                socket.broadcast.to(session).emit(EVENTS.CHANGE_DOC, data);
            }
        }
    });

});

http.listen(port, function() {
    console.log('listening on ' + port);
});

function editString(text, transforms) {

    for (var i = 0; i < transforms.length; i++) {
        var transform = transforms[i];
        var startIndex = transform.range[0].line;
        var startPosition = getPosition(text, '\n', startIndex) + transform.range[0].character;

        text = spliceString(text, startPosition, transform.rangeLength, transform.text);
    }

    return text;

    function spliceString(text, start, length, replacement) {
        return text.substr(0, start) + replacement + text.substr(start + length);
    }

    function getPosition(string, subString, index) {
        if (index == 0) return 0;

        return string.split(subString, index).join(subString).length + 1;
    }
}