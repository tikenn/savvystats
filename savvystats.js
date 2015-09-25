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
 *  - math.js (https://github.com/josdejong/mathjs) Copyright (C) 2013-2015 Jos de Jong wjosdejong@gmail.com under the Apache 2.0 License
 */

// Require the mathjs Package
if (typeof math === "undefined") {
    throw new Error("This package requires the math.js package (https://github.com/josdejong/mathjs) for some of its functions to work.");
}

var ss = (function(math, undefined) {
    "use strict";

    // Set up global object to return into the ss object
    var globalObject = function(file, delimiter) {
        if (typeof file === "undefined") throw new Error("Need a non-empty file argument.");
        var json = fileParser(file, delimiter);

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
     * Simple function built to check if a number is positive
     * 
     * @param Number number
     */
    var isPositive = function(number) {
        if (number >= 0) {
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
     * Parses CSV and TSV file for loading into the ss object
     * Allows ss(file).math_function to be used for any file
     * 
     * @param String file
     * @param String fileType
     */
    var fileParser = function(file, delimiter) {
        // Non-denoted delimiter will assume "," (to fix later)
        delimiter = typeof delimiter === "undefined" ? "," : delimiter;

        // Variable to store file in
        var fileJson = [];

        // Array of objects listing errors for graceful errors
        var errors = [];

        if (delimiter !== "," && delimiter !=="\t") {
            throw new Error("Only CSV and TSV file types can be parsed");
            return undefined;
        }

        // Function shamelessly stolen from PapaParse (mholt | http://papaparse.com) and modified
        function guessLineEndings(input) {
            input = input.substr(0, 1024*1024); // max length 1 MB

            var r = input.split("\r");

            if (r.length == 1) {
                var n = input.split("\n");
                if (n.length > 1) {
                    return "\n";
                } else {
                    // file has no line endings and is only one line
                    return undefined;
                }
            }

            var numWithN = 0;
            for (var i = 0; i < r.length; i++) {
                if (r[i][0] == "\n")
                    numWithN++;
            }

            return numWithN >= r.length / 2 ? "\r\n" : "\r";
        }

        var lineEnding;
        if (lineEnding = guessLineEndings(file)) {
            var dataLines = file.split(lineEnding);
        } else {
            throw new Error("File provided has no line endings");
        }

        for (var i = 0; i < dataLines.length; i++) {
            var dataFields = dataLines[i].split(delimiter);
            // Set headers and keep moving
            if (i == 0) {
                var dataHeaders = dataFields;
                continue;
            }

            // Don't fill with garbage data
            if (dataLines[i] == "") {
                errors.push({
                    "function": "fileParser",
                    "process": "Parsing file lines",
                    "message": "No data present in the indicated line, skipping",
                    "row": i
                });
                continue;
            }

            // object to hold data for each line
            var lineObject = {};
            for (var j = 0; j < dataFields.length; j++) {
                if (typeof dataHeaders[j] !== "undefined") {
                    lineObject[dataHeaders[j]] = dataFields[j];
                } else {
                    errors.push({
                        "function": "fileParser",
                        "process": "Parsing data fields",
                        "message": "Fields exceeded expected number based on headers, skipping",
                        "row": i
                    });
                }
            }

            // Add each object to json array of file
            fileJson.push(lineObject);
        }

        // Attach error to jsonData prototype for viewing of file errors
        jsonData.prototype.errors = errors;

        return fileJson;
    }

    /*========================*
     * Descriptive Statistics *
     *========================*/

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
        validationReport.validJson = [];
        validationReport.count = 0;

        // In case multiple errors need to be thrown
        var errors = [];

        // -- Validating all input --
        // Make sure json is actually an array
        if (!(json instanceof Array)) {
            errors.push("Data must be in a JSON format starting with an array");
        }

        // Insure that column passed is a string
        if (typeof column !== "string") {
            errors.push("The column name must be passed as strings: " + column + ".")
        }

        // One of the inputs failed initial validation, no need to go further
        if (validationReport.error) {
            throw new Error(errors.join("; "));
        }

        // -- Validating the parts of the JSON data --
        for (var i = 0; i < json.length; i++) {
            // Making sure the array components are objects (note: arrays are considered to be instances of objects, so have to 
            // specificall exclude arrays)
            if (!(json[i] instanceof Object) || (json[i] instanceof Array)) {
                throw new Error("The JSON array must be filled with objects");
            }

            // Column argument must be a property of every JSON object
            if (!json[i].hasOwnProperty(column)) {
                throw new Error("The column " + column + " does not exist; or, if you're sure it does, the json might be broken. Verify the JSON before continuing.");
            }

            // column property argument listed must only consist of numbers
            if (isNaN(json[i][column])) {
                throw new Error("The column " + column + " does not contain only numbers and has to for this operation.");
            }

            // filter array (put this in after documentation, simply need to pass validationReport.validJson to "new ValidJson" instead of the original json argument for each function)
            // NOTE: will also need to remove unnecessary filtering from each function as well
            
            // If a callback has been used (argument in filterCb) and is a callback function, filter data
            if (filterCb && typeof filterCb === "function") {
                
                // callback must return true or false
                if (filterCb(json[i]) === true || filterCb(json[i]) === false) {
                    
                    // If the callback succeeds (the data meets the filter criteria set by the callback function)
                    // Note, this is the most trippy function I have every written in javascript
                    if (filterCb(json[i]) === true) {
                        
                        // Add that object to a new JSON array for returning, this is the json array that should be considered valid
                        validationReport.validJson.push(json[i]);
                        validationReport.count++;
                    }
                } else {
                    throw new Error("The function " + filterCb + " must return either true or false.");
                }

            // If a callback has been used but is not a function, return error
            } else if (filterCb && typeof filterCb !== "function") {
                throw new Error("The function " + filterCb + " is not a function or is improperly formed.");
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
            errors = [];

        // Is json an array in the first place
        if (!(json instanceof Array)) {
            errors.push("Data must be passed as a JSON array starting with an array");
        }

        // Is the column appropriate to be passed as the name of an object property
        if (typeof column !== "string") {
            errors.push("The column must be provided as a string");
        }

        // Grab errors and print
        if (errors.length > 0) {
            throw new Error(errors.join("; "));
        }

        // Begin going through JSON array
        for (var i = 0; i < json.length; i++) {
            // Does the JSON array contain objects
            if (!(json[i] instanceof Object)) {
                throw new Error("The JSON array must be filled with objects");
            }

            // Do the objects have the property passed in the column param
            if (!json[i].hasOwnProperty(column)) {
                throw new Error("The column selected does not exist, or, if you're sure it does, the json might be broken.  Verify the JSON before continuing.");
            }

            // Are values in the column param property numbers
            if (isNaN(json[i][column])) {
                throw new Error("All values of the chosen column must be numbers for the summmation");
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
            try {
                var validationReport = validateJson(json, column, filterCb);
                var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                return sumOfSquares(validJson, column, filterCb);
            
            // Validation failed, catch errors
            } catch (err) {
                
                // Re-throw for catching later
                throw err;
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
        var errors = [];

        // Is json an array in the first place
        if (!(json instanceof Array)) {
            errors.push("Data must be passed as a JSON array starting with an array");
        }

        // Is the column appropriate to be passed as the name of an object property
        if (typeof column !== "string") {
            errors.push("The column must be provided as a string");
        }

        // Grab errors and print
        if (errors.length > 0) {
            throw new Error(errors.join("; "));
        }

        // Copy json array so that the original data is not affected
        // This is, admittedly a little bit of a hack, but...
        var transformedJson = JSON.parse(JSON.stringify(json));

        for (var i = 0; i < transformedJson.length; i++) {
            // Does the JSON array contain objects
            if (!(json[i] instanceof Object)) {
                throw new Error("The JSON array must be filled with objects");
            }

            // Do the objects have the property passed in the column param
            if (!transformedJson[i].hasOwnProperty(column)) {
                throw new Error("The column selected does not exist, or, if you're sure it does, the json might be broken.  Verify the JSON before continuing.");
            }

            // Are values in the column param property numbers
            if (isNaN(transformedJson[i][column])) {
                throw new Error("All values of the chosen column must be numbers for the logarithm transformation");
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
            try {
                var validationReport = validateJson(json, column, filterCb);
                var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                return min(validJson, column, filterCb);
            } catch (err) {
                
                // Re-throw for catching later
                throw err;
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
            try {
                var validationReport = validateJson(json, column, filterCb);
                var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                return max(validJson, column, filterCb);
            
            // Validation failed, catch errors
            } catch (err) {
                
                // Re-throw for catching later
                throw err;
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
            try {
                var validationReport = validateJson(json, column, filterCb);
                var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                return range(validJson, column, filterCb);
            
            // Validation failed, catch errors
            } catch (err) {
                
                // Re-throw for catching later
                throw err;
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
            try {
                var validationReport = validateJson(json, column, filterCb);
                var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                return mean(validJson, column, filterCb);
            
            // Validation failed, catch errors
            } catch (err) {
                
                // Re-throw for catching later
                throw err;
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
            try {
                var validationReport = validateJson(json, column, filterCb);
                var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                return geomean(validJson, column, filterCb);
            
            // Validation failed, catch errors
            } catch (err) {
                
                // Re-throw for catching later
                throw err;
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
                throw new Error("The kth percentile must be a number between 1 and 100: " + k);
            }
        // Data has not been validated
        } else {


            // Attempt to validate... everything!!!
            try {
                var validationReport = validateJson(json, column, filterCb);
                var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                return percentile(k, validJson, column, filterCb);
            
            // Validation failed, catch errors
            } catch (err) {
                
                // Re-throw for catching later
                throw err;
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
            try {
                var validationReport = validateJson(json, column, filterCb);
                var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                return median(validJson, column, filterCb);
            
            // Validation failed, catch errors
            } catch (err) {
                
                // Re-throw for catching later
                throw err;
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
                throw new Error(type + " is not a quartile. Appropriate quartiles are 1, 2, 3, 4");
            }

       // Data has not been validated
        } else {


            // Attempt to validate... everything!!!
            try {
                var validationReport = validateJson(json, column, filterCb);
                var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                return quartile(type, validJson, column, filterCb);
            
            // Validation failed, catch errors
            } catch (err) {
                
                // Re-throw for catching later
                throw err;
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
            try {
                var validationReport = validateJson(json, column, filterCb);
                var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                return mode(validJson, column, filterCb);
            
            // Validation failed, catch errors
            } catch (err) {
                
                // Re-throw for catching later
                throw err;
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
            try {
                var validationReport = validateJson(json, column, filterCb);
                var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                return mode(validJson, column, filterCb);
            
            // Validation failed, catch errors
            } catch (err) {
                
                // Re-throw for catching later
                throw err;
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
            try {
                var validationReport = validateJson(json, column, filterCb);
                var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                return stdev(validJson, column, filterCb);
            
            // Validation failed, catch errors
            } catch (err) {
                
                // Re-throw for catching later
                throw err;
            }
        }
    };

    // Add stdev to prototype for easy access
    jsonData.prototype.stdev = function(column, filterCb) {
        return stdev(this.json, column, filterCb);
    };

    /*=================================*
     * Probabilities and Distributions *
     * ------------------------------- *
     * Note: section depends heavily   *
     * on mathjs package               *
     *=================================*/

    /**
     * Calculates the permutations of k objects chosen from n
     * In other words, choose k from n where the order of k matters
     * Based on the function (n!)/((n-k)!)
     *
     * @param Integer n
     * @param Integer k
     */
    globalObject.permutations = function(n, k) {
        var errors = [];

        // transfer everything to math.bignumbers for factorial calculations
        n = math.bignumber(n);
        k = math.bignumber(k);

        // Input sanitization
        if (!math.isInteger(n))
            errors.push("Permutation: The total number n from which k items are being chosen must be an integer: " + math.format(n));

        if (!math.isInteger(k))
            errors.push("Permutation: The number of k items to be chosen from n items must be an integer: " + math.format(k));

        if (math.larger(k, n))
            errors.push("Permutation: n must be greater than or equal to k: " + n + " < " + k);

        if (errors.length > 0) {
            throw new Error(errors.join("; "));
            return undefined;
        }

        var numerator = math.factorial(n);
        var denominator = math.factorial(math.subtract(n,k));

        return math.format(math.divide(numerator, denominator));
    };

    /**
     * Calculates the combinations of k objects chosen from n
     * In other words, choose k from n where the order of k doesn't matter
     * Based on the function (n choose k) or (n!)/(k!(n-k)!)
     *
     * @param Integer n
     * @param Integer k
     */
    globalObject.combinations = function(n, k) {
        var errors = [];

        // transfer everything to math.bignumbers for factorial calculations
        n = math.bignumber(n);
        k = math.bignumber(k);

        // Input sanitization
        if (!math.isInteger(n))
            errors.push("Permutation: The total number n from which k items are being chosen must be an integer: " + math.format(n));

        if (!math.isInteger(k))
            errors.push("Permutation: The number of k items to be chosen from n items must be an integer: " + math.format(k));

        if (math.larger(k, n))
            errors.push("Permutation: n must be greater than or equal to k: " + n + " < " + k);

        var numerator = math.bignumber(globalObject.permutations(n, k));
        var denominator = math.factorial(k);

        return math.format(math.divide(numerator, denominator));
    };

    /**
     * Calculates the probability of k number of successes in n number of trials based on a binomial distribution
     * 
     * @param Integer successes
     * @param Integer trials
     * @param Float probability
     * @param Boolen cumulative
     */
    globalObject.binomdist = function(successes, trials, probability, cumulative) {
        cumulative = typeof cumulative === "undefined" ? false: cumulative;
        
        var errors = [],                 // error array for error reporting
            total = math.bignumber(0);   // total probability

        // Sanitizing input
        if (!isInt(successes))
            errors.push("The number of successes must be an integer (" + successes + ")");

        if (!isPositive(successes))
            errors.push("The number of successes must be a positive integer (" + successes + ")");

        if (!isInt(trials))
            errors.push("The number of trials must be an integer (" + trials + ")");

        if (!isPositive(trials))
            errors.push("The number of trials must be a positive integer (" + trials + ")");

        if (successes > trials)
            errors.push("It is impossible to have more successes than trials, in both life and statistics...");

        if (typeof probability === "undefined")
            error.push("A probability of success must be provided");

        if (probability > 1 || probability < 0)
            errors.push("The probability of a success must be between 0 and 1 (" + probability + ")");

        if (errors.length > 0) {
            throw new Error(errors.join("; "));
        }

        // function to perform the actual calculation
        // Based on the function (n choose k)(p^k)(q^(n-k))
        var binomDistCalc = function(successes, trials, probability) {
            // Make everything a big number for use in massive factorial calculations
            successes = math.bignumber(successes);
            trials = math.bignumber(trials);
            probability = math.bignumber(probability);

            // Special case where combinatorics will come out to 1 and does not need to be calculated
            if (successes === 0 || successes === trials) {
                return math.multiply(math.pow(probability, successes), math.pow(math.subtract(1, probability), math.subtract(trials, successes)));
            
            // Not the special case, brute calculation
            } else {
                // Combinatorics calculation
                var combinations = math.bignumber(globalObject.combinations(trials, successes));

                // probability calculation
                var probPow = math.pow(probability, successes);
                var complementProbPow = math.pow(math.subtract(1, probability), math.subtract(trials, successes));
                var combinedProb = math.multiply(probPow, complementProbPow);

                // return final calculation, which is the answer
                return math.multiply(combinations, combinedProb);
            }
        };


        // No cumulative distribution
        if (cumulative === false) {
            return math.format(binomDistCalc(successes, trials, probability));
        
        // User asked for cumulative distribution
        } else {

            // Loop through current number of successes and all smaller number of successes and add probabilities together
            // for cumulative probability
            for (successes; successes >= 0; successes--) {
                total = math.add(total, binomDistCalc(successes, trials, probability));
            }
            return math.format(total);
        }
    };


    /**
     * Calculates the probability of k number of successes in a given time frame t with an average number of 
     * successes mu in time frame t
     * 
     * @param Int successes
     * @param Float avgSuccesses
     * @param Boolean cumulative
     */
    globalObject.poissondist = function(successes, avgSuccesses, cumulative) {
        cumulative = typeof cumulative === "undefined" ? false: cumulative;
        
        var errors = [],                 // error array for error reporting
            total = math.bignumber(0);   // total probability

        // Sanitizing input
        if (!isInt(successes))
            errors.push("The number of successes must be an integer (" + successes + ")");

        if (!isPositive(successes))
            errors.push("The number of successes must be a positive integer (" + successes + ")");

        if (!isPositive(avgSuccesses))
            errors.push("The average number of successes must be a positive number (" + avgSuccesses + ")");

        if (errors.length > 0) {
            throw new Error(errors.join("; "));
        }

        // Performs actual calculation
        // Based on the formula ((e^-mu)*(mu^k))/k!
        var poissonDistCalc = function(successes, avgSuccesses) {
            // Change all inputs to bignumbers for working with factorials
            successes = math.bignumber(successes);
            var negativeAvgSuccesses = math.bignumber(-avgSuccesses);
            avgSuccesses = math.bignumber(avgSuccesses);

            // Calculate numerator and denominator of the equation
            var numerator = math.multiply(math.pow(math.bignumber(math.e), negativeAvgSuccesses), math.pow(avgSuccesses, successes));
            var denominator = math.factorial(successes);

            return math.divide(numerator, denominator);
        };

        // No cumulative distribution
        if (cumulative === false) {
            return math.format(poissonDistCalc(successes, avgSuccesses));
        
        // User asked for cumulative distribution
        } else {

            // Loop through current number of successes and all smaller number of successes and add probabilities together
            // for cumulative probability
            for (successes; successes >= 0; successes--) {
                total = math.add(total, poissonDistCalc(successes, avgSuccesses));
            }
            return math.format(total);
        }
    };

    /**
     * Calculates the probability of getting the value x in an observation or the probability of x and anything less (cumulative)
     * Based on the formula (1/(sigma*sqrt(2*pi)))*e^((-1/(2*sigma^2))*(x-mu)^2)
     * Integration of the above function results in the cumulative distribution function
     *
     * See https://en.wikipedia.org/wiki/Normal_distribution#Cumulative_distribution_function and 
     *      https://en.wikipedia.org/wiki/Error_function for how this works
     * 
     * @param Float x
     * @param Float mean
     * @param Float stdev
     * @param Boolean cumulative (optional)
     */
    globalObject.normdist = function(x, mean, stdev, cumulative) {
        cumulative = typeof cumulative === "undefined" ? true : cumulative;
        var errors = [];

        // Sanitize the data
        if (isNaN(x)) {
            errors.push("normdist: the x value " + x + " is not a number");
        }

        if (isNaN(mean)) {
            errors.push("normdist: the mean " + mean + " is not a number");
        }

        if (isNaN(stdev)) {
            errors.push("normdist: the standard deviation " + stdev + " is not a number");
        }

        if(errors.length > 0) {
            throw new Error(errors.join("; "));
        }

        // Integrate the pmf of the normal distribution
        if (cumulative === true) {
            // based on integration of normal distribution probability mass function
            var errorFuncInput = ((x-mean)/stdev)/Math.sqrt(2),
                value = errorFuncInput,
                sum = errorFuncInput,
                prob;

            // Summing first 1000 terms of error function Taylor series (sum from(n = 0) to(infinity) (((-1)^n)*z^(2n+1))/(n!(2n+1)))
            for (var n = 1; n < 1001; n++) {
                // Change the previous term in the sum to the current term by multiplying the previous value by the change
                value *= (-1 * Math.pow(errorFuncInput, 2) * (2*n - 1))/(n * (2*n + 1));
                sum += value;
            }

            // Error function value of cumulative probability distribution
            var errorFunction = 2 / Math.sqrt(Math.PI) * sum;

            // handling javascript rounding problem
            if (errorFunction > 1) {
                prob = 1;
            } else {
                // cumulative probability
                prob = 1 / 2 * (1 + errorFunction);
            }

        // Probability based on pmf of normal distribution
        } else {
            prob = (1 / (stdev * Math.sqrt(2 * Math.PI))) * Math.pow(Math.E, (-1 / (2 * Math.pow(stdev, 2)) * Math.pow((x - mean), 2)));
        }

        return prob;
    };

    /**
     * Calculates the smallest x value that will give a cumulative probability equal to user input
     * Function provided by adussaq (https://github.com/adussaq)
     * 
     * @param Float prob
     * @param Float mean
     * @param Float stdev
     */
    globalObject.norminv = function(prob, mean, stdev) {
        var errors = [];

        // Sanitize the data
        if (isNaN(prob)) {
            errors.push("normdist: the x value " + x + " is not a number");
        }

        if (prob > 1 || prob < 0) {
            errors.push("normdist: the probability " + prob + " should be between 0 and 1 including the bounds");
        }

        if (isNaN(mean)) {
            errors.push("normdist: the mean " + mean + " is not a number");
        }

        if (isNaN(stdev)) {
            errors.push("normdist: the standard deviation " + stdev + " is not a number");
        }

        if(errors.length > 0) {
            throw new Error(errors.join("; "));
        }

        var z,                  // value for standard normal distribution (mean = 0, stdev = 1)
            diff,               // difference between guessed probability and user submitted probability
            error = 1e-10,      // allowed error between guessed probability and user submitted probability
            maxIter = 1000,     // after 1000 iterations, it's close enough
            step = 0.25,        // gives faster convergence on diff
            stepInc = 1.2,      // increase step to converge faster
            stepDec = 0.5,      // decreases step for after overshoot
            iter = 0,           // counts number of iterations
            direction = 1,      // determines direction of alternation
            lastDiff = 1;       // used to calculate overshooting

        // Make some intelligent guesses based on knowing that, for a standard normal distribution,
        // a probability < 0.5 must be from a negative z and a probability > 0.5 must be from a positive z
        if (prob < 0.5) {
            z = -0.5;
        } else if (prob > 0.5) {
            z = 0.5;
        } else {
            z = 0;
        }

        // Guess until gone for too many iterations or arrived within error
        do {
            // Check the guess
            diff = prob - globalObject.normdist(z, 0, 1, true);

            // Change direction on number line based on whether still above or below actual value
            if (diff > 0) {
                direction = 1;
            } else if (diff < 0) {
                direction = -1;
            } else {
                direction = 0;
            }

            // Increase step rate until overshoot
            if (lastDiff * diff > 0) {
                step *= stepInc;

            // Decrease step rate immediately after overshooting to narrow in
            } else {
                step *= stepDec;
            }

            // create another guess
            z += direction * step;

            // save last diff to check for overshooting
            lastDiff = diff;

            // Maintain count of iterations thus far
            iter++;
        } while (Math.abs(diff) > error && iter < maxIter);

        // return value back based on user-select normal distribution
        //return [z * stdev + mean, globalObject.normdist(z, 0, 1, true), iter]; (for debugging)
        return z * stdev + mean;
    }

    /**
     * Calculates the x value such that P(-x < X < x) is equal to the provided user probability
     * assuming a normal distribution
     * 
     * @param Float probability
     * @param Float mean
     * @param Float stdev
     */
    globalObject.normbetween = function(prob, mean, stdev) {
        var errors = [];

        // Sanitize the data
        if (isNaN(prob)) {
            errors.push("normdist: the x value " + x + " is not a number");
        }

        if (prob > 1 || prob < 0) {
            errors.push("normdist: the probability " + prob + " should be between 0 and 1 including the bounds");
        }

        if (isNaN(mean)) {
            errors.push("normdist: the mean " + mean + " is not a number");
        }

        if (isNaN(stdev)) {
            errors.push("normdist: the standard deviation " + stdev + " is not a number");
        }

        if(errors.length > 0) {
            throw new Error(errors.join("; "));
        }

        // Based on the fact that the normal distribution is symmetric and P(X < mu) = 0.5
        var cumulativeProb = 0.5 + prob / 2;

        return globalObject.norminv(cumulativeProb, mean, stdev);
    }

    return globalObject;
})(math);