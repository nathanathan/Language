#!/bin/env node
var express = require('express');
var fs      = require('fs');
var _ = require('underscore')._;
var assert = require('assert');

var Handlebars = require('handlebars');
Handlebars.registerHelper('stringify', function(object) {
    return JSON.stringify(object);
});
//Database:
var mongo = require('mongoskin');
var db;
//For connecting to github api:
var https = require('https');
var pipette = require('pipette');

var config = require('./config');
var langNodes = require('./langNodes');
//var earley = require('./earley');

//  Local cache for static content [fixed and loaded at startup]
var zcache = {};
zcache.indexTemplate = Handlebars.compile(fs.readFileSync('index.html', encoding='utf8'));
zcache.resultsTemplate = Handlebars.compile(fs.readFileSync('results.html', encoding='utf8'));

// Create "express" server.
var app  = express.createServer();

app.configure(function(){
	//app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
	app.use(express.bodyParser());//This must come before router
	app.use(app.router);
	//app.use(express.static('./ace-builds'));
    app.use(express.static('./static'));
});

/*  =====================================================================  */
/*  Setup route handlers.  */
/*  =====================================================================  */

// Handler for GET /health
app.get('/health', function(req, res){
    res.send('1');
});

app.get('/dbg', function(req, res) {
    db.collection('langNodes').find().toArray(function(err, items){
        if(err) throw err;
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end(JSON.stringify(items));
    });
    return;
});
app.get('/dbgf', function(req, res) {
    db.collection('files').find().toArray(function(err, items){
        if(err) throw err;
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end(JSON.stringify(items));
    });
    return;
});


/*
function addToSet(item, arraySet) {
    if(_.any(arraySet, function(setItem){ return item === setItem; })) {
        //no-op
    } else {
        arraySet.push(item);
    }
}
*/
function isIncomplete(langNode) {
    return (langNode.atComponent < langNode.components.length);
}
var EventEmitter = require( "events" ).EventEmitter;

//Earley parser refrences I studied:
//http://en.wikipedia.org/wiki/Earley_parser
//http://www1.icsi.berkeley.edu/~stolcke/papers/cl95/paper-html.html
//https://github.com/tomerfiliba/tau/blob/master/earley3.py
//http://stevehanov.ca/qb.js/EarleyParser.js

