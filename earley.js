//TODO: Create StreamList w/ forEachThen, append, and finish methods
var assert = require('assert');
var _ = require('underscore')._;
var EventEmitter = require( "events" ).EventEmitter;
function isIncomplete(langNode) {
    return (langNode.atComponent < langNode.components.length);
}
//Thanks to Luke Z. for suggesting the Earley parser to me.
//The thing that makes it great for my purposes is that it doesn't have to look at all the non-terminals,
//but it still has reasonable time complexity in the size of the input string.
//Earley parser refrences I studied:
//http://en.wikipedia.org/wiki/Earley_parser
//http://www1.icsi.berkeley.edu/~stolcke/papers/cl95/paper-html.html
//https://github.com/tomerfiliba/tau/blob/master/earley3.py
//http://stevehanov.ca/qb.js/EarleyParser.js
//My Earley parser differs from the standard version in it's use of
//node.js's asynchronous capabilities.
//Each token is a pool that the predictions flow through, or something like that.
//I still don't feel like I fully understand it.
module.exports = {
    /**
     * chartToTree has issues.
     * 1. I'm sure it's quite inefficient.
     * 2. It's probably possible to slightly modify the parse function to generate tree stuff,
     *    however, I don't want to make that any more complex that it already is.
     * 3. The structure of "interpretations" is ambiguous. For example, ambiguous ABC could be:

     *      interpretations: [
     *          {components: [A1, 
     *              {
     *                  interpretations: [{components: [B1 ,C1]}]
     *              }
     *          ]},
     *          {components: [A2, 
     *              {
     *                  interpretations: [{components: [B2 ,C2]}]
     *              }
     *          ]},
     *      ]
     * or
     *      interpretations: [
     *          {components: [
     *              {
     *                  interpretations: [{components: [A1 ,B1]}]
     *              }, C1
     *          ]},
     *          {components: [
     *              {
     *                  interpretations: [{components: [A2 ,B2]}]
     *              }, C2
     *          ]},
     *      ]
     * To avoid ambiguity and dealing with nested interpretations we can make a forest with every full parse tree, but that could get pretty big.
     * For now I'm grouping interpretations to the left.
     * 
     * Nevermind! I'm really tired right now but I have an idea that seems to make more sence
     * where interpretations apply to the whole component array.
     */
    chartToInterpretationTree : function (chart) {
         //Try to find all the components' childen in the chart starting at colIdx and progressing left.
         //Returns an array of interpretations. Each interpretation is a corresponding array of components.
        function processComponents(components, colIdx) {
            var component, langNodeInterps;
            if(components.length === 0 || colIdx <= 0){//colIdx?
                return [[]];
            }
            component = components.slice(-1)[0];
            if(_.isString(component)) {
                return _.map(processComponents(components.slice(0, -1), colIdx - component.length), function(interpretation){
                    return interpretation.concat(component);
                });
            } else if(_.isObject(component)) {
                if('category' in component) {
                    langNodeInterps = _.filter(chart[colIdx], function(langNode) {
                        return (langNode.category === component.category) && !isIncomplete(langNode);
                    });
                    return _.flatten(_.map(langNodeInterps, function(langNodeInterp) {
                        var returnInterp = _.extend({}, langNodeInterp);
                        returnInterp.interpretations = processComponents(returnInterp.components, colIdx);
                        return _.map(processComponents(components.slice(0, -1), langNodeInterp.origin), function(interpretation){
                            return interpretation.concat(returnInterp);
                        });
                    }), true);
                } else if('regex' in component) {
                    //TODO
                } else {
                    throw "Unknown component type:\n" + JSON.stringify(component);
                }
            } else {
                throw "Unknown component type:\n" + component;
            }
        }
        var interpretationsTree = processComponents([{category : 'GAMMA'}], chart.length - 1)[0][0];
        if('interpretations' in interpretationsTree){
            return _.flatten(interpretationsTree.interpretations, true);
        } else {
            return interpretationsTree;
        }
    },
    parse : function (input, startCategory, collection, callback) {
        if(!input) {
            callback('No input');
            return;
        }
        if(!startCategory) {
            callback('No start category');
            return;
        }
        //Note, an emptystring is added to the end of the input array bc
        //the scanner might try to add things when it's on the last char.
        var splitInput = input.split('').concat(['']);
        console.log(splitInput);
        var chart = _.map(splitInput, function(){
            return [];
        });
        var statePools = [];
        var finishCounter = splitInput.length;
        function finishListener() {
            console.log("finish");
            finishCounter--;
            if(finishCounter <= 0){
                callback(null, chart);
            }
        }
        //This is async.
        function predictor(langNode, j) {
            var currentComponent = langNode.components[langNode.atComponent];
            console.log("predictor: category: " + currentComponent.category);
            collection.find(currentComponent).toArray(function(err, array) {
                if (err) throw err;//TODO: Missing categories might be an issue, but perhaps this is only for db errors.
                _.each(array, function(cLangNode){
                    cLangNode.atComponent = 0;
                    cLangNode.stringIdx = 0;
                    cLangNode.origin = j;
                    statePools[j].emit('add', cLangNode);
                    //cLangNode.value = _.map(cLangNode.components, function(){return [];});
                    //langNode.value[langNode.atComponent].push(cLangNode);
                });
                //I'm assuming that emited events happen in order or emission.
                statePools[j].emit('done');
            });
        }
        function scanner(langNode, j) {
            console.log("scanner");
            console.log(langNode);
            var component = langNode.components[langNode.atComponent];
            if(input[j] === component[langNode.stringIdx]) {
                langNode = Object.create(langNode);
                langNode.stringIdx++;
                if(langNode.stringIdx >= component.length) {
                    langNode.atComponent++;
                    langNode.stringIdx = 0;
                }
                statePools[j+1].emit('add', langNode);
            }
            statePools[j].emit('done');
        }
        function completer(langNode, j) {
            console.log("completer");
            //TODO: This is probably a bug, the chart might not be fully filled out.
            _.each(chart[langNode.origin], function(originLN, idx) {
                var originComponent = originLN.components[originLN.atComponent];
                //This assumes we are completing non-terminals.
                if(originComponent.category === langNode.category) {
                    //Make a new state from the origin state
                    originLN = Object.create(originLN);
                    originLN.atComponent++;
                    statePools[j].emit('add', originLN);
                }
            });
            statePools[j].emit('done');
        }
        _.each(splitInput, function(character, idx) {
            var statePool = new EventEmitter();
            var counter = 0;
            var prevPoolFinished = false;
            if(idx > 0){
                statePools[idx-1].on('finish', function(){
                    prevPoolFinished = true;
                    if( counter === 0 ){
                        statePool.emit('empty');
                    }
                });
            } else {
                prevPoolFinished = true;
            }
            statePool.on('finish', finishListener);
            statePool.on('done', function(){
                console.log("done");
                counter--;
                if( counter === 0 ){
                    statePool.emit('empty');
                }
            });
            statePool.on('empty', function(){
                console.log("empty");
                if( prevPoolFinished ){
                    statePool.emit('finish');
                }
            });
            statePool.on('add', function(langNode) {
                console.log("Adding:");
                console.log(_.extend({}, langNode));
                var currentComponent;
                //Make sure the item is unique.
                if(_.any(chart[idx], function(item){
                        if(langNode.atComponent === item.atComponent){
                            if(langNode.stringIdx === item.stringIdx){
                                if(langNode.category === item.category){
                                    return _.isEqual(langNode.components, item.components);
                                }
                            }
                        }
                        return false;
                    })) {
                    console.log("duplicate found");
                    return;
                }
                counter++;
                chart[idx].push(langNode);
                if(isIncomplete(langNode)) {
                    currentComponent = langNode.components[langNode.atComponent];
                    if(_.isString(currentComponent)) { //TODO: Strings are teminals.
                         scanner(langNode, idx);
                    } else if(_.isObject(currentComponent)) {
                        if('category' in currentComponent) { //categories are non-terminals
                            predictor(langNode, idx);
                        } else if('regex' in currentComponent) {
                            //TODO
                        } else {
                            throw "Unknown component type:\n" + JSON.stringify(currentComponent);
                        }
                    }
                } else {
                    completer(langNode, idx);
                }
            }); 
            statePools.push(statePool);
        });
        statePools[0].emit('add', {
            'category' : 'GAMMA',
            'components' : [{'category' : startCategory}],
            'atComponent' : 0,
            'stringIdx' : 0,
            'origin': 0
            //,'value': [[]]
        });
    }
};