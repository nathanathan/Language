//TODO: Why am I getting duplicate interpretations for nested lists (e.g. ((1)))
//TODO: Should regexs have multiple interpretations.
//TODO: Create StreamList w/ forEachThen, append, and finish methods
var assert = require('assert');
var _ = require('underscore')._;
var EventEmitter = require( "events" ).EventEmitter;
var winston = require('winston');
var utils = require('./utils');

var myCustomLevels = {
    levels: {
        statepool: 1,
        functions: 1
    },
    colors: {
        statepool: 'blue',
        functions: 'green'
    }
};
//TODO: Remember to comment out logging for greater efficiency.
var logger = new(winston.Logger)({
    levels: myCustomLevels.levels,
    transports: [
        new (winston.transports.Console)({ level: 'functions', colorize: true })
    ]
});
winston.addColors(myCustomLevels.colors);

function replaceStringsWithTerminalObjects(langNode) {
    //Strings syntactic sugar to make it easier to langNode creators to define terminals.
    //Object terminals are needed so meta data can be attached to them.
    if (langNode.components) {
        langNode.components = _.map(langNode.components, function(component) {
            if (_.isString(component)) {
                return {
                    terminal: component
                };
            }
            else if (_.isObject(component)) {
                replaceStringsWithTerminalObjects(component);
                return component;
            }
        });
    }
}
function initializeRegexs(langNode) {
    //Strings syntactic sugar to make it easier to langNode creators to define terminals.
    //Object terminals are needed so meta data can be attached to them.
    if (langNode.components) {
        langNode.components = _.map(langNode.components, function(component) {
            if (_.isObject(component)) {
                if('regex' in component){
                    component.compiledRegExp = new RegExp('^' + component.regex + '$');
                } else {
                    initializeRegexs(component);
                }
                return component;
            }
        });
    }
}
/**
 * Compare two langNodes to see if they are at the same state of the same production rule.
 **/
