/**
 * Scatterplot
 *
 */

ESV.scatterplot = (function (esv) {

	// === PROPERTIES ===

	// --- Global View Properties ---

	// --- Global Fieldsets Properties  ---

	esv.fields = {};
	for (var dataType in CONFIG.editor) {
		if (CONFIG.editor[dataType].hasOwnProperty("scatterplot")) {
			$.extend(true, esv.fields, CONFIG.editor[dataType]["scatterplot"]["fields"]);
		}
	}

	// --- Private Module Properties ---

	var config = {};
	var defaults = {
		margin: { top: 36, right:10, bottom: 36, left: 40 },
		padding: {top: 24, right: 24, bottom: 24, left: 24 },
		gridWidth: 4,
		gridHeight: 4,
		width: 450,
		height: 450,
		gridsterBaseDimension: 120,
		maxQuerySize: 10000,
		axesScaling: 0.05,
		dotRadius: 4,
		roundPrecision: 3,
		subsetColorArray: ['#a6cee3','#1f78b4','#33a02c','#e31a1c','#ff7f00','#6a3d9a','#ffff99','#b15928','#b2df8a','#fb9a99','#fdbf6f','#cab2d6', '#820096', '#4385FF', '#AAFFC3', '#00BE00', '#808000', '#008080', '#FFEA00'],

		legendContainerWidth: 60,
		legendSquareSize: 10,
		legendSquareSizeHover: 12,
		legendSquareSpacing: 5,
		legendTextOffset: 5,

		histogramContainerHeight: 50,
		histogramContainerWidth: 50,
		histogramXBinCount : 30,
	 	histogramYBinCount : 30
	};


	// === PUBLIC METHODS ===

	/**
	 * Performs initialization of this module
	 * @param {Object} options - Any properties that should override the default properties
	 */
	esv.init = function(options) {
		$.extend(true, config, defaults, options);

		// Gets the vizObj and appends properties specific to the view to it
		var vizObj = ESV.nodes[options.vizID];
		vizObj.viewType = "scatterplot";
		vizObj.view = {};

		vizObj.view.width = config.width;
		vizObj.view.height = config.height;
		vizObj.view.config = config;

		// Save the vizObj back to the global scope
		ESV.nodes[vizObj.id] = vizObj;

		// Renders the base HTML for the scatterplot and applies it to the grid
		var viewHTML = '<div class="scatterplot-wrapper"><div id="viz-' + vizObj.id + '"></div></div> \
						<div class="scatterplot-legend" id="viz-' + vizObj.id + '-legend"></div>' ;

		ESV.initBaseView(vizObj, viewHTML, config.gridWidth, config.gridHeight);

		// Updates the view
		ESV.scatterplot.update(vizObj);

		// Clicking on multifilter-pill removes all facades
		var container = $('#container-'+vizObj.id);
		container.on('click', '.multifilter-pill', function(){
			$('.panel-heading').removeClass('open');
			esv.clearViewFacade(vizObj);
		});
	}

	/**
	 * Queries the server for the requested data and updates the view
	 * @param {Object} vizObj
	 * @param {Array} viewFacades (optional) - An array of view facades that are currently applied on this view
	 * @param {Boolean} isTriggeredByViewFacade (optional) - true if this view was updated as a view facade was applied (ie. useful if you want to ensure scales don't change when a view facade is applied)
	 */
	esv.update = function(vizObj, viewFacades, isTriggeredByViewFacade) {
    	ESV.queries.query(vizObj, viewFacades, isTriggeredByViewFacade);
	}

	/**
	 * Makes and runs the query specific to this view
	 * @param {Object} vizObj
	 * @param {Array} queryTrees - Each query tree will spawn a new query. The number of query trees correspond to the number of data nodes.
	 * @param {Array} viewFacades (optional) - An array of view facades that are currently applied on this view
	 * @param {Boolean} isTriggeredByViewFacade (optional) - true if this view was updated as a view facade was applied (ie. useful if you want to ensure scales don't change when a view facade is applied)
	 */
	esv.query = function(vizObj, queryTrees, viewFacades, isTriggeredByViewFacade) {
		ESV.viewlibs.viewPreProcess(vizObj, isTriggeredByViewFacade);
		var dataTypes = ESV.getUnderlyingDataTypes(vizObj.id);

		//Update plot title
		ESV.viewlibs.setPlotTitle(vizObj);

		vizObj.view.xAxis = vizObj.info["scatterplot-" + dataTypes.join() + "-dimension-x"].join();
		vizObj.view.yAxis = vizObj.info["scatterplot-" + dataTypes.join() + "-dimension-y"].join();
		vizObj.view.measure = vizObj.info["scatterplot-" + dataTypes.join() + "-subsets"].join();

		vizObj.view.xAxisField = ESV.getFieldConfig(dataTypes.join(), vizObj.view.xAxis);
		vizObj.view.yAxisField = ESV.getFieldConfig(dataTypes.join(), vizObj.view.yAxis);
		if (vizObj.view.measure !== "none") {
			vizObj.view.measureField = ESV.getFieldConfig(dataTypes.join(), vizObj.view.measure);
		}


		var baseQuery = {
			"size": vizObj.view.config.maxQuerySize,
			"fields": [],
			"aggs": {}
		}

		baseQuery.fields.push(vizObj.view.xAxis);
		baseQuery.fields.push(vizObj.view.yAxis);
		baseQuery.fields.push(ESV.mappings.singleCellID);


		baseQuery.aggs.xStats = {
			"stats": {
				"field": vizObj.view.xAxis
			}
		}

		baseQuery.aggs.yStats = {
			"stats": {
				"field": vizObj.view.yAxis
			}
		}

		if (vizObj.view.measure !== "none") {
			baseQuery.fields.push(vizObj.view.measure);
			baseQuery.aggs.subsetNames = {
				"terms": {
					"field": vizObj.view.measure,
					"size": vizObj.view.config.maxQuerySize
				}
			}
		}

		var queries = ESV.queries.addQueryFiltersAndRanges(queryTrees, baseQuery, viewFacades);
		
		// Filter out all records that does not have x or y data
		var xFilter = {
			"exists": {
				"field": vizObj.view.xAxis
			}
		};
		var yFilter = {
			"exists": {
				"field": vizObj.view.yAxis
			}
		};

		queries = $.map(queries, function(query) {
			query.query.filtered.filter.bool.must.push(xFilter);
			query.query.filtered.filter.bool.must.push(yFilter);
			return query
		});
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

		if (!isTriggeredByViewFacade){
			vizObj = _setJustifiedHistogramConstants(vizObj)
		}

		vizObj = _parseData(vizObj);
		
		vizObj = _setBaseView(vizObj);

		// to remove dynamic scaling when facade is added
		if (!isTriggeredByViewFacade) {
			vizObj = _setScales(vizObj);
		}

		vizObj = _setAxes(vizObj);
		vizObj = _setContent(vizObj);
		vizObj = _setLegend(vizObj);
		vizObj = _setHistogramContent(vizObj);

		$("#container-" + vizObj.id + " .loading").remove();
		ESV.hideLoading();

		$('[id^=viz-' + vizObj.id + ']').fadeIn();

		return vizObj;
	}


	/**
	 * Clears the view facade (ie. if a view facade was triggered by clicking on a bar, unhighlight the bar)
	 * @param {Object} vizobj
	 */
	esv.clearViewFacade = function(vizObj) { 
		_deselectAllCell(vizObj);
		ESV.viewlibs.clearViewFacade(vizObj);

		_removeBrushOnTopOfDOM(vizObj);
		vizObj.view.svg.select(".brush").call(vizObj.view.canvasBrush.clear());

		_displayHistogramBySubset(vizObj,"all");

		if (vizObj.view.measure !== "none") {
			_updateAllLegendSubsetDeselect(vizObj);
			
		}
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
	 * Parses data (value) into vizObj.data.data
	 * @param {Object} vizObj
	 * @return {Object} vizObj
	 */
	 function _parseData(vizObj) {
	 	vizObj.data = {};

	 	var aggs = vizObj.rawData[0].response.aggregations;
	 	vizObj.view.xMin = aggs.xStats.min;
	 	vizObj.view.xMax = aggs.xStats.max;
	 	vizObj.view.yMin = aggs.yStats.min;
	 	vizObj.view.yMax = aggs.yStats.max;

		//Initialize histogram bins for all points
		var histogramBinData = {};
		histogramBinData = _initHistogramObj(vizObj,histogramBinData,"all");

	 	if (vizObj.view.measure !== "none") {
	 		var subsetNames = _parseSubsetBuckets(aggs.subsetNames.buckets);
	 		vizObj.data.subsetNames = subsetNames;
	 		
	 		var subSetMap = new Map();

	 		$.map(subsetNames, function(subset){
	 			subSetMap.set(subset,[]);

	 			//Initialize histogram bins for each subset
	 			histogramBinData = _initHistogramObj(vizObj,histogramBinData,subset);
	 		});
	 	}

	 	var hits = vizObj.rawData[0].response.hits.hits;
	 	var xAxis = vizObj.view.xAxis;
	 	var yAxis = vizObj.view.yAxis;
	 	
	 	var data = $.map(hits, function(record) {
	 		var xData = record.fields[xAxis][0];
	 		var yData = record.fields[yAxis][0];
	 		var scID = record.fields[ESV.mappings.singleCellID][0] // TODO: deal with lack of field

	 		var dataObj = { id: scID,
	 			x: xData,
	 			y: yData }

	 		if (vizObj.view.measure !== "none") {
	 			dataObj.subset = record.fields[vizObj.view.measure][0];

	 			var listOfDataObj = subSetMap.get(dataObj.subset);
	 			listOfDataObj.push(dataObj);
	 			subSetMap.set(dataObj.subset,listOfDataObj);

	 			vizObj.subsetData = subSetMap;
	 		}

	 		//Increase frequency for bin for this specific point
	 		histogramBinData = _setHistogramBins(histogramBinData, dataObj);
	 		
	 		return dataObj;
	 	});

	 	vizObj.histogramData = histogramBinData;
	 	vizObj.data.data = data;

	 	return vizObj;
	 }

	/**
	 * Parses subset buckets into sorted (alphabetically) array of subset names
	 * @param {Array} subsetBuckets
	 * @param {Array} subsetNames
	 */
	function _parseSubsetBuckets(subsetBuckets) {
		var subsetNames = $.map(subsetBuckets, function(d) {
			return d.key;
		});
		return subsetNames.sort();
	}

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
		dim.baseY = dim.histogramContainerHeight + dim.margin.top;
		dim.baseWidth = dim.axesWidth - dim.baseX - dim.margin.right -dim.histogramContainerWidth;
		dim.baseHeight = dim.axesHeight - dim.baseY - dim.margin.bottom - dim.padding.bottom;

		dim.YAxisStartY = dim.baseY;
		dim.YAxisEndY = dim.axesHeight - dim.histogramContainerHeight;
		dim.XAxisStartX = dim.baseX;
		dim.XAxisEndX = dim.axesWidth - dim.histogramContainerWidth;

		dim.xAxisTitleX = ((dim.XAxisEndX - dim.XAxisStartX) / 2) + dim.XAxisStartX;
		dim.xAxisTitleY = dim.axesHeight;

		dim.yAxisTitleX = ((dim.YAxisEndY - dim.YAxisStartY) / 2) + dim.YAxisStartY;

		dim.YAxisX = dim.baseX;
		dim.XAxisY = dim.baseY + dim.baseHeight;

		dim.XhistogramContainerWidth = dim.baseWidth;
		dim.XhistogramContainerHeight = dim.histogramContainerHeight;
		dim.XhistogramX = dim.baseX;
		dim.XhistogramY = dim.margin.top;
		
		dim.YhistogramContainerWidth = dim.histogramContainerWidth;
		dim.YhistogramContainerHeight = dim.baseHeight;
		dim.YhistogramX = dim.XAxisEndX - dim.margin.right;
		dim.YhistogramY = dim.baseY;

		if (vizObj.view.measure !== "none") {
			dim.legendX = 0;
			dim.legendY = (2 * dim.margin.top);
			dim.legendContainerHeight = dim.height - dim.margin.top - dim.margin.bottom;
			dim.legendSubsetTitleY = dim.padding.top;
			dim.legendSubsetStartY = dim.legendSubsetTitleY + dim.legendSquareSpacing;
			dim.legendSquareTextX = dim.legendSquareSize + dim.legendTextOffset;
		}
		
		return vizObj;
	}

	/**
	* Clears previous content from view
	* @param {Object} vizObj
	*/
	function _removePreviousContent(vizObj) {
		d3.select("#viz-" + vizObj.id).selectAll(".y.axis").remove();
		d3.select("#viz-" + vizObj.id).selectAll(".x.axis").remove();
		
		vizObj.view.svgBase.selectAll(".cell").remove();
		vizObj.view.svgBase.select(".brush").remove();
		
		vizObj.view.svgBase.selectAll(".rect").remove();
		
		for(var prevSubset in vizObj.view.subsetColorMap){
			vizObj.view.svgBase.selectAll(".subset-" + prevSubset).remove();
		}
	}

	/**
	 * Sets all the scales
	 * @param {Object} vizobj
	 * @returns {Object} vizObj - vizObj with reference to the scales
	 */
	function _setScales(vizObj) { 
		var dim = vizObj.view.config;
		// allow some spacing between edge of axes and content
		var xSpacing = (vizObj.view.xMax - vizObj.view.xMin) * dim.axesScaling;
		var ySpacing = (vizObj.view.yMax - vizObj.view.yMin) * dim.axesScaling;
		var xMin = vizObj.view.xMin - xSpacing;
		var xMax = vizObj.view.xMax + xSpacing;
		var yMin = vizObj.view.yMin - ySpacing;
		var yMax = vizObj.view.yMax + ySpacing;

		vizObj.view.xScale = d3.scale.linear()
							   .domain([xMin, xMax])
							   .range([0, dim.baseWidth]);
		vizObj.view.yScale = d3.scale.linear()
							   .domain([yMin, yMax])
							   .range([dim.baseHeight, 0]);
		return vizObj;
	}

	/**
	 * Sets all the axes using the previously defined scales
	 * @param {Object} vizobj
	 * @returns {Object} vizObj - vizObj with reference to the axes
	 */
	 function _setAxes(vizObj) { 
	 	var dim = vizObj.view.config;
	 	// xAxis
	 	var xAxis = d3.svg.axis()
	 				  .scale(vizObj.view.xScale)
	 				  .orient("bottom");

	 	vizObj.view.svg.append("g")
	 		  .attr("class", "x axis")
	 		  .attr("transform", "translate(" + dim.baseX + ", " + dim.XAxisY + ")")
	 		  .call(xAxis)

		// y Axis
		var yAxis = d3.svg.axis()
	 				  .scale(vizObj.view.yScale)
	 				  .orient("left");

	 	vizObj.view.svg.append("g")
	 		  .attr("class", "y axis")
	 		  .attr("transform", "translate(" + dim.YAxisX + ", " + dim.baseY + ")")
	 		  .call(yAxis)

		// Labels
		vizObj.view.svg.append("text")
			  .attr("class", "x axis label")
			  .attr("text-anchor", "middle")
			  .attr("x", dim.xAxisTitleX)
			  .attr("y", dim.xAxisTitleY)
			  .text(vizObj.view.xAxisField.label +  " (n = " + vizObj.data.data.length +  ")")

		vizObj.view.svg.append("text")
			  .attr("class", "y axis label")
			  .attr("text-anchor", "middle")
			  .attr("x", (-1 * dim.yAxisTitleX))
			  .attr("y", dim.padding.left)
			  .attr("transform", "rotate(-90)")
			  .text(vizObj.view.yAxisField.label)

		vizObj.view.xAxisSVG = xAxis;
		vizObj.view.yAxisSVG = yAxis;


	 	return vizObj
	 }

	/**
	 * Plots the data onto the SVG
	 * @param {Object} vizObj
	 * @returns {Object} vizObj - vizObj with the updated data and views
	 */
	 function _setContent(vizObj) {

	 	var dim = vizObj.view.config;

		vizObj = _setCanvasSelectionBrush(vizObj);

		//Set subset color scheme if needed
		if (vizObj.view.measure !== "none") {
			vizObj = _removePreviousSubsetDOMElements(vizObj);
			var subsetColorMap = {};
			for (var i = 0; i < vizObj.data.subsetNames.length; i++) {

				//Get and set subset properties 
				var subset = vizObj.data.subsetNames[i];
				var subsetClassName = "subset_"+vizObj.data.subsetNames[i];
				var subsetData = vizObj.subsetData.get(subset);

				var subsetAppendNode = vizObj.view.svgBase.append('svg').attr("class",subsetClassName);
				
				subsetColorMap[subset] = vizObj.view.config.subsetColorArray[i];
				vizObj.view.subsetColorMap = subsetColorMap;

				//Plot all points for the given subsets
				createCanvasPoints(vizObj,subsetAppendNode,subsetClassName,subsetData);
			}
		}else{
			//Plot all points without subset
			createCanvasPoints(vizObj,vizObj.view.svgBase,"cell",vizObj.data.data);
		}

	 	vizObj = _setTooltip(vizObj)

	 	return vizObj
	 }

	 /**
	 * Sets the plots' overall max and minimum
	 * @param - vizObj
	 *
	 */
	 function _setJustifiedHistogramConstants(vizObj){
		var aggs = vizObj.rawData[0].response.aggregations;

	 	vizObj.view.overallXMin = aggs.xStats.min;
	 	vizObj.view.overallXMax = aggs.xStats.max;
	 	vizObj.view.overallYMin = aggs.yStats.min;
	 	vizObj.view.overallYMax = aggs.yStats.max;

	 	return vizObj;
	}
	  /**
	* Initialize data object for a specific subset or for the all subset
	* @param {Object} vizObj
	* @param {Object} histogramBinData
	* @param {String} collectionName
	*/
	function _initHistogramObj(vizObj,histogramBinData,collectionName){

		//Initialize histogramBinData object only the first time 
		if (collectionName == "all"){

			var xSpacing = (vizObj.view.overallXMax - vizObj.view.overallXMin) * vizObj.view.config.axesScaling;
			var ySpacing = (vizObj.view.overallYMax - vizObj.view.overallYMin) * vizObj.view.config.axesScaling;
			var xMin = vizObj.view.overallXMin - xSpacing;
			var xMax = vizObj.view.overallXMax + xSpacing;
			var yMin = vizObj.view.overallYMin - ySpacing;
			var yMax = vizObj.view.overallYMax + ySpacing;

 			var xBinCount = vizObj.view.config.histogramXBinCount;
 			var yBinCount = vizObj.view.config.histogramYBinCount;
			
			var xInterval = Math.round(((xMax - xMin)/xBinCount) * 100000) /100000;
			var xArrayOffset = Math.round(-xMin/xInterval);

			var yInterval = Math.round(((yMax - yMin)/yBinCount) * 100000) /100000;
			var yArrayOffset = Math.round(-yMin/yInterval);

			//Histogram bin data object 
			histogramBinData = {
				xDefaultInterval: xInterval,
				yDefaultInterval: yInterval,
				xBinSize: xBinCount,
				yBinSize: yBinCount,
				largestXBin: 0,
				largestYBin: 0,
				xArrayOffset: xArrayOffset,
				yArrayOffset: yArrayOffset,
				data: {}
				};
		}

		histogramBinData.data[collectionName] = { 
			X:Array.apply(null, Array(histogramBinData.xBinSize)).map(Number.prototype.valueOf,0),
			Y:Array.apply(null, Array(histogramBinData.yBinSize)).map(Number.prototype.valueOf,0),
		};

		return histogramBinData;
	}

	/**
	* Increase bin count for histogram by 1 for the "all" collection and any subset the point belongs to
	* @param {Object} histogramBinData
	* @param {Object} dataObj
	*/
	function _setHistogramBins(histogramBinData, dataObj){

		var subset = dataObj.subset;
		var binData = histogramBinData.data;
		
		var locationInXArray = Math.floor(dataObj.x / histogramBinData.xDefaultInterval) + histogramBinData.xArrayOffset;
		var locationInYArray = Math.floor(dataObj.y / histogramBinData.yDefaultInterval) + histogramBinData.yArrayOffset;

		//Update record for the "all" subset
		var updatedXRecord = ++binData.all.X[locationInXArray];	
		var updatedYRecord = ++binData.all.Y[locationInYArray];
		
		histogramBinData = _setLargestHistogramBin(histogramBinData,updatedXRecord,updatedYRecord);
		
		//Update record for the subset the point belongs to
		if (subset) {
			updatedXRecord = ++binData[subset].X[locationInXArray];
			updatedYRecord = ++binData[subset].Y[locationInYArray];	

			histogramBinData = _setLargestHistogramBin(histogramBinData,updatedXRecord,updatedYRecord);
		}

		histogramBinData.data = binData;		
		return histogramBinData;
	}

	/**
	* For a given subset, display histogram and hide previous
	* @param {Object} vizObj
	* @param {String} subset - to bring foreward
	**/
	function _displayHistogramBySubset(vizObj,subset){
		 vizObj.view.svg.selectAll(".histogram")
		 	.classed("scatterplot-histogram-hidden", true);

		vizObj.view.svg.selectAll(".histogram.subset_"+subset)
			.classed("scatterplot-histogram-hidden", false);
	}

	/**
	* Set the largest bin size
	* @param {Object} histogramBinData
	* @param {Int} updatedXRecord
	* @param {Int} updatedYRecord
	*/
	function _setLargestHistogramBin(histogramBinData,updatedXRecord,updatedYRecord){
		histogramBinData.largestXBin = Math.max(histogramBinData.largestXBin, updatedXRecord);
		histogramBinData.largestYBin = Math.max(histogramBinData.largestYBin, updatedYRecord);
		return histogramBinData;
	}
	/**
	* Set the histogram base for x and y axis and add all bars to the plot
	* @param {Object} - vizObj
	*/
	function _setHistogramContent(vizObj){

		vizObj.view.svg.selectAll(".baseHistogramSVG-xAxis").remove();
		vizObj.view.svg.selectAll(".baseHistogramSVG-yAxis").remove();

		vizObj  = _setHistogramXAxisToolTip(vizObj);
		vizObj  = _setHistogramYAxisToolTip(vizObj);

		var dim = vizObj.view.config;
		var histogramXContainer = vizObj.view.svg
					.append("svg:svg")
					.attr("class", "baseHistogramSVG-xAxis")
					.attr("width", vizObj.view.config.XhistogramContainerWidth)
					.attr("height", vizObj.view.config.XhistogramContainerHeight)					
					.attr("x", vizObj.view.config.XhistogramX)
					.attr("y", vizObj.view.config.XhistogramY);

		var histogramYContainer = vizObj.view.svg
					.append("svg:svg")
					.attr("class", "baseHistogramSVG-yAxis")
					.attr("width", vizObj.view.config.YhistogramContainerWidth)
					.attr("height", vizObj.view.config.YhistogramContainerHeight)					
					.attr("x", vizObj.view.config.YhistogramX)
					.attr("y", vizObj.view.config.YhistogramY);

		for (var subset in vizObj.histogramData.data) {
				var subsetClassName = "histogram subset_"+subset;
				var subsetData = vizObj.histogramData.data[subset];
				
				var XAxisAppendNode = histogramXContainer.append('svg').attr("class",subsetClassName+" xAxis");
				var YAxisAppendNode = histogramYContainer.append('svg').attr("class",subsetClassName+ " yAxis");
				
				//Hide all subsets except for the "all" subset
				if(subset != "all"){ 
					XAxisAppendNode.classed("scatterplot-histogram-hidden",true); 
					YAxisAppendNode.classed("scatterplot-histogram-hidden",true); 
				}

				//Create histogram bars for each subset
				_createHistogramBars(XAxisAppendNode,subset,vizObj);
				_createHistogramBars(YAxisAppendNode,subset,vizObj);	
		}
		
		
	 	return vizObj;
	 }


	 /**
	 * Create histogram rectangles and plot
	 * @param {Object} histogramContainer 
	 * @param {String} subset
	 * @param {Object} vizObj
	 */
	 function _createHistogramBars(histogramContainer, subset, vizObj){
	 	
	 	var dim = vizObj.view.config;
		if (histogramContainer.classed("xAxis")){	 	
			var largestXBin = vizObj.histogramData.largestXBin;
			var binDataX = vizObj.histogramData.data[subset].X;
 			var xBinWidth = dim.baseWidth/Object.keys(binDataX).length;

		 	histogramContainer.selectAll(".bar")
					.data(binDataX)
					.enter()
					.append("rect")
					.attr("x", function(d, i) { return i * xBinWidth; })
					.attr("y", function(d, i) { return dim.histogramContainerHeight - (d * dim.histogramContainerHeight/ largestXBin); })
					.attr("class","bar")
					.attr("height", function(d){ 
							return ( d * dim.histogramContainerHeight )/ largestXBin; })
					.attr("width", function(d){ return  xBinWidth - 3; })
					.attr("fill", function(d){
						if (subset !== "all") {
		 		  			return vizObj.view.subsetColorMap[subset];
		 		  		} 
		 		  		else{
		 		  			return "#c7c7c9";
		 		  		}
		 		  	})
		 		  	.on("mouseover", function(d){		 		  		
		 		  		vizObj.view.histogramXAxisToolTip.show(d,histogramContainer);
		 		  		return d3.select(this).attr("opacity",0.6);
		 		  	})
		 		  	.on("mouseout", function(d){
		 		  		vizObj.view.histogramXAxisToolTip.hide();
		 		  		return d3.select(this).attr("opacity",1);
		 		  	});
		 	} else{
		 		var largestYBin = vizObj.histogramData.largestYBin;
				var binDataY = vizObj.histogramData.data[subset].Y;
				var dataArrayLength = Object.keys(binDataY).length;
 				var yBinWidth = dim.baseHeight/dataArrayLength;

		 		histogramContainer.selectAll(".bar")
					.data(binDataY)
					.enter()
					.append("rect")
					.attr("x", 0)
					.attr("y", function(d, i) { return dataArrayLength * yBinWidth - (i * yBinWidth); })
					.attr("class","bar")
					.attr("height", function(d){ 
							return yBinWidth -3; })
					.attr("width", function(d){ return  d * dim.YhistogramContainerWidth/ largestYBin; })
					.attr("fill", function(d){
						if (subset !== "all") {
		 		  			return vizObj.view.subsetColorMap[subset];
		 		  		} 
		 		  		else{
		 		  			return "#c7c7c9";
		 		  		}
		 		  	})		 		  	
		 		  	.on("mouseover", function(d){
		 		  		vizObj.view.histogramYAxisToolTip.show(d,histogramContainer);
		 		  		return d3.select(this).attr("opacity",0.6);
		 		  	})
		 		  	.on("mouseout", function(d){
		 		  		vizObj.view.histogramYAxisToolTip.hide();
		 		  		return d3.select(this).attr("opacity",1);
		 		  	});		
		 }
	}

	/**
	* Set the tooltip for histogram on the Y axis
	* @param {Object} - vizObj
	*/
	function _setHistogramYAxisToolTip(vizObj){
		vizObj.view.histogramYAxisToolTip = d3.tip()
			.attr("class", "d3-tip")	
			.direction('n')
			.offset([-10,0])
			.html(function(d) {
				return "<strong>" + d + "</strong>"
			});

		vizObj.view.svg.call(vizObj.view.histogramYAxisToolTip);
		return vizObj;
	}

	/**
	* Set the tooltip for histogram on the X axis
	* @param {Object} - vizObj
	*/
	function _setHistogramXAxisToolTip(vizObj){
		vizObj.view.histogramXAxisToolTip = d3.tip()
			.attr("class", "d3-tip")	
			.direction('n')
			.offset([-10,0])
			.html(function(d) {
				return "<strong>" + d + "</strong>"
			});

		vizObj.view.svg.call(vizObj.view.histogramXAxisToolTip);
		return vizObj;
	}
	
	 /**
	 * Removes previous,empty subset DOM elements
	 * @param {Object} vizObj
	 */
	 function _removePreviousSubsetDOMElements(vizObj){
		for (var i = 0; i < vizObj.data.subsetNames.length; i++) {
			vizObj.view.svgBase.select(".subset_"+vizObj.data.subsetNames[i]).remove();
		}
		return vizObj;
	 } 

	 /*
	* Creates scatterplot circles according to data
	* @param {Object} vizObj
	* @param {Object} appendNode - svg element, either svgBase or subset node
	* @param {String} className - subset name or "cell"
	* @param {Object} data - either all points or 1 subset
	*/
	 function createCanvasPoints(vizObj, appendNode, className, data){
	 	appendNode.selectAll("."+className)
	 		  .data(data)
	 		  .enter()
	 		  .append("circle")
	 		  .attr("class", function(d) {
	 		  	var name = "cell id-" + d.id; 
	 		  	if (vizObj.view.measure !== "none") {
	 		  		name = name + " subset-" + d.subset;
	 		  	};
	 		  	return name;
	 		  })
	 		  .attr("cx", function(d) {
	 		  	return vizObj.view.xScale(d.x);
	 		  })
	 		  .attr("cy", function(d) {
	 		  	return vizObj.view.yScale(d.y);
	 		  })
	 		  .attr("r", vizObj.view.config.dotRadius)
	 		  .style("fill", function(d) {
	 		  	if (vizObj.view.measure !== "none") {
	 		  		return vizObj.view.subsetColorMap[d.subset];
	 		  	}
	 		  })
	 		  .on("mouseover", function(d) { _highlightCell(vizObj, d, this); })
	 		  .on("mouseout", function(d) { _unhighlightCell(vizObj, d); });

	 }

	/**
	* Sets selection brush and handler
	* @param {Object} vizObj
	* @return {Object} vizObj
	*/
	function _setCanvasSelectionBrush(vizObj) {

		var brush = d3.svg.brush()
			.x(vizObj.view.xScale)
			.y(vizObj.view.yScale)
			.on("brushend", function() {
				_displayHistogramBySubset(vizObj,"all");
				_canvasSelectionBrushEnd(vizObj, brush);
			})
			.on("brush", function() {
				_canvasSelectionBrushMove(vizObj, brush);
			})

		vizObj.view.svgBase.append("g")
			.attr("class", "brush")
			.call(brush)

		vizObj.view.canvasBrush = brush;

		return vizObj;
	}

	/**
	* Handler for brush end (when button up)
	* @param {Object} vizObj
	* @param {Object} brush
	*/
	function _canvasSelectionBrushEnd(vizObj, brush) {
		if (brush.empty()) {
			esv.clearViewFacade(vizObj);
		}
		else {	
			if (ESV.queries.isQueryAllowed(vizObj)) {	
				var extent = brush.extent();
	 			var facade = _createCanvasFacade(vizObj, extent);
	 			ESV.queries.query(vizObj, facade);
	 		
	 			vizObj.view.svgBase.selectAll(".cell-brushed").attr("cell-facade", facade.id);

	 		}
		}

	}

	/**
	* Handler for brush movement
	* @param {Object} vizObj
	* @param {Object} brush
	*/
	function _canvasSelectionBrushMove(vizObj, brush) {
		if (!brush.empty()) {

			var extent = brush.extent();
			var minX = extent[0][0];
			var minY = extent[0][1];
			var maxX = extent[1][0];
			var maxY = extent[1][1];

			vizObj.view.svg.selectAll(".cell")
				.classed("cell-brushed", function(d) {
					var isXSelect = minX <= d.x && d.x <= maxX;
					var isYSelect = minY <= d.y && d.y <= maxY;
					return isXSelect && isYSelect;
				})

			_selectAllCellByCanvasBrush(vizObj, extent);
			_setBrushOnTopOfDOM(vizObj);
		}
	}	

	/**
	* Removes instance of old brush overlay element
	* @param {Object} vizObj
	*/
	function _removeBrushOnTopOfDOM(vizObj){
		vizObj.view.svgBase.select(".brushOverlay").remove();
	}

	/**
	* Adds brush DOM element on top of scatterplot
	* @param {Object} vizObj
	*/
	function _setBrushOnTopOfDOM(vizObj){

		//Remove instance of brush overlay if it exists
		_removeBrushOnTopOfDOM(vizObj);
		
		var baseSvg = vizObj.view.svgBase.select(".baseSVG").node(); 

		//Copy existing brush node
		var brushBox =  vizObj.view.svgBase.select(".extent"); 
		var brushOverlay = brushBox.node().cloneNode(true);
		brushOverlay.setAttribute("class", "extent brushOverlay");
		
		//Append element to the end of the baseSVG class
		vizObj.view.svgBase.node().appendChild(brushOverlay);
	}

	 /**
	 * Sets tooltip for hover
	 * @param {Object} vizObj
	 * @returns {Object} vizObj - with reference to tooltip
	 */
	 function _setTooltip(vizObj) {
 	 	vizObj.view.gridTip = d3.tip()
			.attr("class", "d3-tip")
			.offset([-10,0])
			.html(function(d) {
				var numDigits = vizObj.view.config.roundPrecision;
				return "ID: <strong>" + d.id + "</strong>\
			<br/>" + vizObj.view.xAxisField.label + ": <strong>" + ESV.viewlibs.roundFloat(d.x, numDigits) + "</strong>\
			<br/>" + vizObj.view.yAxisField.label + ": <strong>" + ESV.viewlibs.roundFloat(d.y, numDigits) + "</strong><br>"
			});
		vizObj.view.svgBase.call(vizObj.view.gridTip);

		return vizObj;

	 }

	/**
	 * Handles highlighting of the hovered cell
	 * @param {Object} vizObj
	 * @param {Object} context - D3 hover context
	 * @param {Object} data - Data behind the hovered component
	 */
	 function _highlightCell(vizObj, data, context) { 
	 	d3.selectAll(".id-" + data.id).classed("cell-hover", true);
	 	vizObj.view.gridTip.show(data, d3.select(context).node());
	 }


	/**
	 * Handles mouseout of the hovered cell grid
	 * @param {Object} context - D3 mouseout context
	 */
	 function _unhighlightCell(vizObj, data) {
	 	d3.selectAll(".id-" + data.id).classed("cell-hover", false);
	 	vizObj.view.gridTip.hide();
	 }

	/**
	* Handles selection of cells by selection brush
	* @param {Object} vizObj
	* @param {Array} extent
	*/
	 function _selectAllCellByCanvasBrush(vizObj, extent) {

	 	vizObj.view.svgBase.selectAll(".cell")
	 		  .classed("cell-inactive", true);

	 	vizObj.view.svgBase.selectAll(".cell-brushed")
	 		.classed("cell-brushed", false)
	 		.classed("cell-active", true)
	 		.classed("cell-inactive", false)

	 }


	/**
	* Creates facade for selection brush
	* @param {Object} vizObj
	* @param {Array} extent
	* @returns {Object} facade
	*/
	function _createCanvasFacade(vizObj, extent) {
		var facadeID = ESV.generateID();
		var dataTypes = ESV.getUnderlyingDataTypes(vizObj.id);

		var fields = {};
		fields[vizObj.view.xAxis] = {
			"label": vizObj.view.xAxisField.label,
			"dataSourceType": dataTypes.join(),
			"fieldValues": [extent[0][0], extent[1][0]],
			"isRange": true
		}

		fields[vizObj.view.yAxis] = {
			"label": vizObj.view.yAxisField.label,
			"dataSourceType": dataTypes.join(),
			"fieldValues": [extent[0][1], extent[1][1]],
			"isRange": true
		}
		return {
			id: facadeID,
			"viewID": vizObj.id,
			"fields": fields
		}

	}

	/**
	* Deselects all cells
	* @param {Object} vizObj
	*/
	function _deselectAllCell(vizObj) {
		vizObj.view.svg.selectAll(".cell")
			  .classed("cell-active", false)
			  .classed("cell-inactive", false)
			  .attr("cell-facade", null)
	}

	/**
	* Plots the legend onto the view
	* @param {Object} vizObj
	* @returns {Object} vizObj
	*/
	function _setLegend(vizObj) {
		// Only need legend if subsetting exists
		if (vizObj.view.measure !== "none") {

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

			// Title
			legendContainer.append("text")
						   .attr("x", 0)
						   .attr("y", dim.legendSubsetTitleY)
						   .attr("text-anchor", "start")
						   .text(vizObj.view.measureField.label)

			// Square
			for (var i = 0; i < vizObj.data.subsetNames.length; i++) {
				var subset = vizObj.data.subsetNames[i];
				var subsetColor = vizObj.view.subsetColorMap[subset];
				var yPos = dim.legendSubsetStartY + (i * (dim.legendSquareSize + dim.legendSquareSpacing));

				legendContainer.append("rect")
							   .attr("class", "legend subset-" + subset)
							   .attr("id", subset)
							   .attr("x", 0)
							   .attr("y", yPos)
							   .attr("width", dim.legendSquareSize)
							   .attr("height", dim.legendSquareSize)
							   .attr("fill", subsetColor)
							   .on("mouseover", function(d) { 
							   		_highlightSubset(vizObj, this);
							   		})
							   .on("mouseout", function(d) { 
							   		_unhighlightSubset(vizObj);
							   		})
							   .on("click", function(d) {
							   		_clickSubset(vizObj, this); })

				legendContainer.append("text")
							   .attr("class", "legend subset-" + subset)
	 						   .attr("id", subset)
							   .attr("x", dim.legendSquareTextX)
							   .attr("y", yPos)
							   .attr("text-anchor", "start")
							   .attr("dominant-baseline", "hanging")
							   .text(subset)
							   .on("mouseover", function(d) { _highlightSubset(vizObj, this); })
							   .on("mouseout", function(d) { _unhighlightSubset(vizObj);})
							   .on("click", function(d) { _clickSubset(vizObj, this); })
			}

			vizObj.view.svgLegend = legendContainer;
		}
		return vizObj
	}

	/**
	 * Handles highlighting of the hovered subset square on legend (affecting cells)
	 * @param {Object} vizObj
	 * @param {Object} context - D3 hover context
	 */
	 function _highlightSubset(vizObj, context) {
	 	if(!_hasFacade(vizObj)){
	 		_displayHistogramBySubset(vizObj,d3.select(context).attr("id"));
		 	var subset = d3.select(context).attr("id");

		 	vizObj.view.svgBase.selectAll(".cell")
		 		  .classed("subset-unhover", true);

		 	vizObj.view.svgBase.selectAll(".subset-" + subset)
		 		  .classed("subset-unhover", false)
		 		  .classed("subset-hover", true);

			_bringSubsetToFront(vizObj, subset);
		}
		
	 }

	/**
	* Brings subset of points to the front of the scatterplot
	* @param {Object} vizObj
	* @param {String} subset - name of the subset
	*/
	 function _bringSubsetToFront(vizObj, subset){	
	 	var subsetSlection = vizObj.view.svgBase.select(".subset_"+subset).node();
	 	subsetSlection.parentNode.appendChild(subsetSlection);
	 }
	/**
	 * Handles mouseout of the hovered subset square on legend (affecting cells)
	 * @param {Object} vizObj
	 * @param {Object} context - D3 hover context
	 */
	 function _unhighlightSubset(vizObj) { 
	 	
		vizObj.view.svgBase.selectAll(".cell")
	 		  .classed("subset-unhover", false)
	 		  .classed("subset-hover", false);

		vizObj.view.svgBase.selectAll(".subset-hover")
	 		  .classed("subset-unhover", false)
	 		  .classed("subset-hover", false);

	 	if (!_hasFacade(vizObj)){
	 		_displayHistogramBySubset(vizObj,"all");
	 	}
	 }

	 /**
	 * Handles mouse click on legend subset space
	 * @param {Object} vizObj
	 * @param {Object} context - D3 hover context
	 */
	 function _clickSubset(vizObj, context) {
	 	// if facade exists already, then remove first
	 	if (_hasFacade(vizObj)) {
	 		_displayHistogramBySubset(vizObj,"all");
	 		esv.clearViewFacade(vizObj);
	 		_deselectAllCell(vizObj);
	 	} else {
			
		 	var subset = d3.select(context).attr("id");
			_displayHistogramBySubset(vizObj,subset);

		 	if (d3.select(context).classed("subset-active")) {
		 		var facadeID = d3.select(context).attr("subset-facade");
		 		var facade = ESV.viewlibs.getViewFacadeByID(facadeID);
		 		esv.clearViewFacade(vizObj, facade);

		 	} else {
		 		_selectAllCellBySubset(vizObj, subset);
		 		_bringSubsetToFront(vizObj, subset);
		 	}
	 	}
	 }

	 /**
	 * Determines whether facade has been applied
	 * @param {Object} vizObj
	 * @returns {Bool}
	 */
	 function _hasFacade(vizObj) {
	 	return vizObj.view.svgBase.selectAll(".cell-active").size() !== 0;
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

	/**
	* Handles selection of cells by subset selection
	* @param {Object} vizObj
	* @param {String} subset
	*/
	function _selectAllCellBySubset(vizObj, subset) {
		var facade = _createSubsetFacade(vizObj, subset);

		var facadesToRemove = [];
		ESV.queries.query(vizObj, facade);

	 	vizObj.view.svgBase.selectAll(".cell")
	 		  .classed("cell-inactive", true);

	 	vizObj.view.svgBase.selectAll(".subset-" + subset)
	 		.classed("cell-active", true)
	 		.classed("cell-inactive", false)
	 		.attr("cell-facade", facade.id)

		_updateLegendSubsetSelect(vizObj, subset, facade.id);
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
	return esv;
}(ESV.scatterplot || {}));