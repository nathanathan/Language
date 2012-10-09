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

4. If none of the resulting interpretations are to the user's liking, they can add new language nodes to the grammar that do what they want. This is easily done using a query like "I want to create a language node."


In the distant future:
---------------------

Create interface for widgets to request access to resources from the parent site. For example, if the user links their github account to the main site, widgets could request the ability to modify one of the user's repositories from it.

Opt-in personalized rankings.

Parsing of non-textual input (e.g. voice, video)



Language Terminology for computer scientists:
---------------------------------------------

  LangNode => Production rule + meta data
  
  Category => Non-termial (LHS of production rule)
  
  Components => RHS of production rule
  
  Interpretation ~> Parse tree
  
  
Server API:
---------------

upsert language node

get parse tree


Parse Tree Structure:
---------------------

TBD
