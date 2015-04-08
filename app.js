var fs = require('fs');
var express = require('express');
var app = express();
var logger = require('morgan');
var bodyParser = require('body-parser');
var elastic = require('elasticsearch');

var http = require('http').Server(app);
var io = require('socket.io')(http);

var ncp = require('ncp').ncp;
var rimraf = require('rimraf');
var mkdirp = require('mkdirp');

var util = require('util');
var exec = require('child_process').exec;
var child = null;

var SERVER_PORT = 3000;
var ES_PORT = ':9200';
var HOST = 'localhost';

var NODE_SOURCE = './elasticsearch-1.5.0/';
var NODE_DESTINATION = './nodes/';
var NODE_NAME = 'node_';

var client = new elastic.Client({host: HOST + ES_PORT});
var counter = 0;
ncp.limit = 16;

app.use(logger('dev'));
app.set('views', __dirname + '/views/pages');
app.set('view engine', 'ejs');
app.engine('html', require('ejs').renderFile);
app.use(bodyParser.urlencoded({ extended: false}));
app.use(bodyParser.json());
app.set('port', (process.env.PORT || SERVER_PORT));
app.use(express.static(__dirname + '/public'));

/*******************************************************************************/

app.get('/', function(req, res) {
	createNode('node_1', function() {
		console.log('folder created');
	});
	res.render('index.ejs');
});

app.post('/index', function(req, res) {
	console.log(req.body);
	initialize(req.body);
	io.emit('log', {"msg" : "Initializing..."});
	res.json('ok');
});

/*******************************************************************************/
function initialize(params) {
	flushOldNodes(NODE_DESTINATION, function() {
		createNodeFolder(NODE_DESTINATION, function() {
			createNode(0, params.node_number);
		});
	});

	/*client	= new elastic.Client({
  		host: HOST
	});

	client.indices.delete({
		timeout: 30000,
		masterTimeout: 30000,
		index: INDEX
	}, function(error, response, status) {
		callback();
	});*/
};

function flushOldNodes(folder, callback) {
	rimraf(folder, function() {
		io.emit('log', {"msg" : "Flushed old nodes..."});
		callback();
	});
};

function createNodeFolder(path, callback) {
	mkdirp(path, function(err) { 
		if(err)
			console.log('An error occurred while creating the node directory');
		else {
			io.emit('log', {"msg" : "Created node folder..."});
			callback();
		}
	});
};

function createNode(number, total) {
	ncp(NODE_SOURCE, NODE_DESTINATION + NODE_NAME + number, function (err) {
		if(err)
			return console.error(err);
		else {
			io.emit('log', {"msg" : NODE_NAME + number + " created..."});

			if(number == total - 1) {
				io.emit('log', {"msg" : "All nodes created..."});
				runNode(0, total);
			} else
				createNode(++number, total);
		}
	});
};

function runNode(number, total) {
	child = exec(NODE_DESTINATION + NODE_NAME + number + '/bin/elasticsearch',
		function (error, stdout, stderr) {
		    console.log('stdout: ' + stdout);
		    console.log('stderr: ' + stderr);

		    if (error != null)
		      console.log('exec error: ' + error);
		    
	});
	io.emit('log', {"msg" : NODE_NAME + number + " running..."});
	
	/*if(number == total - 1) {
		io.emit('log', {"msg" : "All nodes running..."});
		console.log('callback');
	} else
		runNode(++number, total);*/
};
/*******************************************************************************/
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    console.log(err.message);
});

http.listen(SERVER_PORT, function() {
	console.log('listening on port ', SERVER_PORT);
});