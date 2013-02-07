(function($) {

    var elroi = function(element, dataSeries, graphOptions, tooltips) { return new e(element, dataSeries, graphOptions, tooltips); };

    elroi.fn = {};

    window.elroi = elroi;


    /**
     * Creates an graph in a given empty div
     * Usage: see /test/elroi.js for an example usage (this is commented out currently due to WebTestJS erroring out)
     * @param args An object containing
     *          $el - jQ DOM element to insert the graph into
     *          data - An array of series objects containing series data, and series options
     *          options - options for the graph
     * @return graph The graph object
     * @return {object} object containing method for draw and method for update
     */
    function e(element, dataSeries, graphOptions, tooltips) {
        var defaults = {
            animation: true,
            colors: ['#99cc33', '#ffee44', '#ffbb11', '#ee5500', '#33bbcc', '#88ddee'],
            dates : {
                format: 'auto'
            },
            errorMessage : false,
            labelWidth : 'auto',
            topLabelFormatter: function(value, axis) {
                var label = axis.prefixUnit ? (axis.topUnit + value) : (value + ' ' + axis.topUnit);
                return label;
            },
            labelFormatter: function(value, axis) {
                var label = axis.prefixUnit ? (axis.unit + value) : (value + ' ' + axis.unit);
                return label;
            },
            flagOffset : 5,
            skipPointThreshhold : 18,
            precision: 0,
            dynamicLeftPadding: false,
            grid : {
                show: true,
                showBaseline: true,
                numYLabels : 5
            },
            axes : {
                x1 : {
                    customXLabel: false,
                    id : 'x1',
                    type: 'date',
                    show : true,
                    labels : [],
                    seriesIndex : 0    // By default, the axis values are derived from the first series of data
                },
                x2 : {
                    customXLabel: false,
                    id : 'x2',
                    type : 'text',
                    show : false,
                    labels : [],
                    seriesIndex : 0
                },
                y1 : {
                    id : 'y1',
                    show : true,
                    unit: '',
                    topUnit: '',
                    prefixUnit: false,
                    seriesIndex : 0
                },
                y2 : {
                    id : 'y2',
                    show : false,
                    unit: '',
                    topUnit: '',
                    prefixUnit: false,
                    seriesIndex: 0
                }
            },
            tooltip: {
                formatter : function(tip) {return tip;},
                show: true,
                width: 120
            },
            seriesDefaults: {
                type: 'line',
                showPoints: false,
                fillPoints: false,
                labelPoints: false,
                animatePoints : false,
                pointStroke: true,
                interpolateNulls : false,
                maxYValue : 'auto',
                minYValue : 'zeroOrLess',
                unit: '',
                pointLabelUnits: ''
            },
            bars : {
                highlightBorderWidth : 2,
                highlightBorderOpacity : 0.8,
                highlightColor : '#ccc',
                flagPosition: 'exterior' // exterior or interior - the label appears above or inside the bar
            },
            lines : {
                width : 2,
                opacity : 0.8,
                fillOpacity : 0.2,
                pointRadius : 3,
                pointStrokeWidth : 2,
                highlightStrokeWidth : 4,
                highlightRadius : 6,
                highlightOpacity : 0.8
            },
            padding: {top:15, right:20, bottom:18, left:50}
        };

        var $el = $(element)
                .addClass('elroi'),
            $paper = $('<div></div>')
                .addClass('paper')
                .appendTo($el),
            options = $.extend(true, {}, defaults, graphOptions);

        var width = $paper.width() || $el.width(),
            height = $paper.height() || $el.height();

        var idCounter = 0; //Used to create unique IDs in generateID method.

        /**
         * Get mouse position relative to the top left corner of the Elroi element.
         * @param e {Object} Mouse event object
         * @return {Object} x - x position relative to the top left corner of the Elroi element.
         *                  y - y position relative to the top left corner of the Elroi element.
         */
        function getRelativeMousePosition (e) {
            var elementOffset = $el.offset();
            return {
                x: e.clientX + $document.scrollLeft() - elementOffset.left,
                y: e.clientY + $document.scrollTop() - elementOffset.top
            };
        }

        /**
         * Helper function to determine whether a mouse is in a Raphael path.
         * @param e {Object} Mouse event object
         * @param path {string} Raphael path string
         * @return {boolean} true if the mouse is in the path, false otherwise
         */
        function isMouseInPath(e, path) {
            var relativePosition = getRelativeMousePosition(e);
            return Raphael.isPointInsidePath(path, relativePosition.x, relativePosition.y);
        }

        /**
         * Helper function to determine whether a mouse is in an object across browser and taking into account the
         * offset of the graph container.
         * @param e {Object} Mouse event object
         * @param element {Object} Raphael element
         * @return {boolean} true if the mouse is in the element, false otherwise
         */
        function isMouseInElement(e, element) {
            var relativePosition = getRelativeMousePosition(e);
            return element.isPointInside(relativePosition.x, relativePosition.y);
        }


        /**
         * Creates a random alpha-numeric string of the length specified.  This is used to create IDs by stopJQP.
         *
         * @param length {Number} The length of the desired string. A length less than 1 will result in an empty string.
         * @return {String} A randomly generated alpha-numeric string of specified length.
         */
        function generateId() {
            return '_elroi_unique_id_' + (++idCounter);
        }

        /**
         * Animate and return (jQ)uery (P)romise
         * Helper function that executes a Raphael animate and returns a jQuery promise that will resolve on animation
         * complete.  This is extremely useful when chaining or synchronizing animations!
         *
         * IMPORTANT
         * If the element that is animating has .stop() called on it; its callback won't be called!
         * As a result its promise won't be rejected and hence stop should not be called on elements
         * utilizing animateJQP, instead use stopJQP.
         *
         * A feature request has been created on the Raphael repo requesting a proper stop/interrupt callback which
         * would allow the removal of stopJQP() and generateId().
         * https://github.com/DmitryBaranovskiy/raphael/issues/661
         *
         * @param e {Object} Raphael JS element or set of elements
         * @param params {Array} Array of animate parameters (DO NOT INCLUDE CALLBACK)
         * @return {Object} jQuery promise that will resolve when the animation is complete.
         */
        function animateJQP(element, params) {
            var deferred = $.Deferred();
            params.push(deferred.resolve);

            //Elements are provided ids by default but sets are not; for stopJQP to work we need a unique ID, so we'll
            // assign an ID if one isn't provided (null or undefined).
            if (!element.id && element.id !== 0) {
                element.id = generateId();
            }

            eve.once('raphael.anim.stop.' + element.id, deferred.reject);
            element.animate.apply(element, params);
            return deferred.promise();
        }

        /**
         * Stop and reject (jQ)uery (P)romise
         * If animateJQP is used; stopJQP should be used instead of stop() to ensure that the promise provided by
         * animateJQP is rejected.
         *
         * @param e {Object} Raphael JS element or set of elements
         */
        function stopJQP(element) {
            element.stop();
            eve('raphael.anim.stop.'+ element.id, null, null);
            return element;
        }

        var graph = elroi.fn.init({
            padding : options.padding,
            labelLineHeight: 12,
            width: width,
            height: height,
            allSeries: dataSeries,
            $el: $el,
            paper: Raphael($paper.get(0), width, height),
            options: options,
            tooltips: tooltips,
            isMouseInPath: isMouseInPath,
            isMouseInElement: isMouseInElement,
            animateJQP: animateJQP,
            stopJQP: stopJQP
        });

        var html = '<div class="elroi-tooltip"><div class="elroi-tooltip-content"></div></div>';
        graph.$tooltip = $(html);

        graph.$tooltip.width(graph.options.tooltip.width).appendTo($el.find('.paper')).addClass('png-fix');
        $el.mouseleave(function() {
            graph.$tooltip.css('left', -10000);
        });

        /**
         * Draws the graph grid, any error messaging, and any charts and graphs for all data
         */
        function draw() {

            var isGridDrawn = false;

            if (graph.options.errorMessage) {
                var $errorMsg = $('<div class="elroi-error">' + graph.options.errorMessage + '</div>')
                    .addClass('alert box');

                graph.$el.find('.paper').prepend($errorMsg);
            }

            if (!graph.allSeries.length) {
                elroi.fn.grid(graph).draw();
            }


            $(graph.allSeries).each(function(i) {

                if (!isGridDrawn && graph.seriesOptions[i].type !== 'pie') {
                    elroi.fn.grid(graph).draw();
                    isGridDrawn = true;
                }

                var type = graph.seriesOptions[i].type;
                elroi.fn[type](graph, graph.allSeries[i].series, i).draw();

            });

        }

        /**
         * Deletes all of the Raphael objects, and removes the axes from the graph
         */
        function clearGraph() {
            graph.paper.clear();

            graph.$el.find('ul').remove();
            graph.$el.find('.elroi-point-flag').remove();
            graph.$el.find('.elroi-point-label').remove();
        }

        /**
         * Redraws the graph with new data
         * @param newData A new data object to be graphed
         */
        function update(newData) {
            clearGraph();
            graph.allSeries = newData;

            draw();
        }

        draw();

        return $.extend({},{
            graph: graph,
            draw: draw,
            update: update
        }, graph.ext);
    }

})(jQuery);
