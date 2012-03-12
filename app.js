var fs = require('fs');
var path = require('path');
var express = require('express');
var swig = require('swig');
var async = require('async');
var moment = require('moment');
var _ = require('underscore')._;
var everyauth = require('everyauth');
var horoscope = require('./lib/horoscope');
var graph = require('fbgraph');
var RedisStore = require('connect-redis')(express);


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

    FACEBOOK_APP_ID = "383114045041494";
    FACEBOOK_APP_SECRET = "f72cc305ca430f7f0e9392b690ea45f8";
} else {
var redis = require('redis').createClient();
    FACEBOOK_APP_ID = "262532087156566";
    FACEBOOK_APP_SECRET = "aa34e8714d3edd484cd0595302e1f531";
}

var options = {
    timeout: 30000,
    pool: { maxSockets:  Infinity },
    headers: { connection:  "keep-alive" }
};

graph.setOptions(options);

everyauth.facebook
    .moduleTimeout(9999999999)
    .appId(FACEBOOK_APP_ID)
    .appSecret(FACEBOOK_APP_SECRET)
    .scope('friends_birthday,friends_about_me,friends_photos,user_birthday,user_about_me,user_photos')
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
        secret: 'fa8232889ff9323d7ed8368a410a4027',
        store: new RedisStore({ client: redis })
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
    this.picture = user.picture;
    this.sign = horoscope.for_user(user);
    this.born_at = "";
    this.year = null;
    if (this.sign) {
        this.year = parseInt(this.sign.day.year(), 10);
        if (this.year == 1900) {
            this.born_at = null;
        } else {
            this.born_at = this.sign.day.fromNow();
        }

    }
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

    var context = {
        name: user.name + "",
        born_past: sign.day.fromNow(),
        sign: sign,
        signs: horoscope.ordered_signs
    };
    var params = {
        "access_token": access_token
    };

    async.waterfall([
        function fetch_friends(callback){
            graph.get('me/friends', params, function(err, res){
                return callback(err, res.data);
            });
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
                            return callback(null, cached);
                        } else {
                            var path = '/' + friend.id;
                            graph.get(path, params, callback);
                        }
                    },
                    function get_picture(user, callback){
                        if (user.picture) {return callback(null, user);}
                        graph.get(user.id, _.extend(params, {fields: 'picture'}), function(err, res){
                            if (!err) {
                                user.cached = false;
                                user.picture = res.picture;
                            }
                            return callback(err, user);
                        });
                    },
                    function persist (data, callback) {
                        var f = _.extend(friend, data);
                        var raw = JSON.stringify(f);
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
                var newsign = _.clone(sign);
                newsign.friends = _.filter(friends, function(f){
                    return f.sign && (f.sign.name === sign.name);});
                return newsign;
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
        var pre_friends_json = {};
        _.each(friends, function(f){
            pre_friends_json[f.name] = f;
        });
        context.friends_json = JSON.stringify(pre_friends_json);
        context.friend_names = JSON.stringify(_.map(friends, function(f){return f.name;}));
        return response.render('index.html', context);
    });

}));

app.listen(process.env.PORT || 3000);
