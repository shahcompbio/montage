/**
 * Violin plot
 *
 */

ESV.violin = (function (esv) {


	// === PROPERTIES ===

	// --- Global View Properties ---

	// --- Define Fields ---

	esv.fields = {};

	for (var dataType in CONFIG.editor) {
		if (CONFIG.editor[dataType].hasOwnProperty("violin")) {
			$.extend(true, esv.fields, CONFIG.editor[dataType]["violin"]["fields"]);
		}
	}

	// --- Private Module Properties ---

	var config = {};
	var defaults = {
		margin: { top: 24, right: 36, bottom: 12, left: 24 },
		padding: { top: 24, right: 36, bottom: 36, left: 52 },
		gridWidth: 7,
		gridHeight: 3,
		width: 900,
		height: 345,
		xAxisMargin: 26,
		yAxisMargin: 12,
		strokeWidth: 2,
		maxQuerySize: 1000,
		xPlotSpacing: 0.2,
		subsetSpacing: 0.1,
		axesScaling: 0.05,
		cellRadius: 3,
		numDensityPoints: 1000,
		roundPrecision: 3

	};

	var isPopOverVisible = false;


	// === PUBLIC METHODS ===

	/**
	 * Performs initialization of this module
	 * @param {Object} options - Any properties that should override the default properties
	 */
	esv.init = function(options) {
    	config = $.extend(true, {}, defaults, options);

		// Gets the vizObj and appends properties specific to the view to it
		var vizObj = ESV.nodes[options.vizID];
		vizObj.viewType = "violin";
		vizObj.view = {};

		vizObj.view.width = config.width;
		vizObj.view.height = config.height;
		vizObj.view.config = config;

		// Save the vizObj back to the global scope
		ESV.nodes[vizObj.id] = vizObj;

		// Renders the base HTML for the histogram and applies it to the grid
		var viewHTML = '<div class="violin-container"><div id="viz-' + vizObj.id + '"></div></div>';
						// <div class="violin-legend" id="viz-' + vizObj.id + '-legend"></div>;
		ESV.initBaseView(vizObj, viewHTML, config.gridWidth, config.gridHeight);

		// Updates the view
		ESV.violin.update(vizObj);
	}

	/**
	 * Queries the server for the requested data and updates the view
	 * @param {Object} vizObj
	 * @param {Array} viewFacades (optional) - An array of view facades that are currently applied on this view
	 */
	esv.update = function(vizObj, viewFacades) {
    	ESV.queries.query(vizObj, viewFacades);
	}

	/**
	 * Makes and runs the query specific to this view
	 * @param {Object} vizObj
	 * @param {Array} queryTrees - Each query tree will spawn a new query. The number of query trees correspond to the number of data nodes.
	 * @param {Array} viewFacades (optional) - An array of view facades that are currently applied on this view
	 * * @param {Boolean} isTriggeredByViewFacade
	 */
	esv.query = function(vizObj, queryTrees, viewFacades, isTriggeredByViewFacade) {
		ESV.viewlibs.viewPreProcess(vizObj, isTriggeredByViewFacade);
		var dataTypes = ESV.getUnderlyingDataTypes(vizObj.id);

		ESV.viewlibs.setPlotTitle(vizObj);

		vizObj.view.dimensionX = vizObj.info["violin-" + dataTypes.join() + "-dimension-x"].join();
		if (vizObj.view.dimensionX !== "all") { 
			vizObj.view.xAxisField = ESV.getFieldConfig(dataTypes.join(), vizObj.view.dimensionX);
		}
				
		vizObj.view.dimensionY = vizObj.info["violin-" + dataTypes.join() + "-dimension-y"].join();
		vizObj.view.yAxisField = ESV.getFieldConfig(dataTypes.join(), vizObj.view.dimensionY);

		// if dimension X is "all", then no subsetting is needed
		vizObj.view.measure = (vizObj.view.dimensionX === "all") ? 
			"none" : vizObj.info["violin-" + dataTypes.join() + "-subsets"].join();
		if (vizObj.view.measure !== "none") {
			vizObj.view.measureField = ESV.getFieldConfig(dataTypes.join(), vizObj.view.measure);
		}

		// First query to get min/max
		var baseQuery = {
			"size": 0,
			"aggs": {}
		};

		// add query for subset (if needed)
		if (vizObj.view.measure !== "none") {
			baseQuery.aggs[vizObj.view.measure] = {
				"terms": {
					"size": vizObj.view.config.maxQuerySize,
					"field": vizObj.view.measure,
					"order": {
						"_term": "asc"
					}
				},
				"aggs": {}
			}

			var queryAgg = baseQuery.aggs[vizObj.view.measure].aggs;
		} else {
			var queryAgg = baseQuery.aggs;
		}

		// add query for x ranges (if needed)
		if (vizObj.view.dimensionX !== "all") {
			queryAgg[vizObj.view.dimensionX] = {
				"terms": {
					"size": vizObj.view.config.maxQuerySize,
					"field": vizObj.view.dimensionX,
					"order": {
						"_term": "asc"
					}
				},
				"aggs": {}
			}
			queryAgg = queryAgg[vizObj.view.dimensionX].aggs;
		}

		// Get stats for each bucket
		queryAgg.bucketStats = {
			"stats": {
				"field": vizObj.view.dimensionY
			}
		}
		queryAgg.bucketPercentiles = {
			"percentiles": {
				"field": vizObj.view.dimensionY
			}
		}


		// Add query to get single cell ID + y data
		queryAgg[ESV.mappings.singleCellID] = {
			"terms": {
				"size": vizObj.view.config.maxQuerySize,
				"field": ESV.mappings.singleCellID
			},
			"aggs": {}
		}
		queryAgg[ESV.mappings.singleCellID].aggs[vizObj.view.dimensionY] = {
			"terms": {
				"size": vizObj.view.config.maxQuerySize,
				"field": vizObj.view.dimensionY
			}
		}

		// Overall Stats
		baseQuery.aggs.allYStats = {
			"stats": {
				"field": vizObj.view.dimensionY
			}
		}

		var queries = ESV.queries.addQueryFiltersAndRanges(queryTrees, baseQuery, viewFacades);
		ESV.queries.makeQueries(vizObj, queryTrees, queries, vizObj.searchIndex, isTriggeredByViewFacade);

	}

	/**
	 * Populates a visualization with data
	 * @param {Object} vizObj - This should contain a full vizObj with the rawData from the server
	 * @returns {Object} vizObj - vizObj with the processed data
	 */
	esv.updateView = function(vizObj, isTriggeredByViewFacade) {
		if (vizObj.hasOwnProperty("rawData")) {
			$('#container-' + vizObj.id + ' .error-overlay').hide();
		}

		if (ESV.properties[vizObj.type].maxDataSources > vizObj.rawData.length) {
		} else {
			if (vizObj.rawData.length > 1) {
				ESV.errorView(vizObj, "This view supports only one dataset");
				return;
			}
		}

		vizObj = _parseData(vizObj);

		vizObj = _setBaseView(vizObj);
		vizObj = _setScales(vizObj);
		vizObj = _setAxes(vizObj);
		vizObj = _setContent(vizObj);

		$("#container-" + vizObj.id + " .loading").remove();
		ESV.hideLoading();

		$('[id^=viz-' + vizObj.id + ']').fadeIn();
		return vizObj;

	}

	/**
	 * Clears the view facade (ie. if a view facade was triggered by clicking on a bar, unhighlight the bar)
	 * @param {Object} vizobj
	 * @param {Object} viewFacadeToRemove
	 */
	esv.clearViewFacade = function(vizObj, viewFacadeToRemove) {

		_updateViolinDeselect(vizObj);
		ESV.viewlibs.clearViewFacade(vizObj, viewFacadeToRemove);
	}
	/**
	 * Adjusts plot dimension given specific changes in the X/Y axis
	 * @param {Object} vizObj
	 * @param {Object} dimensionChange - an object specifying height/width plot change
	 */ 
	esv.resizeView = function(vizObj, dimensionChange) {
		config.width = Math.round(config.width * dimensionChange.width);
		config.height = Math.round(config.height * dimensionChange.height);
		esv.updateView(vizObj);
	}

	// === PRIVATE FUNCTIONS ===

	// ********
	// PARSE DATA
	// ********

	/**
	 * Parses data (value) into vizObj.data.data
	 * @param {Object} vizObj
	 * @return {Object} vizObj - with reference to data
	 */
	 function _parseData(vizObj) {
	 	var aggs = vizObj.rawData[0].response.aggregations;

	 	var data = {};
	 	vizObj.data = {};

	 	// Stats
	 	vizObj.view.yMin = aggs.allYStats.min;
	 	vizObj.view.yMax = aggs.allYStats.max;
	 	vizObj.view.totalRecords = aggs.allYStats.count;


	 	// Data, for each subset
	 	if (vizObj.view.measure !== "none") {
			var subsets = [];
			var subsetBuckets = aggs[vizObj.view.measure].buckets;
			for (var i = 0; i < subsetBuckets.length; i++) {
				var subsetBucket = subsetBuckets[i];
				var subsetName = subsetBucket.key;

				// parse x buckets
				var xBuckets = subsetBucket[vizObj.view.dimensionX].buckets;
				var xData = _parseXBuckets(vizObj, xBuckets);

				data[subsetName] = {
					xData: xData
				}

				subsets.push(subsetName);
			}

			vizObj.data.subsetNames = subsets.sort();

	 	} else {
	 		if (vizObj.view.dimensionX !== "all") {
	 			data = _parseXBuckets(vizObj, aggs[vizObj.view.dimensionX].buckets);
	 		} else {
	 			data = _parseXBuckets(vizObj, [aggs]);
	 		}
	 	}

	 	vizObj.data.data = data;
	 	return vizObj;
	 }

	 /**
	 * Parse x data buckets (one set of buckets per subset)
	 * @param {Object} vizObj
	 * @param {Array} xBuckets
	 * @returns {Object} xData
	 */
	 function _parseXBuckets(vizObj, xBuckets) {
	 	var xData = {};
	 	var xNames = [];

	 	for (var i = 0; i < xBuckets.length; i++) {
	 		var xBucket = xBuckets[i];

	 		if (xBucket.hasOwnProperty("key")) {
	 			var key = xBucket.key;
	 		} else {
	 			var key = "all";
	 		}

	 		var stats = _parseXBucketStats(xBucket.bucketStats, xBucket.bucketPercentiles);

	 		var cellBuckets = xBucket[ESV.mappings.singleCellID].buckets;
	 		var cellData = _parseCellBuckets(vizObj, cellBuckets, stats)

	 		var xBucketData = {
	 			stats: stats,
	 			cellData: cellData.cells
	 		}

	 		if (cellData.hasOwnProperty("densityData")) {
	 			xBucketData.densityData = cellData.densityData;
	 		}

	 		xData[key] = xBucketData;
	 		xNames.push(key);
	 	}


	 	if (vizObj.data.hasOwnProperty("xNames")) {
	 		xNames = _.union(vizObj.data.xNames, xNames);
	 	}

	 	vizObj.data.xNames = xNames

	 	return xData;

	 }


	 /**
	 * Parses the stats for the x bucket
	 * @param {Object} bucketStats
	 * @param {Object} bucketPercentiles
	 */
	 function _parseXBucketStats(bucketStats, bucketPercentiles) {

	 	return {
	 		count: bucketStats.count,
	 		yMin: bucketStats.min,
	 		yMax: bucketStats.max,
	 		average: bucketStats.avg,
	 		q1: bucketPercentiles.values["25.0"],
	 		median: bucketPercentiles.values["50.0"],
	 		q3: bucketPercentiles.values["75.0"]
	 	}
	 }


	 /**
	 * Parse cell buckets into cell ID and associated y value
	 * @param {Object} vizObj
	 * @param {Array} cellBuckets
	 * @param {Object} stats
	 * @returns {Object} cell data and density data
	 */
	 function _parseCellBuckets(vizObj, cellBuckets, stats) {
	 	var cells = [];
	 	var yData = [];
	 	for (var i = 0; i < cellBuckets.length; i++) {
	 		var cellBucket = cellBuckets[i];

	 		cellYData = cellBucket[vizObj.view.dimensionY].buckets

	 		// add only if there is y data
	 		if (cellYData.length !== 0) {
	 			cells.push({
		 			id: cellBucket.key,
		 			y: cellYData[0].key
		 		});

		 		yData.push(cellYData[0].key);
	 		}
	 	}

	 	var cellData = {
	 		cells: cells
	 	}

	 	// if there is data, then generate density plot
	 	if (yData.length > 1) {
	 		var densityData = _getDensityData(vizObj, yData, stats);

	 		cellData.densityData = densityData;
	 	}

	 	return cellData;
	}


	/**
	* Generates the density plot given yData
	* ASSUME: yData is not empty
	* @param {Object} vizObj
	* @param {Array} yData
	* @param {Object} stats
	* @returns {Object} density data and max density value
	*/
	function _getDensityData(vizObj, yData, stats) {
		var kde = science.stats.kde().sample(yData);

		var yMin = stats.yMin;
		var yMax = stats.yMax;

		var densityX = d3.range(yMin, yMax, (yMax - yMin) / vizObj.view.config.numDensityPoints);

		var densityPlot = kde(densityX, 0);
		var densityMax = _.max(densityPlot, function(d) { return d[1]; })[1];

		return {
			density: densityPlot,
			densityMax: densityMax
		}
	}

	// ********
	// DRAWING
	// ********

	/**
	 * Creates the base SVG for the view -> where all the data will be plotted and axes SVG -> which contains all the axes and surrounding labels
	 * @param {Object} vizobj
	 * @returns {Object} vizObj - vizObj with reference to the SVG
	 */
	function _setBaseView(vizObj) {
		var dim = vizObj.view.config;
		vizObj = _setConfigs(vizObj);

		if (vizObj.view.svg === undefined || vizObj.view.svg === null) {
			var svg = d3.select("#viz-" + vizObj.id)
						.append("svg:svg")
						.attr("class", "axesSVG");

			var svgBase = svg.append("svg:svg")
							 .attr("class", "baseSVG");
		} else {
			_removePreviousContent(vizObj);
			var svg = d3.select("#viz-" + vizObj.id).select(".axesSVG");
			var svgBase = d3.select("#viz-" + vizObj.id).select(".baseSVG");
		}

		svg.attr("width", dim.axesWidth)
		   .attr("height", dim.axesHeight);

		svgBase.attr("x", dim.baseX)
			   .attr("y", dim.baseY)
			   .attr("width", dim.baseWidth)
			   .attr("height", dim.baseHeight);

		vizObj.view.svg = svg;
		vizObj.view.svgBase = svgBase;
		return vizObj;
	}


	/**
	 * Sets additional configurations for view
	 * @param {Object} vizobj
	 * @returns {Object} vizObj
	 */
	function _setConfigs(vizObj) {
		var dim = vizObj.view.config;

		dim.axesWidth = dim.width;
		dim.axesHeight = dim.height;

		dim.baseX = dim.margin.left + dim.padding.left;
		dim.baseY = dim.margin.top;
		dim.baseWidth = dim.axesWidth - dim.baseX - dim.margin.right;
		dim.baseHeight = dim.axesHeight - dim.baseY - dim.margin.bottom - dim.padding.bottom;

		dim.yAxisX = dim.baseX;
		dim.yAxisY = dim.baseY;		
		dim.YAxisStartY = dim.baseY;
		dim.YAxisEndY = dim.baseY + dim.baseHeight;
		dim.yAxisTitleX = ((dim.YAxisEndY - dim.YAxisStartY) / 2) + dim.YAxisStartY

		dim.xAxisXOffset = dim.baseX;
		dim.xAxisY = dim.baseY + dim.baseHeight;
		dim.XAxisStartX = dim.baseX;
		dim.XAxisEndX = dim.baseX + dim.baseWidth;		
		dim.xAxisTitleX = ((dim.XAxisEndX - dim.XAxisStartX) / 2) + dim.XAxisStartX;
		dim.xAxisTitleY = dim.axesHeight - dim.margin.bottom;
		// NOTE: plot widths are configured in _setScales
		return vizObj;
	}

	/**
	* Clears previous content from view
	* @param {Object} vizObj
	*/
	function _removePreviousContent(vizObj) {
		d3.select("#viz-" + vizObj.id).selectAll(".axis").remove();
		vizObj.view.svgBase.selectAll(".cell").remove();
		vizObj.view.svgBase.selectAll(".violin").remove();
		vizObj.view.svgBase.selectAll(".violin-line").remove();
	}

	/**
	 * Sets all the scales
	 * @param {Object} vizobj
	 * @returns {Object} vizObj - vizObj with reference to the scales
	 */
	function _setScales(vizObj) { 
		var dim = vizObj.view.config;

		// allow some spacing between edge of axes and content
		var ySpacing = (vizObj.view.yMax - vizObj.view.yMin) * dim.axesScaling;
		var yMin = vizObj.view.yMin - ySpacing;
		var yMax = vizObj.view.yMax + ySpacing;

		// scale for yAxis
		vizObj.view.yScale = d3.scale.linear()
							   .domain([yMin, yMax])
							   .range([dim.baseHeight, 0]);


		// if subset, add scale for x axis ranges
		if (vizObj.view.measure !== "none") {
			vizObj.view.subsetsScale = d3.scale.ordinal()
										.domain(vizObj.data.subsetNames)
										.rangeBands([0, dim.baseWidth], dim.subsetSpacing)

			dim.xPlotsWidth = vizObj.view.subsetsScale.rangeBand();

		} else {
			dim.xPlotsWidth = dim.baseWidth;
		}

		// x axis ranges
		vizObj.view.xPlotsScale = d3.scale.ordinal()
									  .domain(vizObj.data.xNames)
									  .rangeBands([0, dim.xPlotsWidth], dim.xPlotSpacing);

		dim.xPlotWidth = vizObj.view.xPlotsScale.rangeBand();
		dim.xHalfPlotWidth = dim.xPlotWidth / 2;

		// scale for each plot - domain to be added by each xBucket
		vizObj.view.xScale = d3.scale.linear()
							   .range([0, Math.floor(dim.xHalfPlotWidth)]);

		return vizObj;
	}

	/**
	 * Sets all the axes using the previously defined scales
	 * @param {Object} vizobj
	 * @returns {Object} vizObj - vizObj with reference to the axes
	 */
	 function _setAxes(vizObj) { 

	 	var dim = vizObj.view.config;

	 	// y axis
	 	var yAxis = d3.svg.axis()
	 				  .scale(vizObj.view.yScale)
	 				  .orient("left");

	 	vizObj.view.svg.append("g")
	 		  .attr("class", "axis y")
	 		  .attr("transform", "translate(" + dim.yAxisX + ", " + dim.yAxisY + ")")
	 		  .call(yAxis)

		vizObj.view.svg.append("text")
			  .attr("class", "axis y label")
			  .attr("text-anchor", "middle")
			  .attr("x", (-1 * dim.yAxisTitleX))
			  .attr("y", dim.margin.left)
			  .attr("transform", "rotate(-90)")
			  .text(vizObj.view.yAxisField.label)

	 	//x axis
	 	var xAxis = d3.svg.axis()
	 				  .scale(vizObj.view.xPlotsScale)
	 				  .orient("bottom")
	 				  .tickSize(3,0)

		if (vizObj.view.dimensionX !== "all") {
			vizObj.view.svg.append("text")
				  .attr("class", "axis x label")
				  .attr("text-anchor", "middle")
				  .attr("x", dim.xAxisTitleX)
				  .attr("y", dim.xAxisTitleY)
				  .text(vizObj.view.xAxisField.label + " (n = " + vizObj.view.totalRecords +  ")")
		}

	 	// subset axis
	 	if (vizObj.view.measure !== "none") {
	 		var subsetsAxis = d3.svg.axis()
	 						   .scale(vizObj.view.subsetsScale)
	 						   .orient("top")
	 				 		   .tickSize(3,0);

	 		vizObj.view.svg.append("g")
	 			  .attr("class", "axis subset")
	 			  .attr("transform", "translate(" + dim.baseX + ", " + dim.margin.top + ")")
	 			  .call(subsetsAxis)

	 		// add x axis (one for each subset)
	 		for (var i = 0; i < vizObj.data.subsetNames.length; i++) {
	 			var subset = vizObj.data.subsetNames[i];

	 			vizObj.view.svg.append("g")
	 				  .attr("class", "axis x " + subset)
	 				  .attr("transform", "translate(" + (dim.xAxisXOffset + vizObj.view.subsetsScale(subset)) + ", " + dim.xAxisY + ")" )
	 				  .call(xAxis)
	 		} 
	 	} else {
	 		// add x axis (no subset)
 			vizObj.view.svg.append("g")
 				  .attr("class", "axis x")
 				  .attr("transform", "translate(" + dim.baseX + ", " + (dim.baseY + dim.baseHeight) + ")" )
 				  .call(xAxis)
	 	}

	 	return vizObj;

	 }


	/**
	 * Plots the data onto the view
	 * @param {Object} vizobj
	 * @returns {Object} vizObj - vizObj with the updated data and views
	 */
	function _setContent(vizObj) { 

		if (vizObj.view.measure !== "none") {
			for (var i = 0; i < vizObj.data.subsetNames.length; i++) {
				var subset = vizObj.data.subsetNames[i];
				var subsetPlotOffset = vizObj.view.subsetsScale(subset);

				_drawXPlots(vizObj, vizObj.data.data[subset].xData, subsetPlotOffset, subset);
			}
		} else {
			_drawXPlots(vizObj, vizObj.data.data, 0);
		}

		vizObj = _setTooltip(vizObj)
		return vizObj;
	}


	/**
	* Draws the x data plots onto view
	* @param {Object} vizObj
	* @param {Object} xData
	* @param {Number} offset - x pixel shift
	* @param {String || undefined} subset - name
	*/
	function _drawXPlots(vizObj, xData, offset, subset) {

		for (var i = 0; i < vizObj.data.xNames.length; i++) {
			var xName = vizObj.data.xNames[i];
			var xOffset = vizObj.view.xPlotsScale(xName);

			//quick check that data exists
			if (xData.hasOwnProperty(xName)) {

				if (xData[xName].hasOwnProperty("densityData")) {
					_drawDensityPlot(vizObj, xData[xName].densityData, offset + xOffset, xName, subset);
					_drawViolinLines(vizObj, offset + xOffset, xName, subset);
				}
				_drawCellLine(vizObj, xData[xName].cellData, offset + xOffset);
			}
		}
	}

	/**
	* Draws a density (violin) plot onto view
	* @param {Object} vizObj
	* @param {Object} densityData - for one plot
	* @param {Number} offset - x pixel shift
	* @param {String} xName
	* @param {String || undefined} subset
	*/
	function _drawDensityPlot(vizObj, densityData, offset, xName, subset) {

		// Set scale
		var xScale = vizObj.view.xScale.copy();
		xScale.domain([0, densityData.densityMax]);

		// Set lines
		var halfWidth = vizObj.view.config.xPlotWidth / 2;
		var totalOffset = halfWidth + offset;
		var leftLine = d3.svg.line()
						 .x(function(d) { return totalOffset - xScale(d[1]); }) // y coordinate of density plot
						 .y(function(d) { return vizObj.view.yScale(d[0]); }) // x coordinate

 		var rightLine = d3.svg.line()
						 .x(function(d) { return totalOffset + xScale(d[1]); }) // y coordinate of density plot
						 .y(function(d) { return vizObj.view.yScale(d[0]); }) // x coordinate


		var violinArea = d3.svg.area()
						.x0(function(d) { return totalOffset - xScale(d[1]); })
						.x1(function(d) { return totalOffset + xScale(d[1]); })
						.y(function(d) { return vizObj.view.yScale(d[0]); })

		vizObj.view.svgBase.insert("path")
			.datum(densityData.density)
			.attr("class", "violin " + _getViolinName(vizObj, xName, subset))
			.attr("d", violinArea)
			.attr("x-name", xName)
			.attr("subset-name", subset)
			.on("mouseover", function(d) {
				_highlightViolin(vizObj, this);
			})
			.on("mouseout", function(d) {
				_unhighlightViolin(vizObj, this);
			})
			.on("click", function(d) {
				_clickViolin(vizObj, this)
			})

	}

	/**
	* Generates name of violin plot
	* @param {Object} vizObj
	* @param {String} xName
	* @param {String || undefined} subset - name
	* @returns {String} name
	*/
	function _getViolinName(vizObj, xName, subset) {
		if (vizObj.view.measure !== "none") {
			return subset + "-" + xName;
		} else {
			return xName;
		}

	}

	/**
	* Draws the quantitle and median lines onto violin plot
	* @param {Object} vizObj
	* @param {Number} offset
	* @param {String} xName
	* @param {String || undefined} subset - name
	*/
	function _drawViolinLines(vizObj, offset, xName, subset) {
		var x1 = offset;
		var x2 = offset + vizObj.view.config.xPlotWidth;

		var stats = _getStatsForX(vizObj, xName, subset);

		var yScale = vizObj.view.yScale;

		var q1Y = yScale(stats.q1);
		var medianY = yScale(stats.median);
		var q3Y = yScale(stats.q3);

		_drawViolinLine(vizObj, "q1", x1, x2, q1Y, xName, subset);
		_drawViolinLine(vizObj, "q3", x1, x2, q3Y, xName, subset);
		_drawViolinLine(vizObj, "median", x1, x2, medianY, xName, subset); // to plot on top

	}

	/**
	* Draws line at specified place onto plot
	* @param {Object} vizObj
	* @param {String} name - for line
	* @param {Number} x1
	* @param {Number} x2
	* @param {Number} y
	* @param {String} xName
	* @param {String || undefined} subset - name
	*/
	function _drawViolinLine(vizObj, name, x1, x2, y, xName, subset) {
		vizObj.view.svgBase.append("svg:line")
			  .attr("class", "violin line " + name + " " + _getViolinName(vizObj, xName, subset))
			  .attr("x-name", xName)
			  .attr("subset-name", subset)
			  .attr("x1", x1)
			  .attr("y1", y)
			  .attr("x2", x2)
			  .attr("y2", y)
	}


	/**
	* Draws cell dots onto violin plot
	* @param {Object} vizObj
	* @param {Array} cells - for one violin plot
	* @param {Number} offset - x pixel shift
	*/
	function _drawCellLine(vizObj, cells, offset) {
		var dim = vizObj.view.config;

		vizObj.view.svgBase.selectAll(".dot")
			  .data(cells)
			  .enter()
			  .append("circle")
			  .attr("class", function(d) {
			  	return "cell id-" + d.id;
			  })
			  .attr("cx", dim.xHalfPlotWidth + offset)
			  .attr("cy", function(d) {
			  	return vizObj.view.yScale(d.y);
			  })
			  .attr("r", dim.cellRadius)
	}


	 /**
	 * Sets tooltip for hover
	 * @param {Object} vizObj
	 * @returns {Object} vizObj - with reference to tooltip
	 */
	 function _setTooltip(vizObj) {
 	 	vizObj.view.violinTip = d3.tip()
			.attr("class", "d3-tip")
			.direction("e")
			.offset([0,10])
			.html(function(d) {
				var countHTML = "Count: <strong>" + d.count + "</strong>";

				if (d.count === 0 || d.count === 1) {
					return countHTML;
				}
				else {
					var numDigits = vizObj.view.config.roundPrecision;
					var minHTML = "<br>Min: <strong>" + ESV.viewlibs.roundFloat(d.yMin, numDigits) + "</strong>";
					var maxHTML = "<br>Max: <strong>" + ESV.viewlibs.roundFloat(d.yMax, numDigits) + "</strong>";
					var q1HTML = "<br>Q1: <strong>" + ESV.viewlibs.roundFloat(d.q1, numDigits) + "</strong>";
					var medHTML = "<br>Median: <strong>" + ESV.viewlibs.roundFloat(d.median, numDigits) + "</strong>";
					var q3HTML = "<br>Q3: <strong>" + ESV.viewlibs.roundFloat(d.q3, numDigits) + "</strong>";

					return countHTML + maxHTML + q3HTML + medHTML + q1HTML + minHTML;
				}
			});
		vizObj.view.svgBase.call(vizObj.view.violinTip);

		return vizObj;

	 }

	/**
	* Handler for click on violin plot
	* @param {Object} vizObj
	* @param {Object} context
	*/
	function _clickViolin(vizObj, context) {
		var violin = d3.select(context);

		if (violin.classed("violin-active")) {
			_updateViolinDeselect(vizObj)
		} else {
			if (ESV.queries.isQueryAllowed(vizObj)) {
				_selectViolin(vizObj, violin)
			}
		}
	}

	/**
	* Handler for selection of violin plot
	* NOTE: Only one violin plot can be selected at a time
	* @param {Object} vizObj
	* @param {Object} violin - selected plot
	*/
	function _selectViolin(vizObj, violin) {
		if (vizObj.view.dimensionX !== "all") {

			_updateViolinDeselect(vizObj)

			var facade = _createViolinFacade(vizObj, violin);
			ESV.queries.query(vizObj, facade);

			_updateViolinSelect(vizObj, violin, facade.id);

		}
	}

	/**
	* Creates facade for selecting violin plot
	* @param {Object} vizObj
	* @param {Object} violin
	* @returns {Object} facade
	*/
	function _createViolinFacade(vizObj, violin) {
		var facadeID = ESV.generateID();
		var dataTypes = ESV.getUnderlyingDataTypes(vizObj.id);

		var fields = {};

		fields[vizObj.view.dimensionX] = {
			label: vizObj.view.xAxisField.label,
			dataSourceType: dataTypes.join(),
			fieldValues: [violin.attr("x-name")]
		}

		if (vizObj.view.measure !== "none") {
			fields[vizObj.view.measure] = {
				label: vizObj.view.measureField.label,
				dataSourceType: dataTypes.join(),
				fieldValues: [violin.attr("subset-name")]
			}
		}

		return {
			id: facadeID,
			viewID: vizObj.id,
			fields: fields
		};
	}

	/**
	* Updates attr of all violin plots due to selection
	* @param {Object} vizObj
	* @param {Object} violin - selected plot
	* @param {Number} facadeID
	*/
	function _updateViolinSelect(vizObj, violin, facadeID) {

		vizObj.view.svgBase.selectAll(".violin")
			  .classed("violin-inactive", true);

		var xName = violin.attr("x-name");
		var subset = violin.attr("subset-name");

		var violinName = _getViolinName(vizObj, xName, subset);

		vizObj.view.svgBase.selectAll("." + violinName)
			  .classed("violin-active", true)
			  .classed("violin-inactive", false)
			  .attr("violin-facade", facadeID)

	}


	/**
	* Updates attr of all violin plots due to deselection
	* @param {Object} vizObj
	*/
	function _updateViolinDeselect(vizObj) {
		vizObj.view.svgBase.selectAll(".violin")
			  .classed("violin-active", false)
			  .classed("violin-inactive", false)
			  .attr("violin-facade", null)
	}


	/**
	* Handles mouse over of a violin plot
	* @param {Object} vizObj
	* @param {Object} context - of selected plot
	*/
	function _highlightViolin(vizObj, context) {
		var violin = d3.select(context);
		violin.classed("violin-hover", true);

		var xName = violin.attr("x-name");
		var subset = violin.attr("subset-name");
		var stats = _getStatsForX(vizObj, xName, subset);

		vizObj.view.violinTip.show(stats, violin.node());
	}


	/**
	* Handles mouse out of a violin plot
	* @param {Object} vizObj
	* @param {Object} context - of selected plot
	*/
	function _unhighlightViolin(vizObj, context) {
		d3.select(context).classed("violin-hover", false);
		vizObj.view.violinTip.hide()
	}


	/**
	* Returns the stats for given x bucket name
	* @param {Object} vizObj
	* @param {String} xName
	* @param {String || undefined} subset - name
	* @returns {Object} stats
	*/
	function _getStatsForX(vizObj, xName, subset) {
		if (vizObj.view.measure !== "none") {
			var stats = vizObj.data.data[subset].xData[xName].stats;
		} else {
			var stats = vizObj.data.data[xName].stats;
		}

		return stats;
	}

    return esv;
}(ESV.violin || {}));
