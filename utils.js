var _ = require('underscore')._;

/**
 * Takes objects/arrays and recusively adds all poperties to the
 * top level objects in place.
 * This is useful for stringifying objects with complex prototype chains.
 **/
exports.deprototype = function deprototype(thing){
    if(_.isArray(thing)) {
        _.each(thing, deprototype);
    } else if(_.isObject(thing)) {
        _.extend(thing, thing);
        _.each(_.values(thing), deprototype);
    }
    return thing;
}