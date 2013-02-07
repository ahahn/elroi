(function(elroi, $) {

    /**
     * Draws a pie chart that provides dynamic resizing and the ability to hook in events.
     * @param graph The graph object defined in elroi
     * @param series The series of data
     * @param {int} seriesIndex The index of the pie graph data in the graph's allSeries array.  Multiple series don't
     *              make sense in this case.  Any multi-series data sets may provide unexpected results.
     * @return {object} edges - the collection of wedges that make up this pie
     *                  draw -  the method to draw the pie graph.
     */
    function pie(graph, series, seriesIndex) {
        /* If full set of graph options wasn't provided, then fill in graph.options with defaults.
         * We update the graph.options object with calculated values so we have a way to determine outside of Elroi
         * things like the center of a pie graph if we didn't specify it ourselves.
         * */
        var pieOptions = graph.options.pie = graph.options.pie || {};
        var center = pieOptions.center = pieOptions.center || {
            x : (graph.width + graph.padding.left - graph.padding.right)/2,
            y : (graph.height - graph.padding.bottom + graph.padding.top)/2
        };
        var RADIUS = pieOptions.radius =
            pieOptions.radius || (graph.height - graph.padding.bottom + graph.padding.top)/ 2;
        var INNER_RADIUS = pieOptions.innerRadius = pieOptions.innerRadius || pieOptions.radius/2;
        var wedgeAttributes = pieOptions.wedgeAttributes = pieOptions.wedgeAttributes || {};
        var pieHoleAttributes = pieOptions.pieHoleAttributes = pieOptions.pieHoleAttributes || {};

        var LOAD_ANIMATION_PROMISE;

        var wedgeEventsEnabled,
            wedgeEventsEnabledCounter = 0;

        var hitShield;

        /*Ext holds extension functions specific to the pie.  They are merged into the parent namespace making
         them publicly accessible at the level of the elroi object. */
        graph.ext = {};

        var DEFAULT_ROTATION = -90; //current rotation of the pie

        /* Raphael transform constants */
        var CENTER_COORDINATES = center.x + ',' + center.y,
            S11 = 's1,1';

        /* Set to store wedge paths */
        var wedges = graph.paper.set();
        var passThroughWedge = null; //wedge under the circle at the point of the mouse.  Null represents no current pass-through wedge.

        var pieHole; //Static part of message, in default case under circle and over hit circle for mouse detection.
        var messageContainer; //div that is layered
        var selectedWedge; //The selected wedge, a selection change is triggered by clicking a wedge

        /* Mathematical constants */
        var DEGREES_TO_RADIANS = Math.PI / 180;

        /**
         * Custom attribute for raphael that will create a pie wedge based on the following attributes.
         * @param x {number} X coordinate of the center of the pie.
         * @param y {number} Y coordinate of the center of the pie.
         * @param r {number} The radius of the pie wedge.
         * @param a1 {number} Start angle of wedge in degrees.
         * @param a2 {number} End angle of wedge in degrees.
         * @param [self] {object} Raphael object that this segment is being altered for.  Typically 'this' can be used
         *   but in the case the radius customAttribute (which calls segment), 'this' is not the wedge and it must be
         *   provided.
         * @return {object} Path attribute for attachment to a Raphael object.
         */
        graph.paper.customAttributes.segment = function (x, y, r, a1, a2, self) {

            /* Mathematical constants */
            var angle = a2 - a1,
                largeArcFlag = +(angle > 180);

            /* Set self either using this which typically is the case or self if segment is called from radius. */
            self = self || this;

            /* Update the r attribute on our path so it's consistent with the new radius */
            if (self.attrs) {
                self.attrs.radius = r;
            }

            /* Hide a wedge if it is 0% of the pie, this prevents ie8 quirkiness and a wedge of 0% from being selected
             * by hovering over its border. */
            if (angle===0) {
                self.hide();
            } else if (self.node.style.display !== "") { /* Use same method as Raphael to check if its already shown. */
                self.show();
            }

            a1 = (a1 % 360) * DEGREES_TO_RADIANS;
            a2 = (a2 % 360) * DEGREES_TO_RADIANS;

            return {
                path: [['M', x, y],
                    ['l', r * Math.cos(a1), r * Math.sin(a1)],
                    ['A', r, r, 0, largeArcFlag, 1, x + r * Math.cos(a2), y + r * Math.sin(a2)],
                    ['z']]
            };
        };

        /**
         * Custom attribute for raphael that will alter the radius of a wedge; allows for short-handing the longer
         * customAttributes.segment call when the radius is the only change to the path.
         * @param r {number} The new radius of the pie wedge.
         * @return {object} Path attribute for attachment to a Raphael object.
         */
        graph.paper.customAttributes.radius = function (r) {

            var segment = this.attrs.segment;
            segment[2] = r; // Update the segment attribute (segment[2]) so it's consistent with the new radius

            return graph.paper.customAttributes.segment(segment[0], segment[1], r, segment[3],segment[4], this);
        };

        /**
         * Animation pie from initial radius of 1 to full value.  May eventually provide this as a callback instead.
         * @param [ms] {number} The duration of tha Raphael animation
         * @return jQuery promise that resolves when the load animation is complete
         */
        function loadAnimation(ms) {
            wedgeEventsDisable();
            return graph.animateJQP(wedges, [
                {radius: RADIUS, transform: [S11+CENTER_COORDINATES+'r'+ DEFAULT_ROTATION +','+CENTER_COORDINATES]},
                ms || 1500,
                'backOut'])
                .always(regenerateTransformedWedgePaths, wedgeEventsEnable);
        }

        /**
         * Recalculates wedge sizes and animates (if enabled) pie to new proportion.  Run after updating series data.
         * @param [ms] {number} The duration of tha Raphael animation
         * @return {object} jQuery deferred object that resolves after the resize animation, or immediately if animation
         *     is flagged off.
         */
        function resize(ms) {
            var start = 0, // current angle offset
                total = graph.sums[seriesIndex],
                data = series[seriesIndex],
                $deferreds = [];

            var i, //current index of data for traversal of data
                dataLength = data.length; //length of data for traversal of data

            var wedgeSize, //In degrees
                newAttributes; //New segment and transform attributes for Raphael

            wedgeEventsDisable();

            for (i = 0; i < dataLength; i++) {
                wedgeSize = 360 / total * data[i].value;
                newAttributes = {segment: [center.x, center.y, wedges[i].attr('radius'), start, start += wedgeSize]};

                wedges[i].data = data[i]; //update data tied to each wedge

                if (graph.options.animation) {  //either animate transition of flatly update
                    $deferreds.push(graph.animateJQP(wedges[i], [newAttributes, ms || 750, 'backOut']));
                } else {
                    wedges[i].attr(newAttributes);
                }
            }

            return $.when.apply(null, $deferreds)
                .always(regenerateTransformedWedgePaths, wedgeEventsEnable);
        }

        /**
         * Either clears the selectedWedge or sets it to a new value.  Does not cause wedgeSelectionChanged event!
         * @param [wedge] {object} Raphael wedge from the current pie to update the selectedWedge to.
         */
        function resetSelectedWedge(wedge) {
            if (wedge) {
                selectedWedge = wedge;
            } else {
                selectedWedge = null;
            }
        }
        /**
         * Returns whether or not a wedge is the selected wedge.
         * @param wedge {object} Raphael object of the wedge to compare to the selectedWedge
         * @return {boolean} true if the selectedWedge is the same object as wedge
         */
        function isSelectedWedge(wedge) {
            return (wedge === selectedWedge);
        }
        /**
         * Checks whether or not a clicked on wedge is different than the wedge that was previously the selectedWedge.
         * Triggers a wedgeSelectionChanged event if one was provided.
         * @param [wedge] {object} Raphael wedge from the current pie that is the new selectedWedge.
         */
        function updateSelectedWedge(wedge) {
            var previouslySelectedWedge;

            if (selectedWedge === wedge) {
                return;
            } else {
                previouslySelectedWedge = selectedWedge;
                selectedWedge = wedge;

                if (graph.options.pie.wedgeSelectionChanged) {
                    graph.options.pie.wedgeSelectionChanged(previouslySelectedWedge, selectedWedge);
                } else {
                    /* DEFAULT BEHAVIOR */
                    getMessageContainer().empty();
                    rotateToWedge(wedge)
                        .done((!pieOptions.disableDefaultLabeling) ? drawDefaultLabeling : null);
                }
            }
        }

        /**
         * Draws a pie chart and provides appropriate styling and callback hooks.
         */
        function drawPie() {

            /**
             * Wrapper function that calls a user provided method (if one is provided) for a click event on a wedge, or
             * by default rotateToWedge.
             * @param wedge {object} Raphael element for the clicked wedge
             */
            function wedgeClick(wedge) {
                if (wedgeEventsEnabled) {

                    if (graph.options.pie.wedgeClick) {
                        graph.options.pie.wedgeClick(wedge);
                    }

                    updateSelectedWedge(wedge);
                }
            }

            /**
             * Wrapper function that calls a user provided method (if one is provided) for a hover entered event on a
             * wedge.
             * @param e {Object} Mouse event object
             * @param wedge {object} Raphael element for the entered wedge
             */
            function wedgeEnter(e,wedge) {
                if (wedgeEventsEnabled) {
                    if (graph.options.pie.wedgeHoverIn) {
                        graph.options.pie.wedgeHoverIn(e,wedge);
                    } else {
                        /* DEFAULT BEHAVIOR */
                    }
                }
            }

            /**
             * Wrapper function that calls a user provided method (if one is provided) for a hover exit event on a
             * wedge.
             * @param e {Object} Mouse event object
             * @param wedge {object} Raphael element for the exited wedge
             */
            function wedgeExit(e,wedge) {
                if (wedgeEventsEnabled) {
                    var i;
                    if (graph.options.pie.wedgeHoverOut) {
                        graph.options.pie.wedgeHoverOut(e,wedge);
                    } else {
                        /* DEFAULT BEHAVIOR */
                    }
                }
            }

            /**
             * Draws a wedge to the Raphael paper and attaches mouse events.
             * @return {Object} the wedge that was drawn
             */
            function generateWedge() {
                var wedge = graph.paper.path()
                    .click(function(e) { wedgeClick(wedge); })
                    .hover(function(e) { wedgeEnter(e,wedge); },
                    function(e) { wedgeExit(e,wedge); });
                return wedge;
            }

            var start = 0,
                total = graph.sums[seriesIndex],
                data = series[seriesIndex],
                dataLength = data.length,
                i,
                wedge,
                val; //current index of data for traversal of data

            for (i = 0; i < dataLength; i++) {
                val = 360 / total * data[i].value;

                wedge = generateWedge()
                    .attr({fill: graph.options.colors[i % graph.options.colors.length]})
                    .attr(wedgeAttributes);

                wedge.data = data[i];

                /*If a wedge has custom element attributes, attach them. This is used to allow data-test
                 * attributes to be attached to individual elements. */
                if (wedge.data.customElementAttributes) {
                    $(wedge.node).attr(wedge.data.customElementAttributes);
                }

                if (graph.options.animation) {
                    wedge.attr({segment: [center.x, center.y, 1, start, start + val]});
                } else {
                    wedge.attr({segment: [center.x, center.y, RADIUS, start, start + val],
                        transform: [S11+CENTER_COORDINATES+'r'+ DEFAULT_ROTATION +','+CENTER_COORDINATES]});
                }

                wedge.data.offset = start;
                wedge.data.degrees = val;

                wedges.push(wedge);

                start += val;
            }

            if (graph.options.animation) {
                LOAD_ANIMATION_PROMISE = loadAnimation(1000);

                if(!pieOptions.disableDefaultLabeling) {
                    LOAD_ANIMATION_PROMISE.done(drawDefaultLabeling);
                }
            }

            if(pieOptions.drawPieHole) {
                pieHole = graph.paper
                    .circle(center.x, center.y, INNER_RADIUS)
                    .attr({fill: 'white'})
                    .attr(pieHoleAttributes).hide();
            }

            graph.$el.addClass('piechart');
            messageContainer = $('<div></div>').addClass('text-container').prependTo(graph.$el);

            pieOptions.usePassThrough && generateHitShield();
        }

        /**
         * Creates a hit shield for the pie.  The hit shield is a transparent Raphael overlay that passes  wedges from
         * losing focus when mousing over the donut or text.  This makes developing an interactive pie that has labels
         * or Raphael object overlays (pie hole) on top of the pie possible.
         */
        function generateHitShield() {
            var hitShieldContainer,
                PIE_HOLE_STROKE_WIDTH = pieHoleAttributes['stroke-width'] || 0,
                PIE_HOLE_CURSOR = pieHoleAttributes['cursor'] || 'auto';

            /**
             *  Handles determination of which wedge is under the donut hole so that events can be passed to that wedge.
             *  If the passthrough wedge changes a wedgeHoverIn event is passed to the receiving wedge.
             *  @param e {Object} Mouse move event.
             */
            function hitShieldMouseMove(e) {
                var newWedge, //used to store new wedge if it is detected the passThroughWedge has changed
                    i,
                    wedgesLength = wedges.length,
                    passthoughWedgeIndex = (passThroughWedge !== null) ? getWedgeIndex(passThroughWedge) : -1;

                //Most likely we are in the same wedge, so check that first and skip the rest of the heavy lifting
                if (passthoughWedgeIndex !== -1 && graph.isMouseInPath(e, transformedWedgePaths[passthoughWedgeIndex])) {
                    return;
                }

                //Detect which wedge the mouse is currently hovering over
                for (i=0; i < wedgesLength; i+=1) {
                    if (i !== passthoughWedgeIndex &&  graph.isMouseInPath(e,transformedWedgePaths[i])) {
                        newWedge = wedges[i];
                        break;
                    }
                }

                //Check if we actually had a change and update the passThroughWedge accordingly and simulate events.
                if (newWedge !== null && newWedge !== undefined) {
                    //passThroughWedge = newWedge;
                    //if (newWedge !== hoverWedge) {
                    if (passThroughWedge !== newWedge && wedgeEventsEnabled) {
                        passThroughWedge = newWedge;   //end
                        graph.options.pie.wedgeHoverIn(e,newWedge);
                    }
                }
            }

            /**
             * If a passthrough wedge exist attempt to find its click handlers and execute it. If no click handler is
             * found just return.
             */
            function hitShieldClick() {
                var i;
                if (passThroughWedge) {
                    for (i=0;i< passThroughWedge.events.length; i+=1) {
                        if (passThroughWedge.events[i].name === "click") {
                            passThroughWedge.events[i].f();
                            return;
                        }
                    }
                }
            }

            hitShieldContainer = $('<div></div>').addClass('hit-shield').prependTo(graph.$el);
            hitShield = Raphael(hitShieldContainer[0], graph.width, graph.height)
                .circle(center.x, center.y, RADIUS + PIE_HOLE_STROKE_WIDTH)
                .attr({fill: 'red', 'stroke-width':0, opacity: 0, cursor: PIE_HOLE_CURSOR}); // fill is required so picked an arbitrary color

            $.when(LOAD_ANIMATION_PROMISE).done(function() {
                hitShield.mousemove(hitShieldMouseMove)
                    .click(hitShieldClick)
                    .hover(null, function(e) {
                        graph.options.pie.wedgeHoverOut(e, passThroughWedge); //security against skipping out event
                        passThroughWedge = null;
                    });
            });
        }

        var transformedWedgePaths = []; //the actual path of the wedge w/ rotation taken into account. Needed for event passthrough.
        /**
         * Caches the path for each wedge after a transformation occurs.
         * This is important as a lot of Raphael's collision detection does not take into account the current
         * transformations applied to an element.
         */
        function regenerateTransformedWedgePaths() {
            $.each(wedges, function(i, wedge) {
                var wedgePath = wedge.attrs.path.toString();
                $.each(wedge.attrs.transform, function(i, transform) {
                    wedgePath = Raphael.transformPath(wedgePath, transform.toString());
                });
                transformedWedgePaths[i] = wedgePath.toString();
            });
        }

        /**
         * Draw default labeling for pie chart this can be disabled by setting the disableDefaultLabeling option.
         * Simply draws the value adjascent to each wedge.  The selected wedge is provided an additional class so
         * CSS can be used to stylize the text.  Currently the default labeling is pretty bare bones.
         */
        function drawDefaultLabeling() {
            $.each(wedges, function(i, wedge) {

                var label = $('<span>'+wedge.data.value+'</span>')
                    .addClass('label')
                    .css('visibility','hidden')
                    .appendTo(getMessageContainer());

                if(wedge === selectedWedge) {
                    label.addClass('selected');
                }

                var fontRadius = Math.max(label.width(), label.height()); //This could be refactored to be more accommodating

                var angle = (getDegreesRotated() + wedge.data.offset + .5 * wedge.data.degrees) * DEGREES_TO_RADIANS;
                var top = center.y + Math.sin(angle) * (wedge.attrs.radius+fontRadius);
                var left = center.x + Math.cos(angle) * (wedge.attrs.radius+fontRadius);

                label.css('position','absolute')
                    .css('left',left-label.width() *.5)
                    .css('top',top-label.height() *.5)
                    .css('visibility','visible');
            });
        }

        /**
         * Rotate the pie clockwise.
         * @param deg {number} Number of degrees to callback pie.
         * @return {object} jQuery deferred object that is resolved after the rotation animation or immediately if
         *                  animation is flagged off.
         */
        function rotate(deg) {
            var $deferred = null;
            wedgeEventsDisable();

            //Do not waste time animating a non event, if we're at the rotation angle, cut out early.
            if (graph.options.animation && getDegreesRotated() !== deg) {
                $deferred = graph.animateJQP(wedges,
                    [{transform: [S11+CENTER_COORDINATES+'r'+ deg +','+CENTER_COORDINATES]}, 675, 'backOut']);
            } else {
                wedges.attr({transform: [S11+CENTER_COORDINATES+'r'+ deg+','+CENTER_COORDINATES]});
            }

            return $.when($deferred)
                .always(regenerateTransformedWedgePaths, wedgeEventsEnable);
        }

        /**
         * Rotate the center of a pie wedge to 0 degrees.
         * @param wedge {object} Wedge to rotate to, must be in pie's wedges set.
         * @return {object} jQuery Deferred object
         */
        function rotateToWedge(wedge) {
            var a1 = wedge.attr('segment')[3],
                a2 = wedge.attr('segment')[4],
                t = a2-((a2-a1)/2);

            return rotate(-t);
        }

        /**
         * @return {number} number of degrees the pie is currently rotated, if no rotation transformation is present
         *                  null is returned.
         */
        function getDegreesRotated() {
            if (!wedges[0].attr("transform")[1]) {
                return null;
            } else {
                return wedges[0].attr("transform")[1][1];
            }
        }

        /**
         * Update the pie graph data and resize the wedges accordingly.
         * @param newSeries {object} New data to base pie off of.
         * @param newSeriesIndex {number} Index to use in the newSeries.
         * @return {object} jQuery deferred object that resolves after the resize animation, or immediately if animation
         *     is flagged off.
         */
        function updateLive(newSeries, newSeriesIndex) {
            series = graph.allSeries.series = graph.allSeries[0].series = newSeries;
            seriesIndex = newSeriesIndex;

            graph.sums = elroi.fn.helpers.sumSeries(elroi.fn.helpers.getDataValues(graph.allSeries));
            graph.hasData = elroi.fn.helpers.hasData(graph.allSeries);

            return resize(500);
        }

        /**
         * @return {object} Raphael object that is the circle that represents the pie hole.
         */
        function getPieHole() {
            return (pieOptions.drawPieHole) ? pieHole: null;
        }

        /**
         * @return {object} Raphael object that is the hit shield (invisible circle) used for passthrough
         */
        function getHitShield() {
            return (pieOptions.usePassThrough) ? hitShield : null;
        }

        /**
         * Shows (or hides) the pie hole.
         * @param {boolean} true to show the pie hole; false to hide the pie hold.
         */
        function showPieHole(show) {
            if (pieOptions.drawPieHole) {
                show ? pieHole.show() : pieHole.hide();
            }
        }

        /**
         * @return {object} jQuery promise that resolves when loadAnimation completes or null if pie is not initialized
         *   or not using animation.
         */
        function getLoadAnimationPromise() {
            return LOAD_ANIMATION_PROMISE;
        }

        /**
         * Get the container used to hold pie messages.
         * @return {object} jQuery element that is the container
         */
        function getMessageContainer() {
            return messageContainer;
        }

        /**
         * Helper to show or hide the message container
         * @param {boolean} show - true to show, false otherwise
         */
        function showMessageContainer(show) {
            show ? messageContainer.show() : messageContainer.hide();
        }

        /**
         * Update the color of each slice of the pie graph and update the graph options.
         * @param colors {array} New color data.
         */
        function updateColors(colors) {
            var i,
                wedgesLength = wedges.length,
                colorsLength = colors.length;

            if (colors === null || colors.length < 1) {
                throw 'Parameter colors must be a non empty array';
            }

            for (i = 0; i < wedgesLength; i+=1) {
                wedges[i].attr({fill: colors[i % colorsLength] });
            }

            graph.options.colors = colors;
        }

        /**
         * Gets the index of a wedge in the wedges array.
         * @param wedge {object} the wedge that is to be found
         * @return {number} index of the wedge if found, otherwise -1
         */
        function getWedgeIndex(wedge) {
            var i, //index of wedge for traversal
                wedgesLength = wedges.length; //length of wedges for traversal
            for (i=0; i < wedgesLength; i+=1) {
                if (wedge === wedges[i]) {
                    return i;
                }
            }
            return -1;
        }

        /**
         * Increments the wedgeEventsEnabledCounter, if the counter is non-negative, wedge events are enabled.
         * @param force {boolean} if force is truth-y the wedgeEventsEnabledCounter will be reset to 0
         *   and wedgeEventsEnabled hence will be set to true.
         */
        function wedgeEventsEnable(force) {
            (force) ? wedgeEventsEnabledCounter = 0 : wedgeEventsEnabledCounter++;

            if (wedgeEventsEnabledCounter >= 0) {
                wedgeEventsEnabled = true;
                wedgeEventsEnabledCounter = 0;
            }
        }

        /**
         * Decrements the wedgeEventsEnabledCounter and disables wedge events.  If multiple calls to wedgeEventsDisable
         * occur in sequence, a matching number of calls to wedgeEventsEnable need to occur before wedge events are
         * enabled again.
         */
        function wedgeEventsDisable() {
            wedgeEventsEnabledCounter--;
            wedgeEventsEnabled = false;
        }


        graph.ext.wedgeEventsEnable = wedgeEventsEnable;
        graph.ext.wedgeEventsDisable = wedgeEventsDisable;

        graph.ext.resetSelectedWedge = resetSelectedWedge;
        graph.ext.isSelectedWedge = isSelectedWedge;

        graph.ext.showPieHole = showPieHole;
        graph.ext.getPieHole = getPieHole;

        graph.ext.showMessageContainer = showMessageContainer;
        graph.ext.getMessageContainer = getMessageContainer;
        graph.ext.getHitShield = getHitShield;

        graph.ext.rotateToWedge = rotateToWedge;
        graph.ext.getWedgeIndex = getWedgeIndex;
        graph.ext.rotate = rotate;

        graph.ext.updateLive = updateLive;
        graph.ext.updateColors = updateColors;

        graph.ext.getloadAnimationPromise = getLoadAnimationPromise;

        graph.wedges = wedges;

        return {
            wedges : wedges,
            draw : drawPie
        };
    }

    elroi.fn.pie = pie;

})(elroi, jQuery);
