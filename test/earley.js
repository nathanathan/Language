var earley = require('../earley');
var assert = require('assert');
var langNodes = require('./testLangNodes');

function fake_find(result){
    return function(query){
        console.log('search:');
        console.log(query);
        return result;
    }
}
function fake_to_array(result){
    return function(f){
        return f(false, result);
    }
}

describe('earley.parse', function(){
    it('should greet the world', function(done){
        langNodes.simpleTestNodes.find = fake_find(langNodes.simpleTestNodes);
        langNodes.simpleTestNodes.toArray = fake_to_array(langNodes.simpleTestNodes);

        earley.parse('hello world', 'main', langNodes.simpleTestNodes, function(err,chart){
            assert(!err);
            console.log(JSON.stringify(chart));
            var interpretations = earley.chartToInterpretations(chart);
            console.log(JSON.stringify(interpretations));
            assert.equal(interpretations.length, 1);
            var inter = interpretations[0].interpretations;
            assert.equal(inter.length, 1);
            assert.equal(inter[0].length, 3);
            assert.equal(inter[0][0].terminal, 'hello');
            assert.equal(inter[0][1].terminal, ' ');
            assert.equal(inter[0][2].terminal, 'world');
            done();
        })
    });
    it('should test', function(done){
        langNodes.simpleTestNodes.find = fake_find(langNodes.simpleTestNodes);
        langNodes.simpleTestNodes.toArray = fake_to_array(langNodes.simpleTestNodes);

        earley.parse('test', 'main', langNodes.simpleTestNodes, function(err,chart){
            assert(!err);
            done();
        })
    });
});
      
                                             