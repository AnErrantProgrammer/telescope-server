var editors = [];

var sheet = (function() {
    var style = document.createElement("style");
    style.appendChild(document.createTextNode(""));
    document.head.appendChild(style);

    return style.sheet;
})();

var socket = io();
var currentDoc = "";
var previousDoc = "";
var name = (typeof localStorage.username !== 'undefined') ? localStorage.username : "HamCutter";
var lastSession = (typeof localStorage.lastSession !== 'undefined' && localStorage.lastSession !== '' ) ? localStorage.lastSession : null;
var belayChange = false;
var currentSession = '';
var files = [];

var EVENTS = {
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
    USER_JOINED: 'joined'
};

$('#user').text(name).click(function() {
    var username = prompt('User Name');
    if (username && username != '') {
        localStorage.setItem("username", name);
        name = username;
        $(this).text(name);
        socket.emit(EVENTS.SET_NAME, {
            name: name
        });
    }
});

socket.emit(EVENTS.SET_NAME, {
    name: name
});

socket.on(EVENTS.ADD_DOC, function(data) {
    addDocToWorkSpace(data);
});

socket.on(EVENTS.SET_SESSION, function(data) {
    currentSession = data.session;
    localStorage.lastSession = data.session;
    $('#connection-status').text('Connected to ' + data.session);
});

socket.on(EVENTS.ECHO, function(data) {
    Materialize.toast(data.text, 4000)
});

socket.on(EVENTS.USER_JOINED, function(data) {
    sheet.addRule('.' + data.name, "background-color: blue");
    sheet.addRule('.' + data.name + '-cursor', "border-right:1px solid blue");

    Materialize.toast(data.name + " joined", 4000)
});

socket.on(EVENTS.REJECT_JOIN, function(data) {
    Materialize.toast("Unknown Session ID", 4000)
});

socket.on(EVENTS.SET_NAME, function(data) {
    Materialize.toast(data.name + " renamed", 4000)
});

socket.on(EVENTS.SET_DOC_ID, function(data) {
    addDocToWorkSpace(data);
});

socket.on(EVENTS.CHANGE_SELECTION, function(data) {

    var editor = getEditorByFileId(data.fileId)
    if (editor) {
        editor.setSelection(data.name, data.selections)
    }

});

socket.on(EVENTS.CHANGE_DOC, function(data) {
    belayChange = true;
    var editor = getEditorByFileId(data.fileId);

    if (editor) {
        for (var i = 0; i < data.changeEvent.length; i++) {
            editor.model.applyEdits([deFormatChange(data.changeEvent[i])]);
        }
    }

    belayChange = false;
});

$("#join-session").click(function() {
    var session = prompt('Session ID');
    if (session && session != '') {
        socket.emit(EVENTS.JOIN_SESSION, {
            session: session
        });
    }
});

$("#create").click(function() {
    var fileName = prompt('File Name');

    if (fileName && fileName != '') {
        socket.emit(EVENTS.ADD_DOC, {
            fileName: fileName,
            text: ''
        });
    }
});

$("#leave-session").click(function() {
    currentSession = '';
    localStorage.lastSession = '';
    socket.emit(EVENTS.LEAVE_SESSION);
});


$("#create-session").click(function() {
    socket.emit(EVENTS.CREATE_SESSION);
});

$("#echo-session").click(function() {
    socket.emit(EVENTS.ECHO_SESSION);
});

if(lastSession){
    console.log('Trying to resume last session');
    socket.emit(EVENTS.JOIN_SESSION, {
        session: lastSession
    });    
}


function guid() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
        s4() + '-' + s4() + s4() + s4();
}

function getEditorByFileId(fileId) {
    for (var i = 0; i < editors.length; i++) {
        if (editors[i].editor.domElement.id == fileId)
            return editors[i].editor;
    }

    return false;
}

function getActiveEditor() {
    for (var i = 0; i < editors.length; i++) {
        if (editors[i].editor.isFocused())
            return editors[i].editor;
    }

    return false;
}

function addDocToWorkSpace(data) {
    var newGuid = data.fileId;
    var fileName = data.fileName;
    var text = data.text;
    files[data.fileName] = data.fileId;

    var elem = $('<div></div>')
        .css('width', '100%')
        .css('height', '85%')
        .attr('data-file-name', fileName)
        .attr('id', newGuid)
        .appendTo("#docs")
        .get()[0];

    var tabContainer = $('<li></li>')
        .addClass('tab')
        .addClass('col')
        .addClass('s2')
        .appendTo("#docs > .tabs");

    $('<a></a>')
        .attr('href', '#' + newGuid)
        .text(fileName)
        .appendTo(tabContainer)
        .click();

    var newEditor = monaco.editor.create(elem, {
        value: text,
        language: 'javascript',
        theme: 'vs-dark'
    });

    newEditor.fileName = fileName;
    newEditor.fileId = data.fileId;
    newEditor.userSelections = {};

    newEditor.onDidChangeModelContent(function(event) {
        var editor = getActiveEditor();
        socket.emit(EVENTS.CHANGE_DOC, {
            fileName: editor.fileName,
            fileId: files[editor.fileName],
            changeEvent: reformatChanges(event.changes)
        });
    });

    newEditor.onDidChangeCursorSelection(function(event) {
        var selections = [];
        var editor = getActiveEditor();

        selections.push({
            start: {
                line: event.selection.startLineNumber,
                character: event.selection.startColumn
            },
            end: {
                line: event.selection.endLineNumber,
                character: event.selection.endColumn
            }
        });

        event.secondarySelections.forEach(function(selection) {
            selections.push({
                start: {
                    line: selection.startLineNumber,
                    character: selection.startColumn
                },
                end: {
                    line: selection.endLineNumber,
                    character: selection.endColumn
                }
            });
        });

        socket.emit(EVENTS.CHANGE_SELECTION, {
            fileName: editor.fileName,
            fileId: files[editor.fileName],
            selections: selections
        });

    });

    newEditor.setSelection = function(user, selections) {
        if (typeof this.userSelections[user] === 'undefined') {
            this.userSelections[user] = [];
        }

        this.userSelections[user] = this.deltaDecorations(this.userSelections[user], createNewSelectionDecorations(selections, user));
    };

    editors.push({
        fileName: fileName,
        editor: newEditor
    });
}

function createNewSelectionDecorations(selections, user) {
    return selections.map(function(selection) {
        return {
            range: new monaco.Range(selection.start.line + 1, selection.start.character + 1, selection.end.line + 1, selection.end.character + 1),
            options: {
                isWholeLine: false,
                className: user,
                afterContentClassName: user + '-cursor'
            }
        }

    });
}

function reformatChanges(changes) {
    var newChanges = [];
    for (var i = 0; i < changes.length; i++) {
        var change = changes[i];
        newChanges.push({
            range: [{
                line: change.range.startLineNumber - 1,
                character: change.range.startColumn - 1
            }, {
                line: change.range.endLineNumber - 1,
                character: change.range.endColumn - 1
            }],
            rangeLength: change.rangeLength,
            text: change.text,

        })
    }

    return newChanges;
}

function deFormatChange(change) {
    return {
        range: {
            startLineNumber: change.range[0].line + 1,
            startColumn: change.range[0].character + 1,
            endLineNumber: change.range[1].line + 1,
            endColumn: change.range[1].character + 1
        },
        rangeLength: change.rangeLength,
        text: change.text

    }
}