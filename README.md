Language
========

Use Case:
---------
1. The user types a command that makes sense to them into a search box. For example:

  `generate an html form with name age and gender fields`
  `draw a teapot`
  `sum(1,2,3)`

2. The command is parsed using an ambiguous grammar, generating many possible interpretations.
An interpretation is a parse tree with a widget attached to its root (other nodes may also have widgets). 
A widget is a small webpage that performs a particular function relevant to the interpretation it is attached to. 

3. The user sees a list of widgets corresponding to various interpretations of their command. For example, if the user's command was "draw a teapot" they might see widgets containing various teapot drawings and perhaps widgets with instructions how to draw a teapot. The user can up-vote good interpretations and down-vote irrelevant interpretations to improve future rankings. In addition to votes, probability of occurance also affects an interpration's ranking. 

4. If none of the resulting interpretations are to the user's liking, they can add new language nodes to the grammar that do what they want. This is easily done using a query like "[add language node](https://language-nathanathan.rhcloud.com/category/main?q=add+language+node)."

Live Examples:
--------------

You can see the languageNodes used in all these examples by clicking more->view source.

* [(+ 1 2 (+ 3 4 5))](https://language-nathanathan.rhcloud.com/category/main?q=%28%2B+1+2+%28%2B+3+4+5%29%29)
* [population of Canada since 1970](https://language-nathanathan.rhcloud.com/category/main?q=population+of+Canada+since+1970)
* [paint a picture](https://language-nathanathan.rhcloud.com/category/example%20widgets?q=paint+a+picture)
* [show source](https://language-nathanathan.rhcloud.com/category/main?q=show+source)


Language Terminology for computer scientists:
---------------------------------------------

  LangNode => Production rule + meta data
  
  Category => Non-termial (LHS of production rule)
  
  Components => RHS of production rule
  
  Interpretation ~> Parse tree


Planned* formats (as json schemas):
----------------------------------

*note that the current formats differ in a few ways.

langNode:

```javascript
    {
        type: "object",
        properties: {
            category: { type: "string" },
            components: {
                type: "array",
                items: [
                    {
                        description: "terminal",
                        type: "string"
                    },
                    {
                        description: "non-terminal",
                        type: "object",
                        properties: {
                            category: {
                                type: ["string", "array"]
                                description: "This can be a category name (which corresponds to an array of language nodes in the database) or an array of language nodes defined inline.",
                            }
                        }
                    },
                    {
                        description: "regular expression",
                        type: "object",
                        properties: {
                            regex: { type: "string" }
                        }
                    },
                ]
            },
            repository: {
                type: "object",
                properties: {
                    type: "gist",
                    gistId: "3925079",
                    lastSync: { type: "string"}
                }
            },
            content: {
                description: "The complete content of the json object used to construct this langNode. You can put any metadata you want here.",
                type: "object"
            }
        }
    }
```

Interpretation: (Add "&json=true" to your url search strings to see what things actually look like)

```javascript
    {
        type: "object",
        properties: {
            query: {
                description: "The command/query the user searched for.",
                type: "string"
            },
            category: {
                description: "The category that the search was done under. (e.g. main/science/code)",
                type: "string"
            },
            interpretations: {
                description: "The interpretations of the query",
                type: "array",
                items: {
                    type: "object",
                    description: "A langNode extended with an interpretations array like this one."
                }
            }
        }
    }
```

Server API:
---------------

Upsert language node

TODO

Get parse tree:

```javascript
//This example uses jQuery and jQuery-URL-Parser
var interpId = $.url().param('interpId'); 
$.getJSON($.url().param('serverUrl') + '/interpretations/' + interpId, function(data) {
	var multiParseTree = data.root;
});
```


Roadmap:
--------

There is a need for some kind of API to make it easier to deal with multi-parse trees in widgets. One idea I like for this is having callback functions that get called multiple times for each interpretation.

Voting/ranking is not implemented. This will also require github or some other authentication service to prevent ballot box stuffing. First there needs to be enough widgets that there is a need to rank them though.

In the distant future:
----------------------

Create interface for widgets to request access to resources from the parent site. For example, if the user links their github account to the main site, widgets could request the ability to modify one of the user's repositories from it.

Opt-in personalized rankings.

Parsing of non-textual input (e.g. voice, video)
