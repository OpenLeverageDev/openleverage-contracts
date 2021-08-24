const argv = require('minimist')(process.argv.slice(2), {string: ['custom_argument']});
var logger = require("mocha-logger");

var mochaTestCount = 0;
var fastMode = false;

beforeEach(function () {
    this.currentTest.id = ++mochaTestCount;
    logger.log("\n[TEST " + this.currentTest.id + "]: " + this.currentTest.title);
    if (argv['mode'] == "fast")
        fastMode = true;
    console.log("Running mode: " + argv['mode']);
});