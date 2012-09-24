exports.testNodes = [{lastSync:0, content:null,
    "repository": {
        "type": "gist",
        "gistId": "3681913"
    }
}, {lastSync:0, content:null,
    "repository": {
        "type": "gist",
        "gistId": "3730443"
    }
}];
exports.simpleTestNodes = [{
    category: 'main',
    components: ['hello', 'world']
}, {
    category: 'main',
    components: ['test']
}, {
    category: 'main',
    components: ['test']
}, {
    category: 'main',
    components: ['canMix?(', {'category' : 'software licenses'}, ',', {'category' : 'software licenses'}, ')']
}, {
    category: 'software licenses',
    components: ['apache']
}, {
    category: 'software licenses',
    components: ['MIT']
}, {
    category: 'software licenses',
    components: ['GPL']
}, {
    category: 'software licenses',
    components: ['BSD']
}, {
    category: 'main',
    components: ['canMix?(MIT,BSD)']
}];