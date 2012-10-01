#!/bin/env node

var express = require('express');
var fs      = require('fs');
var _ = require('underscore')._;
var assert = require('assert');

var Handlebars = require('handlebars');
Handlebars.registerHelper('stringify', function(object) {
    return JSON.stringify(_.extend({}, object), 2, 4);
});
//Database:
var mongo = require('mongoskin');
var db;
//For connecting to github api:
var https = require('https');
var pipette = require('pipette');

var config = require('./config');
var langNodes = require('./langNodes');
var EarleyParser = require('./earley');

//  Local cache for static content [fixed and loaded at startup]
var zcache = {};
zcache.indexTemplate = Handlebars.compile(fs.readFileSync('templates/index.html', 'utf8'));
zcache.resultsTemplate = Handlebars.compile(fs.readFileSync('templates/results.html', 'utf8'));
zcache.parseChartTemplate = Handlebars.compile(fs.readFileSync('templates/parseChart.html', 'utf8'));
zcache.defaultWidget = fs.readFileSync('defaultWidget.html', 'utf8');

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

app.get('/interpretations/:id', function(req, res) {
    db.collection('interpretations').findById(req.params.id, function(err, interpretation){
        if(err) throw err;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(interpretation)); 
    });
    return;
});



/**
 * It might be desirable to have widget html served from this server for a few reasons:
 * -Widgets can be server-side templates.
 * -Gists can't be hosted on gh-pages, and I want them to be very easy to use.
 * -There could be some origin issues.
 **/
app.get('/pages/:id', function(req, res) {
    db.collection('files').findById(req.params.id, function(err, langNodeFiles){
        if(err) throw err;
        if(langNodeFiles && langNodeFiles.files && langNodeFiles.files['index.html']) {
            //res.writeHead(200, {'Content-Type': 'text/plain'});
            //TODO: Generalize this so we can serve the full gist.
            res.send(langNodeFiles.files['index.html'].content);
        } else {
            res.send(zcache.defaultWidget);
        }
    });
    return;
});

function renderChart(input, chart){
    return zcache.parseChartTemplate({
        columns : _.map(chart, function(col, colIdx) {
            return _.map(col, function(langNode){
                return _.extend(langNode, {
                    colspan: colIdx - langNode.parseData.origin,
                    complete: langNode.parseData.complete,
                    origin: langNode.parseData.origin
                });
            });
        }),
        symbols: input.split('')
    });
}

app.get('/category/:category', function(req, res){
    //TODO: Check that the category exists.
    var renderedTemplate;
    var category = req.params.category;
    if('q' in req.query){
        var queryId = new mongo.ObjectID();
        db.collection('queries').insert({
            '_id': queryId,
            'query': req.query.q,
            'category': category,
            'timestamp': String(new Date())
        }, 
        { safe: true }, 
        function(err, result){
            if(err){
                //If this happens there are problems I haven't thought about.
                res.send(String(err));
                return;
            }
        });
        EarleyParser.parse(req.query.q, category, db.collection('langNodes'), function(err, chart){
            if(err){
                res.send(String(err));
                return;
            }
            if('chart' in req.query){
                res.send(renderChart(req.query.q, chart));
            } else if( 'json' in req.query) {
                res.send('<pre>'+JSON.stringify(EarleyParser.chartToInterpretations(chart), 2, 4)+'</pre>');
            } else {
                var interpretations;
                interpretations = EarleyParser.chartToInterpretations(chart);
                interpretations = _.map(interpretations, function(interpretation){
                    return {
                        '_id': new mongo.ObjectID(),
                        'root': interpretation,
                        'queryId': queryId
                    };
                });
                _.defer(function(){
                    //This is deferred so it can happen whiles the interpretations are inserted.
                    renderedTemplate = zcache.resultsTemplate({
                        'interpretations': interpretations,
                        'query': req.query.q,
                        'category': category
                    });
                });
                if(interpretations.length > 0){
                    db.collection('interpretations').insert(interpretations, {
                        safe: true
                    }, function(err, result) {
                        if(err){
                            res.send(String(err));
                            return;
                        }
                        res.send(renderedTemplate);
                    });
                } else {
                     _.defer(function(){
                         //This is deferred so it happens after the template is rendered.
                         res.send(renderedTemplate);
                     });
                }
            }
        });
    } else {
        renderedTemplate = zcache.indexTemplate({'category' : category});
        res.send(renderedTemplate);
    }
});
app.get('/', function(req, res){
    var renderedTemplate;
    var category = 'main';
    renderedTemplate = zcache.indexTemplate({'category' : category});
    res.send(renderedTemplate);
});
app.get('/upvote/:id', function(req, res){
    res.send("Not yet implemented");
});
app.get('/downvote/:id', function(req, res){
    res.send("Not yet implemented");
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
        if (langNode === null) {
            res.send('Could not find langNode with id ' + String(id));
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
//TODO: Make way of submitting JSON
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
            }, function(err) {
                if (err) {
                    res.send('Error: ' + err);
                    return;
                }
                //TODO: Redirect to langNode url (this could trigger syncing, and the page could indicate progress.)
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(syncedNode, 2, 4));
            });
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
    db.createCollection('interpretations', function(err, collection) {});
    db.createCollection('queries', function(err, collection) {});
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