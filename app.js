var fs = require('fs');
var express = require('express');
var app = express();
var logger = require('morgan');
var bodyParser = require('body-parser');
var elastic = require('elasticsearch');
var request = require('request');
var readline = require('line-by-line');

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

var INDEX = null;
var TYPE = null;

var client = new elastic.Client({host: HOST + ES_PORT});
var rl = null;
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
	INDEX = params.index;
	TYPE = params.type;

	killAllNodes(function() {
		flushOldNodes(NODE_DESTINATION, function() {
			createNodeFolder(NODE_DESTINATION, function() {
				createNode(0, params.node_number, function() {
					createIndex(params.primary_shard_number, params.replica_shard_number, function() {
						indexContent(params.content_path);
					});
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
	 	io.emit('log', {"msg" : 'Marvel installed on ' + NODE_NAME + number + '...'});
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

	  	if(decoder.write(data).indexOf('started') != -1) {
	  		if(number == total - 1) {
				io.emit('log', {"msg" : "All nodes running..."});
				callback();
			} else
				runNode(++number, total, callback);
	  	}
	});
	
	children[number].stderr.on('data', function (data) {
	  	io.emit('log', {"msg" : '-------->' + decoder.write(data)});
	  	//io.emit('log', {"msg" : NODE_NAME + number + ' caused an error...'});
	});
	
	children[number].on('close', function (code) {
	  	//io.emit('log', {"msg" : '-------->' + decoder.write(data)});
	});
};

function createIndex(primary_shards, replica_shards, callback) {
	io.emit('log', {"msg" : "Creating index..."});
	client	= new elastic.Client({
  		host: HOST
	});

	client.indices.delete({
		timeout: 30000,
		masterTimeout: 30000,
		index: INDEX
	}, function(error, response, status) {
		if(error != null) {
			console.log('An error occurred while deleting old index (maybe it never existed)...');
		}

		var params = JSON.parse('{"settings" : {"number_of_shards" : ' + primary_shards + ',"number_of_replicas" : ' + replica_shards + '}}');

		request({ 
			url: 'http://localhost:9200/' + INDEX + '/', 
			method: 'PUT', 
			json: params }, 
			function(err, res, body) {
				if(err == null) {
					io.emit('log', {"msg" : "Index created..."});

					callback();
				} else
					io.emit('log', {"msg" : "An error occurred while creating new index..."});
		});
	});
};

function indexContent(path) {
	rl =  new readline(path);
	rl.on('line', function(line) {
	    counter++;
	    rl.pause();
	    processObject(counter, extractObject(line));
  	});

	rl.on('end', function() {
	    rl.close();
	    client.indices.refresh({index:INDEX}, function(err, response, status) {
	    	if(err == null)
	        	io.emit('log', {"msg" : "Refreshing index..."});

	      process.exit();
	    })
	});
};

function extractObject(line) {
  var temp = line.replace(/\"/g, '').split("///");
  var object = {
    id: temp[0],
    sid: temp[1],
    serverid: temp[2],
    title: convertToQuery(temp[3]),
    singerid: convertToQuery(temp[4]),
    styleid: temp[5],
    tagid: temp[6],
    tracktime: temp[7],
    hotnum: temp[8],
    similarid: temp[9],
    status: temp[10],
    pubdate: temp[11],
    checked: temp[12]
  };
   
  return object;
};

function convertToQuery(string) {
  if(string != undefined) {
    var punctuationless = removePunctuation(string);
    var temp = punctuationless.split(' ');
    var name = '';

    for(var j = 0; j < temp.length; j++)
      name += temp[j] + '+';

    return name.substr(0, name.length - 1);
  } else
    return '';
};

function removePunctuation(string) {
  var punctRE = /[\u2000-\u206F\u2E00-\u2E7F\\'!"#\$%&\(\)\*\+,\-\.\/:;<=>\?@\[\]\^_`\{\|\}~]/g;
  var spaceRE = /\s+/g;
  var result = string.replace(punctRE, '').replace(spaceRE, ' ');
  return result;
};

function processObject(number, input) {
	client.index({
			index: INDEX,
			type: TYPE,
			id: number,
			body: input
		}, function (error, response) {
		    if(counter % 1000 == 0) 
		        io.emit('log', {"msg" : "1000 done..."});
		    rl.resume();
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