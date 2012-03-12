var _ = require('underscore')._;
var moment = require('moment');

var SIGNS = {
    "aries" : new Sign("03/21", "04/20", "aries"),
    "taurus": new Sign("04/21", "05/20", "taurus"),
    "gemini": new Sign("05/21", "06/21", "gemini"),
    "cancer": new Sign("06/22", "07/21", "cancer"),
    "leo":    new Sign("07/22", "08/22", "leo"),
    "virgo":  new Sign("08/23", "09/22", "virgo"),
    "libra":  new Sign("09/23", "10/22", "libra"),
    "scorpius": new Sign("10/23", "11/21", "scorpius"),
    "sagitarius": new Sign("11/22", "12/21", "sagitarius"),
    "capricornius": new Sign("12/22", "01/20", "capricornius"),
    "aquarius": new Sign("01/21", "02/19", "aquarius"),
    "pisces": new Sign("02/20", "03/20", "pisces")
};

function horoscope_from_moment(date, callback){
    var year = date.year();
    for (var name in SIGNS) {
        var sign = SIGNS[name];
        sign.normalize(year);

        if (sign.matches_birthday(date)) {
            return sign;
        }
    }
}

function Sign(start, end, name){
    this.start = moment(start, "MM/DD").toDate();
    this.end = moment(end, "MM/DD").toDate();
    this.name = name;
}
Sign.prototype.normalize = function(year){
    this.start.setFullYear(year);
    this.end.setFullYear(year);
};

Sign.prototype.matches_birthday = function(birthday){
    var date = birthday.toDate();
    var start = this.start;
    var end = this.end;
    start.setFullYear(birthday.year());
    end.setFullYear(birthday.year());
    return (date >= start) && (date <= end);
};

function for_user(user){
    var birthday = moment(user.birthday, "MM/DD/YYYY");
    return horoscope_from_moment(birthday);
}

module.exports.for_user = for_user;
module.exports.signs = {};
module.exports.Sign = Sign;

module.exports.signs = SIGNS;