//My Earley parser differs from the standard version in it's use of
//node.js's asynchronous capabilities.
//Each token is a pool that the predictions flow through, or something like that.
//I still don't feel like I fully understand it.
var EarleyParser = {
    chartToTree : function (chart) {
        /*
        var gammaState = chart.slice(-1).find(function(state){
            return state.category === 'GAMMA';
        });
        var component = components.slice(-1);
        */
        function processComponents(components, colIdx) {
            if(components.length === 0 || colIdx <= 0){//colIdx?
                return [];
            }
            var returnComponent;
            var component = components.slice(-1)[0];
            if(_.isString(component)) {
                return processComponents(components.slice(0, -1), colIdx - component.length).concat([component]);
            } else if(_.isObject(component)) {
                if('category' in component) { //categories are non-terminals
                    returnComponent = Object.create(component);
                    returnComponent.interpretations = _.filter(chart[colIdx], function(state) {
                        return (state.category === component.category) && !isIncomplete(state);
                    });
                    returnComponent.interpretations = _.map(returnComponent.interpretations, function(interpretation) {
                        var returnInterp = Object.create(interpretation);
                        returnInterp.components = processComponents(interpretation.components, colIdx);
                        return processComponents(components.slice(0, -1), interpretation.origin - 1).concat([_.extend({}, interpretation)]);
                    });
                    return [_.extend({}, returnComponent)];
                    //return processComponents(components.slice(0, -1), component.origin - 1).concat([_.extend({}, returnComponent)]);
                } else if('regex' in component) {
                    //TODO
                } else {
                    throw "Unknown component type:\n" + JSON.stringify(component);
                }
            } else {
                throw "Unknown component type:\n" + component;
            }
        }
        return processComponents([{category : 'GAMMA'}], chart.length - 1);
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
        function predictor(catComponent, j) {
            console.log("predictor: category: " + catComponent.category);
            collection.find({ 'category' : catComponent.category }).toArray(function(err, array) {
                if (err) throw err;//TODO: Missing categories might be an issue, but perhaps this is only for db errors.
                _.each(array, function(langNode){
                    langNode.atComponent = 0;
                    langNode.stringIdx = 0;
                    langNode.origin = j;
                    statePools[j].emit('add', langNode);
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
                            predictor(currentComponent, idx);
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
        });
    }
};
/*
app.get('/category/:category', function(req, res){
    //TODO: Check that the category exists.
    var renderedTemplate;
    var category = req.params.category;
    if('q' in req.query){
        db.collection('langNodes').find().toArray(function(err, items) {
            if(err) throw err;
            renderedTemplate = zcache.resultsTemplate({interpretations: items, parseId:123, query: req.query.q});
            res.send(renderedTemplate);
        });
    } else {
        renderedTemplate = zcache.indexTemplate({'category' : category});
        res.send(renderedTemplate);
    }
});
*/

app.get('/category/:category', function(req, res){
    //TODO: Check that the category exists.
    var renderedTemplate;
    var category = req.params.category;
    if('q' in req.query){
         EarleyParser.parse(req.query.q, category, db.collection('langNodes'), function(err, chart){
            if(err){
                res.send(String(err));
                return;
            }
            /*
            res.send('<pre>'+JSON.stringify(_.map(chart, function(col) {
                return _.map(col, function(item){
                    return _.extend({}, item);
                });
            }), 2, 4)+'</pre>');
            */
            res.send('<pre>'+JSON.stringify(EarleyParser.chartToTree(chart), 2, 4)+'</pre>');
         });
    } else {
        renderedTemplate = zcache.indexTemplate({'category' : category});
        res.send(renderedTemplate);
    }
});
/*
app.get('/', function(req, res){
    EarleyParser.parse('test', 'general', db.collection('langNodes'), function(err, parseTree){
        if(err){
            res.send(String(err));
            return;
        }
        res.send('<pre>'+JSON.stringify(parseTree, 2, 4)+'</pre>');
    });
});
*/
// Handler for GET /
app.get('/', function(req, res){
    var renderedTemplate;
    var category = 'main';
    renderedTemplate = zcache.indexTemplate({'category' : category});
    res.send(renderedTemplate);
});

function fetchRepo(repository, callback) {
    if (repository.type === 'gist') {
        https.request({
            host: 'api.github.com',
            port: 443,
            path: '/gists/' + repository.gistId,
            method: 'GET'
        }, function(gitres) {
            var gitdata = new pipette.Sink(gitres);
            gitdata.on('data', function(data) {
                var parsedData;
                try{
                    parsedData = JSON.parse(data.toString());
                } catch(err) {
                    callback(err);
                    return;
                }
                callback(null, parsedData);
            });
        }).on('error', callback).end();
    }
    else if (repository.type === 'github') {
        //see:
        //http://developer.github.com/v3/repos/contents/
    }
    else {
        callback("Unknown repo type");
    }
}
function syncNode(query, content, callback) {
    db.collection('langNodes').findAndModify(query, [['_id', 'descending']], {
        $set: {
            lastSync: String(new Date()),
            content: content
        }
    }, {
        'upsert': true,
        'new': true,
        'safe': true //Not sure if this is needed for findAndModify, it checks for success
    },
    function(err, result) {
        callback(err, result);
    });
}

/**
 * Return info on a language node and sync it with its repo
 **/
app.get('/langNode/:id', function(req, res) {
    var id = req.params.id;
    db.collection('langNodes').findById(id, function(err, langNode) {
        if (err) {
            res.send('Error: ' + err);
            return;
        }
        fetchRepo(langNode.repository, function(err, repositoryData) {
            var content, lastGistCommitDate, lastSyncDate;
            if (err) {
                res.send('Error: ' + err);
                return;
            }
            lastGistCommitDate = new Date(repositoryData.history[0].committed_at);
            lastSyncDate = langNode.lastSync ? new Date(langNode.lastSync) : new Date(0);
            if (lastGistCommitDate > lastSyncDate) {
                try{
                    content = JSON.parse(repositoryData.files['languageNode.json'].content);
                } catch(err) {
                    res.send('Error: ' + err);
                    return;
                }
                //content.files = repositoryData.files;
                
                syncNode({
                    _id: langNode._id
                }, content, function(err, syncedNode) {
                    if (err) {
                        res.send('Error: ' + err);
                        return;
                    }
                    //Files are kept separately so langNode docs are smaller.
                    //Eventually, I would like to use ghpages
                    db.collection('files').update({
                        _id: syncedNode._id
                    }, {
                        _id: syncedNode._id,
                        files: repositoryData.files
                    }, {
                        upsert: true,
                        safe: true
                    }, function() {});
                    
                    res.send('SYNCED:' + JSON.stringify(syncedNode));
                });
            }
            else {
                res.send('Repository already synced.');
            }
        });
    });
});

app.post('/submit', function(req, res) {
    var repository = {
        type: 'gist',
        gistId: req.body.gistId
    };
    fetchRepo(repository, function(err, repositoryData) {
        var content;
        if (err) {
            res.send('Error: ' + err);
            return;
        }
        try{
            content = JSON.parse(repositoryData.files['languageNode.json'].content);
        } catch(err) {
            res.send('Error: ' + err);
            return;
        }
        //content.files = repositoryData.files;
        
        syncNode({
            repository: repository
        }, content, function(err, syncedNode) {
            if (err) {
                res.send('Error: ' + err);
                return;
            }
            db.collection('files').update({
                _id: syncedNode._id
            }, {
                _id: syncedNode._id,
                files: repositoryData.files
            }, {
                upsert: true,
                safe: true
            }, function() {});
            
            res.send('SYNCED:' + JSON.stringify(syncedNode));
        });
    });
});

//  Get the environment variables we need.
var ipaddr, port;
if(config.openshift){
    ipaddr = process.env.OPENSHIFT_INTERNAL_IP;
    port = process.env.OPENSHIFT_INTERNAL_PORT || 8080;
} else {
    ipaddr = process.env.IP;
    port = process.env.PORT;
}

if (typeof ipaddr === "undefined") {
   console.warn('No OPENSHIFT_INTERNAL_IP environment variable');
}

//  terminator === the termination handler.
function terminator(sig) {
   if (typeof sig === "string") {
      console.log('%s: Received %s - terminating Node server ...',
                  Date(Date.now()), sig);
      process.exit(1);
   }
   console.log('%s: Node server stopped.', Date(Date.now()) );
}

//  Process on exit and signals.
process.on('exit', function() { terminator(); });

['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT', 'SIGBUS',
 'SIGFPE', 'SIGUSR1', 'SIGSEGV', 'SIGUSR2', 'SIGPIPE', 'SIGTERM'
].forEach(function(element, index, array) {
    process.on(element, function() { terminator(element); });
});


//Question: What is the ideal place to connect to the db
app.listen(port, ipaddr, function() {
    var reinit = true;
    db = mongo.db(config.databaseUrl);
    db.createCollection('files', function(err, collection) {});
    db.createCollection('langNodes', function(err, collection) {
        if(reinit){
            db.collection('langNodes').remove(function() {
                /*
                var testNodes = [
                _.extend(Object.create(langNodes.testNodes), {
                    hi: 'hi'
                })
                //Object.create(langNodes.baseNode)
                ];
                */
        
                db.collection('langNodes').insert(langNodes.simpleTestNodes, {
                    upsert: true,
                    safe: true
                },
        
                function(err, result) {
                    assert.equal(null, err);
                });
        
                console.log('%s: Node server started on %s:%d ...', Date(Date.now()), ipaddr, port);
            });
        } else {
            console.log('%s: Node server started on %s:%d ...', Date(Date.now()), ipaddr, port);
        }
    });
});