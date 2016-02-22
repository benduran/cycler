/*
    Copyright, Feb 2016, AnyWhichWay
    
    MIT License (since some CDNs and users must have some type of license and MIT in pretty un-restrictive)
    
    Substantive portions based on:
    
    cycle.js
    2013-02-19 douglas crockford

    Public Domain.
    
 */
(function() {
	"use strict";

	var cycler = {};

	// AnyWhichWay, Feb 2016, isolates code for tagging objects with $class during decycle
	// See resurrect for the converse
	function augment(context, original, decycled) {
		var classname = original.constructor.name;
		if (!classname || classname === "") { // look in context if classname not available
			Object.keys(context).some(function(name) {
				if (context[name] === original.constructor) {
					classname = name;
					return true;
				}
			});
		}
		if (classname && classname.length > 0) { // add the $class info to array or object
			if (Array.isArray(decycled)) {
				decycled.push({
					$class : classname
				});
				return;
			}
			decycled.$class = classname;
		}
	}

	cycler.decycle = function decycle(object, context) {

		// Make a deep copy of an object or array, assuring that there is at most
		// one instance of each object or array in the resulting structure. The
		// duplicate references (which might be forming cycles) are replaced with
		// an object of the form
		//      {$ref: PATH}
		// where the PATH is a JSONPath string that locates the first occurance.
		// So,
		//      var a = [];
		//      a[0] = a;
		//      return JSON.stringify(JSON.decycle(a));
		// produces the string '[{"$ref":"$"}]'.
		// Add a $class property to objects or element to arrays so that they can
		// be restored as their original kind.

		// JSONPath is used to locate the unique object. $ indicates the top level of
		// the object or array. [NUMBER] or [STRING] indicates a child member or
		// property.

		// AnyWhichWay, Feb 2016, establish context
		context = (context ? context
				: (typeof (window) !== "undefined" ? window : global));

		var objects = new Map(); // AnyWhichWay, replaced objects and paths arrays with Map, Feb 2016

		return (function derez(value, path) {

			// The derez recurses through the object, producing the deep copy.

			var i, // The loop counter
			pathfound, // AnyWhichWay added Feb 2016
			name, // Property name
			nu; // The new object or array

			// typeof null === "object", so go on if this value is really an object but not
			// one of the weird builtin objects.

			if (typeof value === "object" && value !== null
					&& !(value instanceof Boolean) && !(value instanceof Date)
					&& !(value instanceof Number) && !(value instanceof RegExp)
					&& !(value instanceof String)) {

				// If the value is an object or array, look to see if we have already
				// encountered it. If so, return a $ref/path object. 
				pathfound = objects.get(value); // AnyWhichWay replaced array loops with Map get, Feb 2016
				if (pathfound) {
					return {
						$ref : pathfound
					};
				}
				// Otherwise, accumulate the unique value and its path.
				objects.set(value, path); // AnyWhichWay, Feb 2016 replace array objects and paths with Map, Feb 2016
				// If it is an array, replicate the array and return copy.
				if (Array.isArray(value) || value instanceof Array) { // instanceof added by AnyWhichWay, Feb 2016
					nu = [];
					for (i = 0; i < value.length; i += 1) {
						nu[i] = derez(value[i], path + "[" + i + "]");
					}
					augment(context, value, nu); // AnyWhichWay, Feb 2016 augment with $class
					return nu;
				}

				// If it is an object, replicate the object and return copy.
				nu = {};
				for (name in value) {
					if (Object.prototype.hasOwnProperty.call(value, name)) {
						nu[name] = derez(value[name], path + "["
								+ JSON.stringify(name) + "]");
					}
				}
				augment(context, value, nu); // AnyWhichWay, Feb 2016 augment with $class
				return nu;
			}
			// Otherwise, just return value
			return value;
		}(object, "$"));
	};

	function getConstructor(context,item) {
		var obj; // temporary variable
		// process objects and return possibly modified item
		if (item && item.$class) {
			if(typeof (context[item.$class]) === "function") {
				return context[item.$class];
			}
			delete item.$class;
		}
		if (Array.isArray(item) && item[item.length - 1].$class
				&& Object.keys(item[item.length - 1]).length === 1) {
			if(typeof (context[item[item.length - 1].$class]) === "function") {
				return context[item[item.length - 1].$class];
			}
			// otherwise delete the $class data
			item.splice(item.length - 1, 1);
		}
		return undefined;
	}
	// AnyWhichWay, Feb 2016, isolates code for resurrecting objects as their original type
	// see augment for inverse
	function resurrect(context, item) {
		var obj, // temporary variable
			cons = getConstructor(context,item)
		// process objects and return possibly modified item
		if (cons) {
			obj = Object.create(cons.prototype);
			obj.constructor = cons;
			Object.keys(item).forEach(function(key,i) {
				if (key !== "$class" && (i!==item.length-1 || !(Array.isArray(item) || item instanceof Array))) { // skip the $class data
					obj[key] = item[key];
				}
			});
			return obj;
		}
		return item;
	}

	cycler.retrocycle = function retrocycle($, context) {

		// Restore an object that was reduced by decycle. Members whose values are
		// objects of the form
		//      {$ref: PATH}
		// are replaced with references to the value found by the PATH. This will
		// restore cycles. The object will be mutated.

		// AnyWhichWay, Feb 2016
		// Objects containing $class member are converted to the class specified
		// Arrays with last member {$class: <some kind>} are converted to the specified class of array

		// A dynamic Function is used to locate the values described by a PATH. The
		// root object is kept in a $ variable. A regular expression is used to
		// assure that the PATH is extremely well formed. The regexp contains nested
		// * quantifiers. That has been known to have extremely bad performance
		// problems on some browsers for very long strings. A PATH is expected to be
		// reasonably short. A PATH is allowed to belong to a very restricted subset of
		// Goessner's JSONPath.

		// So,
		//      var s = '[{"$ref":"$"}]';
		//      return JSON.retrocycle(JSON.parse(s));
		// produces an array containing a single element which is the array itself.

		// AnyWhichWay, Feb 2016, establish the context
		context = (context ? context
				: (typeof (window) !== "undefined" ? window : global));

		// AnyWhichWay, Feb 2016 do any required top-level conversion from POJO's to $classs
		$ = resurrect(context, $);

		var px = /^\$(?:\[(?:\d+|\"(?:[^\\\"\u0000-\u001f]|\\([\\\"\/bfnrt]|u[0-9a-zA-Z]{4}))*\")\])*$/;

		(function rez(value) {

			// Modified by AnyWhichWay, Feb 2016
			// The rez function walks recursively through the object looking for $ref
			// and $class properties or array values. When it finds a $ref value that is a path, 
			// then it replaces the $ref object with a reference to the value that is found by
			// the path. When it finds a $class value that names a function in the global scope,
			// it assumes the function is a constructor and uses it to create an object which
			// replaces the JSON such that it is restored with the appropriate class semantics
			// and capability rather than just a general object. If no constructor exists, a
			// POJO is used.

			// AnyWhichWay, Feb 2016, replaced separate array and object loops with forEach
			Object.keys(value).forEach(
					function(name) {
						var item = resurrect(context, value[name]);
						// re-assign in case item has been converted
						value[name] = item;
						if (item && typeof item === "object"
								&& typeof item.$ref === "string"
								&& px.test(item.$ref)) {
							value[name] = Function("dollar","var $ = dollar; return " + item.$ref)($);
						} else if (item && typeof item === "object") {
							rez(item);
						}
					});

		}($));
		return $;
	};

	if (this.exports) {
		this.exports = cycler;
	} else if (typeof define === "function" && define.amd) {
		// Publish as AMD module
		define(function() {
			return cycler;
		});
	} else {
		this.Cycler = cycler;
	}

}).call((typeof (window) !== "undefined" ? window
		: (typeof (module) !== "undefined" ? module : null)));