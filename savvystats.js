/**
 * Savvy Stats v0.0-alpha (http://savvystats.tk)
 * Copyright 2015 Tim Kennell Jr.
 * Licensed under the MIT License (http://opensource.org/licenses/MIT)
 **
 * Statistics library capable of performing various calculations with JSON data
 * Note that recursion is used frequently to prevent excessive error checking in arrays 
 *     and allow faster performance
 * 
 * Dependency
 *  - Math object (native to JS)
 *  - BigRational.js
 */
var ss = (function(undefined) {
    "use strict";

    // Set up global object to return into the ss object
    var globalObject = function(json) {
        if (typeof json === "undefined") return "Error: need a file argument.";
        return new jsonData(json);
    };

    globalObject.errors = [];

    /*==========================*
     * Helper Functions Section *
     *==========================*/

    /**
     * Check if the needle is in the haystack (use this function sparingly)
     */
     var inArray = function(needle, haystack) {
        if (!(haystack instanceof Array)) {
            return false;
        } else {
            for (var i = 0; i < haystack.length; i++) {
                if (needle === haystack[i]) return true;
            }
        }

        return false;
     };

    /**
     * Simple function built to check if a number is an int (whole number) (used in percentile)
     * 
     * @param Number number
     */
    var isInt = function(number) {
        if (number === parseInt(number)) {
            return true;
        }

        return false;
    };

    /**
     * Sorts a json array based on provided column if the provided column is populated by numbers
     * Preserves the original array by forcing a copy of the array to be made before sorting (not sure if I need this anymore, seems processor expensive)
     *
     * @param Array array
     */
    var jsonSort = function(json, sortColumn) {
        if (!(json instanceof Array)) {
            return undefined;
        } else {
            return Array.prototype.slice.call(json).sort(function(a,b) {return a[sortColumn]-b[sortColumn];});
        }
    };

    /*============================*
     * Statistics Library Section *
     *============================*/

     /**
      * Class for creating objects that hold JSON
      * Allows addition of statistical functions to prototype for easy calculations
      */
    function jsonData(json) {
        var self = this;
        if (!(json instanceof Array)) {
            self.json = undefined;
        } else {
            self.json = json;
        }
    }

    /**
     * Class that will be used for pseudo-type-hinting to ensure that JSON data are only validated once
     * This uses filtered or non-filtered json and stores the count for repeated use as well (saves on processing)
     */
    function ValidJson(json, count) {
        var self = this;

        // Check if value passed is an array in the first place
        // If no, then it can't possibly be a validated array
        // If yes, then make it a part of the object for passing along
        if (!(json instanceof Array)) {
            self.validArray = false;
        } else {
            self.validJson = json;
            self.count = count;
        }
    }


    /**
     * Validates a JSON array and any columns provided to it (allowed to be a variable number of params)
     * This is one (large) function to accomplish all validation with one loop to save on processing speed for large data sets
     * Note that the only static parameter of this function is the "json" param, all others are just placeholders for readability
     * The function only uses the arguments object from then on
     * 
     * @param JsonArray json
     * @params String columns
     * @param function filterCb
     *     takes an object in the JSON array
     *     should return true or false
     *     used to filter values in column used for mean based on values in the same column or other columns
     *     e.g. function(data) {data.column == "value";}
     */
    var validateJson = function(json, column, filterCb) {
        // Error collection object
        var validationReport = {};
        validationReport.error = false;
        validationReport.errors = [];
        validationReport.validJson = [];
        validationReport.count = 0;

        // Prevent rechecking and multiple errors
        var typeErrorColumns = [];      // keeps track of columns that don't exist
        var numberErrorColumns = [];    // keeps track of columns that don't have numbers in them

        // -- Validating all input --
        // Make sure json is actually an array
        if (!(json instanceof Array)) {
            validationReport.error = true;
            validationReport.errors.push("Data must be in a JSON format starting with an array");
        }

        // Insure that column passed is a string
        if (typeof column !== "string") {
            validationReport.error = true;
            validationReport.errors.push("All columns must be passed as strings: " + arguments[i] + ".")
        }

        // One of the inputs failed initial validation, no need to go further
        if (validationReport.error) {
            return validationReport;
        }

        // -- Validating the parts of the JSON data --
        for (var i = 0; i < json.length; i++) {
            // Making sure the array components are objects (note: arrays are considered to be instances of objects, so have to 
            // specificall exclude arrays)
            if (!(json[i] instanceof Object) || (json[i] instanceof Array)) {
                validationReport.error = true;
                validationReport.errors.push("The JSON array must be filled with objects");
                return validationReport;
            }

            // Column argument must be a property of every JSON object
            if (!json[i].hasOwnProperty(column)) {
                validationReport.error = true;
                validationReport.errors.push("The column " + column + " does not exist; or, if you're sure it does, the json might be broken. Verify the JSON before continuing.");
                return validationReport;
            }

            // column property argument listed must only consist of numbers
            if (isNaN(json[i][column])) {
                validationReport.error = true;
                validationReport.errors.push("The column " + column + " does not contain only numbers and has to for this operation.");
                return validationReport;
            }

            // filter array (put this in after documentation, simply need to pass validationReport.validJson to "new ValidJson" instead of the original json argument for each function)
            // NOTE: will also need to remove unnecessary filtering from each function as well
            
            // If a callback has been used (argument in filterCb) and is a callback function, filter data
            if (filterCb && typeof filterCb === "function") {
                
                // If the callback succeeds (the data meets the filter criteria set by the callback function)
                // Note, this is the most trippy function I have every written in javascript
                if (filterCb(json[i]) === true) {
                    
                    // Add that object to a new JSON array for returning, this is the json array that should be considered valid
                    validationReport.validJson.push(json[i]);
                    validationReport.count++;
                }

            // If a callback has been used but is not a function, return error
            } else if (filterCb && typeof filterCb !== "function") {
                validationReport.error = true;
                validationReport.errors.push("The function " + filterCb + " is not a function or is improperly formed.");
                return validationReport;
            }
        }

        // If no callback has been called, there is no reason to filter json data and array count
        // Simply shove the arguments into the validationReporting object for return
        if (!filterCb) {
            validationReport.validJson = json;
            validationReport.count = json.length;
        }

        // Default return
        return validationReport;
    };

    /**
     * Takes an array of errors and prints them to console and stores them in the global error array (globalObject.errors)
     * 
     * @param Array errorArray
     */
    var storeAndDisplayErrors = function(errorArray) {
        // Must have an array
        if (errorArray instanceof Array) {
            
            // Go through array and print errors to console and put in global error array (globalObject.errors)
            for (var i = 0; i < errorArray.length; i++) {
                console.error(errorArray[i]);
                globalObject.errors.push(errorArray[i]);
            }
        }
    };

    /**
     * A simple function with error checking to sum an array
     * Since a loop for addition of all data is required, validation is done while parsing data
     * 
     * @param (JSON array) json
     * @param String column
     * @param function filterCb
     *     takes an object in the JSON array as an argument
     *     should return true or false
     *     used to filter values in column used for calculation based on values in the same column or other columns
     *     e.g. function(data) {data.column == "value";}
     */
    var sum = function(json, column, filterCb) {
        // Holds the total that is returned if the function is successful
        var total = 0,
            error = [];

        // Is json an array in the first place
        if (!(json instanceof Array)) {
            error.push("Data must be passed as a JSON array starting with an array");
        }

        // Is the column appropriate to be passed as the name of an object property
        if (typeof column !== "string") {
            error.push("The column must be provided as a string");
        }

        // Grab errors and print
        if (error.length > 0) {
            console.error(error);
            globalObject.errors.push(error);
            return undefined;
        }

        // Begin going through JSON array
        for (var i = 0; i < json.length; i++) {
            // Does the JSON array contain objects
            if (!(json[i] instanceof Object)) {
                console.error("The JSON array must be filled with objects");
                globalObject.errors.push("The JSON array must be filled with objects");
                return undefined;
            }

            // Do the objects have the property passed in the column param
            if (!json[i].hasOwnProperty(column)) {
                console.error("The column selected does not exist, or, if you're sure it does, the json might be broken.  Verify the JSON before continuing.");
                globalObject.errors.push("The column selected does not exist, or, if you're sure it does, the json might be broken.  Verify the JSON before continuing.");
                return undefined;
            }

            // Are values in the column param property numbers
            if (isNaN(json[i][column])) {
                console.error("All values of the chosen column must be numbers for the summmation");
                globalObject.errors.push("All values of the chosen column must be numbers for the summmation");
                return undefined;
            }

            // Use filter if it exists
            if(filterCb && filterCb(json[i]) === false) {
                continue;
            }

            total += parseFloat(json[i][column]);
        }

        return total;
    };

    /**
     * Calculates the sumOfSquares of a data set (column)
     * Data in column can be filtered with callback (filterCb)
     * This calculation is used in many statistical functions but itself is not useful
     * 
     * @param (JSON array) json
     * @param String column
     * @param function filterCb
     *     takes an object in the JSON array as an argument
     *     should return true or false
     *     used to filter values in column used for calculation based on values in the same column or other columns
     *     e.g. function(data) {data.column == "value";}
     */
    var sumOfSquares = function(json, column, filterCb) {
        // If JSON has already been validated, crunch numbers
        if (json instanceof ValidJson) {
            var total = 0;
            var avg = mean(json, column, filterCb);

            for (var i = 0; i < json.validJson.length; i++) {
                total += Math.pow((parseFloat(json.validJson[i][column]) - avg), 2);
            }

            return total;

       // Data has not been validated
        } else {

            // Attempt to validate... everything!!!
            var validationReport = validateJson(json, column, filterCb);
            
            // If validated, move json to ValidJson for type hinting
            if (!validationReport.error) {
                var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                
                // Recursively call function again as json is now valid and will pass the first if statement
                return sumOfSquares(validJson, column, filterCb);
            
            // JSON is not valid, display errors
            } else {
                storeAndDisplayErrors(validationReport.errors);
            }
        }
    };

    /**
     * Log transforms a column in the data set and returns the new data set
     * Uses the base e for the transformation (because e is what the JavaScript Math library has)
     * Returns a new JSON array with the transformed data
     * Similar to the sum function, this function must go through all data, so validation is done while parsing
     * 
     * @param (JSON array) json
     * @param String column
     */
    var logtrans = function(json, column) {
        // set up something to catch errors
        var error = [];

        // Is json an array in the first place
        if (!(json instanceof Array)) {
            error.push("Data must be passed as a JSON array starting with an array");
        }

        // Is the column appropriate to be passed as the name of an object property
        if (typeof column !== "string") {
            error.push("The column must be provided as a string");
        }

        // Grab errors and print
        if (error.length > 0) {
            console.error(error);
            globalObject.errors.push(error);
            return undefined;
        }

        // Copy json array so that the original data is not affected
        // This is, admittedly a little bit of a hack, but...
        var transformedJson = JSON.parse(JSON.stringify(json));

        for (var i = 0; i < transformedJson.length; i++) {
            // Does the JSON array contain objects
            if (!(json[i] instanceof Object)) {
                console.error("The JSON array must be filled with objects");
                globalObject.errors.push("The JSON array must be filled with objects");
                return undefined;
            }

            // Do the objects have the property passed in the column param
            if (!transformedJson[i].hasOwnProperty(column)) {
                console.error("The column selected does not exist, or, if you're sure it does, the json might be broken.  Verify the JSON before continuing.");
                globalObject.errors.push("The column selected does not exist, or, if you're sure it does, the json might be broken.  Verify the JSON before continuing.");
                return undefined;
            }

            // Are values in the column param property numbers
            if (isNaN(transformedJson[i][column])) {
                console.error("All values of the chosen column must be numbers for the logarithm transformation");
                globalObject.errors.push("All values of the chosen column must be numbers for the logarithm transformation");
                return undefined;
            }

            // Log transform the specified column in the JSON data
            transformedJson[i][column] = Math.log(transformedJson[i][column]);
        }

        return transformedJson;
    };

    // Add logtrans to prototype and return new jsonData for stringing methods
    jsonData.prototype.logtrans = function(column) {
        return new jsonData(logtrans(this.json, column));
    };

    /**
     * Calculates the minimum of a data set (column)
     * Data in column can be filtered with callback (filterCb)
     * 
     * @param (JSON array) json
     * @param String column
     * @param function filterCb
     *     takes an object in the JSON array as an argument
     *     should return true or false
     *     used to filter values in column used for calculation based on values in the same column or other columns
     *     e.g. function(data) {data.column == "value";}
     */
    var min = function(json, column, filterCb) {
        // If JSON has already been validated, crunch numbers
        if (json instanceof ValidJson) {
            var sortedJson = jsonSort(json.validJson, column);      // sort json on column
            return parseFloat(sortedJson[0][column]);               // return first value (minimum)
        
        // Data has not been validated
        } else {

            // Attempt to validate... everything!!!
            var validationReport = validateJson(json, column, filterCb);
            
            // If validated, move json to ValidJson for type hinting
            if (!validationReport.error) {
                var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                
                // Recursively call function again as json is now valid and will pass the first if statement
                return min(validJson, column, filterCb);
            
            // JSON is not valid, display errors
            } else {
                storeAndDisplayErrors(validationReport.errors);
            }
        }
    };

    // Add min to prototype for easy access
    jsonData.prototype.min = function(column, filterCb) {
        return min(this.json, column, filterCb);
    };

    /**
     * Calculates the maximum of a data set (column)
     * Data in column can be filtered with callback (filterCb)
     * 
     * @param (JSON array) json
     * @param String column
     * @param function filterCb
     *     takes an object in the JSON array as an argument
     *     should return true or false
     *     used to filter values in column used for calculation based on values in the same column or other columns
     *     e.g. function(data) {data.column == "value";}
     */
    var max = function(json, column, filterCb) {
        // If JSON has already been validated, crunch numbers
        if (json instanceof ValidJson) {
            var sortedJson = jsonSort(json.validJson, column);        // sort json on column
            return parseFloat(sortedJson[json.count - 1][column]);    // return last value (maximum)

        // Data has not been validated
        } else {

            // Attempt to validate... everything!!!
            var validationReport = validateJson(json, column, filterCb);
            
            // If validated, move json to ValidJson for type hinting
            if (!validationReport.error) {
                var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                
                // Recursively call function again as json is now valid and will pass the first if statement
                return max(validJson, column, filterCb);
            
            // JSON is not valid, display errors
            } else {
                storeAndDisplayErrors(validationReport.errors);
            }
        }
    };

    // Add max to prototype for easy access
    jsonData.prototype.max = function(column, filterCb) {
        return max(this.json, column, filterCb);
    };


    /**
     * Calculates the range of a data set (column)
     * Data in column can be filtered with callback (filterCb)
     * 
     * @param (JSON array) json
     * @param String column
     * @param function filterCb
     *     takes an object in the JSON array as an argument
     *     should return true or false
     *     used to filter values in column used for calculation based on values in the same column or other columns
     *     e.g. function(data) {data.column == "value";}
     */
    var range = function(json, column, filterCb) {
        // If JSON has already been validated, crunch numbers
        if (json instanceof ValidJson) {
            return max(json, column, filterCb) - min(json, column, filterCb);

        // Data has not been validated
        } else {

            // Attempt to validate... everything!!!
            var validationReport = validateJson(json, column, filterCb);
            
            // If validated, move json to ValidJson for type hinting
            if (!validationReport.error) {
                var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                
                // Recursively call function again as json is now valid and will pass the first if statement
                return range(validJson, column, filterCb);
            
            // JSON is not valid, display errors
            } else {
                storeAndDisplayErrors(validationReport.errors);
            }
        }
    };

    // Add range to prototype for easy access
    jsonData.prototype.range = function(column, filterCb) {
        return range(this.json, column, filterCb);
    };


    /**
     * Calculates the mean of a data set (column)
     * Data in column can be filtered with callback (filterCb)
     * 
     * @param (JSON array) json
     * @param String column
     * @param function filterCb
     *     takes an object in the JSON array as an argument
     *     should return true or false
     *     used to filter values in column used for calculation based on values in the same column or other columns
     *     e.g. function(data) {data.column == "value";}
     */
    var mean = function(json, column, filterCb) {
        // If JSON has already been validated, crunch numbers
        if (json instanceof ValidJson) {
            return sum(json.validJson, column, filterCb)/json.count;

        // Data has not been validated
        } else {

            // Attempt to validate... everything!!!
            var validationReport = validateJson(json, column, filterCb);
            
            // If validated, move json to ValidJson for type hinting
            if (!validationReport.error) {
                var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                
                // Recursively call function again as json is now valid and will pass the first if statement
                return mean(validJson, column, filterCb);
            
            // JSON is not valid, display errors
            } else {
                storeAndDisplayErrors(validationReport.errors);
            }
        }
    };

    // Allowing jsonData to have access to mean for easy calculation on any column
    jsonData.prototype.mean = function(column, filterCb) {
        return mean(this.json, column, filterCb);
    };

    /**
     * Calculates the geometric mean of a data set (column)
     * Data in column can be filtered with callback (filterCb)
     * 
     * @param (JSON array) json
     * @param String column
     * @param function filterCb
     *     takes an object in the JSON array as an argument
     *     should return true or false
     *     used to filter values in column used for calculation based on values in the same column or other columns
     *     e.g. function(data) {data.column == "value";}
     */
    var geomean = function(json, column, filterCb) {
        // If JSON has already been validated, crunch numbers
        if (json instanceof ValidJson) {
            var logJson = logtrans(json.validJson, column);
            return Math.exp(sum(logJson, column, filterCb)/json.count);

        // Data has not been validated
        } else {

            // Attempt to validate... everything!!!
            var validationReport = validateJson(json, column, filterCb);
            
            // If validated, move json to ValidJson for type hinting
            if (!validationReport.error) {
                var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                
                // Recursively call function again as json is now valid and will pass the first if statement
                return geomean(validJson, column, filterCb);
            
            // JSON is not valid, display errors
            } else {
                storeAndDisplayErrors(validationReport.errors);
            }
        }
    };

    // Allow easy access to geomean through prototype
    jsonData.prototype.geomean = function(column, filterCb) {
        return geomean(this.json, column, filterCb);
    };

    /**
     * Calculates the kth percentile (exclusive) of a data set (column)
     * Data in column can be filtered with callback (filterCb)
     * 
     * @param Number k
     * @param (JSON array) json
     * @param String column
     * @param function filterCb
     *     takes an object in the JSON array as an argument
     *     should return true or false
     *     used to filter values in column used for calculation based on values in the same column or other columns
     *     e.g. function(data) {data.column == "value";}
     */
    var percentile = function(k, json, column, filterCb) {
        // If JSON has already been validated, crunch numbers
        if (json instanceof ValidJson) {

            // Validate that k is a number in the appropriate domain [0, 100]
            if (typeof k === "number" && k >= 0 && k <= 100) {
                
                // Sort the data
                var sortedJson = jsonSort(json.validJson, column);

                // Position used to determine percentile ((k/100) * (n + 1))
                // Because arrays are 0-based, subtract 1 to correct locator position
                var locatorPos = (k/100) * (json.count + 1);

                // The 0th percentile doesn't technically exist, but can be considered to be the min value
                if (k === 0) {
                    return parseFloat(sortedJson[0][column]);

                // The 100th percentile also doesn't technically exist, but can be considered to be the max value
                } else if (k === 100) {
                    return parseFloat(sortedJson[json.count - 1][column]);

                // If locatorPos is int, the value at that position is the percentile (locatorPos - 1 because arrays are zero-based)
                } else if (isInt(locatorPos)) {
                    return parseFloat(sortedJson[locatorPos - 1][column]);
                
                // If the locatorPos is not an int, the take the floor of locatorPos 
                // and then average the value at that position and the value one position above
                // Again, the special trick below are because arrays are zero-based
                } else {
                    locatorPos = Math.floor(locatorPos);
                    return (parseFloat(sortedJson[locatorPos - 1][column]) + parseFloat(sortedJson[locatorPos][column]))/2;
                }

            // k was not a number or it was not in the range
            } else {
                console.error("The kth percentile must be a number between 1 and 100: " + k);
                globalObject.errors.push("The kth percentile must be a number between 1 and 100: " + k);
            }
        // Data has not been validated
        } else {

            // Attempt to validate... everything!!!
            var validationReport = validateJson(json, column, filterCb);
            
            // If validated, move json to ValidJson for type hinting
            if (!validationReport.error) {
                var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                
                // Recursively call function again as json is now valid and will pass the first if statement
                return percentile(k, validJson, column, filterCb);
            
            // JSON is not valid, display errors
            } else {
                storeAndDisplayErrors(validationReport.errors);
            }
        }
    };

    // Add percentile to prototype for easy access
    jsonData.prototype.percentile = function(k, column, filterCb) {
        return percentile(k, this.json, column, filterCb);
    };

    /**
     * Calculates the median of a data set (column)
     * Data in column can be filtered with callback (filterCb)
     * A median is a type of percentile (k = 50), so this function depends on percentile
     * 
     * @param (JSON array) json
     * @param String column
     * @param function filterCb
     *     takes an object in the JSON array as an argument
     *     should return true or false
     *     used to filter values in column used for calculation based on values in the same column or other columns
     *     e.g. function(data) {data.column == "value";}
     */
    var median = function(json, column, filterCb) {
        // If JSON has already been validated, crunch numbers
        if (json instanceof ValidJson) {

            // Median is the 50th percentile
            return percentile(50, json.validJson, column, filterCb);

        // Data has not been validated
        } else {

            // Attempt to validate... everything!!!
            var validationReport = validateJson(json, column, filterCb);
            
            // If validated, move json to ValidJson for type hinting
            if (!validationReport.error) {
                var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                
                // Recursively call function again as json is now valid and will pass the first if statement
                return median(validJson, column, filterCb);
            
            // JSON is not valid, display errors
            } else {
                storeAndDisplayErrors(validationReport.errors);
            }
        }
    };

    // Add median to prototype for easy access
    jsonData.prototype.median = function(column, filterCb) {
        return median(this.json, column, filterCb);
    };

    /**
     * Calculates the quartiles (exclusive) of a data set (column)
     * Data in column can be filtered with callback (filterCb)
     * Quartiles are types of percentile (k = 50), so this function depends on percentile
     * 
     * @param Number type
     * @param (JSON array) json
     * @param String column
     * @param function filterCb
     *     takes an object in the JSON array as an argument
     *     should return true or false
     *     used to filter values in column used for calculation based on values in the same column or other columns
     *     e.g. function(data) {data.column == "value";}
     */
    var quartile = function(type, json, column, filterCb) {
        // If JSON has already been validated, crunch numbers
        if (json instanceof ValidJson) {

            // Quartiles are special percentiles, so using the type of quartile to calculate the related percentile
            if (type === 1) {
                return percentile(25, json.validJson, column, filterCb);
            } else if (type === 2) {
                return percentile(50, json.validJson, column, filterCb);
            } else if (type === 3) {
                return percentile(75, json.validJson, column, filterCb);
            } else if (type === 4) {
                return percentile(100, json.validJson, column, filterCb);
            } else {
                console.error(type + " is not a quartile. Appropriate quartiles are 1, 2, 3, 4");
                globalObject.errors.push(type + " is not a quartile. Appropriate quartiles are 1, 2, 3, 4");
            }

       // Data has not been validated
        } else {

            // Attempt to validate... everything!!!
            var validationReport = validateJson(json, column, filterCb);
            
            // If validated, move json to ValidJson for type hinting
            if (!validationReport.error) {
                var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                
                // Recursively call function again as json is now valid and will pass the first if statement
                return quartile(type, validJson, column, filterCb);
            
            // JSON is not valid, display errors
            } else {
                storeAndDisplayErrors(validationReport.errors);
            }
        }
    };

    // Add quartile to prototype for easy access
    jsonData.prototype.quartile = function(type, column, filterCb) {
        return quartile(type, this.json, column, filterCb);
    };


    /**
     * Calculates the mode of a data set (column)
     * Data in column can be filtered with callback (filterCb)
     * 
     * @param Number type
     * @param (JSON array) json
     * @param String column
     * @param function filterCb
     *     takes an object in the JSON array as an argument
     *     should return true or false
     *     used to filter values in column used for calculation based on values in the same column or other columns
     *     e.g. function(data) {data.column == "value";}
     */
    var mode = function(json, column, filterCb) {
        // If JSON has already been validated, crunch numbers
        if (json instanceof ValidJson) {

            var sortedJson = jsonSort(json.validJson, column);

            var currentCount = 0,         // Changed each time a new number appears
                rememberedCount = 0,      // Highest count remembered so far
                rememberedValues = [];    // Values with the highest count currently, set as an array to hold more than one mode

            // Starting sortedJson at 2nd value to avoid initial edge effect
            for (var i = 1; i < json.count; i++) {

                // If callback returns false (data does not match user submitted filter)
                if (filterCb && filterCb(json.validJson[i]) === false) continue;

                // If the current value is the same as the previous, increment counter (it has occurred more than once)
                if (sortedJson[i][column] === sortedJson[i - 1][column]) {
                    // The first number is not counted because the number before it was different;
                    // therefore, the count is always 1 less than the total actually occurring
                    currentCount++;

                // The current value is new, begin storing state
                } else {

                    // The current group of same numbers is larger than any previous
                    if (currentCount > rememberedCount) {
                        rememberedValues = [];                                           // reset current sortedJson array of values (anything stored occurs less frequently)
                        rememberedValues.push(parseFloat(sortedJson[i - 1][column]));    // put the previous value (last member of group) into sortedJson to be remembered
                        rememberedCount = currentCount;                                  // Pass the current count to the remembered count as the highest remembered count
                        currentCount = 0;                                                // reset the current count

                    // Current count is equal to the last highest remembered (don't fill this if count is 0 (no two equal values); this is not a mode!)
                    } else if (currentCount === rememberedCount && currentCount !== 0) {
                        rememberedValues.push(parseFloat(sortedJson[i - 1][column]));    // simply add the last number of the group to the sortedJson with any others
                        currentCount = 0;                                                // reset counter
                    
                    // Current counter did not exceed highest remembered count (this number is obviously not the mode)
                    } else {
                        currentCount = 0;    // reset counter
                    }
                }
            }

            // A count of 1 is not a mode!!
            if (rememberedCount === 0) {
                return "DNE";
            } else {
                return rememberedValues;
            }

       // Data has not been validated
        } else {

            // Attempt to validate... everything!!!
            var validationReport = validateJson(json, column, filterCb);
            
            // If validated, move json to ValidJson for type hinting
            if (!validationReport.error) {
                var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                
                // Recursively call function again as json is now valid and will pass the first if statement
                return mode(validJson, column, filterCb);
            
            // JSON is not valid, display errors
            } else {
                storeAndDisplayErrors(validationReport.errors);
            }
        }
    };

    // Add mode to prototype for easy access
    jsonData.prototype.mode = function(column, filterCb) {
        return mode(this.json, column, filterCb);
    };

    /**
     * Calculates the variance of a data set (column)
     * Data in column can be filtered with callback (filterCb)
     * 
     * @param (JSON array) json
     * @param String column
     * @param function filterCb
     *     takes an object in the JSON array as an argument
     *     should return true or false
     *     used to filter values in column used for calculation based on values in the same column or other columns
     *     e.g. function(data) {data.column == "value";}
     */
    var variance = function(json, column, filterCb) {
        // If JSON has already been validated, crunch numbers
        if (json instanceof ValidJson) {
            
            // Filter count if needed
            return sumOfSquares(json, column, filterCb)/(json.count - 1);

        // Data has not been validated
        } else {

            // Attempt to validate... everything!!!
            var validationReport = validateJson(json, column, filterCb);
            
            // If validated, move json to ValidJson for type hinting
            if (!validationReport.error) {
                var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                
                // Recursively call function again as json is now valid and will pass the first if statement
                return variance(validJson, column, filterCb);
            
            // JSON is not valid, display errors
            } else {
                storeAndDisplayErrors(validationReport.errors);
            }
        }
    };

    // Add variance to prototype for easy access
    jsonData.prototype.variance = function(column, filterCb) {
        return variance(this.json, column, filterCb);
    };

    /**
     * Calculates the standard deviation of a data set (column)
     * Data in column can be filtered with callback (filterCb)
     * 
     * @param (JSON array) json
     * @param String column
     * @param function filterCb
     *     takes an object in the JSON array as an argument
     *     should return true or false
     *     used to filter values in column used for calculation based on values in the same column or other columns
     *     e.g. function(data) {data.column == "value";}
     */
    var stdev = function(json, column, filterCb) {
        // If JSON has already been validated, crunch numbers
        if (json instanceof ValidJson) {
            return Math.sqrt(variance(json, column, filterCb));
        
        // Data has not been validated
        } else {

            // Attempt to validate... everything!!!
            var validationReport = validateJson(json, column, filterCb);
            
            // If validated, move json to ValidJson for type hinting
            if (!validationReport.error) {
                var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                
                // Recursively call function again as json is now valid and will pass the first if statement
                return stdev(validJson, column, filterCb);
            
            // JSON is not valid, display errors
            } else {
                storeAndDisplayErrors(validationReport.errors);
            }
        }
    };

    // Add stdev to prototype for easy access
    jsonData.prototype.stdev = function(column, filterCb) {
        return stdev(this.json, column, filterCb);
    };

    return globalObject;
})();