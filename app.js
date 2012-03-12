var fs = require('fs');
var path = require('path');
var express = require('express');
var swig = require('swig');
var async = require('async');
var moment = require('moment');
var _ = require('underscore')._;
var everyauth = require('everyauth');
var horoscope = require('./lib/horoscope');
var fbapi = require('facebook-api');


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
    var rtg   = require("url").parse(process.env.REDISTOGO_URL);
    var redis = require("redis").createClient(rtg.port, rtg.hostname);
    redis.auth(rtg.auth.split(":")[1]);

    FACEBOOK_APP_ID = "302858476405601";
    FACEBOOK_APP_SECRET = "19c377a2f8635016bd5109d45d44a29a";
} else {
var redis = require('redis').createClient();
    FACEBOOK_APP_ID = "262532087156566";
    FACEBOOK_APP_SECRET = "aa34e8714d3edd484cd0595302e1f531";
}
everyauth.facebook
    .appId(FACEBOOK_APP_ID)
    .appSecret(FACEBOOK_APP_SECRET)
    .scope('friends_birthday,friends_about_me,friends_photos')
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

function Friend(user){
    this.user = user;
    this.id = user.id;
    this.name = user.name;
    this.sign = horoscope.for_user(user);
}

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
    var access_token = request.session.access_token;
    var user = request.session.user;

    var sign = horoscope.for_user(user);

    var client = fbapi.user(access_token);

    var context = {
        name: user.name,
        born_past: sign.day.fromNow(),
        sign: sign,
        signs: horoscope.ordered_signs
    };
    var params = {
        "access_token": access_token
    };

    async.waterfall([
        function fetch_friends(callback){
            client.me.friends(callback);
        },
        function fetch_birthdays(friends, callback){
            async.map(friends, function(friend, callback){
                async.waterfall([
                    function get_from_redis(callback){
                        redis.get('user::' + friend.id, callback);
                    },
                    function get_data(user, callback) {
                        if (user) {
                            var cached = JSON.parse(user);
                            cached.cached = true;
                            console.log('found in cache: ', cached.name);
                            return callback(null, cached);
                        } else {
                            fbapi.raw('GET', ('/' + friend.id), params, callback);
                        }
                    },
                    function persist (data, callback) {
                        var f = _.extend(friend, data);
                        var raw = JSON.stringify(friend);
                        if (f.cached) {
                            return callback(null, new Friend(f));
                        } else {
                            redis.set('user::' + friend.id, raw, function(err){
                                console.log('saving user: ', f.name);
                                return callback(null, new Friend(f));
                            });
                        }
                    }
                ], callback);
            }, callback);
        },
        function order(friends, callback){
            var signs_and_friends = _.map(horoscope.ordered_signs, function(sign){
                return {
                    name: sign.name,
                    friends: _.filter(friends, function(f){return f.sign && (f.sign.name === sign.name);})
                };
            });
            return callback(null, signs_and_friends, friends);
        },
        function persist_redis(signs_and_friends, friends, callback){
            redis.save(function(err){
                return callback(err, signs_and_friends, friends);
            });
        }
    ], function(err, signs_and_friends, friends){
        context.signs_and_friends = signs_and_friends;
        context.friends = friends;
        return response.render('index.html', context);
    });

}));

app.listen(process.env.PORT || 3000);
