const net = require('net');
const { parseHTML } = require('./parserHTML');

// 不支持 utf
class Request {
    constructor(options) {
        this.method = options.method || 'GET';
        this.host = options.host || 'localhost';
        this.port = options.port || '80';
        this.path = options.path || '/';
        this.header = options.header || {};
        this.body = options.body || {};

        if (!this.header['Content-Type']) {
            this.header['Content-Type'] = 'application/x-www-form-urlencoded';
        }

        if (this.header['Content-Type'] === 'application/json') {
            this.bodyText = JSON.stringify(this.body);
        }

        if (this.header['Content-Type'] === 'application/x-www-form-urlencoded') {
            this.bodyText = Object.keys(this.body).map(key => `${key}=${encodeURIComponent(this.body[key])}`).join('&');
        }

        this.header['Content-Length'] = this.bodyText.length;

        this.response = null;
    }

    toString() {
        return `${this.method} ${this.path} HTTP/1.1\r\n`
                + `Host: ${this.host}\r\n`
                + `${Object.keys(this.header).map(key => `${key}: ${this.header[key]}`).join('\r\n')}\r\n`
                + `\r\n`
                + `${this.bodyText}`;
    }

    send(connection) {
        return new Promise((resolve, reject) => {
            if (connection) {
                connection.write(this.toString());
            } else {
                connection = net.createConnection({ 
                    host: this.host,
                    port: this.port,
                }, () => {
                    connection.write(this.toString());
                });
            }

            connection.on('data', (data) => {
                if (!this.response) {
                    this.response = new ResponseParse(connection);
                }

                if (this.response.finished) {
                    connection.end();
                } else {
                    this.response.receive(data.toString())
                }
            });
            
            connection.on('end', () => {
                resolve(this.response.response);
                console.log('disconnected from server');
            });
            
            connection.on('error', (err) => {
                reject(err);
                connection.end();
            });
        });
    }
}

class Response {}

class ResponseParse {
    // 传入 connection， 用于主动关闭连接
    constructor(connection) {
        this.WAITING_STATUS_LINE = 0;
        this.WAITING_STATUS_LINE_END = 1;
        this.WAITING_HEADERS_NAME = 2;
        this.WAITING_HEADERS_SPACE = 3;
        this.WAITING_HEADERS_VALUE = 4;
        this.WAITING_HEADERS_LINE_END = 5;
        this.WAITING_HEADERS_BLOCK_END = 6;
        this.WAITING_BODY = 7;
        
        this.current = this.WAITING_STATUS_LINE;
        this.statusLine = '';
        this.header = {};
        this.headerName = '';
        this.headerValue = '';
        this.body = '';
        this.bodyParser = null;

        this.connection = connection;
    }

    connectEnd() {
        this.connection.end();
    }

    get finished() {
        return this.bodyParser && this.bodyParser.finished;
    }

    get response() {
        this.statusLine.match(/HTTP\/1.1 ([0-9]+) ([\s\S]+)/);

        return {
            statusCode: RegExp.$1,
            statusText: RegExp.$2,
            header: this.header,
            body: this.bodyParser.content.join(''),
        };
    }

    receive(string) {
        for (let i = 0; i < string.length; i++) {
            this.receiveChar(string.charAt(i));
        }
    }

    receiveChar(char) {
        if (this.current === this.WAITING_STATUS_LINE) {
            if (char === '\r') {
                this.current = this.WAITING_STATUS_LINE_END;
            } else {
                this.statusLine += char;
            }
        } else if (this.current === this.WAITING_STATUS_LINE_END) {
            if (char === '\n') {
                this.current = this.WAITING_HEADERS_NAME;
            }
        } else if (this.current === this.WAITING_HEADERS_NAME) {
            if (char === '\r') {
                this.current = this.WAITING_HEADERS_BLOCK_END;
            }

            if (char === ':') {
                this.current =this.WAITING_HEADERS_SPACE;
            } else {
                this.headerName += char;
            }
        } else if (this.current === this.WAITING_HEADERS_SPACE) {
            if (char === ' ') {
                this.current = this.WAITING_HEADERS_VALUE;
            }
        } else if (this.current === this.WAITING_HEADERS_VALUE) {
            if (char === '\r') {
                this.current = this.WAITING_HEADERS_LINE_END;

                this.header[this.headerName] = this.headerValue;
                this.headerName = '';
                this.headerValue = '';
            } else {
                this.headerValue += char;
            }
        } else if (this.current === this.WAITING_HEADERS_LINE_END) {
            if (char === '\n') {
                this.current = this.WAITING_HEADERS_NAME;
            }
        } else if (this.current === this.WAITING_HEADERS_BLOCK_END) {
            if (char === '\n') {
                this.current = this.WAITING_BODY;
            }
        } else if (this.current === this.WAITING_BODY) {
            if (!this.bodyParser && this.header['Transfer-Encoding'] === 'chunked') {
                this.bodyParser = new TrunckedBodyParse();
            }

            if (this.bodyParser && this.bodyParser.finished) {
                this.connectEnd();
            }
            // this.body += char;
            this.bodyParser.receiveChar(char);
        }
        // console.log(this.body)
    }
}

class TrunckedBodyParse {
    constructor() {
        this.WAITING_LENGTH = 0;
        this.WAITING_LENGTH_END = 1;
        this.READING_TRUNK = 2;
        this.WAITING_NEW_LINE = 3;
        this.WAITING_NEW_LINE_END = 4;
        
        this.finished = false;
        this.length = 0
        this.content = [];
        this.current = this.WAITING_LENGTH;
    }

    receiveChar(char) {
        this.body += char;
        if (this.current === this.WAITING_LENGTH) {
            if (char === '\r') {
                console.log('长度:', this.length)
                this.current = this.WAITING_LENGTH_END;
            } else {
                // chunk-size 是 16 进制
                this.length *= 16;
                this.length += parseInt(char, 16);
            }

        } else if (this.current === this.WAITING_LENGTH_END) {
            if (this.length === 0) {
                this.finished = true;
            }

            if (char === '\n') {
                this.current = this.READING_TRUNK;
            }
        } else if (this.current === this.READING_TRUNK) {
            if (this.length === 0) {
                // 这里已经消费掉了 '\r'
                this.current = this.WAITING_NEW_LINE;
            } else {
                this.content.push(char);
                this.length --;
            }

        } else if (this.current === this.WAITING_NEW_LINE) {
            if (char === '\n') {
                this.current = this.WAITING_NEW_LINE_END;
            }
        } else if (this.current === this.WAITING_NEW_LINE_END) {
            this.current = this.WAITING_LENGTH;
        }
    }
}

void async function() {
    const request = new Request({
        method: 'POST',
        path: '/',
        port: '8088',
        body: {
            name: 'whh',
        },
    });
    
    const response = await request.send();
    // console.log('response::', response)
    parseHTML(response.body)
}();
