var earley = require('../earley');
var assert = require('assert');
var langNodes = require('../langNodes');

describe('earley.parse', function(){
    it('should greet the world', function(done){
        langNodes.simpleTestNodes.find = function(query) {
            return langNodes.simpleTestNodes;
        }
        langNodes.simpleTestNodes.toArray = function(f) {
            f(langNodes.simpleTestNodes);
        }
        earley.parse('hello world', 'main', langNodes.simpleTestNodes, function(err,chart){
            assert(!err);
            done();
        })
    });
});
      
                                             