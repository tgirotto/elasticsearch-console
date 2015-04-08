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

var SERVER_PORT = 3000;
var ES_PORT = ':9200';
var HOST = 'localhost';

var NODE_SOURCE = './elasticsearch-1.5.0/';
var NODE_DESTINATION = './nodes/';

var client = new elastic.Client({host: HOST + ES_PORT});
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
	io.emit('log', {"msg" : "Initializing..."});
	res.json('ok');
});

/*******************************************************************************/
function initialize(callback) {
	client	= new elastic.Client({
  		host: HOST
	});

	client.indices.delete({
		timeout: 30000,
		masterTimeout: 30000,
		index: INDEX
	}, function(error, response, status) {
		callback();
	});
};

function flushOldNodes(folder, callback) {
	rimraf(folder, function() {
		callback();
	});
};

function createNodeFolder(path, callback) {
	mkdirp(path, function(err) { 
		if(err)
			console.log('An error occurred while creating the node directory');
		else
			callback();
	});
};

function createNode(node_name, callback) {
	ncp(NODE_SOURCE, NODE_DESTINATION + node_name, function (err) {
		if(err)
			return console.error(err);
		else
			callback();
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