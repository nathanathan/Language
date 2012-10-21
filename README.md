Language Terminology for computer scientists:
LangNode => Production rule + meta data
Category => Non-termial (LHS of production rule)
Components => RHS of production rule
Interpretation ~> Parse tree


Planned formats (as json schemas):
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
                    type: object,
                    description: "A langNode extended with an interpretations array like this one."
                }
            }
        }
    }
```
