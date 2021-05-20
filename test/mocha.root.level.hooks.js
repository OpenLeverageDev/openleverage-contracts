var logger = require("mocha-logger");

var mochaTestCount = 0;

beforeEach(function() {
  this.currentTest.id = ++mochaTestCount;
  logger.log("\n[TEST " + this.currentTest.id + "]: " + this.currentTest.title);
});