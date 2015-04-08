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
var string_decoder = require('string_decoder').StringDecoder;

var util = require('util');
var child_process = require('child_process');
var children = [];

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
	res.render('index.ejs');
});

app.post('/index', function(req, res) {
	console.log(req.body);
	initialize(req.body);
	io.emit('log', {"msg" : "Initializing..."});
	res.json('ok');
});

app.post('/kill', function(req, res) {
	killAllNodes(function() {
		console.log('callback...');
	});
});

/*******************************************************************************/
function initialize(params) {
	killAllNodes(function() {
		flushOldNodes(NODE_DESTINATION, function() {
			createNodeFolder(NODE_DESTINATION, function() {
				createNode(0, params.node_number, function() {
					io.emit('log', {"msg" : "Creating index"});
				});
			});
		});
	});
};

function killAllNodes(callback) {
	var killer = child_process.exec('pkill -f elastic', function (error, stdout, stderr) {
		if(error)
			io.emit('log', {"msg" : '-------->' + error.stack});
	});
	
	killer.on('exit', function (code) {
	 	io.emit('log', {"msg" : 'Killed all nodes...'});
	 	callback();
	});
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

function createNode(number, total, callback) {
	ncp(NODE_SOURCE, NODE_DESTINATION + NODE_NAME + number, function (err) {
		if(err)
			return console.error(err);
		else {
			io.emit('log', {"msg" : NODE_NAME + number + " created..."});

			if(number == total - 1) {
				io.emit('log', {"msg" : "All nodes created..."});
				installMarvel(0, total, callback);
			} else
				createNode(++number, total, callback);
		}
	});
};

function installMarvel(number, total, callback) {
	var ps = child_process.exec(NODE_DESTINATION + NODE_NAME + number + '/bin/plugin -i elasticsearch/marvel/latest', function (error, stdout, stderr) {
		if(error)
			io.emit('log', {"msg" : '-------->' + error.stack});
	 });
	
	 ps.on('exit', function (code) {
	 	io.emit('log', {"msg" : 'Marvel installed on ' + NODE_NAME + number});
	 	if(number == total - 1) {
			io.emit('log', {"msg" : "Marvel installed on all nodes..."});
			runNode(0, total, callback);
		} else
			installMarvel(++number, total, callback);
	 });
};

function runNode(number, total, callback) {
	children[number] = (child_process.spawn('sh', [NODE_DESTINATION + NODE_NAME + 0 + '/bin/elasticsearch']));

	var decoder = new string_decoder('utf8');

	children[number].stdout.on('data', function (data) {
	  	io.emit('log', {"msg" : '-------->' + decoder.write(data)});
	  	//io.emit('log', {"msg" : NODE_NAME + number + ' running...'});
	});
	
	children[number].stderr.on('data', function (data) {
	  	io.emit('log', {"msg" : '-------->' + decoder.write(data)});
	  	//io.emit('log', {"msg" : NODE_NAME + number + ' caused an error...'});
	});
	
	children[number].on('close', function (code) {
	  	//io.emit('log', {"msg" : '-------->' + decoder.write(data)});
	});

	if(number == total - 1) {
		io.emit('log', {"msg" : "All nodes running..."});
		callback();
	} else
		runNode(++number, total, callback);
};

function createIndex(index) {
	client	= new elastic.Client({
  		host: HOST
	});

	client.indices.delete({
		timeout: 30000,
		masterTimeout: 30000,
		index: INDEX
	}, function(error, response, status) {
		//callback();
		console.log('done');
	});
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