const EOF = Symbol('EOF'); // EOF: End of File

function data(c) {
    if (c === '<') {
        return tagOpen;
    } else if (c === EOF) {
        return;
    } else {
        return data;
    }
}

function tagOpen(c) {
    if (c === '/') {
        return endTagOpen;
    } else if (c.match(/^[a-zA-Z]$/)) {
        return tagName(c);
    } else {
        return;
    }
}

function endTagOpen(c) {
    if (c.match(/^[a-zA-Z]$/)) {
        return tagName(c);
    } else if (c === '>') {
        return data;
    } else {
        return;
    }
}

function tagName(c) {
    if (c.match(/^[\t\n\f ]$/)) {
        return beforeAttributeName;
    } else if (c === '/') {
        return selfClosingStartTag;
    }  else if (c === '>') {
        return data;
    } else {
        return tagName;
    }
}

function beforeAttributeName(c) {
    if (c.match(/^[\t\n\f ]$/)) {
        return beforeAttributeName;
    } else if (c === '>') {
        return data;
    } else if (c === '=') {
        return beforeAttributeName;
    } else {
        return beforeAttributeName;
    }
}

function attributeNameState(c) {}

function selfClosingStartTag(c) {
    if (c === '>') {
        return data;
    } else {
        return beforeAttributeName;
    }
}

module.exports.parseHTML = function(html) {
    let state = data;
    for (let c of html) {
        state = state(c);
    }
    state = state(EOF);
}