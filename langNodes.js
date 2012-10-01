exports.testNodes = [{
    lastSync: 0,
    content: null,
    "repository": {
        "type": "gist",
        "gistId": "3681913"
    }
}, {
    lastSync: 0,
    content: null,
    "repository": {
        "type": "gist",
        "gistId": "3730443"
    }
}];
exports.simpleTestNodes = [{
    content: {
        category: 'main',
        components: ['hello', 'world']
    }
}, {
    content: {
        category: 'main',
        components: ['test']
    }
}, {
    content: {
        category: 'main',
        components: ['add'],
        url: "/addLangNode.html"
    }
}, {
    content: {
        category: 'main',
        components: ['canMix?(', {
            'category': 'software licenses'
        }, ',', {
            'category': 'software licenses'
        }, ')']
    }
}, {
    content: {
        category: 'software licenses',
        components: ['apache']
    }
}, {
    content: {
        category: 'software licenses',
        components: ['MIT']
    }
}, {
    content: {
        category: 'software licenses',
        components: ['GPL']
    }
}, {
    content: {
        category: 'software licenses',
        components: ['BSD']
    }
}, {
    content: {
        category: 'main',
        components: ['canMix?(MIT,BSD)']
    }
}];