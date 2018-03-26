/**
 * Single Cell Chip Heatmap Plugin
 *
 */

ESV.chipheatmap = (function (esv) {
	// === PROPERTIES ===

	// --- Global View Properties ---

	// --- Define Fields ---

	esv.fields = {};

	for (var dataType in CONFIG.editor) {
		if (CONFIG.editor[dataType].hasOwnProperty("chipheatmap")) {
			$.extend(true, esv.fields, CONFIG.editor[dataType]["chipheatmap"]["fields"]);
		}
	}

	// --- Private Module Properties ---
	var defaults = {
		margin: { top: 24, right: 24, bottom: 24, left: 24, x: 2, y: 2 },
		padding: { top: 24, right: 24, bottom: 24, left: 24 },
		gridWidth: 6, // 6
		gridHeight: 6, // 5
		width: 770, // 580
		height: 720, // 560
		transitionSpeed: 200,
		isPopOverVisible: false,
		button: false,
		gridsterBaseDimension: 120,
		maxCellNum: 72,
		maxQuerySize: 1000,
		xDimension: "column",
		yDimension: "row",
		fadeOpacity: 0.5,
		roundPrecision: 2,


		// Cell Configs
		colorArray: ["#0C7CA6", "#FFFFFF", "#f04f4f"],
		cellSpacing: 1,
		blankValue: "blank",
		blankColor: "#f3f3f3",


		// Legend Configs
		legendContainerWidth: 100,
		legendWidth: 5,
		legendHeight: 270,
		legendSquareSize: 10,
		legendSquareSizeHover: 12,
		legendSquareSpacing: 5,
		legendTextOffset: 5

	};
	var config = {}


	// === PUBLIC METHODS ===

	/**
	 * Performs initialization of this module
	 * @param {Object} options - Any properties that should override the default properties
	 */
	esv.init = function(options) { 
		// Gets the vizObj and appends properties specific to the view to it
		var vizObj = ESV.nodes[options.vizID];
		config = $.extend(true, {}, defaults, options);

		vizObj.view = {};

		vizObj = _initializeView(vizObj);

		ESV.nodes[vizObj.id] = vizObj;

		// Renders the base HTML for the histogram and applies it to the grid
		var viewHTML = '<div class="chipheatmap-wrapper" id="viz-' + vizObj.id + '"></div>\
						<div class="chipheatmap-legend" id="viz-' + vizObj.id + '-legend"></div>';

		ESV.initBaseView(vizObj, viewHTML, config.gridWidth, config.gridHeight);

		// Updates the view
		ESV.chipheatmap.update(vizObj);
		
		//Update the title 
		ESV.viewlibs.setPlotTitle(vizObj);

		// Clicking on multifilter-pill removes all facades
		var container = $('#container-'+vizObj.id);
		container.on('click', '.multifilter-pill', function(){
			$('.panel-heading').removeClass('open');
			esv.clearViewFacade(vizObj);
		});
		//  This is used to remove one filter-pill at a time
		ESV.viewlibs.dropdownListeners(vizObj, container);
	}

	/**
	 * Queries the server for the requested data and updates the view
	 * @param {Object} vizObj
	 * @param {Array} viewFacades (optional) - An array of view facades that are currently applied on this view
	 * @param {Boolean} isTriggeredByViewFacade (optional) - true if this view was updated as a view facade was applied (ie. useful if you want to ensure scales don't change when a view facade is applied)
	 */
	esv.update = function(vizObj, viewFilters, isTriggeredByViewFacade) {
    	ESV.queries.query(vizObj, viewFilters, isTriggeredByViewFacade);
	}


	/**
	 * Makes and runs the query specific to this view - This uses the same query as the tri-nucleotide histogram
	 * @param {Object} vizObj
	 * @param {Array} queryTrees - Each query tree will spawn a new query. The number of query trees correspond to the number of data nodes.
	 * @param {Array} viewFacades (optional) - An array of view facades that are currently applied on this view
	 * @param {Boolean} isTriggeredByViewFacade (optional) - true if this view was updated as a view facade was applied (ie. useful if you want to ensure scales don't change when a view facade is applied)
	 */
	esv.query = function(vizObj, queryTrees, viewFacades, isTriggeredByViewFacade) {
		ESV.viewlibs.viewPreProcess(vizObj, isTriggeredByViewFacade);
		var dataTypes = ESV.getUnderlyingDataTypes(vizObj.id);
		vizObj.view.intensity = vizObj.info["chipheatmap-" + dataTypes.join() + "-intensity"].join();
		vizObj.view.measure = vizObj.info["chipheatmap-" + dataTypes.join() + "-subsets"].join();

		if (vizObj.view.intensity != "count") {
			vizObj.view.intensityField = ESV.getFieldConfig(dataTypes.join(), vizObj.view.intensity);
		}
		if (vizObj.view.measure != "none") {
			vizObj.view.measureField = ESV.getFieldConfig(dataTypes.join(), vizObj.view.measure);
		}

		vizObj.view.XAxisField = ESV.getFieldConfig(dataTypes.join(), vizObj.view.config.xDimension);
		vizObj.view.YAxisField = ESV.getFieldConfig(dataTypes.join(), vizObj.view.config.yDimension);

		var baseQuery = {
			"size": 0,
			"aggs": {}
		};

		baseQuery.aggs[config.xDimension] = {
			"terms": {
				"size": config.maxQuerySize,
				"field": config.xDimension,
				"order": {
					"_term": "asc"
				}
			}
		};

		baseQuery.aggs[config.xDimension].aggs = {};
		baseQuery.aggs[config.xDimension].aggs[config.yDimension] = {
			"terms": {
				"size": config.maxQuerySize,
				"field": config.yDimension,
				"order": {
					"_term": "asc"
				}
			}
		};


		baseQuery.aggs[config.xDimension].aggs[config.yDimension].aggs = {};

		baseQuery.aggs[config.xDimension].aggs[config.yDimension].aggs[ESV.mappings.singleCellID] = {
			"terms": {
				"size": config.maxQuerySize,
				"field": ESV.mappings.singleCellID,
				"order": {
					"_term": "asc"
				}
			}
		};

		if (vizObj.view.intensity !== "count") {
			baseQuery.aggs[config.xDimension].aggs[config.yDimension].aggs[vizObj.view.intensity] = {
				"avg": {
					"field": vizObj.view.intensity
				}
			};
		};

		if (vizObj.view.measure !== "none") {
			baseQuery.aggs[config.xDimension].aggs[config.yDimension].aggs[vizObj.view.measure] = {
				"terms": {
					"size": config.maxQuerySize,
					"field": vizObj.view.measure,
					"order": {
						"_term": "asc"
					}
				}
			};
		};


		var queries = ESV.queries.addQueryFiltersAndRanges(queryTrees, baseQuery, viewFacades);
		ESV.queries.makeQueries(vizObj, queryTrees, queries, vizObj.searchIndex, isTriggeredByViewFacade);
	}



	/**
	 * Populates a visualization with data
	 * @param {Object} vizObj - This should contain a full vizObj with the rawData from the server
	 * @param {Array} isTriggeredByViewFacade (optional) - true if this view was updated as a view facade was applied (ie. useful if you want to ensure scales don't change when a view facade is applied)
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

		// before parsing, initialize data structures
		vizObj = _initializeData(vizObj)

		// parse data
		vizObj = _parseData(vizObj);

		// draw
		vizObj = _setBaseView(vizObj);
		vizObj = _setScales(vizObj);
		vizObj = _setAxes(vizObj);
		vizObj = _setContent(vizObj);
		vizObj = _setLegend(vizObj);

		// Remove the loading icons
		$("#container-" + vizObj.id + " .loading").remove();
		ESV.hideLoading();

		$('[id^=viz-' + vizObj.id + ']').fadeIn();

		return vizObj;

	}

	/**
	 * Clears the view facade (ie. if a view facade was triggered by clicking on a bar, unhighlight the bar)
	 * @param {Object} vizobj
	 * @param {Object || Array} viewFacadeToRemove - stores facade ID, viewID and fields (Alt, Ref....)
	 */
	esv.clearViewFacade = function(vizObj, viewFacadeToRemove) { 
		// Has specific view facade(s)
		if (viewFacadeToRemove) {
			// if multiple
			if ($.isArray(viewFacadeToRemove)) {
				for (var i = 0; i < viewFacadeToRemove.length; i++) {
					var facadeID = viewFacadeToRemove[i].id;
					_clearOneViewFacade(vizObj, facadeID);
				}
			}
			// if single
			else {
				_clearOneViewFacade(vizObj, viewFacadeToRemove.id);
			}
		} 
		// All facades
		else {
			_deselectAllGridCell(vizObj);
			if (vizObj.view.measure !== "none") {
				_updateAllLegendSubsetDeselect(vizObj)
			}
		}

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
		}
		else {
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
	 * Sets all the scales
	 * @param {Object} vizobj
	 * @returns {Object} vizObj - vizObj with reference to the scales
	 */
	function _setScales(vizObj) {
		var dim = vizObj.view.config;

		var yDomain = vizObj.view.rowLabel;
		var xDomain = vizObj.view.colLabel;

		vizObj.view.YAxisScale = d3.scale.ordinal().domain(yDomain).rangeBands([dim.YAxisStartY, dim.YAxisEndY]);
		vizObj.view.XAxisScale = d3.scale.ordinal().domain(xDomain).rangeBands([dim.XAxisStartX, dim.XAxisEndX]);

		return vizObj;
	}

	/**
	 * Sets all the axes using the previously defined scales
	 * @param {Object} vizobj
	 * @returns {Object} vizObj - vizObj with reference to the axes
	 */
	 function _setAxes(vizObj) {

		// yAxis
		var yAxis = d3.svg.axis()
			.scale(vizObj.view.YAxisScale)
			.orient("left")
			.tickSize(0,3);

		vizObj.view.svg.append("g")
			.attr("class", "axis y")
			.attr("transform", "translate(" + vizObj.view.config.YAxisX + ", 0)")
			.call(yAxis)


		// xAxis
		var xAxis = d3.svg.axis()
			.scale(vizObj.view.XAxisScale)
			.orient("bottom")
			.tickSize(0,3);

		vizObj.view.svg.append("g")
			.attr("class", "axis x")
			.attr("transform", "translate(0, " + vizObj.view.config.XAxisY + ")")
			.call(xAxis)



		vizObj.view.svg.selectAll(".axis").selectAll("text")
			.style("font-size", "8pt")



		// adjust ticks to show every couple of ticks
		var tickInterval = 5;
		if (vizObj.view.config.cellWidth < 16) {
			vizObj.view.svg.selectAll(".axis.x .tick").each(function(d, i) {
				if ((i + 1)%tickInterval !== 0) {
					d3.select(this).style("display", "none")
				}
			});
		}
		if (vizObj.view.config.cellHeight < 16) {
			vizObj.view.svg.selectAll(".axis.y .tick").each(function(d, i) {
				if ((i + 1)%tickInterval !== 0) {
					d3.select(this).style("display", "none")
				}
			});
		}


		// Count
		vizObj.view.svg.append("text")				  
			.attr("class", "axis count")
			.attr("text-anchor", "middle")
			.attr("x", vizObj.view.config.xAxisTitleX)
			.attr("y", vizObj.view.config.xAxisTitleY)
			.text("n = " + vizObj.data.totalCells);


	 	return vizObj;
	 }

	/**
	 * Plots the data onto the SVG
	 * @param {Object} vizObj
	 * @returns {Object} vizObj - vizObj with the updated data and views
	 */
	function _setContent(vizObj) {
		vizObj = _setColorScales(vizObj);
		vizObj = _setSelectionBrush(vizObj);

		var cellWidth = vizObj.view.config.cellWidth;
		var cellHeight = vizObj.view.config.cellHeight
		var cellSpacing = vizObj.view.config.cellSpacing;

		vizObj.view.svgBase.selectAll(".cellg")
			.data(vizObj.data.data)
			.enter()
			.append("rect")
			.attr("class", function(d) { 
				var name = "cell id-" + d.id;
				if (d.value !== vizObj.view.config.blankValue) {
					name += " cell-data"
				}
				if (vizObj.view.measure !== "none") {
					name = name + " subset-" + d.subset;
				}
				return name })
			.attr("x", function(d) { return (d.col - 1)  * (cellWidth + cellSpacing); })
			.attr("y", function(d) { return (d.row - 1) * (cellHeight + cellSpacing); })
			.attr("width", cellWidth)
			.attr("height", cellHeight)
			.style("fill", function(d) { 
				if (d.value === vizObj.view.config.blankValue || d.value === null)
					{ return vizObj.view.config.blankColor; }
				return vizObj.view.colorScale(d.value); })
			.on("click",function(d) { _clickGridCell(vizObj, this, d); })
			.on("mouseover", function(d) { _highlightGridCell(vizObj, this, d); })
			.on("mouseout", function(d) { _unhighlightGridCell(vizObj, this, d); })
			.on("mousedown", function(d) { _startSelectionBrush(vizObj); })

		vizObj = _setTooltip(vizObj);
		return vizObj;
	}

	/**
	* Set tooltip for heatmap hovering
	* @param {Object} vizObj
	* @returns {Object} vizObj
	*/
	function _setTooltip(vizObj) {
	 	vizObj.view.gridTip = d3.tip()
			.attr("class", "d3-tip")
			.offset([-10,0])
			.html(function(d) {
				var intensityTitle = vizObj.view.intensity === "count" ? "Occurances" : vizObj.view.intensityField.label;
				var roundedValue = _roundValue(vizObj, d.value);
				
				return "Cell: <strong>" + d.id + "</strong>\
			<br/>" + vizObj.view.XAxisField.label + ": <strong>" + d.col + "</strong>\
			<br/>" + vizObj.view.YAxisField.label + ": <strong>" + d.row + "</strong>\
			<br>" + intensityTitle + ": <strong>" + roundedValue + "</strong><br>"
			})
		vizObj.view.svgBase.call(vizObj.view.gridTip);
		return vizObj;
	}

	/**
	* Rounds value to x sig figs or decimal points if needed
	* @param {Object} vizObj
	* @param {Number} num - value to round
	*/
	function _roundValue(vizObj, num) {
		if (num === null || num === "blank") {
			return num
		}
		else {
			return ESV.viewlibs.roundFloat(num, vizObj.view.config.roundPrecision);
		}
	}

	/**
	* Plots the legend onto the view
	* @param {Object} vizObj
	* @returns {Object} vizObj
	*/
	function _setLegend(vizObj) {
		// Remove previous legend contents
		var legendContainer = d3.select("#viz-" + vizObj.id + "-legend");
		legendContainer.selectAll("svg").remove();
		legendContainer.selectAll("rect").remove();

		// Create container
		var dim = vizObj.view.config;
		legendContainer = d3.select("#viz-" + vizObj.id + "-legend")
						.append("svg")
						.attr("class", "legend")
						.attr("x", dim.legendX)
						.attr("y", dim.legendY)
						.attr("width", dim.legendContainerWidth)
						.attr("height", dim.legendContainerHeight);

		vizObj.view.svgLegend = legendContainer

		// Legend gradient
		var gradient = legendContainer.append("svg:defs")
						.append("svg:linearGradient")
						.attr("id", vizObj.id + "-gradient3")
						.attr("x1", "0%")
						.attr("y1", "100%")
						.attr("x2", "0%")
						.attr("y2", "0%")

		var colorArray = vizObj.view.config.colorArray.slice();
		if (vizObj.view.minIntensity === 0) {
			colorArray.shift(); // all but first element
		}

		var colorScale = d3.scale.linear().range(colorArray);
		gradient.selectAll("stop")
				.data(colorScale.range())
				.enter()
				.append("stop")
				.attr("offset", function(d,i) { return i /(colorScale.range().length-1)})
				.attr("stop-color", function(d) { return d })

		legendContainer.append("rect")
				.attr("x", 0)
				.attr("y", dim.legendY)
				.attr("width", vizObj.view.config.legendWidth)
				.attr("height", vizObj.view.config.legendHeight)
				.style("fill", "url(#" + vizObj.id + "-gradient3)");


		// Legend Axis - split into two axes (min to 0, 0 to max)
		var maxIntensity = vizObj.view.maxIntensity;
		var minIntensity = vizObj.view.minIntensity;

		var legendHeightEnd = (minIntensity === 0) ? vizObj.view.config.legendHeight : (vizObj.view.config.legendHeight / 2);

		var legendMaxScale = d3.scale.linear()
							   .domain([0, maxIntensity]).nice()
							   .range([legendHeightEnd, 0]);
		var legendMaxAxis = d3.svg.axis()
							  .scale(legendMaxScale)
							  .orient("right")
							  .ticks(3)

		legendContainer.append("g")
					   .attr("class", "legend axis max")
					   .attr("transform", "translate(10, " + dim.legendY + ")")
					   .call(legendMaxAxis)


		if (minIntensity !== 0) {
			var legendMinScale = d3.scale.linear()
							   .domain([minIntensity, 0])
							   .range([vizObj.view.config.legendHeight, legendHeightEnd]);
			var legendMinAxis = d3.svg.axis()
							  .scale(legendMinScale)
							  .orient("right")
							  .ticks(3)
			legendContainer.append("g")
					   .attr("class", "legend axis min")
					   .attr("transform", "translate(10, " + dim.legendY + ")")
					   .call(legendMinAxis)			  
		}

		// Blank Square
		legendContainer.append("rect")
					   .attr("x", 0)
					   .attr("y", dim.legendBlankY)
					   .attr("width", dim.legendSquareSize)
					   .attr("height", dim.legendSquareSize)
					   .attr("fill", dim.blankColor);

		legendContainer.append("text")
					   .attr("x", dim.legendSquareTextX)
					   .attr("y", dim.legendBlankY)
					   .attr("text-anchor", "start")
					   .attr("dominant-baseline", "hanging")
					   .text("No Data")

		// Count



		// Subset Squares
		if (vizObj.view.measure !== "none") {

			// Title
			legendContainer.append("text")
						   .attr("x", 0)
						   .attr("y", dim.legendSubsetTitleY)
						   .attr("text-anchor", "start")
						   .text(vizObj.view.measureField.label)

			for (var i = 0; i < vizObj.view.subsetList.length; i++) {
				var subset = vizObj.view.subsetList[i];
				var yPos = dim.legendSubsetStartY + (i * (dim.legendSquareSize + dim.legendSquareSpacing));

				legendContainer.append("text")
							   .attr("class", "legend subset-" + subset)
	 						   .attr("id", subset)
							   .attr("x", dim.legendSquareTextX)
							   .attr("y", yPos)
							   .attr("text-anchor", "start")
							   .attr("dominant-baseline", "hanging")
							   .text(subset)
							   .on("mouseover", function(d) { _highlightSubset(vizObj, this) })
							   .on("mouseout", function(d) { _unhighlightSubset(vizObj, this); })
							   .on("click", function(d) { _clickSubset(vizObj, this); })

			}
		}



		return vizObj;
	}

	/**
	* Returns domain and range of axis scale
	* @param {Object} vizObj
	* @returns {Object} - of legend domain and range
	*/
	function _getLegendAxisArguments(vizObj) {
		var legendDomain = [vizObj.view.maxIntensity, vizObj.view.maxIntensity / 2, 0]; 
		var legendRange = [];
		if (vizObj.view.minIntensity !== 0) { // if non-zero min exists
			legendDomain.push(vizObj.view.minIntensity / 2, vizObj.view.minIntensity);
		}

		var spacing = vizObj.view.config.legendHeight / (legendDomain.length - 1)
		for (var i = 0; i < legendDomain.length; i++) {
			legendRange.push(i * spacing)
		}

		return { legendDomain: legendDomain,
			legendRange: legendRange }

	}

	/**
	 * Sets additional configurations for view
	 * @param {Object} vizobj
	 * @returns {Object} vizObj
	 */
	function _setConfigs(vizObj) {
		var dim = vizObj.view.config;

		dim.axesWidth = dim.width - dim.legendContainerWidth - dim.margin.left;
		dim.axesHeight = dim.height - dim.margin.top - dim.margin.bottom;

		dim.baseX = dim.margin.left; // TODO: increas by width of y axis
		dim.baseY = dim.margin.top;
		dim.baseWidth = dim.axesWidth - dim.baseX - dim.margin.right;
		dim.baseHeight = dim.axesHeight - dim.baseY - dim.margin.bottom; // TODO: decrease by x axis height


		var cellWidth = dim.baseWidth / dim.maxCellNum;
		dim.cellWidth = cellWidth - dim.cellSpacing;

		var cellHeight = dim.baseHeight / dim.maxCellNum;
		dim.cellHeight = cellHeight - dim.cellSpacing;

		dim.YAxisStartY = dim.margin.top;
		dim.YAxisEndY = dim.margin.top + dim.baseHeight;

		dim.XAxisStartX = dim.margin.left;
		dim.XAxisEndX = dim.margin.left + dim.baseWidth;

		dim.xAxisTitleX = ((dim.XAxisEndX - dim.XAxisStartX) / 2) + dim.XAxisStartX;
		dim.xAxisTitleY = dim.axesHeight;

		dim.YAxisX = dim.baseX - dim.cellSpacing;
		dim.XAxisY = dim.baseY + dim.baseHeight;

		dim.legendContainerHeight = dim.height - dim.margin.top - dim.margin.bottom;
		dim.legendX = 0;
		dim.legendY = dim.margin.top;

		dim.legendBlankY = dim.legendY + dim.legendHeight + dim.padding.bottom;
		dim.legendSquareTextX = dim.legendSquareSize + dim.legendTextOffset;

		if (vizObj.view.measure !== "none") {
			dim.legendSubsetTitleY = dim.legendBlankY + dim.legendSquareSize + (2 * dim.padding.top);
			dim.legendSubsetStartY = dim.legendSubsetTitleY + dim.legendSquareSpacing;
		}

		return vizObj;
	}
	/**
	 * Initialize plot dimensions
	 * @param {Object} vizObj
	 * @return {Objec} vizObj
	 */
	function _initializeView(vizObj) {
		vizObj.view.width = config.width;
		vizObj.view.height = config.height;
		vizObj.view.config = config;
		vizObj.viewType = "chipheatmap";
		return vizObj;
	}

	/**
	* Clears previous content from view
	* @param {Object} vizObj
	*/
	function _removePreviousContent(vizObj) {
		d3.select("#viz-" + vizObj.id).selectAll(".axis").remove();
		vizObj.view.svgBase.select(".brush").remove();
		vizObj.view.svgBase.selectAll(".cell").remove();
	}


	/**
	 * Initialize data structures
	 * @param {Object} vizObj
	 * @return {Objec} vizObj
	 */
	function _initializeData(vizObj) {
		var colLabel = [];
		var rowLabel = [];
		for (var i = 1; i < config.maxCellNum + 1; i++) {
			colLabel.push(i);
			rowLabel.push(i);
		}
		vizObj.view.colLabel = colLabel;
		vizObj.view.rowLabel = rowLabel;

		vizObj.data = {};
		vizObj.data.data = [];
		vizObj.data.dataMap = {};
		for (var row = 1; row < rowLabel.length + 1; row++) {
			for (var col = 1; col < colLabel.length + 1; col++) {
				vizObj.data.data.push({
					"row": row,
					"col": col,
					"value": vizObj.view.config.blankValue,
					"subset": "none",
					"id": ""
				});
				vizObj.data.dataMap[row] = vizObj.data.dataMap[row] || {};
				vizObj.data.dataMap[row][col] = vizObj.data.data.length - 1;
			}
		}

		// color map for subset
		if (vizObj.view.measure !== "none") {
			vizObj.view.subsetList = [];
		}

		return vizObj;
	}


	/**
	 * Parses data (value) into vizObj.data.data
	 * @param {Object} vizObj
	 * @return {Objec} vizObj
	 */
	function _parseData(vizObj) {
		var response = vizObj.rawData[0].response;

		var colBuckets = response.aggregations[config.xDimension].buckets;

		var rowBucketsItemCount = 0;
		var maxIntensity = 0;
		var minIntensity = 0;

		for (var i = 0; i < colBuckets.length; i++) {
			var colBucket = colBuckets[i];
			var rowBuckets = colBucket[config.yDimension].buckets;
			rowBucketsItemCount += rowBuckets.length;

			for (var j = 0; j < rowBuckets.length; j++) {
				var rowBucket = rowBuckets[j];

				// set single cell ID -- TODO: account for data that doesn't have this property?
				var scID = rowBucket[ESV.mappings.singleCellID].buckets[0].key;
				vizObj.data.data[vizObj.data.dataMap[rowBucket.key][colBucket.key]].id = scID;

				// set intensity
				var intensity = vizObj.view.intensity === "count" ? rowBucket.doc_count : rowBucket[vizObj.view.intensity].value;
				vizObj.data.data[vizObj.data.dataMap[rowBucket.key][colBucket.key]].value = intensity;
				maxIntensity = Math.max(maxIntensity, intensity);
				minIntensity = Math.min(minIntensity, intensity);

				// set subset -- assume at most one value
				if (vizObj.view.measure !== "none") {
					var measure = rowBucket[vizObj.view.measure].buckets[0].key;
					vizObj.data.data[vizObj.data.dataMap[rowBucket.key][colBucket.key]].subset = measure;

					if (!_.contains(vizObj.view.subsetList, measure)) {
						vizObj.view.subsetList.push(measure);
					}
				}
			}
		}

		if (true || isTriggeredByViewFacade !== true) {
			vizObj.view.maxIntensity = maxIntensity;
			vizObj.view.minIntensity = minIntensity;
		}
		vizObj.data.totalCells = rowBucketsItemCount;
		return vizObj;

	}


	/**
	 * Sets the color scales for cells and subset
	 * @param {Object} vizObj
	 * @return {Object} vizObj
	 */
	function _setColorScales(vizObj) {
		vizObj.view.colorScale = d3.scale.linear()
						.domain([vizObj.view.minIntensity, 0, vizObj.view.maxIntensity])
						.range(vizObj.view.config.colorArray)
						.interpolate(d3.interpolateRgb)

		return vizObj;
	}

	/**
	 * Handles clicking of a single cell
	 * @param {Object} vizObj
	 * @param {Object} context - D3 selection context
	 * @param {Object} data - Data behind the selected component
	 */
	function _clickGridCell(vizObj, context, data) {

		var cell = d3.select(context);

		// if cell is already selected, then deselect
		if (cell.classed("cell-active")) {
			_deselectGridCellByClick(vizObj, cell);
		}
		else { // if cell has not been selected
			if (ESV.queries.isQueryAllowed(vizObj)) {
				_selectGridCellByClick(vizObj, context, data)
			}
		}
	}

	/**
	* Handler for mouse down on grid cell, to enable brush selection (on lower layer)
	* @param {Object} vizObj
	*/
	function _startSelectionBrush(vizObj) {
		brushElement = vizObj.view.svg.select(".brush").node();
		clickEvent = new Event("mousedown");
		clickEvent.pageX = d3.event.pageX;
		clickEvent.pageY = d3.event.pageY;
		clickEvent.clientX = d3.event.clientX;
		clickEvent.clientY = d3.event.clientY;
		brushElement.dispatchEvent(clickEvent);
	}

	/**
	* Sets selection brush and handler
	* @param {Object} vizObj
	* @return {Object} vizObj
	*/
	function _setSelectionBrush(vizObj) {
		var dim = vizObj.view.config;

		var x = d3.scale.linear()
			.domain([1, dim.maxCellNum+1])
			.range([0, dim.baseWidth])

		var y = d3.scale.linear()
			.domain([1, dim.maxCellNum+1])
			.range([0, dim.baseHeight])

		var brush = d3.svg.brush()
			.x(x)
			.y(y)
			.on("brushend", function() {
				_selectionBrushEnd(vizObj, brush)
			})
			.on("brush", function() {
				_selectionBrushMove(vizObj, brush)
			})

		vizObj.view.svgBase.append("g")
			.attr("class", "brush")
			.call(brush);

		vizObj.view.xBrushScale = x;
		vizObj.view.yBrushScale = y;
		vizObj.view.brush = brush;

		return vizObj;
	}

	/**
	* Handler for brush movement
	* @param {Object} vizObj
	* @param {Object} brush
	*/
	function _selectionBrushMove(vizObj, brush) {
		if(!brush.empty()) {
			var extent = brush.extent();

			var minCol = Math.floor(extent[0][0]);
			var minRow = Math.floor(extent[0][1]);
			var maxCol = Math.floor(extent[1][0]);
			var maxRow = Math.floor(extent[1][1]);

			vizObj.view.svg.selectAll(".cell")
					.classed("cell-brushed", function(d) {
						isBrushed = minCol <= d.col && d.col <= maxCol && minRow <= d.row && d.row <= maxRow;
						return isBrushed;
					})
		}
	}

	/**
	* Handler for brush end (when button up)
	* @param {Object} vizObj
	* @param {Object} brush
	*/
	function _selectionBrushEnd(vizObj, brush) {
		if (brush.empty()) {
			// Do nothing
		} else if (_isAllBrushedCellsSelected(vizObj)) {  // all brushed cells are selected
			_deselectAllGridCellByBrush(vizObj);
		}

		else {
			_selectAllGridCellByBrush(vizObj);
		}

		vizObj.view.svg.select(".brush").call(brush.clear())
	}


	/**
	* Determines whether all brushed cells have been previously selected
	* @param {Object} vizObj
	*/
	function _isAllBrushedCellsSelected(vizObj) {
		var allSelected = true;
		vizObj.view.svg.selectAll(".cell-brushed").each(function(d) {
			var cell = d3.select(this);
			if (!cell.classed("cell-active")) {
				allSelected = false;
			}
		});
		return allSelected;
	}


	/**
	 * Handles highlighting of the hovered cell grid
	 * @param {Object} vizObj
	 * @param {Object} context - D3 hover context
	 * @param {Object} data - Data behind the hovered component
	 */
	 function _highlightGridCell(vizObj, context, data) { 
	 	if (data.id === "") {
	 		d3.select(context).classed("cell-hover", true);
	 	}
	 	else {
	 		d3.selectAll(".id-" + data.id).classed("cell-hover", true)
	 	}
	 	vizObj.view.gridTip.show(data, d3.select(context).node())
	 }

	/**
	 * Handles mouseout of the hovered cell grid
 	 * @param {Object} vizObj
	 * @param {Object} context - D3 mouseout context
 	 * @param {Object} data - Data behind the hovered component
	 */
	 function _unhighlightGridCell(vizObj, context, data) {
	 	if (data.id === "") {
	 		d3.select(context).classed("cell-hover", false);
	 	}
	 	else {
	 		d3.selectAll(".id-" + data.id).classed("cell-hover", false)
	 	}
	 	vizObj.view.gridTip.hide();
	 }


	/**
	 * Handles highlighting of the hovered subset square on legend (affecting cells)
	 * @param {Object} vizObj
	 * @param {Object} context - D3 hover context
	 */
	 function _highlightSubset(vizObj, context) {
	 	var subset = d3.select(context).attr("id");


	 	vizObj.view.svgBase.selectAll(".cell-data")
	 		  .classed("subset-unhover", true);

	 	vizObj.view.svgBase.selectAll(".subset-" + subset)
	 		  .classed("subset-unhover", false)
	 		  .classed("subset-hover", true);


	 	d3.select("#viz-" + vizObj.id + "-legend").select(".subset-" + subset)
	 		.classed("subset-hover", true)
	 }

	/**
	 * Handles mouseout of the hovered subset square on legend (affecting cells)
	 * @param {Object} vizObj
	 * @param {Object} context - D3 hover context
	 */
	 function _unhighlightSubset(vizObj, context) { 
	 	var subset = d3.select(context).attr("id");

	 	vizObj.view.svgBase.selectAll(".cell-data")
	 		  .classed("subset-unhover", false)
	 		  .classed("subset-hover", false);

	 	d3.select("#viz-" + vizObj.id + "-legend").select(".subset-" + subset)
	 		.classed("subset-hover", false)
	 }

	 /**
	 * Handles mouse click on legend subset space
	 * @param {Object} vizObj
	 * @param {Object} context - D3 hover context
	 */
	 function _clickSubset(vizObj, context) {
	 	var subset = d3.select(context).attr("id");

	 	if (d3.select(context).classed("subset-active")) {
	 		var facadeID = d3.select(context).attr("subset-facade");
	 		var facade = ESV.viewlibs.getViewFacadeByID(facadeID);
	 		esv.clearViewFacade(vizObj, facade);

	 	} else {
	 		_selectAllGridCellBySubset(vizObj, subset);
	 	}
	 }

	 /**
	 * Updates attributes and classes of legend subset that has been selected
	 * @param {Object} vizObj
	 * @param {String} subset
	 * @param {int} facadeID
	 */
	 function _updateLegendSubsetSelect(vizObj, subset, facadeID) {
		vizObj.view.svgLegend.selectAll(".legend.subset-" + subset).each(function(d) {
			d3.select(this).classed("subset-active", true)
						   .attr("subset-facade", facadeID)
		});
	 }

	 /**
	 * Updates attributes and classes of legend subset that has been deselected
	 * @param {Object} vizObj
	 * @param {int} facadeID
	 */
	 function _updateLegendSubsetDeselect(vizObj, facadeID) {
		vizObj.view.svgLegend.selectAll(".legend[subset-facade='" + facadeID + "']").each(function(d) {
			d3.select(this).classed("subset-active", false)
						   .attr("subset-facade", null)
		});
	 }

	/**
	 * Updates attributes and classes of all legend subsets to be deselected
	 * @param {Object} vizObj
	 */
	 function _updateAllLegendSubsetDeselect(vizObj, facadeID) {
		vizObj.view.svgLegend.selectAll(".subset-active").each(function(d) {
			d3.select(this).classed("subset-active", false)
				  		   .attr("subset-facade", null)
		});
	 }

	 // ************
	 // SELECTION FUNCTIONS
	 // ************

	/**
	 * Handles selection of grid cell by mouse click
	 * @param {Object} vizObj
	 * @param {Object} context - D3 selection context
	 */
	function _selectGridCellByClick(vizObj, context, data) {
		var facade = _createCellFacade(vizObj, data.col, data.row)
		ESV.queries.query(vizObj, facade);
		var cell = d3.select(context);
		_updateGridCellSelect(vizObj, cell, facade.id, false);
	}


	/**
	* Handles selection of grid cells by selection brush
	* @param {Object} vizObj
	*/
	function _selectAllGridCellByBrush(vizObj) {

		var facades = [];
		vizObj.view.svg.selectAll(".cell-brushed")
			  .classed("cell-brushed", function(d) {
			  		var cell = d3.select(this);
			  		if (!cell.classed("cell-active")) { // if not selected before
						var facade = _createCellFacade(vizObj, d.col, d.row);
						_updateGridCellSelect(vizObj, cell, facade.id, false);
						facades.push(facade);
					}
					return false;
			  })
		ESV.queries.query(vizObj, facades);
	}

	/**
	* Handles selection of grid cells by subset selection
	* @param {Object} vizObj
	* @param {String} subset
	*/
	function _selectAllGridCellBySubset(vizObj, subset) {
		var facade = _createSubsetFacade(vizObj, subset);

		var facadesToRemove = [];
		ESV.queries.query(vizObj, facade);
		vizObj.view.svg.selectAll(".subset-" + subset).each(function(d) {
			var cell = d3.select(this);

			var oldFacade = _updateGridCellSelect(vizObj, cell, facade.id, true);
			facadesToRemove.push(oldFacade);

		})
		ESV.viewlibs.clearViewFacade(vizObj, facadesToRemove);
		_updateLegendSubsetSelect(vizObj, subset, facade.id);
	}

	/**
	* Handles generating a single cell facades for each cell.
	* @param {Object} vizObj
	* @param {int} x
	* @param {int} y
	* @returns {Object} facade
	*/
	function _createCellFacade(vizObj, x, y){

		var facadeID = ESV.generateID();
		var dataTypes = ESV.getUnderlyingDataTypes(vizObj.id);

		var fields = {};
		var objConfig = vizObj.view.config;

		fields[objConfig.xDimension] = {
			"label": vizObj.view.XAxisField.label,
			"dataSourceType": dataTypes.join(),
			"fieldValues": [x]
		}

		fields[objConfig.yDimension] = {
			"label": vizObj.view.YAxisField.label,
			"dataSourceType": dataTypes.join(),
			"fieldValues": [y]
		}

		return {
			id: facadeID,
			"viewID": vizObj.id,
			"fields": fields
		}
	}

	/**
	* Handles generating a facade for the given subset
	* @param {Object} vizObj
	* @param {String} subset
	*/
	function _createSubsetFacade(vizObj, subset) {

		var facadeID = ESV.generateID();
		var dataTypes = ESV.getUnderlyingDataTypes(vizObj.id);

		var fields = {};

		fields[vizObj.view.measure] = {
			"label": vizObj.view.measureField.label,
			"dataSourceType": dataTypes.join(),
			"fieldValues": [subset]
		}

		return {
			id: facadeID,
			"viewID": vizObj.id,
			"fields": fields
		}
	}


	/**
	 * Adds classes and colour to indicate selection
	 *	NOTE: subset facade ID overwrites cell facade ID
	 * @param {Object} vizObj
	 * @param {Object} cell - D3 selection context
	 * @param {int} facadeID
	 * @param {Bool} isSubset
	 * @returns {Object || undefined} facade, if overwrited
	 */
	function _updateGridCellSelect(vizObj, cell, facadeID, isSubset) {
		if (cell.classed("cell-active")) { // if selected before
			var oldFacadeID = cell.attr("cell-facade");
			cell.attr("cell-facade", (isSubset ? facadeID : oldFacadeID))

			return ESV.viewlibs.getViewFacadeByID(oldFacadeID);
			
		} else { // new selection

			_updateGridCellClassSelect(vizObj, cell, facadeID);
		}
	}

	/**
	* Updates class of selected cell and others (if necessary)
	* @param {Object} vizObj
	* @param {Object} cell - D3 selection
	* @param {int} facadeID
	*/
	function _updateGridCellClassSelect(vizObj, cell, facadeID) {
		cell.classed("cell-active", true)
			.attr("cell-facade", facadeID);

		if (vizObj.view.svg.selectAll(".cell-active").size() === 1) {
			vizObj.view.svg.selectAll(".cell").classed("cell-inactive", true);
		}

		cell.classed("cell-inactive", false);
	}


	 // ************
	 // DESELECTION FUNCTIONS
	 // ************

	/**
	* Handles deselection of a grid cell by mouse click
	* @param {Object} vizObj
	* @param {Object} cell
	*/
	function _deselectGridCellByClick(vizObj, cell) {
		var facadeID = cell.attr("cell-facade");
		var facade = _getFacadeToRemove(vizObj, facadeID);

		// if facade exists, then remove
		if (facade) {
			esv.clearViewFacade(vizObj, facade);
		} else { // else just update appearance of this one cell
			_updateGridCellDeselect(vizObj, cell)
		}
	}

	/**
	* Deselects all grid cells that were brushed
	* @param {Object} vizObj
	*/
	function _deselectAllGridCellByBrush(vizObj) {
		var viewFacadesToRemove = [];
		var facadeIDsToRemove = [];

		vizObj.view.svgBase.selectAll(".cell-brushed").each(function(d) {
			var cell = d3.select(this);
			cell.classed("cell-brushed", false);

			var facadeID = cell.attr("cell-facade");
			// make sure we haven't added this ID before
			if (!_.contains(facadeIDsToRemove, facadeID)) {
				var facade = _getFacadeToRemove(vizObj, facadeID);
				// if facade exists, then add to list of facades to remove
				if (facade) {
					viewFacadesToRemove.push(facade);
					facadeIDsToRemove.push(facadeID);
				} else { // else just update appearance of this one cell
					_updateGridCellDeselect(vizObj, cell)
				}
			}
		});

		esv.clearViewFacade(vizObj, viewFacadesToRemove);
	}


	/**
	* Returns facade to remove if needed
	* @param {Object} vizObj
	* @param {Object} cell
	* @returns {Object || undefined} facade, or nothing if facade shouldn't be removed
	*/
	function _getFacadeToRemove(vizObj, facadeID) {
		if (vizObj.view.svg.selectAll(".cell[cell-facade='" + facadeID + "']").size() === 1) {
			var facade = ESV.viewlibs.getViewFacadeByID(facadeID);
			return facade
		}
	}


	/**
	* Deselects all cells
	* @param {Object} vizObj
	*/
	function _deselectAllGridCell(vizObj) {
		vizObj.view.svg.selectAll(".cell")
			  .style("fill-opacity", 1)
			  .classed("cell-active", false)
			  .classed("cell-inactive", false)
			  .attr("cell-facade", null)

	}

	/**
	* Handles deselection of grid cell given facade
	* @param {Object} vizObj
	* @param {Object} facade
	*/
	function _deselectGridCellByFacade(vizObj, facadeID) {
		vizObj.view.svg.selectAll(".cell[cell-facade='" + facadeID + "']").each(function(d) {
			var cell = d3.select(this);
			_updateGridCellDeselect(vizObj, cell);
		})
	}

	/**
	 * Removes classes and colour to indicate deselection
	 * @param {Object} vizObj
	 * @param {Object} cell - D3 selection context
	 * @param {int} facadeID
	 * @param {Bool} isSubset
	 */
	function _updateGridCellDeselect(vizObj, cell) {
		cell.classed("cell-active", false)
			.classed("cell-inactive", true)
			.attr("cell-facade", null)

		if (vizObj.view.svg.selectAll(".cell-active").size() === 0) {
			vizObj.view.svg.selectAll(".cell")
				.classed("cell-inactive", false)
		}
	}

	/**
	* Resets cells affected by given facade ID
	* @param {Object} vizObj
	* @param {Number} facadeID
	*/
	function _clearOneViewFacade(vizObj, facadeID) {
		_deselectGridCellByFacade(vizObj, facadeID);
			if (vizObj.view.measure !== "none") {
				_updateLegendSubsetDeselect(vizObj, facadeID);
			}
	}

	return esv;
}(ESV.chipheatmap || {}));