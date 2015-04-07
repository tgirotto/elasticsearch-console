var fs = require('fs');
var express = require('express');
var logger = require('morgan');
var bodyParser = require('body-parser');
var elastic = require('elasticsearch');

var SERVER_PORT = 3000;
var ES_PORT = ':9200';
var HOST = 'localhost';

var app = express();
var client = new elastic.Client({host: HOST + ES_PORT});

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

/*******************************************************************************/


/*******************************************************************************/
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    console.log(err.message);
});

var server = app.listen(SERVER_PORT, function() {
	console.log('listening on port ', SERVER_PORT);
});