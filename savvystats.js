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
 */

var ss = (function(undefined) {
    "use strict";

    // Set up global object to return into the ss object
    var globalObject = function(file, delimiter) {
        if (typeof file === "undefined") throw new Error("Need a non-empty file argument.");
        var json = fileParser(file, delimiter);

        return new JsonData(json);
    };

    /*==========================*
     * Helper Functions Section *
     *==========================*/

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


    /*==============================*
     * Statistics for Non-File Data *
     *==============================*/

    /*==========================================================*
     * Probabilities, Distributions, and Population Estimations *
     *==========================================================*/

    /**
     * Calculates the natural log of the gamma function
     * The log calculation is made to avoid arithmetic overflow
     * The gamma function can easily be retrieved by Math.exp(lnGamma(z))
     * Algorithm comes from http://www.rskey.org/CMS/index.php/the-library/11
     * Form of the algorithm: Γ(z)=[(√(2π)/z)(p_0+∑ from(n=1..6) (p_n/(z+n))](z+5.5)^(z+0.5) * e^−(z+5.5)
     * 
     * @param Int z > 0
     */
    var lnGamma = function(z) {
        if (isNaN(z)) {
            throw new Error("lnGamma: the argument of this function must be a positive number");
        }
        
        if (z < 0) {
            throw new Error("lnGamma: the argument of this function must be positive");
        }
        
        // Pre-derived parameters based on site providing algorithm
        var params = [1.000000000190015, 76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 1.208650973866179e-3, -5.395239384953e-6],
            sum = params[0],
            answer;
            
        // Calculates the summation term of the algorithm
        for (var i = 1; i < params.length; i++) {
            sum += params[i]/(z + i);
        }
        
        // Replace constants for faster calculation
        // answer = (1/2) * Math.log(2 * Math.PI) - Math.log(z) + Math.log(sum) + (z + 0.5) * Math.log(z + 5.5) - (z + 5.5);
        answer = 0.9189385332046727 - Math.log(z) + Math.log(sum) + (z + 0.5) * Math.log(z + 5.5) - (z + 5.5);
        return answer;
    };
    
    /**
     * Calculates the lower incomplete gamma function
     * Return the natural log to avoid arithmetic overflow in future calculations
     * Lower Incomplete Gamma function can be achieved by Math.exp(lnGammaIncomplete)
     * Algorithm from (http://www.rskey.org/CMS/index.php/the-library/11)
     * 
     * @param Float a
     * @param Float x
     */
    var lnGammaIncomplete = function(a, x) {
        var errors = [];

        // sanitize the data
        if (isNaN(a)) {
            errors.push("lnGammaIncomplete: the a parameter must be a number");
        }

        if (isNaN(x)) {
            errors.push("lnGammaIncomplete: the x parameter must be a number");
        }

        var sum = 1/a,          // initialize sum and set to sum of first two terms of series
            value = 1/a,        // stores the previous value
            lastSum,            // store value of last sum for error estimation
            error = 2.0e-10,    // tolerated error (same as gamma function)
            n = 1,              // start loop at 1 as 0th term has already been calculated
            maxIter = 1000;     // good enough (also avoiding arithmetic overflow in this case)

        // Keep going until reach error threshhold or run out of iterations
        do {
            // Save last sum before calculation
            lastSum = sum;
            
            // Multiply last value by change in term
            value *= x/(a + n);

            // Add value to continually growing sum
            sum += value;

            // increment count
            n++;
        } while (Math.abs((sum - lastSum)/sum) > error && n < maxIter);

        // return [Math.exp(a * Math.log(x) - x + Math.log(sum)), n];    // for debugging
        return a * Math.log(x) - x + Math.log(sum);
    };

    /**
     * Calculates the natural log of the incomplete beta function
     * The log is taken to avoid arithmetic overflow
     * The incomplete beta function can easily be retrieved by Math.exp(lnBetaIncomplete(x, a, b))
     * 
     * Credit for the algorithm: http://dlmf.nist.gov/8.17#v
     * Credit for continuous fraction implementation: 
     *         https://en.wikipedia.org/wiki/Continued_fraction#Infinite_continued_fractions
     *         and adussaq (https://github.com/adussaq)
     * 
     * @param Float x where 0 < x < 1
     * @param Float a
     * @param Float b
     */
    var lnBetaIncomplete = function(x, a, b) {
        var errors = [];
        
        if (isNaN(x)) {
            errors.push("lnBetaIncomplete: the parameter x: " + x + " must be a number");
        }
        
        if (!isNaN(x) && (x > 1 || x < 0)) {
            errors.push("lnBetaIncomplete: the parameter x: " + x + " must be between 0 and 1");
        }
        
        if (isNaN(a)) {
            errors.push("lnBetaIncomplete: the parameter a: " + a + " must be a number");
        }
        
        if (isNaN(b)) {
            errors.push("lnBetaIncomplete: the parameter b: " + b + " must be a number");
        }
        
        if (errors.length > 0) {
            throw new Error(errors.join("; "));
        }
        
        // A brief explanation of this function is in order:
        // From the algorithm website, the formula is given as I_x (a,b) = x^a * (1−x)^b /a * (1/(1+d_1/(1+d_2/(1+d_3/(1+...
        // For the continuous faction component (1/(1+d1/(1+d2/(1+d3/(1+... ) the following general solution can be shown
        //     (a_0 + a_1/(1 + a_2/(1 + a_3/(1 + a_4...
        //     the evaluation of the first n terms is given by h_n / k_n
        //     where h_n = a_n * h_(n-2) + h_(n-1)
        //     and k_n = a_n * k_(n-2) + k_(n-1)
        //     NOTE: the current term and TWO previous terms must be remembered
        
        // For the incomplete beta function's partial fraction, the following 2 initial states exist
        var h_0 = 0,            // no term in front added to the partial fraction
            k_0 = 1,            // denominators are always 1 with a whole number (or 0) on top
            h_1 = 1,            // the second numerator (a_0 + a_1) must be 1 given the partial fraction
            k_1 = 1,            // denominators are always 1 with a whole number (or 0) on top
            s_0 = h_0 / k_0,    // first proposed solution
            s_1 = h_1 / k_1,    // second proposed solution
            n = 1,              // this initiates d_1 NOT a_1
            error = 2.0e-10,    // set error to same tolerance as gamma function
            maxIter = 50,       // if answer is not found in 50 iterations, good enough
            m,                  // n is a function of m in the incomplete beta function
            d_n;                // used in the partial fraction of the incomplete beta function
            
        // Iterate until the difference between proposed solutions is within error tolerance
        while (Math.abs((s_1 - s_0)/s_1) > error && n < maxIter) {
            // Calculate m for odd n
            m = (n - 1)/2;
            
            // Calculate odd d_n
            d_n = -(a + m) * (a + b + m) * x / (a + 2*m) / (a + 2*m + 1);
            
            // Create new  initial numerator and denominator in set
            // based on general partial fraction solution
            h_0 = d_n * h_0 + h_1;
            k_0 = d_n * k_0 + k_1;
            
            // Next term
            n++;       // even n
            m = n/2;   // Calculate m for even n
            
            // Calculate even d_n
            d_n = m * (b - m) * x / (a + 2*m -1) / (a + 2*m);
            
            // Create new secondary numerator and denominator in set
            // base on general partial fraction solution
            h_1 = d_n * h_1 + h_0;
            k_1 = d_n * k_1 + k_0;
            
            // Propose new solutions
            s_0 = h_0 / k_0;
            s_1 = h_1 / k_1;
            
            // Keep all numbers small (same as multiplying numerators and denominators by (1/k_1)/(1/k_1))
            h_0 = h_0 / k_1;
            k_0 = k_0 / k_1;
            h_1 = s_1;  // s_1 = h_1/k_1
            k_1 = 1;     // k_1/k_1
            
            // Increment for next loop
            n++;
        }
        
        // Log tranform everything to keep everything as small as possible for future calculations
        return a * Math.log(x) + b * Math.log(1 - x) - Math.log(a) + Math.log(s_1);
    };

    /**
     * Calculates the factorial of an integer >= 0
     * 
     * @param Int n
     */
    var factorial = function(n) {
        if (n < 0 || !isInt(n)) {
            return NaN;
        } else if (n <= 1) {
            return 1;
        } else {
            return n * factorial(n - 1);
        }
    };

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

        // Input sanitization
        if (!isInt(n)) {
            errors.push("Permutation: The total number n from which k items are being chosen must be an integer: " + n);
        }

        if (!isInt(k)) {
            errors.push("Permutation: The number of k items to be chosen from n items must be an integer: " + k);
        }

        if (k > n) {
            errors.push("Permutation: n must be greater than or equal to k: " + n + " < " + k);
        }

        if (errors.length > 0) {
            throw new Error(errors.join("; "));
        }

        var product = 1;

        if (n === 0 || k === 0) {
            return 1;
        } else {
            for (var i = n; i > (n - k); i--) {
                product *= i;
            }
        }

        return product;

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

        // Input sanitization
        if (isNaN(n)) {
            errors.push("combinations: n must be a number");
        }

        if (isNaN(k)) {
            errors.push("combinations: k must be a number");
        }

        if (k > n) {
            errors.push("combinations: n must be greater than or equal to k");
        }

        // This function bodes some explanation
        // The terms in this function are broken up so that (n/k) * ((n-1)/(k-1)) * ((n-2)/(k-2)) * ...
        //     where n is the numerator term and k is the denominator term
        // The end of n is chosen by dividing by the larger term in the combinatorics denominator (k! or (n-k)!)
        //     causing the numerator to have as few terms in the product as possible
        // The denominator k, in the above general solution, is the remaining term (k! or (n-k)!)
        // It can then be shown that, for k > n - k, there are n - k terms in the numerator AND denominator
        // Conversely, for n - k > k, there are k terms in the numerator AND denominator
        // This solution insures that each term multiplied together is as small as possible allowing combinations where
        //     n is > 170 to be calculated --> 170! is the maximum factorial of JavaScript

        var numerator,              // numerator of each term
            numeratorProductEnd,    // end of the loop, the last term of the product in the numerator
            denominator,            // denominator of each term
            value = 1,              // numerator divided denominator for each term
            combinations = 1;       // the number of combinations

        // set numerator and denominator based on whether k or n-k is bigger
        if (k > n - k) {
            numeratorProductEnd = k;
            denominator = n - k;
        } else {
            numeratorProductEnd = n - k;
            denominator = k;
        }

        // Go through each term
        for (numerator = n; numerator > numeratorProductEnd; numerator--) {
            value = numerator / denominator;
            combinations *= value;

            // There will always be equal number of terms in the numerator and denominator
            denominator--;
        }

        return combinations;

    };

    /* --------------------- *
     * Binomial distribution *
     * --------------------- */

    // Object holding methods related to binomial distributions
    globalObject.binom = {};

    /**
     * Calculates the probability of k number of successes in n number of trials based on a binomial distribution
     * 
     * @param Integer successes
     * @param Integer trials
     * @param Float probability
     * @param Boolen cumulative
     */
    globalObject.binom.dist = function(successes, trials, probability, cumulative) {
        cumulative = typeof cumulative === "undefined" ? false: cumulative;
        
        var errors = [];                 // error array for error reporting

        // Sanitizing input
        if (!isInt(successes))
            errors.push("The number of successes must be an integer (" + successes + ")");

        if (successes < 0)
            errors.push("The number of successes must be a positive integer (" + successes + ")");

        if (!isInt(trials))
            errors.push("The number of trials must be an integer (" + trials + ")");

        if (trials < 0)
            errors.push("The number of trials must be a positive integer (" + trials + ")");

        if (successes > trials)
            errors.push("It is impossible to have more successes than trials, in both life and statistics...");

        if (typeof probability === "undefined")
            errors.push("A probability of success must be provided");

        if (probability > 1 || probability < 0)
            errors.push("The probability of a success must be between 0 and 1 (" + probability + ")");

        if (errors.length > 0) {
            throw new Error(errors.join("; "));
        }

        // function to perform the actual calculation
        // Based on the function (n choose k)(p^k)(q^(n-k))
        // Design is based on the fact that the resulting probability can't be greater than
        //     1 (arithmetic overflow is less likely)
        var binomDistCalc = function(successes, trials, probability) {
            var successProbabiltyTerm = Math.pow(probability, successes),                      // raising probability of success to number of successes (p^k)
                mutExclProbabilityTerm = Math.pow((1 - probability), (trials - successes)),    // raising mutually exclusive probability to trials minus success (q^(n-k))

                // combination terms
                numerator,              // numerator of each term
                numeratorProductEnd,    // end of the loop, the last term of the product in the numerator
                denominator,            // denominator of each term
                value,                  // numerator divided denominator for each term in combination calculation
                lastValue,              // needed if the product of successProbabiltyTerm and mutExclProbabilityTerm is 0
                prob;                   // probability, set to the smallest term without going to 0 (p^k, q^(n-k), or p^k * q^(n-k))


            // if either of the probability terms is 0 then the whole probability is irrecoverable
            // return 0 as the answer
            if (successProbabiltyTerm === 0 || mutExclProbabilityTerm === 0) {
                return 0;
            }

            // start the probability term out with the smallest term of p^k or q^(n-k)
            // I'm assuming that the term chosen above multiplied by the combinations can 
            //     never overflow...
            if (successProbabiltyTerm > mutExclProbabilityTerm) {
                prob = mutExclProbabilityTerm;
                lastValue = successProbabiltyTerm;
            } else {
                prob = successProbabiltyTerm;
                lastValue = mutExclProbabilityTerm;
            }

            // -----------------------------------------------
            // Basically the same as the combinations function
            // Reused to allow larger calculations
            // -----------------------------------------------

            // set numerator and denominator based on whether successes or trials-successes is bigger
            if (successes > trials - successes) {
                numeratorProductEnd = successes;
                denominator = trials - successes;
            } else {
                numeratorProductEnd = trials - successes;
                denominator = successes;
            }

            // Go through each term
            for (numerator = trials; numerator > numeratorProductEnd; numerator--) {
                value = numerator / denominator;
                prob *= value;

                // There will always be equal number of terms in the numerator and denominator
                denominator--;
            }

            // Multiply the last value (either a probability or 1)
            prob *= lastValue;

            return prob;

        };

        var total = 0;

        // No cumulative distribution
        if (cumulative === false) {
            return binomDistCalc(successes, trials, probability);
        
        // User asked for cumulative distribution
        } else {

            // Loop through current number of successes and all smaller number of successes and add probabilities together
            // for cumulative probability
            for (successes; successes >= 0; successes--) {
                total += binomDistCalc(successes, trials, probability);
            }
            return total;
        }
    };

    /* -------------------- *
     * Poisson Distribution *
     * -------------------- */

    // Object containing Poisson distribution methods
     globalObject.poisson = {};

    /**
     * Calculates the probability of k number of successes in a given time frame t with an average number of 
     * successes mu in time frame t
     * Idea for use of natural log comes from (https://en.wikipedia.org/wiki/Poisson_distribution#Definition)
     * 
     * @param Int successes
     * @param Float avgSuccesses
     * @param Boolean cumulative
     */
    globalObject.poisson.dist = function(successes, avgSuccesses, cumulative) {
        cumulative = typeof cumulative === "undefined" ? false: cumulative;
        
        var errors = [];                 // error array for error reporting

        // Sanitizing input
        if (successes % 1 > 0)
            errors.push("The number of successes must be an integer (" + successes + ")");

        if (successes < 0)
            errors.push("The number of successes must be a positive integer (" + successes + ")");

        if (avgSuccesses < 0)
            errors.push("The average number of successes must be a positive number (" + avgSuccesses + ")");

        if (errors.length > 0) {
            throw new Error(errors.join("; "));
        }

        // Performs actual calculation
        // Based on the formula ((e^-mu)*(mu^k))/k!
        var poissonDistCalc = function(successes, avgSuccesses) {
            var prob;    // The probability from the poisson distribution

            prob = Math.exp(successes * Math.log(avgSuccesses) - avgSuccesses - lnGamma(successes + 1));
            return prob;
        };

        var total = 0;    // total for the cumulative distribution

        // No cumulative distribution
        if (cumulative === false) {
            return poissonDistCalc(successes, avgSuccesses);
        
        // User asked for cumulative distribution
        } else {

            // Loop through current number of successes and all smaller number of successes and add probabilities together
            // for cumulative probability
            for (successes; successes >= 0; successes--) {
                total += poissonDistCalc(successes, avgSuccesses);
            }
            return total;
        }
    };

    /* ------------------- *
     * Normal Distribution *
     * ------------------- */

    // Objects containing Normal distribution methods
    globalObject.norm = {};

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
    globalObject.norm.dist = function(x, mean, stdev, cumulative) {
        // Set default cumulative to true as this is the expected behavior for this function
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

        // based on integration of normal distribution probability mass function
        var errorFuncInput = ((x-mean)/stdev)/Math.sqrt(2),    // input t for error function
            value = errorFuncInput,                            // storing original input for checking javascript rounding error
            sum = errorFuncInput,                              // initializing sum as starting with the input of the error function
            lastSum,                                           // remember the last sum for error tolerance
            error = 2.0e-10,                                   // error threshhold set to be equal to gamma function
            n = 1,                                             // start at n = 1 since the 0th term of the sum has laready been calculated
            maxIter = 1000,                                    // good enough
            prob;                                              // Proability, either cumulative or pdf


        // Integrate the pmf of the normal distribution
        if (cumulative === true) {

            // Calculating sum to error threshhold or maxIter -- (sum from(n = 0) to(infinity) (((-1)^n)*z^(2n+1))/(n * (2n+1)))
            do {
                // save last sum before recalculating it for error analysis
                lastSum = sum;

                // Change the previous term in the sum to the current term by multiplying the previous value by the change
                value *= (-1 * Math.pow(errorFuncInput, 2) * (2*n - 1))/(n * (2*n + 1));
                sum += value;

                // increment n
                n++;
            } while (Math.abs((sum - lastSum)/sum) > error && n < maxIter);

            // Error function value of cumulative probability distribution
            var errorFunction = 2 / Math.sqrt(Math.PI) * sum;

            // handling javascript rounding problem
            if (errorFunction > 1) {
                prob = 1;
            } else if (errorFunction < -1) {
                prob = 0;
            } else {
                // cumulative probability
                prob = 1 / 2 * (1 + errorFunction);
            }

        // Probability based on pmf of normal distribution
        } else {
            prob = (1 / (stdev * Math.sqrt(2 * Math.PI))) * Math.pow(Math.E, (-1 / (2 * Math.pow(stdev, 2)) * Math.pow((x - mean), 2)));
        }

        // return [prob, n];    // for debugging
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
    globalObject.norm.inv = function(prob, mean, stdev) {
        var errors = [];

        // Sanitize the data
        if (isNaN(prob)) {
            errors.push("norm.inv: the probability " + prob + " is not a number");
        }

        if (prob > 1 || prob < 0) {
            errors.push("norm.inv: the probability " + prob + " should be between 0 and 1 including the bounds");
        }

        if (isNaN(mean)) {
            errors.push("norm.inv: the mean " + mean + " is not a number");
        }

        if (isNaN(stdev)) {
            errors.push("norm.inv: the standard deviation " + stdev + " is not a number");
        }

        if (!isNaN(stdev) && stdev < 0) {
            errors.push("norm.inv: the standard deviation " + stdev + " should be positive");
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
            diff = prob - globalObject.norm.dist(z, 0, 1, true);

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
        //return [z * stdev + mean, globalObject.norm.dist(z, 0, 1, true), iter]; // (for debugging)
        return z * stdev + mean;
    };

    /**
     * Calculates the value z * stderror such that P(-z < Z < z) is equal to the provided user alpha (1 - prob)
     * where Z is normally distributed with mu = 0 and sigma = 1 (a standard normal distribution)
     * and z = (x - mean)/sigma
     * 
     * In other words, calculates the confidence interval for a sample mean if the population 
     * standard deviation is known
     * 
     * @param Float alpha
     * @param Float popStdev
     * @param Int sampleSize
     */
    globalObject.norm.conf = function(alpha, popStdev, sampleSize) {
        var errors = [];

        // Sanitize the data
        if (isNaN(alpha)) {
            errors.push("norm.conf: the alpha value " + alpha + " is not a number");
        }

        if (alpha > 1 || alpha < 0) {
            errors.push("norm.conf: the alpha " + alpha + " should be between 0 and 1 including the bounds");
        }

        if (isNaN(popStdev)) {
            errors.push("norm.conf: the population standard " + popStdev + " is not a number");
        }

        if (!isNaN(popStdev) && popStdev < 0) {
            errors.push("norm.conf: the population standard deviation " + popStdev + " should be positive");
        }

        if (isNaN(sampleSize)) {
            errors.push("norm.conf: the sample size " + sampleSize + " is not a number");
        }

        if (!isNaN(sampleSize) && sampleSize < 0) {
            errors.push("norm.conf: the sample size " + sampleSize + " should be positive");
        }

        if(errors.length > 0) {
            throw new Error(errors.join("; "));
        }

        // Based on the fact that the normal distribution is symmetric and P(X < mu) = 0.5
        var cumulativeProb = 1 - alpha / 2;

        var z = globalObject.norm.inv(cumulativeProb, 0, 1);
        return z * popStdev / Math.sqrt(sampleSize);
    };

    /**
     * Calculates the value z * stderror such that P(Z < z) is equal to the provided user alpha (1 - prob)
     * where Z is normally distributed with mu = 0 and sigma = 1 (a standard normal distribution)
     * and z = (x - mean)/sigma
     * 
     * In other words, calculates the lower confidence interval for a sample mean if the population 
     * standard deviation is known
     * 
     * @param Float alpha
     * @param Float popStdev
     * @param Int sampleSize
     */
    globalObject.norm.conf.lower = function(alpha, popStdev, sampleSize) {
        // Sanitize the data
        if (isNaN(alpha)) {
            errors.push("norm.conf: the alpha value " + alpha + " is not a number");
        }

        if (alpha > 1 || alpha < 0) {
            errors.push("norm.conf: the alpha " + alpha + " should be between 0 and 1 including the bounds");
        }

        if (isNaN(popStdev)) {
            errors.push("norm.conf: the population standard " + popStdev + " is not a number");
        }

        if (!isNaN(popStdev) && popStdev < 0) {
            errors.push("norm.conf: the population standard deviation " + popStdev + " should be positive");
        }

        if (isNaN(sampleSize)) {
            errors.push("norm.conf: the sample size " + sampleSize + " is not a number");
        }

        if (!isNaN(sampleSize) && sampleSize < 0) {
            errors.push("norm.conf: the sample size " + sampleSize + " should be positive");
        }

        // Based on the fact that the normal distribution is symmetric and P(X < mu) = 0.5
        var cumulativeProb = 1 - alpha;

        var z = globalObject.norm.inv(cumulativeProb, 0, 1);
        return z * popStdev / Math.sqrt(sampleSize);
    };

    /**
     * Calculates the value z * stderror such that P(Z > -z) is equal to the provided user alpha (1 - prob)
     * where Z is normally distributed with mu = 0 and sigma = 1 (a standard normal distribution)
     * and z = (x - mean)/sigma
     * 
     * In other words, calculates the upper confidence interval for a sample mean if the population 
     * standard deviation is known
     * 
     * @param Float alpha
     * @param Float popStdev
     * @param Int sampleSize
     */
    globalObject.norm.conf.upper = function(alpha, popStdev, sampleSize) {
        // Sanitize the data
        if (isNaN(alpha)) {
            errors.push("norm.conf: the alpha value " + alpha + " is not a number");
        }

        if (alpha > 1 || alpha < 0) {
            errors.push("norm.conf: the alpha " + alpha + " should be between 0 and 1 including the bounds");
        }

        if (isNaN(popStdev)) {
            errors.push("norm.conf: the population standard " + popStdev + " is not a number");
        }

        if (!isNaN(popStdev) && popStdev < 0) {
            errors.push("norm.conf: the population standard deviation " + popStdev + " should be positive");
        }

        if (isNaN(sampleSize)) {
            errors.push("norm.conf: the sample size " + sampleSize + " is not a number");
        }

        if (!isNaN(sampleSize) && sampleSize < 0) {
            errors.push("norm.conf: the sample size " + sampleSize + " should be positive");
        }

        // Based on the fact that the normal distribution is symmetric and P(X < mu) = 0.5
        var cumulativeProb = 1 - alpha;

        var z = globalObject.norm.inv(cumulativeProb, 0, 1);
        return -z * popStdev / Math.sqrt(sampleSize);
    };


    /* -------------- *
     * T Distribution *
     * -------------- */

    // Object containing T distribution methods
    globalObject.t = {};

    /**
     * Calculates the cumulative t distribution
     * Algorithm from (https://en.wikipedia.org/wiki/Student%27s_t-distribution#Cumulative_distribution_function)
     * 
     * @param Float t
     * @param Int df
     * @param Boolean cumulative
     */
    globalObject.t.dist = function(tValue, df, cumulative) {
        // set cumulative default to true as this is typically expected behavior of this function
        cumulative = typeof cumulative === "undefined" ? true : cumulative;

        var errors = [];
        
        // Error checking
        if (isNaN(tValue)) {
            errors.push("t.dist: The t value: " + tValue + " must be a number");
        }
        
        if (isNaN(df)) {
            errors.push("t.dist: The degrees of freedom: " + df + " must be a number");
        }
        
        if (df < 0) {
            errors.push("t.dist: The degrees of freedom: " + df + " must be positive");
        }
        
        if (errors.length > 0) {
            throw new Error(errors.join("; "));
        }

        // parameters for beta functions
        var x = df / (Math.pow(tValue, 2) + df),    // x parameter of beta function
            a = df / 2,                             // a parameter of beta function
            b = 1 / 2,                              // b parameter of beta function
            lnRegBetaInc,                           // natural log of regularized incomplete beta function (B(x; a, b)/B(a, b))
            regBetaInc,                             // regularized incomplete beta function
            prob;                                   // probability of given tValue

        if (cumulative === true) {

            // Calculate lnBeta function using gamma function
            // Beta(a, b) = Gamma(a) * Gamma(b) / Gamma(a + b)
            // var lnBeta = lnGamma(df/2) + lnGamma(1/2) - lnGamma((df+1)/2);
            var lnBeta = lnGamma(df/2) + 0.572364942924743 - lnGamma((df+1)/2);

            // Optimized convergence based on (http://dlmf.nist.gov/8.17#v)
            if (x < (a + 1) / (a + b + 2)) {
                lnRegBetaInc = lnBetaIncomplete(x, a, b) - lnBeta;
                regBetaInc = Math.exp(lnRegBetaInc);
            } else {

                // Note that Beta(a, b) = Beta(b, a), allowing same value for lnBeta to be used as above
                lnRegBetaInc = lnBetaIncomplete(1 - x, b, a) - lnBeta;
                regBetaInc = 1 - Math.exp(lnRegBetaInc);
            }

            // Final step based on whether tValue > 0
            if (tValue < 0) {
                prob = regBetaInc / 2;
            } else {
                prob = 1 - regBetaInc / 2;
            }
        } else {

            // Equation from (wiki article)
            prob = Math.exp(lnGamma((df + 1) / 2) - (1/2) * Math.log(df * Math.PI) - lnGamma(df / 2) - ((df + 1) / 2) * Math.log(1 + (Math.pow(prob, 2)/df)));
        }

        return prob;
    };


    /**
     * Calculates the smallest t value that will give a cumulative probability equal to user input
     * Function provided by adussaq (https://github.com/adussaq)
     * 
     * @param Float prob
     * @param Int df
     */
    globalObject.t.inv = function(prob, df) {
        var errors = [];

        // Sanitize the data
        if (isNaN(prob)) {
            errors.push("t.inv: the probability " + prob + " is not a number");
        }

        if (prob > 1 || prob < 0) {
            errors.push("t.inv: the probability " + prob + " should be between 0 and 1 including the bounds");
        }

        if (isNaN(df)) {
            errors.push("t.inv: the degrees of freedom " + df + " is not a number");
        }

        if (!isNaN(df) && df < 1) {
            errors.push("t.inv: the degrees of freedom " + df + " should be a positive number greater than or equal to 1");
        }

        if(errors.length > 0) {
            throw new Error(errors.join("; "));
        }

        var t,                  // t value that will be associated with user-submitted probability
            diff,               // difference between guessed probability and user submitted probability
            error = 1e-10,      // allowed error between guessed probability and user submitted probability
            maxIter = 1000,     // after 1000 iterations, it's close enough
            step = 0.25,        // gives faster convergence on diff
            stepInc = 1.2,      // increase step to converge faster
            stepDec = 0.5,      // decreases step for after overshoot
            iter = 0,           // counts number of iterations
            direction = 1,      // determines direction of alternation
            lastDiff = 1;       // used to calculate overshooting

        // Make some intelligent guesses based on knowing that, for a t distribution,
        // a probability < 0.5 must be from a negative z and a probability > 0.5 must be from a positive z
        if (prob < 0.5) {
            t = -0.5;
        } else if (prob > 0.5) {
            t = 0.5;
        } else {
            t = 0;
        }

        // Guess until gone for too many iterations or arrived within error
        do {
            // Check the guess
            diff = prob - globalObject.t.dist(t, df, true);

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
            t += direction * step;

            // save last diff to check for overshooting
            lastDiff = diff;

            // Maintain count of iterations thus far
            iter++;
        } while (Math.abs(diff) > error && iter < maxIter);

        // return value back based on user-select normal distribution
        //return [t, globalObject.t.dist(t, df, true), iter]; // (for debugging)
        return t;
    };

    /**
     * Calculates the confidence interval of a sample mean assuming the population variance is unknown
     * Returns the +/- value that is to be added added/subtracted to/from the sample mean
     * 
     * @param Float alpha
     * @param Float stdev
     * @param Int sampleSize
     */
    globalObject.t.conf = function(alpha, stdev, sampleSize) {
        var errors = [];

        // Sanitize the data
        if (isNaN(alpha)) {
            errors.push("t.conf: The alpha value must be a number");
        }

        if (!isNaN(alpha) && (alpha > 1 || alpha < 0)) {
            errors.push("t.conf: The alpha value must be between 0 and 1");
        }

        if (isNaN(stdev)) {
            errors.push("t.conf: The standard deviation must be a number");
        }

        if (isNaN(sampleSize)) {
            errors.push("t.conf: The sample size must be a number");
        }

        if (!isNaN(sampleSize) && sampleSize < 0) {
            errors.push("t.conf: The sample size must be a positive number");
        }

        var prob = 1 - alpha / 2,    // probability is 1 minus desired alpha / 2 because t dist is symmetric
            df = sampleSize - 1;     // standard df calculation

        // Calculate the t value associated with the confidence interval
        var t = globalObject.t.inv(prob, df, true);
        return t * stdev / Math.sqrt(sampleSize);
    };

    /**
     * Calculates the lower confidence interval of a sample mean assuming the population variance is unknown
     * Returns the (+) value that is to be added to the sample mean
     * 
     * @param Float alpha
     * @param Float stdev
     * @param Int sampleSize
     */
    globalObject.t.conf.lower = function(alpha, stdev, sampleSize) {
        var errors = [];

        // Sanitize the data
        if (isNaN(alpha)) {
            errors.push("t.conf: The alpha value must be a number");
        }

        if (!isNaN(alpha) && (alpha > 1 || alpha < 0)) {
            errors.push("t.conf: The alpha value must be between 0 and 1");
        }

        if (isNaN(stdev)) {
            errors.push("t.conf: The standard deviation must be a number");
        }

        if (isNaN(sampleSize)) {
            errors.push("t.conf: The sample size must be a number");
        }

        if (!isNaN(sampleSize) && sampleSize < 0) {
            errors.push("t.conf: The sample size must be a positive number");
        }

        var prob = 1 - alpha,    // probability is 1 minus desired alpha / 2 because t dist is symmetric
            df = sampleSize - 1;     // standard df calculation

        // Calculate the t value associated with the confidence interval
        var t = globalObject.t.inv(prob, df, true);
        return t * stdev / Math.sqrt(sampleSize);
    };

    /**
     * Calculates the upper confidence interval of a sample mean assuming the population variance is unknown
     * Returns the (-) value that is to be subtracted from the sample mean
     * 
     * @param Float alpha
     * @param Float stdev
     * @param Int sampleSize
     */
    globalObject.t.conf.upper = function(alpha, stdev, sampleSize) {
        var errors = [];

        // Sanitize the data
        if (isNaN(alpha)) {
            errors.push("t.conf: The alpha value must be a number");
        }

        if (!isNaN(alpha) && (alpha > 1 || alpha < 0)) {
            errors.push("t.conf: The alpha value must be between 0 and 1");
        }

        if (isNaN(stdev)) {
            errors.push("t.conf: The standard deviation must be a number");
        }

        if (isNaN(sampleSize)) {
            errors.push("t.conf: The sample size must be a number");
        }

        if (!isNaN(sampleSize) && sampleSize < 0) {
            errors.push("t.conf: The sample size must be a positive number");
        }

        var prob = 1 - alpha,    // probability is 1 minus desired alpha / 2 because t dist is symmetric
            df = sampleSize - 1;     // standard df calculation

        // Calculate the t value associated with the confidence interval
        var t = globalObject.t.inv(prob, df);
        return -t * stdev / Math.sqrt(sampleSize);
    };


    /* ----------------------- *
     * Chi Square Distribution *
     * ----------------------- */

    // Objects containing Chi Square distribution methods
    globalObject.chisq = {};          // chi square distribution functions for any data

    /**
     * Calculates the value of the chi-square distribution given a chistat and the degrees of freedom
     * 
     * @param Float chiStat
     * @param Int df
     * @param Boolean cumulative
     */
    globalObject.chisq.dist = function(chiStat, df, cumulative) {
        // Default is set to cumulative as this is the expected behavior of the chi-square statistic
        cumulative = typeof cumulative === "undefined" ? true : cumulative;

        var errors = [];

        if (isNaN(chiStat)) {
            errors.push("chisq.dist: The chi-square statistic must be a number");
        }

        if (!isNaN(chiStat) && chiStat < 0) {
            errors.push("chisq.dist: The chi-square statistic must be greater than or equal to 0");
        }

        if (isNaN(df)) {
            errors.push("chisq.dist: The degrees of freedom must be a number");
        }

        if (!isNaN(df) && df < 0) {
            errors.push("chisq.dist: The degrees of freedome must be positive");
        }

        if (errors.length > 0) {
            throw new Error(errors.join("; "));
        }

        var prob;    // probability of given arguments

        if (cumulative === true) {

            // cumulative distribution function
            prob = Math.exp(lnGammaIncomplete(df/2, chiStat/2) - lnGamma(df/2));
        } else {

            // probability distribution function (probability moment)
            if (chiStat > 0) {
                prob = Math.pow(chiStat, (df/2 - 1)) * Math.exp(-chiStat/2) / Math.pow(2, df/2) / Math.exp(lnGamma(df/2));
            } else {
                prob = 0;
            }
        }

        return prob;
    };
    

    /**
     * Calculates the smallest chi statistic value that will give a cumulative probability equal to user input
     * Function provided by adussaq (https://github.com/adussaq)
     * 
     * @param Float prob
     * @param Int df
     */
    globalObject.chisq.inv = function(prob, df) {
        var errors = [];

        // Sanitize the data
        if (isNaN(prob)) {
            errors.push("chisq.inv: the probability " + prob + " is not a number");
        }

        if (prob > 1 || prob < 0) {
            errors.push("chisq.inv: the probability " + prob + " should be between 0 and 1 including the bounds");
        }

        if (isNaN(df)) {
            errors.push("chisq.inv: the degrees of freedom " + df + " is not a number");
        }

        if (!isNaN(df) && df < 1) {
            errors.push("chisq.inv: the degrees of freedom " + df + " should be a positive number greater than or equal to 1");
        }

        if(errors.length > 0) {
            throw new Error(errors.join("; "));
        }

        var chisq,              // chisq value that will be associated with user-submitted probability
            diff,               // difference between guessed probability and user submitted probability
            error = 1e-10,      // allowed error between guessed probability and user submitted probability
            maxIter = 1000,     // after 1000 iterations, it's close enough
            step = 0.20,        // seems to be the most optimized for the chisq
            stepInc = 1.09,     // increase step to converge faster (optimized for chisq)
            stepDec = 0.35,     // decreases step for after overshoot (optimized for chisq)
            iter = 0,           // counts number of iterations
            direction = 1,      // determines direction of alternation
            lastDiff = 1;       // used to calculate overshooting

        // Make some intelligent guesses based on knowing that, for a chi square distribution,
        // the mean is the degrees of freedom and a probability < 0.5 will result in a chisq < df and vice versa
        // I am starting the bidding (har de har har) at df - 1 or df + 1 as that seems to be safe from testing
        if (prob <= 0.5) {
            chisq = df - 1;
        } else if (prob > 0.5) {
            chisq = df + 1;
        }

        // Guess until gone for too many iterations or arrived within error
        do {
            // Check the guess
            diff = prob - globalObject.chisq.dist(chisq, df, true);

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
            chisq += direction * step;

            // save last diff to check for overshooting
            lastDiff = diff;

            // Maintain count of iterations thus far
            iter++;
        } while (Math.abs(diff) > error && iter < maxIter);

        // return value back based on user-select normal distribution
        // return [chisq, globalObject.chisq.dist(chisq, df, true), iter]; // (for debugging)
        return chisq;
    };

    /**
     * Calculates the right-sided confidence interval for variance using the chisq distribution
     * Solution comes from FUNDAMENTALS OF BIOSTATISTSICS SEVENTH EDITION Bernard Rosner p. 180
     * 
     * @param Float alpha
     * @param Float stdev
     * @param Int sampleSize
     */
    globalObject.chisq.conf = function(alpha, stdev, sampleSize) {
        var errors = [];

        // Sanitize the data
        if (isNaN(alpha)) {
            errors.push("chisq.conf: The alpha value must be a number");
        }

        if (!isNaN(alpha) && (alpha > 1 || alpha < 0)) {
            errors.push("chisq.conf: The alpha value must be between 0 and 1");
        }

        if (isNaN(stdev)) {
            errors.push("chisq.conf: The standard deviation must be a number");
        }

        if (isNaN(sampleSize)) {
            errors.push("chisq.conf: The sample size must be a number");
        }

        if (!isNaN(sampleSize) && sampleSize < 0) {
            errors.push("chisq.conf: The sample size must be a positive number");
        }

        if (!isNaN(sampleSize) && !isInt(sampleSize)) {
            errors.push("chisq.conf: The sample size must be an integer as only serial killers deal in fractions of people and we are assuming users don't fall into that category");
        }

        if (errors.length > 0) {
            throw new Error(errors.join("; "));
        }

        var lowerBoundProb = 1 - alpha/2,    // while counterintuitive as the lower bound, this is based on the derived solution
            upperBoundProb = alpha/2,        // again, counterintuitive, but based on derived solution
            lowerIntervalBound,              // lower bound of confidence interval (chi-square distribution is not symmetric)
            upperIntervalBound;              // upper bound of confidence interval (chi-square distribution is not symmetric)

        // Calculate the bounds of the interval
        lowerIntervalBound = (sampleSize - 1) * Math.pow(stdev, 2) / globalObject.chisq.inv(lowerBoundProb, sampleSize - 1);
        upperIntervalBound = (sampleSize - 1) * Math.pow(stdev, 2) / globalObject.chisq.inv(upperBoundProb, sampleSize - 1);

        // Note that the distribution is not symmetric, so a single value can't be returned
        return [lowerIntervalBound, upperIntervalBound];
    };

    /**
     * Calculates the upper confidence interval for variance using the chisq distribution
     * Solution comes from FUNDAMENTALS OF BIOSTATISTSICS SEVENTH EDITION Bernard Rosner p. 180
     * 
     * @param Float alpha
     * @param Float stdev
     * @param Int sampleSize
     */
    globalObject.chisq.conf.lower = function(alpha, stdev, sampleSize) {
        var errors = [];

        // Sanitize the data
        if (isNaN(alpha)) {
            errors.push("chisq.conf: The alpha value must be a number");
        }

        if (!isNaN(alpha) && (alpha > 1 || alpha < 0)) {
            errors.push("chisq.conf: The alpha value must be between 0 and 1");
        }

        if (isNaN(stdev)) {
            errors.push("chisq.conf: The standard deviation must be a number");
        }

        if (isNaN(sampleSize)) {
            errors.push("chisq.conf: The sample size must be a number");
        }

        if (!isNaN(sampleSize) && sampleSize < 0) {
            errors.push("chisq.conf: The sample size must be a positive number");
        }

        if (!isNaN(sampleSize) && !isInt(sampleSize)) {            errors.push("chisq.conf: The sample size must be an integer as only serial killers deal in fractions of people and we are assuming users don't fall into that category");
        }

        if (errors.length > 0) {
            throw new Error(errors.join("; "));
        }

        var upperBoundProb = alpha,        // again, counterintuitive, but based on derived solution
            upperIntervalBound;              // upper bound of confidence interval (chi-square distribution is not symmetric)

        // Calculate the bounds of the interval
        upperIntervalBound = (sampleSize - 1) * Math.pow(stdev, 2) / globalObject.chisq.inv(upperBoundProb, sampleSize - 1);

        // Note that the distribution is not symmetric, so a single value can't be returned
        return upperIntervalBound;
    };

    /**
     * Calculates the right-sided confidence interval for variance using the chisq distribution
     * Solution comes from FUNDAMENTALS OF BIOSTATISTSICS SEVENTH EDITION Bernard Rosner p. 180
     * 
     * @param Float alpha
     * @param Float stdev
     * @param Int sampleSize
     */
    globalObject.chisq.conf.upper = function(alpha, stdev, sampleSize) {
        var errors = [];

        // Sanitize the data
        if (isNaN(alpha)) {
            errors.push("chisq.conf: The alpha value must be a number");
        }

        if (!isNaN(alpha) && (alpha > 1 || alpha < 0)) {
            errors.push("chisq.conf: The alpha value must be between 0 and 1");
        }

        if (isNaN(stdev)) {
            errors.push("chisq.conf: The standard deviation must be a number");
        }

        if (isNaN(sampleSize)) {
            errors.push("chisq.conf: The sample size must be a number");
        }

        if (!isNaN(sampleSize) && sampleSize < 0) {
            errors.push("chisq.conf: The sample size must be a positive number");
        }

        if (!isNaN(sampleSize) && !isInt(sampleSize)) {
            errors.push("chisq.conf: The sample size must be an integer as only serial killers deal in fractions of people and we are assuming users don't fall into that category");
        }

        if (errors.length > 0) {
            throw new Error(errors.join("; "));
        }

        var lowerBoundProb = 1 - alpha,    // while counterintuitive as the lower bound, this is based on the derived solution
            lowerIntervalBound,              // lower bound of confidence interval (chi-square distribution is not symmetric)

        // Calculate the bounds of the interval
        lowerIntervalBound = (sampleSize - 1) * Math.pow(stdev, 2) / globalObject.chisq.inv(lowerBoundProb, sampleSize - 1);

        // Note that the distribution is not symmetric, so a single value can't be returned
        return -lowerIntervalBound;
    };

    /*=========================*
     * File Statistics Section *
     *=========================*/

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

        var lineEnding,
            dataLines,
            dataHeaders;

        if (lineEnding = guessLineEndings(file)) {
            dataLines = file.split(lineEnding);
        } else {
            throw new Error("File provided has no line endings");
        }

        for (var i = 0; i < dataLines.length; i++) {
            var dataFields = dataLines[i].split(delimiter);
            // Set headers and keep moving
            if (i === 0) {
                dataHeaders = dataFields;
                continue;
            }

            // Don't fill with garbage data
            if (dataLines[i] === "") {
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

        // Attach error to JsonData prototype for viewing of file errors
        JsonData.prototype.errors = errors;

        return fileJson;
    };


    /**
     * Class for creating objects that hold file data in JSON
     * This class forms the foundation of doing statistics on file
     */
    function JsonData(json) {
        if (!(json instanceof Array)) {
            throw new Error("The savvy stats object (ss) must be provided a JSON array");
        }

        var self = this;
        self.json = json;

        /*=============================*
         * Assistive Methods of Object *
         *=============================*/

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
                errors.push("The column name must be passed as strings: " + column + ".");
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

        /*=============================================*
         * Descriptive Statistics or Sample Statistics *
         *=============================================*/

        var count = function(json, column, filterCb) {
            // If JSON has already been validated, crunch numbers
            if (json instanceof ValidJson) {
                return json.count;

            // Data has not been validated
            } else {

                // Attempt to validate... everything!!!
                try {
                    var validationReport = validateJson(json, column, filterCb);
                    var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                    return count(validJson, column, filterCb);
                
                // Validation failed, catch errors
                } catch (err) {
                    
                    // Re-throw for catching later
                    throw err;
                }
            }
        };

        self.count = function(column, filterCb) {
            return count(self.json, column, filterCb);
        }

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

        // Add logtrans to prototype and return new JsonData for stringing methods
        self.logtrans = function(column) {
            return new JsonData(logtrans(self.json, column));
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
        self.min = function(column, filterCb) {
            return min(self.json, column, filterCb);
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
        self.max = function(column, filterCb) {
            return max(self.json, column, filterCb);
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
        self.range = function(column, filterCb) {
            return range(self.json, column, filterCb);
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

        // Allowing JsonData to have access to mean for easy calculation on any column
        self.mean = function(column, filterCb) {
            return mean(self.json, column, filterCb);
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
        self.geomean = function(column, filterCb) {
            return geomean(self.json, column, filterCb);
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
                    return variance(validJson, column, filterCb);
                
                // Validation failed, catch errors
                } catch (err) {
                    
                    // Re-throw for catching later
                    throw err;
                }
            }
        };

        // Add variance to prototype for easy access
        self.variance = function(column, filterCb) {
            return variance(self.json, column, filterCb);
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
        self.stdev = function(column, filterCb) {
            return stdev(self.json, column, filterCb);
        };

        /**
         * Calculates the standard error of the sample mean
         * 
         * @param (JSON array) json
         * @param String column
         * @param function filterCb
         *     takes an object in the JSON array as an argument
         *     should return true or false
         *     used to filter values in column used for calculation based on values in the same column or other columns
         *     e.g. function(data) {data.column == "value";}
         */
        var stderror = function(json, column, filterCb) {
            // If JSON has already been validated, crunch numbers
            if (json instanceof ValidJson) {
                return stdev(json, column, filterCb)/Math.sqrt(json.count);
            
            // Data has not been validated
            } else {

                // Attempt to validate... everything!!!
                try {
                    var validationReport = validateJson(json, column, filterCb);
                    var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                    return stderror(validJson, column, filterCb);
                
                // Validation failed, catch errors
                } catch (err) {
                    
                    // Re-throw for catching later
                    throw err;
                }
            }
        };

        // Attach stderror function to the self for easy access
        self.stderror = function(column, filterCb) {
            return stderror(self.json, column, filterCb);
        };

        /**
         * Calculates the kth percentile (weighted, exclusive) of a data set (column)
         * Function comes from (https://en.wikipedia.org/wiki/Percentile#NIST_method)
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
                    var locatorPos = (k/100) * (json.count + 1),
                        locatorPosInt = Math.floor(locatorPos),
                        locatorPosDec = locatorPos - locatorPosInt;

                    // The 0th percentile doesn't technically exist, but can be considered to be the min value
                    if (k === 0) {
                        return parseFloat(sortedJson[0][column]);

                    // The 100th percentile also doesn't technically exist, but can be considered to be the max value
                    } else if (k === 100) {
                        return parseFloat(sortedJson[json.count - 1][column]);

                    // formula based on NIST suggestion, this is a weighted non-exclusive percentile
                    } else {
                        return parseFloat(sortedJson[locatorPosInt - 1][column]) + parseFloat(locatorPosDec) * (parseFloat(sortedJson[locatorPosInt][column]) - parseFloat(sortedJson[locatorPosInt - 1][column]));
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
        self.percentile = function(k, column, filterCb) {
            return percentile(k, self.json, column, filterCb);
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
        self.median = function(column, filterCb) {
            return median(self.json, column, filterCb);
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
        self.quartile = function(type, column, filterCb) {
            return quartile(type, self.json, column, filterCb);
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
        self.mode = function(column, filterCb) {
            return mode(self.json, column, filterCb);
        };

        /*=======================================*
         * Distributions and Their Related Tests *
         *=======================================*/

        /* -------------- *
         * T Distribution *
         * -------------- */

        // Objects containing T distribution methods
        var t = {};
        self.t = {};

        /**
         * Calculates the confidence interval of the mean of a data set (column) assuming 
         *     that the population variance is not known
         * Data in column can be filtered with callback (filterCb)
         * 
         * @param Float alpha
         * @param (JSON array) json
         * @param String column
         * @param function filterCb
         *     takes an object in the JSON array as an argument
         *     should return true or false
         *     used to filter values in column used for calculation based on values in the same column or other columns
         *     e.g. function(data) {data.column == "value";}
         */
        t.conf = function(alpha, json, column, filterCb) {
            // If JSON has already been validated, crunch numbers
            if (json instanceof ValidJson) {
                var sampleStdev = stdev(json.validJson, column, filterCb),
                    sampleMean = mean(json.validJson, column, filterCb);

                return [sampleMean - globalObject.t.conf(alpha, sampleStdev, json.count), sampleMean + globalObject.t.conf(alpha, sampleStdev, json.count)];

            // Data has not been validated
            } else {

                // Attempt to validate... everything!!!
                try {
                    var validationReport = validateJson(json, column, filterCb);
                    var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                    return t.conf(alpha, validJson, column, filterCb);
                
                // Validation failed, catch errors
                } catch (err) {
                    
                    // Re-throw for catching later
                    throw err;
                }
            }
        };
        
        // Allowing JsonData to have access to t.conf for easy calculation on any column
        self.t.conf = function(alpha, column, filterCb) {
            return t.conf(alpha, self.json, column, filterCb);
        };
        

        /**
         * Calculates the lower confidence interval of the mean of a data set (column) assuming 
         *     that the population variance is not known
         * Data in column can be filtered with callback (filterCb)
         * 
         * @param Float alpha
         * @param (JSON array) json
         * @param String column
         * @param function filterCb
         *     takes an object in the JSON array as an argument
         *     should return true or false
         *     used to filter values in column used for calculation based on values in the same column or other columns
         *     e.g. function(data) {data.column == "value";}
         */
        t.conf.lower = function(alpha, json, column, filterCb) {
            // If JSON has already been validated, crunch numbers
            if (json instanceof ValidJson) {
                var sampleStdev = stdev(json.validJson, column, filterCb),
                    sampleMean = mean(json.validJson, column, filterCb);
                    
                return sampleMean + globalObject.t.conf.lower(alpha, sampleStdev, json.count);

            // Data has not been validated
            } else {

                // Attempt to validate... everything!!!
                try {
                    var validationReport = validateJson(json, column, filterCb);
                    var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                    return t.conf.lower(alpha, validJson, column, filterCb);
                
                // Validation failed, catch errors
                } catch (err) {
                    
                    // Re-throw for catching later
                    throw err;
                }
            }
        };
        
        // Allowing JsonData to have access to t.oneSidedConf for easy calculation on any column
        self.t.conf.lower = function(alpha, column, filterCb) {
            return t.conf.lower(alpha, self.json, column, filterCb);
        };

        /**
         * Calculates the upper confidence interval of the mean of a data set (column) assuming 
         *     that the population variance is not known
         * Data in column can be filtered with callback (filterCb)
         * 
         * @param Float alpha
         * @param (JSON array) json
         * @param String column
         * @param function filterCb
         *     takes an object in the JSON array as an argument
         *     should return true or false
         *     used to filter values in column used for calculation based on values in the same column or other columns
         *     e.g. function(data) {data.column == "value";}
         */
        t.conf.upper = function(alpha, json, column, filterCb) {
            // If JSON has already been validated, crunch numbers
            if (json instanceof ValidJson) {
                var sampleStdev = stdev(json.validJson, column, filterCb),
                    sampleMean = mean(json.validJson, column, filterCb);

                return sampleMean + globalObject.t.conf.upper(alpha, sampleStdev, json.count);

            // Data has not been validated
            } else {

                // Attempt to validate... everything!!!
                try {
                    var validationReport = validateJson(json, column, filterCb);
                    var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                    return t.conf.upper(alpha, validJson, column, filterCb);
                
                // Validation failed, catch errors
                } catch (err) {
                    
                    // Re-throw for catching later
                    throw err;
                }
            }
        };
        
        // Allowing JsonData to have access to t.oneSidedConf for easy calculation on any column
        self.t.conf.upper = function(alpha, column, filterCb) {
            return t.conf.upper(alpha, self.json, column, filterCb);
        };

        /* ----------------------- *
         * Chi Square Distribution *
         * ----------------------- */

        // Objects containing chi square methods
        var chisq = {};
        self.chisq = {};

        /**
         * Calculates the confidence interval of the variance of a data set (column) assuming 
         *     that the population variance is not known
         * Data in column can be filtered with callback (filterCb)
         * 
         * @param Float alpha
         * @param (JSON array) json
         * @param String column
         * @param function filterCb
         *     takes an object in the JSON array as an argument
         *     should return true or false
         *     used to filter values in column used for calculation based on values in the same column or other columns
         *     e.g. function(data) {data.column == "value";}
         */
        chisq.conf = function(alpha, json, column, filterCb) {
            // If JSON has already been validated, crunch numbers
            if (json instanceof ValidJson) {
                var sampleStdev = stdev(json.validJson, column, filterCb),
                    sampleVariance = variance(json.validJson, column, filterCb);
                    alert(sampleVariance);

                return [sampleVariance - globalObject.chisq.conf(alpha, sampleStdev, json.count)[0], sampleVariance + globalObject.chisq.conf(alpha, sampleStdev, json.count)[1]];

            // Data has not been validated
            } else {

                // Attempt to validate... everything!!!
                try {
                    var validationReport = validateJson(json, column, filterCb);
                    var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                    return chisq.conf(alpha, validJson, column, filterCb);
                
                // Validation failed, catch errors
                } catch (err) {
                    
                    // Re-throw for catching later
                    throw err;
                }
            }
        };

        // Add the chisq.conf function to the object as a method
        self.chisq.conf = function(alpha, column, filterCb) {
            return chisq.conf(alpha, self.json, column, filterCb);
        };

        /**
         * Calculates the confidence interval of the variance of a data set (column) assuming 
         *     that the population variance is not known
         * Data in column can be filtered with callback (filterCb)
         * 
         * @param Float alpha
         * @param (JSON array) json
         * @param String column
         * @param function filterCb
         *     takes an object in the JSON array as an argument
         *     should return true or false
         *     used to filter values in column used for calculation based on values in the same column or other columns
         *     e.g. function(data) {data.column == "value";}
         */
        chisq.conf.lower = function(alpha, json, column, filterCb) {
            // If JSON has already been validated, crunch numbers
            if (json instanceof ValidJson) {
                var sampleStdev = stdev(json.validJson, column, filterCb),
                    sampleVariance = variance(json.validJson, column, filterCb);
                    alert(sampleVariance);

                return sampleVariance + globalObject.chisq.conf.lower(alpha, sampleStdev, json.count);

            // Data has not been validated
            } else {

                // Attempt to validate... everything!!!
                try {
                    var validationReport = validateJson(json, column, filterCb);
                    var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                    return chisq.conf.lower(alpha, validJson, column, filterCb);
                
                // Validation failed, catch errors
                } catch (err) {
                    
                    // Re-throw for catching later
                    throw err;
                }
            }
        };

        // Add the chisq.conf function to the object as a method
        self.chisq.conf.lower = function(alpha, column, filterCb) {
            return chisq.conf.lower(alpha, self.json, column, filterCb);
        };


        /**
         * Calculates the confidence interval of the variance of a data set (column) assuming 
         *     that the population variance is not known
         * Data in column can be filtered with callback (filterCb)
         * 
         * @param Float alpha
         * @param (JSON array) json
         * @param String column
         * @param function filterCb
         *     takes an object in the JSON array as an argument
         *     should return true or false
         *     used to filter values in column used for calculation based on values in the same column or other columns
         *     e.g. function(data) {data.column == "value";}
         */
        chisq.conf.upper = function(alpha, json, column, filterCb) {
            // If JSON has already been validated, crunch numbers
            if (json instanceof ValidJson) {
                var sampleStdev = stdev(json.validJson, column, filterCb),
                    sampleVariance = variance(json.validJson, column, filterCb);
                    alert(sampleVariance);

                return sampleVariance + globalObject.chisq.conf.upper(alpha, sampleStdev, json.count);

            // Data has not been validated
            } else {

                // Attempt to validate... everything!!!
                try {
                    var validationReport = validateJson(json, column, filterCb);
                    var validJson = new ValidJson(validationReport.validJson, validationReport.count);
                    return chisq.conf.upper(alpha, validJson, column, filterCb);
                
                // Validation failed, catch errors
                } catch (err) {
                    
                    // Re-throw for catching later
                    throw err;
                }
            }
        };

        // Add the chisq.conf function to the object as a method
        self.chisq.conf.upper = function(alpha, column, filterCb) {
            return chisq.conf.upper(alpha, self.json, column, filterCb);
        };
    }

    return globalObject;
})();