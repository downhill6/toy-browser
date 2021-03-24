const http = require('http');
const fs = require('fs');

const file = fs.readFileSync('./index.html').toString();

const server = http.createServer((req, res) => {
    console.log('request recieved', req.headers);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Foo', 'bar');
    res.writeHead(200);

    res.end(file);
});

server.listen('8088')