//TODO: Unit test this.
//TODO: Inline categories are not handled.
function compareLangNodes(langNodeA, langNodeB) {
    if(langNodeA.category === langNodeB.category){
        if(langNodeA.parseData.origin === langNodeB.parseData.origin){
            if(langNodeA.parseData.atComponent === langNodeB.parseData.atComponent){
                if(langNodeA.parseData.stringIdx === langNodeB.parseData.stringIdx){
                    //State is the same, now check that the components are the same:
                    //TODO: Not sure if this works with regexs properly.
                    //console.log(langNodeA.components);
                    //console.log(langNodeB.components);
                    return _.isEqual(langNodeA.components, langNodeB.components);
                    //Problem comparing compiled regex?
                    if(langNodeA.components.length === langNodeB.components.length) {
                        return _.all(_.zip(langNodeA.components, langNodeB.components), function(componentPair) {
                            return componentPair[0].category === componentPair[1].category &&
                                componentPair[0].match === componentPair[1].match &&
                                componentPair[0].terminal === componentPair[1].terminal;
                        });
                    }
                }
            }
        }
    }
    return false;
}
function mergeInterpretations(interpsA, interpsB){
    interpsB.forEach(function(interpB){
        if(interpsA.every(function(interpA){
                var  componentIdx = 0;
                var compA, compB;
                //interpA and interpB must have the same length
                while( componentIdx < interpA.length ) {
                    compA = interpA[componentIdx];
                    compB = interpB[componentIdx];
                    if('interpretations' in compA && 'interpretations' in compB) {
                        if(compareLangNodes(compA, compB)) {
                            mergeInterpretations(compA.interpretations, compB.interpretations);
                            return false;
                        } else {
                            return true;
                        }
                    } else {
                        return !(compA.terminal === compB.terminal && interpA.match === compB.match);
                    }
                }
            })) {
            //some inefficiency since we don't need to iterate over the new interp.
            interpsA.push(interpB);
        }
    });
}
//Thanks to Luke Z. for suggesting the Earley parser to me.
//The thing that makes it great for this purpose is that it doesn't have to look at all the non-terminals in the grammar,
//but it still has reasonable time complexity in the size of the input string.
//Earley parser refrences I studied:
//http://en.wikipedia.org/wiki/Earley_parser
//http://www1.icsi.berkeley.edu/~stolcke/papers/cl95/paper-html.html
//https://github.com/tomerfiliba/tau/blob/master/earley3.py
//http://stevehanov.ca/qb.js/EarleyParser.js
//http://www.ling.helsinki.fi/kit/2008s/clt231/nltk-0.9.5/doc/en/ch08.html
//My Earley parser differs from the standard version in it's use of
//node.js's asynchronous capabilities.
//Each token is a pool that the predictions flow through, or something like that.
//I still don't feel like I fully understand it.
module.exports = {
    /**
     * chartToInterpretations converts a parse chart to a tree of langNodes with "interpretations" properties.
     * Interpretations is an array of component arrays.
     *    It might be possible to slightly modify the parse function to generate an interpretation tree more efficiently
     *    however, I don't want to make parse any more complex that it already is at this point.
     *    With some query statistics it could even become possible to further prune the grammer by leaving out
     *    highly imporobable parses.
     */
     //Deprecated
    chartToInterpretations : function (chart) {
         //Returns an array of interpretations. Each interpretation is a corresponding array of components.
        function processComponents(components, colIdx) {
            var component, langNodeInterps;
            if(components.length === 0 || colIdx <= 0){//colIdx?
                return [[]];
            }
            component = components.slice(-1)[0];
            if('terminal' in component) {
                return _.map(processComponents(components.slice(0, -1), colIdx - component.terminal.length), function(interpretation){
                    return interpretation.concat(component);
                });
            } else if('regex' in component) {
                return _.map(processComponents(components.slice(0, -1), colIdx - component.match.length), function(interpretation){
                    return interpretation.concat(component);
                });
            } else if('category' in component) {
                langNodeInterps = _.filter(chart[colIdx], function(langNode) {
                    return (langNode.category === component.category) && (langNode.parseData.atComponent >= langNode.components.length);
                });
                if(langNodeInterps.length === 0 ) return [[]];
                return _.flatten(_.map(langNodeInterps, function(langNodeInterp) {
                    //Might be causing stack overflow.
                    var returnInterp = langNodeInterp;//_.extend({}, langNodeInterp);//TODO: Probably not necessairy.
                    returnInterp.interpretations = processComponents(returnInterp.components, colIdx);
                    return _.map(processComponents(components.slice(0, -1), langNodeInterp.parseData.origin), function(interpretation){
                        //TODO: remove parseData here?
                        return interpretation.concat(returnInterp);
                    });
                }), true);
            } else {
                throw "Unknown component type:\n" + JSON.stringify(component);
            }
        }
        var interpretationsTree = processComponents([{category : 'GAMMA'}], chart.length - 1)[0][0];
        if(interpretationsTree){
            return _.flatten(interpretationsTree.interpretations, true);
        } else {
            return interpretationsTree;
        }
    },
    //TODO: I would like to make a streaming version of this.
    //i.e. it would synchronously return an empty parsechart with async events you can bind to.
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
        var chart = _.map(splitInput, function(){
            return [];
        });
        var statePools = [];
        var finishCounter = splitInput.length;
        
        //This is async.
        function predictor(langNode, j) {
            var currentComponent = langNode.components[langNode.parseData.atComponent];
            //console.log("predictor: category: " + currentComponent.category);
            collection.find({ 'content.category' : currentComponent.category }).toArray(function(err, array) {
                if (err) {
                    //TODO: I think err is only for db errors.
                    //In that case a warning to the user that the result set is incomplete might be nice.
                    array = [];
                };
                _.each(array, function(cLangNode){
                    //TODO: Maybe use objects with functions for dealing with parse data on terminals and regexs.
                    cLangNode.parseData = {
                        'atComponent' : 0,
                        'stringIdx' : 0,
                        'origin' : j
                    };
                    //Putting category/components at the top level might make things easier to deal with
                    //if there are nested categories declaired inline in a langNode.json file,
                    //not that I have support for this yet.
                    cLangNode.category = cLangNode.content.category;
                    cLangNode.components = cLangNode.content.components;
                    replaceStringsWithTerminalObjects(cLangNode);
                    cLangNode.interpretations = [_.map(cLangNode.components, Object.create)];
                    initializeRegexs(cLangNode);
                    statePools[j].emit('add', cLangNode);
                });
                //I'm assuming that emited events happen in order or emission.
                //Otherwise the statepool might seem to be empty and finish before all the predicted nodes are added.
                statePools[j].emit('done');
            });
        }
        function terminalScanner(langNode, j) {
            logger.functions("terminalScanner");
            logger.functions(JSON.stringify(langNode));
            var componentString = langNode.components[langNode.parseData.atComponent].terminal;
            if(input[j] === componentString[langNode.parseData.stringIdx]) {
                langNode = Object.create(langNode);
                langNode.parseData = _.clone(langNode.parseData);
                langNode.parseData.stringIdx++;
                if(langNode.parseData.stringIdx >= componentString.length) {
                    langNode.parseData.atComponent++;
                    langNode.parseData.stringIdx = 0;
                }
                statePools[j+1].emit('add', langNode);
            }
            statePools[j].emit('done');
        }
        function regexScanner(langNode, j) {
            logger.functions("regexScanner");
            logger.functions(JSON.stringify(langNode));
            var alwaysEmittedNode, matchEmittedNode, inputSlice, modifiedComponent;
            var component = langNode.components[langNode.parseData.atComponent];
            if(j < input.length) {//TODO: Use incremental regexs here to rule out input that can't possibly match.
                alwaysEmittedNode = Object.create(langNode);
                alwaysEmittedNode.parseData = _.clone(langNode.parseData);//Can I use Object.create here? Iff parseData is static?
                alwaysEmittedNode.parseData.stringIdx++;
                statePools[j+1].emit('add', alwaysEmittedNode);
            }

            inputSlice = input.slice(j - langNode.parseData.stringIdx, j);
            if(component.compiledRegExp.test(inputSlice)) {
                matchEmittedNode = Object.create(langNode);
                matchEmittedNode.parseData = _.clone(langNode.parseData);//Can I use Object.create here?
                //shallow copy interpretations:
                matchEmittedNode.interpretations = matchEmittedNode.interpretations.map(function(x){ return x; });
                //shallow copy component array:
                matchEmittedNode.interpretations[0] = matchEmittedNode.interpretations[0].map(function(x){ return x; });
                modifiedComponent = _.clone(component);//TODO: modify chart rendering so I can use Object.create here?
                modifiedComponent.match = inputSlice;
                matchEmittedNode.interpretations[0][matchEmittedNode.parseData.atComponent] = modifiedComponent;
                matchEmittedNode.parseData.atComponent++;
                matchEmittedNode.parseData.stringIdx = 0;
                statePools[j].emit('add', matchEmittedNode);
            }
            statePools[j].emit('done');
        }
        
        function completer(langNode, j) {
            function completerCallback() {
                logger.functions("completer " + j);
                _.each(chart[langNode.parseData.origin], function(originLN, idx) {
                    var originComponent = originLN.components[originLN.parseData.atComponent];
                    //This assumes we are completing non-terminals.
                    if(originLN.parseData.atComponent < originLN.components.length) {
                        //TODO: Think about this more.
                        //if( originComponent === langNode || originComponent.isPrototypeOf(langNode)) {
                        if( originComponent.category === langNode.category ) {
                            //Make a new state from the origin state
                            originLN = Object.create(originLN);
                            //shallow copy interpretations: (important bc the same origin node might be completed by multiple nodes)
                            originLN.interpretations = originLN.interpretations.map(function(interpretation){ 
                                //shallow copy component array:
                                interpretation = interpretation.map(function(x){ return x; });
                                interpretation[originLN.parseData.atComponent] = langNode;
                                return interpretation;
                            });
                            originLN.parseData = _.clone(originLN.parseData);
                            originLN.parseData.atComponent++;
                            statePools[j].emit('add', originLN);
                        }
                    }
                });
                statePools[j].emit('done');
            }
            //Wait for the origin statepool to drain before doing the lookback.
            if(statePools[langNode.parseData.origin].finished) {
                completerCallback();
            } else {
                //I have this log statement because I want proof that this actually happens.
                console.log("Origin pool not drained!");
                statePools[langNode.parseData.origin].once('finish', completerCallback);
            }
        }
        _.each(splitInput, function(character, idx) {
            var statePool = new EventEmitter();
            //counts unprocessed langNodes remaining the the pool
            statePool.counter = 0;
            
            //Chain all the statepools' finish events together.
            if(idx > 0) {
                statePools[idx-1].once('finish', function() {
                    if( statePool.counter === 0 ){
                        statePool.emit('finish');
                    } //otherwise finish will be emited when the pool is empty.
                });
            }
            //finish is fired when this pool and all the previous pools are empty.
            //I'm not positive it is fired only once, it should be, but I'm using "once" callbacks to be safe.
            statePool.once('finish', function() {
                logger.statepool("finish " + idx);
                statePool.finished = true;
                finishCounter--;
                if(finishCounter <= 0){
                    callback(null, chart);
                }
            });
            //done is fired when a single state in the pool finishes processing.
            statePool.on('done', function() {
                logger.statepool("done");
                statePool.counter--;
                if( statePool.counter === 0 ){
                    statePool.emit('empty');
                }
            });
            statePool.on('empty', function() {
                logger.statepool("empty");
                if( idx === 0 || statePools[idx-1].finished ){
                    statePool.emit('finish');
                }
            });
            statePool.on('add', function(langNode) {
                logger.statepool("Adding:");
                logger.statepool(JSON.stringify(_.extend({}, langNode)));
                var currentComponent;
                //Make sure the item is unique.
                //TODO: I'm not sure what this does with regexs
                var duplicate = _.find(chart[idx], function(item) {
                    return compareLangNodes(langNode, item);
                });
                if(duplicate) {
                    //Duplicates generate interpretations.
                    //I'm not sure if that's the right way to do it.
                    //When I rewrite this I think I will go back to using a separate
                    //step to generate the tree, however I will attempt to make that step streaming
                    //so it can happen as the parse chart is genrated.
                    console.log("Duplicate found:");
                    console.log(JSON.stringify(utils.deprototype(langNode), 2, 2));
                    //duplicate.interpretations = duplicate.interpretations.concat(langNode.interpretations);
                    mergeInterpretations(duplicate.interpretations, langNode.interpretations);
                    return;
                }
                statePool.counter++;
                chart[idx].push(langNode);
                
                if(langNode.parseData.atComponent < langNode.components.length) {
                    currentComponent = langNode.components[langNode.parseData.atComponent];
                    if('terminal' in currentComponent) {
                        terminalScanner(langNode, idx);
                    } else if('category' in currentComponent) { //categories are non-terminals
                        predictor(langNode, idx);
                    } else if('regex' in currentComponent) {
                        regexScanner(langNode, idx);
                    } else {
                        throw "Unknown component type:\n" + JSON.stringify(currentComponent);
                    }
                } else {
                    completer(langNode, idx);
                }
            }); 
            statePools.push(statePool);
        });
        //TODO: Try feeding this into predictor instead so GAMMA doesn't show up in the output.
        statePools[0].emit('add', {
            'category' : 'GAMMA',
            'components' : [{'category' : startCategory}],
            'parseData': {
                'atComponent' : 0,
                'stringIdx' : 0,
                'origin': 0
            },
            'interpretations' : [[{'category' : startCategory}]]
        });
    }
};
