var fs = require('fs');
var path = require('path');
var express = require('express');
var swig = require('swig');
var _ = require('underscore')._;

var app = express.createServer();

function LOCAL_FILE() {
    var parts = [__dirname];
    _.each(arguments, function(x){parts.push(x);});
    var lf = path.join.apply(null, parts);
    return lf;
}
var VIEW_PATH = LOCAL_FILE('views');
var ASSETS_PATH = LOCAL_FILE('public');
var CLIENT_PATH = LOCAL_FILE('client');

swig.init({
    root: VIEW_PATH,
    allowErrors: true
});
app.set('views', VIEW_PATH);
app.register('.html', swig);
app.set('view options', { layout: false });
app.set('view cache', true);

app.set('views', VIEW_PATH);
app.set('view engine', 'html');

app.configure(function(){

    /* very basic HTTP stuff */
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.cookieParser());

    /* and session */
    app.use(express.session({
        secret: 'fa8232889ff9323d7ed8368a410a4027'
    }));

    /* using http://lesscss.org for stylesheets */
    app.use(express.compiler({src: ASSETS_PATH, enable: ['less'] }));

    app.use(app.router);
    app.use(express['static'](ASSETS_PATH));
    app.use(express['static'](CLIENT_PATH));
});

app.configure('development', function(){
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
    app.use(express.errorHandler());
});

app.get('/', function(request, response){
    return response.render('index.html', {
    });
});

app.listen(process.env.PORT || 3000);
