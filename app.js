var fs = require('fs');
var path = require('path');
var express = require('express');
var swig = require('swig');
var moment = require('moment');
var _ = require('underscore')._;
var everyauth = require('everyauth');
var horoscope = require('./lib/horoscope');

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
    allowErrors: false
});
app.set('views', VIEW_PATH);
app.register('.html', swig);
app.set('view options', { layout: false });
app.set('view cache', true);

app.set('views', VIEW_PATH);
app.set('view engine', 'html');

if (process.env.PORT) {
    FACEBOOK_APP_ID = "302858476405601";
    FACEBOOK_APP_SECRET = "19c377a2f8635016bd5109d45d44a29a";
} else {
    FACEBOOK_APP_ID = "262532087156566";
    FACEBOOK_APP_SECRET = "a7197b2c30dc961b3f83f180965911be";
}
everyauth.facebook
    .appId(FACEBOOK_APP_ID)
    .appSecret(FACEBOOK_APP_SECRET)
    .scope('user_about_me,user_photos,friends_photos,email,publish_stream,user_birthday,friends_birthday,friends_about_me')
    .findOrCreateUser(function(session, access_token, accessTokExtra, user) {
        session.user = user;
        session.access_token = access_token;
        return user;
    })
    .logoutPath('/logout')
    .handleLogout(function(request, response){
        request.session.user = null;
        request.logout();
        response.redirect('/');
    })
    .redirectPath('/');

everyauth.helpExpress(app);

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
    app.use(everyauth.middleware());
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

function controller (callback) {
    return function(request, response){
        var self = this;
        if (!request.session.user) {
            return response.redirect('/auth/facebook');
        }
        return callback.apply(self, arguments);
    };
}


app.get('/', controller(function(request, response){
    var user = request.session.user;

    var sign = horoscope.for_user(user);

    var context = {
        name: user.name,
        email: user.email,
        born_past: sign.day.fromNow(),
        sign: sign,
        signs: horoscope.ordered_signs
    };

    return response.render('index.html', context);
}));

app.listen(process.env.PORT || 3000);
