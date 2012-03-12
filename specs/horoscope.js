var should = require('should');
var moment = require('moment');

var horoscope = require('../lib/horoscope');

describe('Horoscope', function(){
    describe('#for_user()', function(){
        it('should return pisces for 02/25', function(){
            var user = {
                birthday: "02/25/1988"
            };

            var sign = horoscope.for_user(user);
            should.exist(sign);
            sign.should.have.property('name', 'pisces');
        });
    });
});

describe('Sign', function(){
    describe('#matches_birthday()', function(){
        it('taurus should match for 05/01', function(){
            var matched = horoscope.signs.taurus.matches_birthday(moment("05/01", "MM/DD"));
            matched.should.be.ok;
        });
    });
});