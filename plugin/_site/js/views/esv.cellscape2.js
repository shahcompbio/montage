 /**
 * Cellscape/Timescape Plugin
 * The plugin integrates the original Cellscape and Timescape applications developed
 * by Maia Smith into the visualization platform, the Javascript portion of the code
 * has been used largely unmodified while the data transformation steps port
 * the logic/functionality of the R component of the original application
 */

ESV.cellscape2 = (function (esv) {
	// === PROPERTIES ===

	// --- Global View Properties ---

	// --- Define Fields ---

	esv.fields = {};

	for (var dataType in CONFIG.editor) {
		if (CONFIG.editor[dataType].hasOwnProperty("cellscape2")) {
			$.extend(true, esv.fields, CONFIG.editor[dataType]["cellscape2"]["fields"]);
		}
	}

	// --- Private Module Properties ---
	var defaults = {
		margin: { top: 24, right: 24, bottom: 24, left: 24, x: 2, y: 2 },
		padding: { top: 12, right: 12, bottom: 12, left: 12, general: 5 },
		gridWidth: 7,
		gridHeight: 8,
		width: 870,
		height: 900,

		// General Settings
		maxQuerySize: 50000,

		heatmap: {
			rowHeight: 7,
			indicatorWidth: 13
		},

		chromAxis: {
			height: 10
		},

		genome: {
			height: 300,
			backgroundColors: ["#fefefe", "#eee"],
			scaleDomain: [-0.5, 8],
			axisDomain: [0,1,2,3,4,5,6,7],
			barHeight: 3,
			segmentColor: "#000000"
		},

		legend: {
			squareSize: 10,
			squareSpacing: 5,
			textOffset: 5,
			titleHeight: 10
		},

		minimap: {
			rowHeight: 2
		},


		rightColumn: {
			width: 100
		},

		dropdownMenu:{
			y: 5,
			height: 50,
			width: 100,
			top:20
		},

		roundPrecision: 2,

		// Settings - probably want to move to universal view file later
		colors: ["#2e7aab", "#73a9d4", "#D6D5D5", "#fec28b", "#fd8b3a", "#ca632c", "#954c25"],
		copyNumbers: [0,1,2,3,4,5,6],
		states: [1,2,3,4,5,6,7],
		heatmapIntensityText: "integer_median",
		genomeBinText: "integer_copy_scale",
		inactiveMenuItemsClass: ["menu-Clear","menu-PDF"],
		
	};
	var config = {}


	/////////////////////////////////////////////////////////////
    ///////////////// PUBLIC METHODS ////////////////////////////
    /////////////////////////////////////////////////////////////

	/**
	 * Performs initialization of this module
	 * @param {Object} options - Any properties that should override the default properties
	 */
	esv.init = function(options) { 
		// Gets the vizObj and appends properties specific to the view to it
		var vizObj = ESV.nodes[options.vizID];
		config = $.extend(true, {}, defaults, options);

		vizObj.view = {};

		vizObj.view.width = config.width;
		vizObj.view.height = config.height;
		vizObj.view.config = config;
		vizObj.viewType = "cellscape2";

		ESV.nodes[vizObj.id] = vizObj;

		// Renders the base HTML for the histogram and applies it to the grid
		var viewHTML = '<div class="cellscape2-wrapper" id="viz-' + vizObj.id + '"></div>';

		ESV.initBaseView(vizObj, viewHTML, config.gridWidth, config.gridHeight);

		// Updates the view
		ESV.cellscape2.update(vizObj);


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

		//Update plot title
		ESV.viewlibs.setPlotTitle(vizObj);
		
		if (dataTypes.length > 1) {
			ESV.errorView(vizObj, "Only one dataset is allowed");
			return;
		}


		var baseQuery = {
			"size": vizObj.view.config.maxQuerySize,
			"fields": [ESV.mappings.singleCellID],
			"sort": [{
				"all_heatmap_order": {
					"unmapped_type": "long"
				}
			}]
		}

		var queries = ESV.queries.addQueryFiltersAndRanges(queryTrees, baseQuery, viewFacades);
		vizObj.view.queryFilters = _getSegFilters(queries[0].query.filtered.filter.bool.must);
		// Add exists query
		queries[0].query.filtered.filter.bool.must.push({"exists": {"field": "all_heatmap_order"}});


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
 
		// First Stage
		_processQCCellList(vizObj);
		_initializeData(vizObj);

		// Start Second stage
		_drawInitView(vizObj);

		
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

	/////////////////////////////////////////////////////////////
    ///////////////// PRIVATE METHODS ///////////////////////////
    /////////////////////////////////////////////////////////////


    /*************************************************************
    * ////////////////////////////////////////////////////////////
    * ////////////////////////////////////////////////////////////
    * QC List Processing
    * ////////////////////////////////////////////////////////////
    * ////////////////////////////////////////////////////////////
    */

    /**
     * Processes QC cell list and pulls chromosome data from segments
     * If no cells in QC list, will also pull cell list from segment data
     * @param {Object} vizObj
     */
    function _processQCCellList(vizObj) {
    	vizObj.data = {};
    	_parseQCCellList(vizObj);

    	var segmentQuery = _getSegmentAggregationsQuery(vizObj);
		_addChromosomeRangesQuery(vizObj, segmentQuery)


    	if (vizObj.data.cells.length === 0) {
			_addCellCountQuery(vizObj, segmentQuery);
    	}

		ESV.queries.makeSimpleQuery(segmentQuery, vizObj.searchIndex, false, function(response) {
			_parseChromRanges(vizObj, response.aggregations["chrom_ranges"]);
			if (vizObj.data.cells.length === 0) {
				_parseSegCellList(vizObj, response.aggregations["cell_list"]);
			}
		})
    }



    /*************************************************************
    * ////////////////////////////////////////////////////////////
    * ////////////////////////////////////////////////////////////
    * Initialize all data structures 
    * ////////////////////////////////////////////////////////////
    * ////////////////////////////////////////////////////////////
    */
    /**
     * Initializes configuration and data structures for plots
     * @param {Object} vizObj
     */
     function _initializeData(vizObj) {
     	_setConfig(vizObj);

     	_setChromosomeBoxes(vizObj);
     	_setInitPlotData(vizObj);
     	_initializeMinimapData(vizObj);

     	_setScales(vizObj);
     }


     /**
     * Sets configuration for view components
     * @param {Object} vizObj
     */
     function _setConfig(vizObj) {
		var dim = vizObj.view.config;

		dim.leftColumn = {};
		dim.leftColumn.width = dim.width - dim.rightColumn.width - dim.margin.left - dim.margin.right - dim.padding.left;
		dim.leftColumn.height = dim.height - dim.margin.top - dim.margin.bottom - (2 * dim.padding.general);
		
		dim.heatmap.box = {};
		dim.heatmap.box.x = dim.margin.left;
		dim.heatmap.box.y = dim.margin.top;
		dim.heatmap.box.width = dim.leftColumn.width;
		dim.heatmap.box.height = dim.leftColumn.height - dim.chromAxis.height - dim.genome.height;

		dim.heatmap.x = dim.heatmap.indicatorWidth;
		dim.heatmap.y = 0;
		dim.heatmap.width = dim.heatmap.box.width - dim.heatmap.x;
		dim.heatmap.height = dim.heatmap.box.height;
		dim.heatmap.numRows = Math.min(vizObj.data.cells.length, Math.floor(dim.heatmap.box.height / dim.heatmap.rowHeight)); 

		dim.chromAxis.x = dim.heatmap.box.x + dim.heatmap.indicatorWidth;
		dim.chromAxis.y = dim.heatmap.box.y + dim.heatmap.box.height + dim.padding.general;
		dim.chromAxis.width = dim.heatmap.width;

		dim.genome.x = dim.heatmap.box.x + dim.heatmap.indicatorWidth;
		dim.genome.y = dim.chromAxis.y + dim.chromAxis.height + dim.padding.general;
		dim.genome.width = dim.heatmap.width;

		dim.cellCount = {};
		dim.cellCount.x = dim.genome.x;

		dim.dropdownMenu.x = dim.width - dim.padding.right - dim.padding.general;

		dim.legend.x = dim.width - dim.rightColumn.width + dim.padding.left;
		dim.legend.y = dim.margin.top;
		dim.legend.offsetY = dim.legend.titleHeight + dim.padding.general;
		dim.legend.height = dim.legend.offsetY + (dim.copyNumbers.length * (dim.legend.squareSize + dim.legend.squareSpacing));
		dim.legend.width = dim.rightColumn.width;
		dim.legend.textX = dim.legend.squareSize + dim.legend.textOffset;

		dim.minimap.x = dim.width - dim.rightColumn.width + dim.padding.left;
		dim.minimap.y = dim.legend.y + dim.legend.height + dim.padding.top;
		dim.minimap.height = dim.heatmap.box.height - dim.minimap.y + dim.heatmap.box.y;
		dim.minimap.width = dim.rightColumn.width;

		_setBPRatios(vizObj);
     }

	    /*************************************************************
	    * ////////////////////////////////////////////////////////////
	    * Plot and Minimap
	    * ////////////////////////////////////////////////////////////
	    */

 	/**
	* Sets the base pair per pixel ratio for plot and minimap
	* @param {Object} vizObj
	*/
	function _setBPRatios(vizObj) {

		var chromosomes = vizObj.data.chromosomes;
		var totalChromLength = 0;
		for (var i = 0; i < chromosomes.length; i++) {
			var chrom = chromosomes[i];
			var chromLength = chrom.end - chrom.start + 1;
			totalChromLength += chromLength;
		}

		plotPixelCount = vizObj.view.config.heatmap.width;
		vizObj.view.config.plotBPRatio = Math.ceil(totalChromLength / plotPixelCount);

		minimapPixelCount = vizObj.view.config.minimap.width;
		vizObj.view.config.minimapBPRatio = Math.ceil(totalChromLength / minimapPixelCount)
	}


	/**
	* Sets the width and x pixels for each chromosome boxes (plot and minimap)
	* @param {Object} vizObj
	*/
	function _setChromosomeBoxes(vizObj) {
		var plotBPRatio = vizObj.view.config.plotBPRatio;
		var curX = 0;
		var minimapBPRatio = vizObj.view.config.minimapBPRatio;
		var curMiniX = 0;
		var chromosomeBoxes = {};

		for (var i = 0; i < vizObj.data.chromosomes.length; i++) {
			var chrom = vizObj.data.chromosomes[i];

			var chromNumber = chrom["chrom"]

			var curWidth = Math.floor((chrom.end - chrom.start + 1) / plotBPRatio);
			var curMiniWidth = Math.floor((chrom.end - chrom.start + 1) / minimapBPRatio);

			chromosomeBoxes[chromNumber] = {
				"chrom": chromNumber,
				"x": curX,
				"width": curWidth,
				"miniX": curMiniX,
				"miniWidth": curMiniWidth
			}
			curX += curWidth;
			curMiniX += curMiniWidth;
		}
		vizObj.view.config.minimap.brushWidth = curMiniX;
		vizObj.view.chromosomeBoxes = chromosomeBoxes;
	}



	    /*************************************************************
	    * ////////////////////////////////////////////////////////////
	    * Plot
	    * ////////////////////////////////////////////////////////////
	    */

	/**
	* Initializes data structure for genome and heatmap plots
	* @param {Object} vizObj
	*/
	function _setInitPlotData(vizObj) {
		var cells = vizObj.data.cells;

		var cellData = {};
		for (var i = 0; i < cells.length; i++) {
			var cell = cells[i];
			cellData[cell] = {
				id: cell
			};
		}

		vizObj.view.plotCells = cellData;
	}


	    /*************************************************************
	    * ////////////////////////////////////////////////////////////
	    * Minimap
	    * ////////////////////////////////////////////////////////////
	    */
    /**
    * Initialize data structure for minimap
    * @param {Object} vizObj
    */
	function _initializeMinimapData(vizObj) {
		_setMinimapCellRatio(vizObj);

		_setInitMinimapData(vizObj);
	}

	/**
	* Sets the base pair per pixel ratio for minimap
	* @param {Object} vizObj
	*/
	function _setMinimapCellRatio(vizObj) {
	   	var totalCells = vizObj.data.cells.length;
		var numRows = Math.min(totalCells, Math.floor(vizObj.view.config.minimap.height / vizObj.view.config.minimap.rowHeight));
		var cellRatio = Math.ceil(totalCells / numRows);

		vizObj.view.config.minimap.cellRatio = cellRatio;
	}


	/**
	* Sets minimap cell list and initialize data structure for minimap
	* @param {Object} vizObj
	*/
	function _setInitMinimapData(vizObj) {
    	var minimapCells = []
    	var minimapData = {}
    	var rowNum = 0;
    	for (var i = 0; i < vizObj.data.cells.length; i++) {
    		if (i % vizObj.view.config.minimap.cellRatio === 0) {
    			var cell = vizObj.data.cells[i];
				minimapCells.push(cell);

				minimapData[cell] = {
					id: cell,
					y: rowNum * vizObj.view.config.minimap.rowHeight
				}
				rowNum += 1;

    		}
    	}

    	vizObj.data.minimapCells = minimapCells;
    	vizObj.view.minimapCells = minimapData;
	}



    /*************************************************************
    * ////////////////////////////////////////////////////////////
    * ////////////////////////////////////////////////////////////
    * Draw all static structures, determine what heatmap data we need 
    * ////////////////////////////////////////////////////////////
    * ////////////////////////////////////////////////////////////
    */

    /**
    * Calls all methods that create/draw cellscape elements (i.e heatmap, minimap or buttons)
    * @param {Object} - vizObj
    */
    function _drawInitView(vizObj) {
    	_setBaseView(vizObj); 
    	_queryAndDrawMinimap(vizObj);
    	_drawChromAxis(vizObj);
    	_drawGenomeInit(vizObj);
    	_drawLegend(vizObj);
    	_drawCellCount(vizObj);
    	_drawDropdownMenu(vizObj);
    }

    /**
    * Creates/sets all main svg/div/button elements
    * @param {Object} - vizObj
    */
    function _setBaseView(vizObj) {
    	var dim = vizObj.view.config;

    	if (!vizObj.view.hasOwnProperty("svg")) {
    		vizObj.view.svg = {};

			var dropdownMenuDIV = d3.select("#container-" + vizObj.id).select(".dropdownMenu");

			var dropdownMenuButton = dropdownMenuDIV.append("button")
										.attr("type","button")
										.attr("class","fa fa-ellipsis-v dropdown-toggle")
										.attr("id","cellscapeDropdownMenu-"+vizObj.id)
										.attr("data-toggle","dropdown");

			var main = d3.select("#viz-" + vizObj.id)
						.append("svg:svg")
						.attr("class", "baseSVG");
			
			var heatmapSVG = main.append("svg:svg")
									   .attr("class", "heatmapSVG");

			var genomeDIV = d3.select("#viz-" + vizObj.id)
								.append("div")
								.attr("class", "genomeDIV"); 

			var genomeSVG = genomeDIV.append("svg:svg")
								.attr("class", "genomeSVG");

			var chromSVG = main.append("svg:svg")
							.attr("class", "chromSVG")

			var legendSVG = main.append("svg:svg")
							.attr("class", "legendSVG")

			var minimapDIV = d3.select("#viz-" + vizObj.id)
								.append("div")
								.attr("class", "minimapDIV");

    	}
		else {
			_removePreviousContent(vizObj);
			var main = d3.select("#viz-" + vizObj.id).select(".baseSVG");
			var heatmapSVG = d3.select("#viz-" + vizObj.id).select(".heatmapSVG");
			var genomeDIV = d3.select("#viz-" + vizObj.id).select(".genomeDIV");
			var genomeSVG = d3.select("#viz-" + vizObj.id).select(".genomeSVG");
			var chromSVG = d3.select("#viz-" + vizObj.id).select(".chromSVG");
			var dropdownMenuDIV = d3.select("#container-" + vizObj.id).select(".dropdownMenu");
			var dropdownMenuButton = dropdownMenuDIV.select(".fa")
			var legendSVG = d3.select("#viz-" + vizObj.id).select(".legendSVG");
			var minimapDIV = d3.select("#viz-" + vizObj.id).select(".minimapDIV");
		}
		main.attr("width", dim.width)
			.attr("height", dim.height);

   		heatmapSVG.attr("width", dim.heatmap.box.width)
   				  .attr("height", dim.heatmap.box.height)
   				  .attr("x", dim.heatmap.box.x)
   				  .attr("y", dim.heatmap.box.y);


   		chromSVG.attr("x", dim.chromAxis.x)
   				.attr("y", dim.chromAxis.y)
   				.attr("width", dim.chromAxis.width)
   				.attr("height", dim.chromAxis.height)


		genomeDIV.style("width", dim.genome.width + "px")
   				.style("height", dim.genome.height + "px")
   				.style("top", dim.genome.y + "px")
   				.style("left", dim.genome.x + "px")

   		genomeSVG.attr("width", dim.genome.width)
   				.attr("height", dim.genome.height)
   				.style("position", "absolute");

   		var genomeCanvas = genomeDIV.append("canvas")
   							.attr("width", dim.genome.width)
   							.attr("height", dim.genome.height)
   							.style("position", "absolute")
			   				.style("left", 0)
			   				.style("top", 0);

		dropdownMenuDIV.attr("width", dim.dropdownMenu.width)
					   .attr("height", dim.dropdownMenu.height) 
					   .style("top", dim.dropdownMenu.y+"px")
					   .style("left",dim.dropdownMenu.x+"px");

		legendSVG.attr("width", dim.legend.width)
				.attr("height", dim.legend.height)
				.attr("x", dim.legend.x)
				.attr("y", dim.legend.y)

		minimapDIV.style("width", dim.minimap.width + "px")
   				.style("height", dim.minimap.height + "px")
   				.style("top", dim.minimap.y + "px")
   				.style("left", dim.minimap.x + "px")


  		var minimapCanvas = minimapDIV.append("canvas")
   							.attr("width", dim.minimap.width)
   							.attr("height", dim.minimap.height)
   							.style("position", "absolute")
   							.style("pointer-events", "none")
			   				.style("left", 0)
			   				.style("top", 0);

		var minimapSVG = minimapDIV.append("svg:svg")
							.attr("class", "minimapSVG")

   		minimapSVG.attr("width", dim.minimap.width)
   				.attr("height", dim.minimap.height)
   				.style("position", "absolute");


   		vizObj.view.svg.mainSVG = main;
		vizObj.view.svg.heatmapSVG = heatmapSVG;
		vizObj.view.svg.chromSVG = chromSVG;
		vizObj.view.svg.genomeDIV = genomeDIV;
		vizObj.view.svg.genomeSVG = genomeSVG;
		vizObj.view.svg.genomeCanvas = genomeCanvas;
		vizObj.view.svg.dropdownMenuDIV = dropdownMenuDIV;
		vizObj.view.svg.dropdownMenuButton = dropdownMenuButton;
		vizObj.view.svg.legendSVG = legendSVG;
		vizObj.view.svg.minimapDIV = minimapSVG;
		vizObj.view.svg.minimapSVG = minimapSVG;
		vizObj.view.svg.minimapCanvas = minimapCanvas;

    }

	/**
	* Clears previous content from view
	* @param {Object} vizObj
	*/
	function _removePreviousContent(vizObj) {
		vizObj.view.svg.chromSVG.selectAll(".chrom-axis-box").remove();
		vizObj.view.svg.chromSVG.selectAll(".chrom-axis").remove();

		vizObj.view.svg.genomeCanvas.node().remove();
		vizObj.view.svg.genomeSVG.selectAll(".gw-background").remove();
		vizObj.view.svg.mainSVG.selectAll(".genome-y-axis").remove();

		vizObj.view.svg.mainSVG.selectAll(".cell-count").remove();

		vizObj.view.svg.minimapCanvas.node().remove();
		vizObj.view.svg.minimapSVG.selectAll(".brush").remove();
		vizObj.view.svg.minimapDIV.selectAll(".minimapSVG").remove();

		vizObj.view.svg.dropdownMenuDIV.select(".dropdown-menu").remove();

		vizObj.view.svg.legendSVG.selectAll(".legend").remove();

		_removeHeatmapContent(vizObj);

	}


    /**
    * Removes current heatmap content
    * @param {Object} vizObj
    */
    function _removeHeatmapContent(vizObj) {
    	vizObj.view.svg.heatmapSVG.selectAll(".hm-indicators").remove();
    	vizObj.view.svg.heatmapSVG.selectAll(".hm-cells").remove();
    }

	    /*************************************************************
	    * ////////////////////////////////////////////////////////////
	    * ////////////////////////////////////////////////////////////
	    * Chromosome Axis
	    * ////////////////////////////////////////////////////////////
	    * ////////////////////////////////////////////////////////////
	    */


	/**
	* Add chromosome axis to SVG
	* @param {Object} vizObj
	*/
    function _drawChromAxis(vizObj) {
		var dim = vizObj.view.config;
		var chromosomes = vizObj.data.chromosomes;

		var chromContainer = vizObj.view.svg.chromSVG.append("g")
			.attr("class", "chrom-axis")

		for (var i = 0; i < chromosomes.length; i++) {
			var chromosome = chromosomes[i].chrom;
			var chromBox = vizObj.view.chromosomeBoxes[chromosome];

			chromContainer.append("rect")
						.attr("class", "chrom-axis-box chrom-" + chromBox.chrom)
						.attr("x", chromBox.x)
						.attr("y", 0)
						.attr("width", chromBox.width)
						.attr("height", dim.chromAxis.height)

			chromContainer.append("text")
						.attr("class", "chrom-axis-box chrom-" + chromBox.chrom)
						.attr("x", chromBox.x + (chromBox.width / 2))
						.attr("y", 0)
						.attr("text-anchor", "middle")
						.attr("dominant-baseline", "hanging")
						.text(chromBox.chrom)

		}
    }

	    /*************************************************************
	    * ////////////////////////////////////////////////////////////
	    * ////////////////////////////////////////////////////////////
	    * Genome
	    * ////////////////////////////////////////////////////////////
	    * ////////////////////////////////////////////////////////////
	    */

	/**
	* Plots inital genome wide plot onto SVG
	* @param {Object} vizObj
	*/
    function _drawGenomeInit(vizObj) {

    	_drawGenomeBackground(vizObj);
    	_drawGenomeYAxisLines(vizObj)
		_drawGenomeYAxis(vizObj);
    }

    /**
    * Plots background chromosome boxes on genome plot
    * @param {Object} vizObj
    */
    function _drawGenomeBackground(vizObj) {
		var dim = vizObj.view.config;
		var chromosomes = vizObj.data.chromosomes;

		vizObj.view.svg.genomeSVG.append("g")
			.attr("class", "gw-background")
			.selectAll(".gw-background-box")
			.data(chromosomes)
			.enter()
			.append("rect")
			.attr("class", function(d) {
				return "gw-background-box chrom-" + d.chrom;
			})
			.attr("x", function(d) {
				return vizObj.view.chromosomeBoxes[d.chrom].x;
			})
			.attr("y", 0)
			.attr("width", function(d) {
				return vizObj.view.chromosomeBoxes[d.chrom].width;
			})
			.attr("height", dim.genome.height)
			.attr("fill", function(d, i) {
				return dim.genome.backgroundColors[i % 2];
			})
    }

    /**
    * Plots dotted lines across the genome plot for axis
    * @param {Object} vizObj
    */
    function _drawGenomeYAxisLines(vizObj) {
		var dim = vizObj.view.config;
		var chromosomes = vizObj.data.chromosomes;

		vizObj.view.svg.genomeSVG.append("g")
			.attr("class", "gw-background-lines")
			.selectAll(".gw-background-line")
			.data(dim.genome.axisDomain)
			.enter()
			.append("line")
			.attr("x1",0)
			.attr("x2", dim.genome.width)
			.attr("y1", function(d) {
				return vizObj.view.scales.genomeY(d)
			})
			.attr("y2", function(d) {
				return vizObj.view.scales.genomeY(d)
			})
    }

	/**
	* Adds y axis for genome wide plot
	* @param {Object} vizObj
	*/
	function _drawGenomeYAxis(vizObj) {
		var dim = vizObj.view.config;
		var yAxis = d3.svg.axis()
						.scale(vizObj.view.scales.genomeY)
						.orient("left")

		vizObj.view.svg.mainSVG.append("g")
			.attr("class", "genome-y-axis")
			.attr("transform", "translate(" + (dim.genome.x - 2) + ", " + dim.genome.y + ")")
			.call(yAxis);
	}

	/**
	* Adds the cell count at bottom of panel
	*/
	function _drawCellCount(vizObj) {
		var dim = vizObj.view.config;

		vizObj.view.svg.mainSVG.append("text")
			.attr("class", "cell-count")
			.attr("x", dim.cellCount.x)
			.attr("y", dim.height)
			.attr("text-anchor", "middle")
			.text("n = " + vizObj.data.cells.length)
	}

	/***
	*Draw drop down menu and coresponding buttons 
	* @param {Object} vizObj
	*/
	function _drawDropdownMenu(vizObj){
		var dropdownMenu =	 vizObj.view.svg.dropdownMenuDIV.append("ul")
								.attr("class","dropdownMenuContent dropdown-menu")
								.attr("role","menu")
								.attr("aria-labelledby","cellscapeDropdownMenu-"+vizObj.id)
								.style("left", -vizObj.view.config.dropdownMenu.width+"px")
								.style("top",vizObj.view.config.dropdownMenu.top+"px");
		vizObj.view.svg.dropdownMenu = dropdownMenu;
		//Append options to drop down menu 
		_addActionToDropdownMenu("CSV", "Export CSV", _clickExportButton,vizObj);
		_addActionToDropdownMenu("PDF", "Export PDF",_clickSegmentPlotExportButton,vizObj);
		_addActionToDropdownMenu("Clear", "Clear",_clickClearButton,vizObj);
		
		vizObj.view.svg.dropdownMenuButton.on("click", function(){ _clickDropdownMenu(vizObj); });
	}

	/**
	*If no cells are selected 
	*@param {Object} vizObj
	*/
	function _clickDropdownMenu(vizObj){
		var dim = vizObj.view.config;
		//If no cells are selected disable export PDF option
		if(vizObj.view.hasOwnProperty("savedCells") && vizObj.view.savedCells.length > 0){
			var isInactiveLink = false;
		}else{
			var isInactiveLink = true;
		}
		
		for(var i=0; i< dim.inactiveMenuItemsClass.length;i++){
			vizObj.view.svg.dropdownMenu.selectAll('a.'+dim.inactiveMenuItemsClass[i])
				.classed("inactiveLink",isInactiveLink);
		}
	}

	/**
	*Appends actions to the drop down menu
	*@param {String} classed 
	*@param {String} type - text
	*@param {Object} clickFunction - what happens when you click on this option
	*@param {Object} vizObj 
	*/
	function _addActionToDropdownMenu(classed,type,clickFunction,vizObj){
		vizObj.view.svg.dropdownMenu.append("li").append("a")
			.text(type)
			.attr("role","menuitem")
			.attr("class","menu-"+classed)
			.on("click",function() {
			   	clickFunction(vizObj);
			 });
	}
	    /*************************************************************
	    * ////////////////////////////////////////////////////////////
	    * ////////////////////////////////////////////////////////////
	    * Action Buttons
	    * ////////////////////////////////////////////////////////////
	    * ////////////////////////////////////////////////////////////
	    */

	/**
	* Click handler for export button. Generates CSV file of all SC IDs in heatmap
	* @param {Object} vizObj
	*/
	function _clickExportButton(vizObj) {
		var csvContent = _createCSVContent(vizObj)

		csvContent = 'data:text/csv;charset=utf-8,' + csvContent;

		var data = encodeURI(csvContent);

		var link = document.createElement("a")
		link.href = data;
		link.target = "_blank"
		link.download = vizObj.sampleIDs[0] + "_" + Math.floor(Date.now() / 1000) + ".csv"
		document.body.appendChild(link)
		link.click();
		document.body.removeChild(link);
		
	}

    /**
    * Returns CSV content with saved cells or all cells 
    * @param {Object} - vizObj
    */
	function _createCSVContent(vizObj) {
		var cellIDs;

		if (vizObj.view.hasOwnProperty("savedCells") && vizObj.view.savedCells.length > 0) {
			cellIDs = vizObj.view.savedCells
		} else {
			cellIDs = vizObj.data.cells
		}

		var cellData = ["cell_id,all_heatmap_order"];
		for (var i = 0; i < cellIDs.length; i++) {
			var cellID = cellIDs[i]
			cellData.push(cellID + ',' + vizObj.data.cells.indexOf(cellIDs[i]))
		}

		var csvContent = cellData.join("\n");

		return csvContent
	}

	/**
	* Click handler for clear all button. Clears all saved cells
	* @param {Object} vizObj
	*/
	function _clickClearButton(vizObj) {
		_unsetActiveCellRow(vizObj)
		_removeAllSavedCells(vizObj)

	}
	/**
	* Click handler to export bin/seg data from selected cells
	* @param {Object} vizObj
	*/
	function _clickSegmentPlotExportButton(vizObj){
		//Append canvas list and backgrounds to a pdf
		var finalPDF = _createSegementPlotPDF(vizObj);
		//Save the pdf
		if (finalPDF != undefined){
			finalPDF.save("SegmentPlot_"+vizObj.sampleIDs+".pdf");
		}
	}

	/**
	* Constructs a PDF of copy number profiles from selected cells 
	* @param {Object} vizObj
	**/
	function _createSegementPlotPDF(vizObj){
		//Create a list of canvases with plot data from selected cells
		var segmentPlotCanvasList = _getSegementPlotDataFromSelectedCells(vizObj);
		
		if (segmentPlotCanvasList != undefined){
			var backgroundCanvas = segmentPlotCanvasList[0].cloneNode(false);
			var finalSegementPlotCanvas = segmentPlotCanvasList[0].cloneNode(false); 
			var finalSegementPlotContext = finalSegementPlotCanvas.getContext('2d');

			//Add all background and axis elements to the canvas 
			_appendSegementPlotElementsToCanvas(backgroundCanvas, vizObj);
			
			//X and Y offsets to account for x/y axis  
			var xAxisOffset = vizObj.view.svg.mainSVG.select(".genome-y-axis")[0][0].getBBox().width;
			var yAxisOffset = vizObj.view.config.chromAxis.height;
			finalSegementPlotCanvas.height += yAxisOffset;
			finalSegementPlotCanvas.width += xAxisOffset;

			var pdf = new jsPDF();

			//For each selected cell add copy number profile onto a canvas with background and labeled axis
			for (var i = 0; i < segmentPlotCanvasList.length; i++){
				finalSegementPlotContext.fillStyle="#FFFFFF";
				finalSegementPlotContext.clearRect(0, 0, finalSegementPlotCanvas.width, finalSegementPlotCanvas.height);
				
				//Add a page for every 4th chart
				var pageMultiple = ( i ) % 3;
				if (pageMultiple == 0 && i != 0){
					pdf.addPage();
				}
				var pdfPageYPosition = pageMultiple * 95 + 10;

				//Draw the background and the segment plot onto one canvas 
				finalSegementPlotContext.drawImage(backgroundCanvas,0 ,0);
				finalSegementPlotContext.drawImage(segmentPlotCanvasList[i], xAxisOffset, yAxisOffset);
				
				//Convert the final canvas into a PNG
				var finalCopyNumberProfilePNG = finalSegementPlotCanvas.toDataURL("image/png");
				pdf.addImage(finalCopyNumberProfilePNG, 10, pdfPageYPosition);

				}

			return pdf;
		}
	}

	/**
	* Add segment plot background and axis elements to canvas 
	* @param {Object} segmentPlotCanvas - a canvas of a copy number profile
	* @param {Object} vizObj
	*/
	function _appendSegementPlotElementsToCanvas(segmentPlotCanvas, vizObj){
		//Increase height and width of the final canvas to include axis elements
		var xAxisOffset = vizObj.view.svg.mainSVG.select(".genome-y-axis")[0][0].getBBox().width;
		var yAxisOffset = vizObj.view.config.chromAxis.height;
		segmentPlotCanvas.height += yAxisOffset;
		segmentPlotCanvas.width += xAxisOffset;
		
		//Clear anything that may have been on the canvas 
		segmentPlotCanvas.getContext('2d').clearRect(0, 0, segmentPlotCanvas.width, segmentPlotCanvas.height);

		//Append all backgroundand axis elements to the canvas 
		_addChromAxisToCanvas(segmentPlotCanvas, vizObj);
		_addSegementPlotYAxisToCanvas(segmentPlotCanvas,vizObj);
		_addSegementPlotBackgroundToCanvas(segmentPlotCanvas, vizObj);
		_addSegementPlotLinesToCanvas(segmentPlotCanvas,vizObj);
	}

	/**
	* Add copy number y axis to canvas 
	* @param {Object} layer - a canvas layer
	* @param {Object} vizObj
	*/
	function _addSegementPlotYAxisToCanvas(layer,vizObj){
		var context = layer.getContext("2d");
		var dim = vizObj.view.config;

		var height = dim.genome.height;
		var width = dim.genome.width;

		//Increase canvas width to account for y axis
		var yAxisWidth = vizObj.view.svg.mainSVG.select(".genome-y-axis")[0][0].getBBox().width;
		layer.attributes.width += width;

		var yAxisOffset = vizObj.view.config.chromAxis.height;
		var yAxisScale = vizObj.view.scales.genomeY.ticks();
		var yAxisHTMLString  ="";
		var axisInterval = height/(Math.abs(vizObj.view.scales.genomeY.domain()[0])+Math.abs(vizObj.view.scales.genomeY.domain()[1]));
		
		for (var x=0; x < yAxisScale.length; x++){
			var yPosition = axisInterval*x + yAxisOffset;
			var xPosition = dim.genome.axisDomain.length - yAxisScale[x];

			//Add the ticks on the x axis
			context.beginPath();
			context.setLineDash([]);
			context.moveTo(8, yPosition);
			context.lineTo(yAxisWidth-1, yPosition);
			context.strokeStyle = "#000000";
			context.lineWidth = 0.5; 
			context.stroke();

		//Append each y axis interval to the final html string
		yAxisHTMLString += "<text y=\""+ yPosition +"\"  x=\"0\">"+ xPosition +"<\/text>";
		}

		yAxisHTMLString = "<svg x=\"0\" y=\"0\" height=\""+height+"\" width=\""+width+"\">"+ yAxisHTMLString + "</svg>"; 

		//Draw vertical line for increased user readability 
		context.setLineDash([]);
		context.moveTo(yAxisWidth-1, 0);
		context.lineTo(yAxisWidth-1, height);
		context.strokeStyle = "#000000";
		context.lineWidth = 0.5; 
		context.stroke();

		//Append Y axis onto canvas
		context.drawSvg(yAxisHTMLString, 0 ,0);

	}
	/**
	* Append copy number dashed lines to canvas
	* @param {Object} layer - a canvas layer
	* @param {Object} vizObj
	*/
	function _addSegementPlotLinesToCanvas(layer,vizObj){
		var context = layer.getContext("2d");
		var dim = vizObj.view.config;

		var yAxisOffset = dim.chromAxis.height;
		var xAxisOffset = vizObj.view.svg.mainSVG.select(".genome-y-axis")[0][0].getBBox().width;

		var scale = vizObj.view.scales.genomeY.ticks();
		var axisInterval = dim.genome.height/(Math.abs(vizObj.view.scales.genomeY.domain()[0])+Math.abs(vizObj.view.scales.genomeY.domain()[1]));
		for (var x=0; x < scale.length; x++){
			var yPosition = axisInterval*x + yAxisOffset;
			var x2Position = dim.genome.width+xAxisOffset;

			context.beginPath();
			context.setLineDash([1,3]);
			context.moveTo(xAxisOffset, yPosition);
			context.lineTo(x2Position, yPosition);
			context.strokeStyle = "#000000";
			context.lineWidth = 1; 
			context.stroke();
		}
	}
	
	/**
	* Append copy number x axis to canvas
	* @param {Object} layer - a canvas layer
	* @param {Object} vizObj
	*/
	function _addChromAxisToCanvas(layer,vizObj){
		var context = layer.getContext("2d");
		var chromosomes = vizObj.data.chromosomes;
		var xAxisOffset = vizObj.view.svg.mainSVG.select(".genome-y-axis")[0][0].getBBox().width;

		var dim = vizObj.view.config;

		var chromAxisHTMLString  = "";
		//For each chromosome append a matching text element to the final html string 
		for (var i = 0; i < chromosomes.length; i++) {
			var chromosome = chromosomes[i].chrom;
			var chromBox = vizObj.view.chromosomeBoxes[chromosome];
			var xPosition = chromBox.x + (chromBox.width / 2);
			var chromosomeClass = chromosome != "X" || chromosome != "Y" ?('0' + chromosome).slice(-2) : chromosome;

			chromAxisHTMLString += "<text class=\"chrom-axis-box chrom-"+chromosomeClass+"\" y=\"0\" x=\""+xPosition+"\" "+
			"text-anchor=\"middle\" dominant-baseline=\"hanging\">"+chromosome+"<\/text>";
		}

		//Surround chromosome text elements in an svg tag
		chromAxisHTMLString = "<svg class=\"chromSVG\" x=\""+dim.chromAxis.x+"\" y=\""+dim.chromAxis.y+"\" height=\""+
			+dim.chromAxis.height+"\" width=\""+dim.chromAxis.width+"\">"+ chromAxisHTMLString + "</svg>"; 

		//Append chrom axis to the canvas 
		context.drawSvg(chromAxisHTMLString, xAxisOffset, 0);
	}

	/**
	* Append copy number grey and white background to canvas
	* @param {Object} layer - a canvas layer
	* @param {Object} vizObj
	*/
	function _addSegementPlotBackgroundToCanvas(layer,vizObj){
		var context = layer.getContext("2d");
		var xAxisOffset = vizObj.view.svg.mainSVG.select(".genome-y-axis")[0][0].getBBox().width;
		var yAxisOffset = vizObj.view.config.chromAxis.height;
		//Append background to the canvas 
		context.drawSvg(vizObj.view.svg.genomeSVG.node().outerHTML, xAxisOffset, yAxisOffset);
	}

	/**
	* Create a list of copy number canvas profiles 
	* @param {Object} layer - a canvas layer
	* @param {Object} vizObj
	*/
	function _getSegementPlotDataFromSelectedCells(vizObj) {
		var cellIDs;
		var listOfSelectedCanvases = [];
		var titleHeight = 10;

		if (vizObj.view.hasOwnProperty("savedCells") && vizObj.view.savedCells.length > 0) {
			cellIDs = vizObj.view.savedCells
		}else{
			return;
		}

		for (var i = 0; i < cellIDs.length; i++){		
			//clone the copy number canvas node 
			var canvas = vizObj.view.svg.genomeCanvas.node().cloneNode(false);
			var context = canvas.getContext("2d");
			canvas.height += titleHeight;
			//Clear the canvas incase there was anything on it
			context.clearRect(0, 0, canvas.width, canvas.height);

			var cellID = cellIDs[i];
			var cellData = vizObj.view.plotCells[cellID];

			if (!cellData.hasOwnProperty("bins")) {
				_getBinData(vizObj, cellID);
			}

			//Append seg and bin data to canvas
			_drawGenomeRowBins(vizObj, cellData.bins, context);
			_drawGenomeRowSegs(vizObj, cellData.segs, context);

			//Add the title to each plot
			var genomeNameXPosition = canvas.width/2 - 70 ;
			var genomeNameYPosition = canvas.height - titleHeight;

			context.fillStyle = 'white';
			context.fillRect(0, genomeNameYPosition, canvas.width, titleHeight);
			context.font = "11px Arial";
			context.fillStyle = 'black';
			context.fillText(cellData.id, genomeNameXPosition, canvas.height);

			//Append canvas to list of canvases
			listOfSelectedCanvases[i] = canvas;
		}
		return listOfSelectedCanvases;
	}

	    /*************************************************************
	    * ////////////////////////////////////////////////////////////
	    * ////////////////////////////////////////////////////////////
	    * Legend
	    * ////////////////////////////////////////////////////////////
	    * ////////////////////////////////////////////////////////////
	    */

	/**
	* Plots the legend onto the view
	* @param {Object} vizObj
	*/
    function _drawLegend(vizObj) {
		var dim = vizObj.view.config;

		var legendSVG = vizObj.view.svg.legendSVG;

		// Title
		legendSVG.append("text")
			   .attr("class", "legend title")
			   .attr("x", 0)
			   .attr("y", dim.legend.titleHeight)
			   .attr("text-anchor", "start")
			   .text("Copy Number")

		// Square
		for (var i = 0; i < dim.copyNumbers.length; i++) {
			var copyNumber = dim.copyNumbers[i];
			var color = dim.colors[i];
			var yPos = dim.legend.offsetY + (i * (dim.legend.squareSize + dim.legend.squareSpacing));


			legendSVG.append("rect")
						   .attr("class", "legend")
						   .attr("x", 0)
						   .attr("y", yPos)
						   .attr("width", dim.legend.squareSize)
						   .attr("height", dim.legend.squareSize)
						   .attr("fill", color)

			legendSVG.append("text")
						   .attr("class", "legend")
						   .attr("x", dim.legend.textX)
						   .attr("y", yPos)
						   .attr("text-anchor", "start")
						   .attr("dominant-baseline", "hanging")
						   .text(function(d) {
						   		if (copyNumber === 6) {
						   			return ">= 6";
						   		}
						   		return copyNumber;
						   })
		}
    }


	    /*************************************************************
	    * ////////////////////////////////////////////////////////////
	    * ////////////////////////////////////////////////////////////
	    * Minimap
	    * ////////////////////////////////////////////////////////////
	    * ////////////////////////////////////////////////////////////
	    */

	/**
	* Queries for minimap data and draws
	* @param {Object} vizObj
	*/ 
    function _queryAndDrawMinimap(vizObj) {

    	// get list of single cells we need data for

    	var query = _getSegmentRecordQuery(vizObj);
    	_addQueryCellFilter(query, vizObj.data.minimapCells);
    	// query
		ESV.queries.makeSimpleQuery(query, vizObj.searchIndex, true, function(response) {
			_parseMinimapData(vizObj, response);
			_parseHeatmapData(vizObj, response);

			_drawMinimap(vizObj);
		})

    }



    /**
    * Draws minimap onto SVG
    * @param {Object} vizObj
    */
    function _drawMinimap(vizObj) {
		var canvasCtx = vizObj.view.svg.minimapCanvas.node().getContext("2d")

    	for (var cell in vizObj.view.minimapCells) {
    		var cellData = vizObj.view.minimapCells[cell];

    		_drawMinimapRow(vizObj, canvasCtx, cellData);
    	}
		_setMinimapBrush(vizObj);

    }


    /**
    * Draws minimap row onto canvas
    * @param {Object} vizObj
    * @param {Object} context
    * @param {Object} data - for cell row
    */
    function _drawMinimapRow(vizObj, context, data) {
    	var segs = data.segs;
    	for (var i = 0; i < segs.length; i++) {
    		var record = segs[i];

    		context.fillStyle = record.color;
    		context.fillRect(record.x, data.y, record.width, vizObj.view.config.minimap.rowHeight);
    	}
    }

    /*************************************************************
    * ////////////////////////////////////////////////////////////
    * ////////////////////////////////////////////////////////////
    * Interactions with minimap to populate seg (drawing heatmap)
    * ////////////////////////////////////////////////////////////
    * ////////////////////////////////////////////////////////////
    */
	    /*************************************************************
	    * ////////////////////////////////////////////////////////////
	    * ////////////////////////////////////////////////////////////
	    * Minimap Brush
	    * ////////////////////////////////////////////////////////////
	    * ////////////////////////////////////////////////////////////
	    */

    /**
    * Set minimap brush
    * @param {Object} vizObj
    */
    function _setMinimapBrush(vizObj) {
    	var dim = vizObj.view.config;
    	var brush = d3.svg.brush()
    					.y(vizObj.view.scales.minimapToHeatmap)
    					.extent([0, dim.heatmap.numRows - 1])
    					.on("brushend", function() {
    						_updateHeatmapWindowByMinimap(vizObj, brush)
    					});

    	var gBrush = vizObj.view.svg.minimapSVG.append("g")
    			.attr("class", "brush")
    			.call(brush)

    	gBrush.selectAll("rect")
    		.attr("width", dim.minimap.brushWidth)

    	// disable resize ability
    	gBrush.selectAll(".resize").remove()
    	gBrush.selectAll(".background")
    		.on("mousedown.brush", function() {
    			_moveMinimapWindow(vizObj, gBrush, brush)
    		})

    	// show extent
		gBrush.call(brush.event)
    }

    /**
    * Moves minimap window on mouse click
    * @param {Object} vizObj
    * @param {Object} gBrush
    * @param {Object} brush
    */
    function _moveMinimapWindow(vizObj, gBrush, brush) {
    	var yPos = d3.mouse(d3.event.target)[1];
    	var minExtent = Math.min(vizObj.view.scales.minimapToHeatmap.invert(yPos), vizObj.data.cells.length - vizObj.view.config.heatmap.numRows - 1);
    	var maxExtent = minExtent + vizObj.view.config.heatmap.numRows;
    	d3.event.stopPropagation();

    	// set new brush extent and show
   		gBrush.call(brush.extent([minExtent, maxExtent]))
    	gBrush.call(brush.event)

    }
    /**
    * Updates heatmap according to window on minimap
    * @param {Object} vizObj
    * @param {Object} brush
    */
    function _updateHeatmapWindowByMinimap(vizObj, brush) {
    	var minIndex = Math.floor(brush.extent()[0]);
    	var maxIndex = Math.floor(brush.extent()[1]);

    	var cellList = [];
    	for (var i = minIndex; i <= maxIndex; i++) {
    		cellList.push(vizObj.data.cells[i]);
    	}

    	_setHeatmapContent(vizObj, cellList);
    }


	    /*************************************************************
	    * ////////////////////////////////////////////////////////////
	    * ////////////////////////////////////////////////////////////
	    * Heatmap
	    * ////////////////////////////////////////////////////////////
	    * ////////////////////////////////////////////////////////////
	    */

    /**
    * Populates heatmap with data according to cells, grabbing data if necessary
    * @param {Object} vizObj
    * @param {Array} cells
    */
    function _setHeatmapContent(vizObj, cells) {

    	_setHeatmapYDomain(vizObj, cells);

    	_queryMissingData(vizObj, cells);

    	_drawHeatmap(vizObj, cells);

    }

    /**
    * Determines which cells are missing seg data and queries
    * @param {Object} vizObj
    * @param {Array} cells
    */
    function _queryMissingData(vizObj, cells) {
    	// filter out all cells that already have seg data
    	var missingCells = [];

    	for (var i = 0; i < cells.length; i++) {
    		if (!vizObj.view.plotCells[cells[i]].hasOwnProperty("segs")) {
    			missingCells.push(cells[i])
    		}
    	}

    	if (missingCells.length > 0) {
    		var query = _getSegmentRecordQuery(vizObj);
    		_addQueryCellFilter(query, missingCells);

    		ESV.queries.makeSimpleQuery(query, vizObj.searchIndex, false, function(response) {
    			_parseHeatmapData(vizObj, response);
    		})
    	}
    }

    /**
    * Populates heatmap with cell data
    * @param {Object} vizObj
    * @param {Array} cells
    */
    function _drawHeatmap(vizObj, cells) {
    	_removeHeatmapContent(vizObj);

    	_drawHeatmapIndicators(vizObj, cells);
    	_drawHeatmapRows(vizObj, cells);

		// redraw saved cells state
		_drawSavedCells(vizObj)

		// Tooltips
	   _drawTooltips(vizObj);
    }

    /**
    * Plots indicators for each cell onto heatmap
    * @param {Object} vizObj
    * @param {Array} cells
    */
    function _drawHeatmapIndicators(vizObj, cells) {
 		var dim = vizObj.view.config;

		// indicators
		vizObj.view.svg.heatmapSVG.append("g")
			.attr("class", "hm-indicators")
			.selectAll(".hm-indicator")
			.data(cells)
			.enter()
			.append("rect")
			.attr("class", function(d) {
				return "hm-indicator id-" + d;
			})
			.attr("x", 0)
			.attr("y", function(d) {
				return vizObj.view.scales.heatmapY(d)
			})
			.attr("width", dim.heatmap.indicatorWidth)
			.attr("height", dim.heatmap.rowHeight)
    }

    /**
    * Draws all records for each cells
    * @param {Object} vizObj
    * @param {Array} cells
    */
    function _drawHeatmapRows(vizObj, cells) {
		var dim = vizObj.view.config;

		vizObj.view.svg.heatmapSVG.selectAll("hm-cells")
			.data(cells)
			.enter()
			.append("g")
			.attr("class", function(d) {
				return "hm-cells id-" + d;
			})
			.on("mouseover", function(d) {
			  	_mouseoverHMRow(vizObj, d, this)
			})
			.on("mouseout", function(d) {
				_mouseoutHMRow(vizObj, d);
			})
		    .on("click", function(d) {
				_clickHMRow(vizObj, d, this);
			})

		// content
		for (var i = 0; i < cells.length; i++) {
			var curID = cells[i];
			var curY = vizObj.view.scales.heatmapY(curID)

			var curSegs = vizObj.view.plotCells[curID].segs;
			var cellContainer = vizObj.view.svg.heatmapSVG.select(".hm-cells.id-" + curID);

			cellContainer.selectAll(".hm-cell.id-" + curID)
				  .data(curSegs)
				  .enter()
				  .append("rect")
				  .attr("class", "hm-cell id-" + curID)
				  .attr("x", function(d) {
				  	return dim.heatmap.x + d.x;
				  })
				  .attr("y", curY)
				  .attr("width", function(d) {
				  	return d.width;
				  })
				  .attr("height", dim.heatmap.rowHeight)
				  .attr("fill", function(d) {
				  	return d.color;
				  })
		}
    }


   /**
    * Updates classes of cells in saved state
    * @param {Object} vizObj
    */
    function _drawSavedCells(vizObj) {
    	d3.selectAll(".id-" + vizObj.view.activeCell).classed("cell-active", true);

    	var savedCells = vizObj.view.savedCells;
    	if (savedCells) { // TODO: this is here because it isn't initialized at the beginning. Maybe fix that? Super grumble
	    	for (var i = 0; i < savedCells.length; i++) {
	    		d3.selectAll(".id-" + savedCells[i]).classed("cell-saved", true)
	    	}
	    }
    }


   	/**
	 * Adds tooltips to heatmap
	 * @param {Object} vizObj
	 */
	 function _drawTooltips(vizObj) {
		// single cell node tip
		vizObj.nodeTip = d3.tip()
		    	    .attr('class', 'd3-tip')
		    	    .offset([-10, 0])
		    	    .html(function(d) {
		    	        return "<strong>Cell:</strong> <span style='color:white'>" +
		    	            d + "</span>";
		    	    });
		vizObj.view.svg.heatmapSVG.call(vizObj.nodeTip);
	}

    /*************************************************************
    * ////////////////////////////////////////////////////////////
    * ////////////////////////////////////////////////////////////
    * Interactions with heatmap to populate bin (drawing genome)
    * ////////////////////////////////////////////////////////////
    * ////////////////////////////////////////////////////////////
    */
	    /*************************************************************
	    * ////////////////////////////////////////////////////////////
	    * ////////////////////////////////////////////////////////////
	    * Heatmap
	    * ////////////////////////////////////////////////////////////
	    * ////////////////////////////////////////////////////////////
	    */

	/**
	* Event handler for mouse over on heatmap row
	* @param {Object} vizObj
	* @param {Object} data
	* @param {Object} context
	*/
	function _mouseoverHMRow(vizObj, data, context) {

		var indicator = vizObj.view.svg.heatmapSVG.select(".hm-indicator.id-" + data);
		vizObj.nodeTip.show(data, indicator.node());

		if (_hasActiveCell(vizObj)) {
			_removeGenomeRow(vizObj)
		}

		_setGenomeRow(vizObj, data);

		d3.selectAll(".id-" + data).classed("cell-hover", true)
	}

	/**
	* Event handler for mouse out on heatmap row
	* @param {Object} vizObj
	* @param {String} scID
	*/
	function _mouseoutHMRow(vizObj, scID) {

		vizObj.nodeTip.hide();

		d3.selectAll(".id-" + scID).classed("cell-hover", false)

		_removeGenomeRow(vizObj)
		if (_hasActiveCell(vizObj)) {
			_setGenomeRow(vizObj, vizObj.view.activeCell)
		}
	}


	    /*************************************************************
	    * ////////////////////////////////////////////////////////////
	    * ////////////////////////////////////////////////////////////
	    * Genome
	    * ////////////////////////////////////////////////////////////
	    * ////////////////////////////////////////////////////////////
	    */

	/**
	* Plots genome wide plot for specific cell
	* @param {Object} vizObj
	* @param {String} scID
	*/
	function _setGenomeRow(vizObj, scID) {

		var cellData = vizObj.view.plotCells[scID];
		if (!cellData.hasOwnProperty("bins")) {
			_getBinData(vizObj, scID);
		}

		_drawGenomeRowBins(vizObj, cellData.bins);
		_drawGenomeRowSegs(vizObj, cellData.segs);

		_drawGenomeRowName(vizObj, scID);

	}

	/**
	* Queries and processes bin data for single cell
	* @param {Object} vizObj
	* @param {String} scID
	*/
	function _getBinData(vizObj, scID) {
		var query = _getBinDataQuery(vizObj);
		_addQueryCellFilter(query, [scID]);

		ESV.queries.makeSimpleQuery(query, vizObj.searchIndex, false, function(response) {
			_parseBinData(vizObj, response, scID)

		})
	}


	/**
	* Plots the genome wide plot bin data for specific cell
	* @param {Object} vizObj
	* @param {Array} bins
	*/
	function _drawGenomeRowBins(vizObj, bins, canvasCtx) {
		var dim = vizObj.view.config;
		if (!canvasCtx){
			var offset = 0;
			canvasCtx = vizObj.view.svg.genomeCanvas.node().getContext("2d");
		}

		for (var i = 0; i < bins.length; i++) {
			var bin = bins[i];

			canvasCtx.fillStyle = bin.color;
			canvasCtx.beginPath();
			canvasCtx.arc(bin.x, bin.genomeY, bin.width, 0, 2*Math.PI, false)
			canvasCtx.fill();
		}
	}

	/**
	* Plots the genome wide plot segment data for specific cell
	* @param {Object} vizObj
	* @param {Array} segData
	*/
	function _drawGenomeRowSegs(vizObj, segData, canvasCtx) {
		var dim = vizObj.view.config;
		if (!canvasCtx){
			canvasCtx = vizObj.view.svg.genomeCanvas.node().getContext("2d");
		}
		for (var i = 0; i < segData.length; i++) {
			var segment = segData[i];

			canvasCtx.fillStyle = dim.genome.segmentColor;
			canvasCtx.fillRect(segment.x, segment.genomeY, segment.width, dim.genome.barHeight)
		}
	}

	/**
	* Adds cell ID of genome row being displayed
	* @param {Object} vizObj
	* @param {String} scID
	*/
	function _drawGenomeRowName(vizObj, scID) {
		var dim = vizObj.view.config;

		vizObj.view.svg.mainSVG.append("text")
			.attr("class", "genome-name")
			.attr("x", dim.genome.x + (dim.genome.width / 2))
			.attr("y", dim.height)
			.attr("text-anchor", "middle")
			.text(scID)
	}

	/**
	* Removes the genome wide segment plot
	* @param {Object} vizObj
	*/
	function _removeGenomeRow(vizObj) {
		var dim = vizObj.view.config;
		var canvasCtx = vizObj.view.svg.genomeCanvas.node().getContext("2d")
		canvasCtx.clearRect(0, 0, dim.genome.width, dim.genome.height);

		vizObj.view.svg.mainSVG.selectAll(".genome-name").remove();
	}

    /*************************************************************
    * ////////////////////////////////////////////////////////////
    * ////////////////////////////////////////////////////////////
    * Interactions with heatmap to save all selected cells
    * ////////////////////////////////////////////////////////////
    * ////////////////////////////////////////////////////////////
    */

	/**
	 * Handles clicking of a row
	 * @param {Object} vizObj
	 * @param {Object} data - Data behind the selected component
	 * @param {Object} context - D3 selection context
	 */
	function _clickHMRow(vizObj, data, context) {

		var rowSegment = d3.select(context);

		if (rowSegment.classed("cell-saved")) {
			_unsaveCellRow(vizObj, data)
			_unsetActiveCellRowIfMatch(vizObj, data)
		}
		else {
			_saveCellRow(vizObj, data)
			_setActiveCellRow(vizObj, data)

		}
	}


	/**
	* Saves cell row in set of selected cells
	* @param {Object} vizObj
	* @param {String} scID
	*/
	function _saveCellRow(vizObj, scID) {
		d3.selectAll(".id-" + scID).classed("cell-saved", true);

		_addCellRowToSavedCells(vizObj, scID)


	}

	/**
	* Adds cell row in set of selected cells
	* @param {Object} vizObj
	* @param {String} scID
	*/
	function _addCellRowToSavedCells(vizObj, scID) {
		if (!vizObj.view.hasOwnProperty("savedCells")) {
			vizObj.view.savedCells = []
		}
		vizObj.view.savedCells.push(scID)
	}


	/**
	* Removes cell row in set of selected cells
	* @param {Object} vizObj
	* @param {String} scID
	*/
	function _unsaveCellRow(vizObj, scID) {
		d3.selectAll(".id-" + scID).classed("cell-saved", false);
		
		_removeCellRowFromSavedCells(vizObj, scID)
	}


	/**
	* Removes cell row in set of selected cells
	* @param {Object} vizObj
	* @param {String} scID
	*/
	function _removeCellRowFromSavedCells(vizObj, scID) {
		var savedCells = vizObj.view.savedCells
		var i = savedCells.indexOf(scID)

		if (i > -1) {
			savedCells.splice(i, 1)
			vizObj.view.savedCells = savedCells
		}
	}


	/**
	* Removes all cell rows from saved cells
	* @param {Object} vizObj
	* @param {String} scID
	*/
	function _removeAllSavedCells(vizObj) {
		d3.selectAll(".cell-saved").classed("cell-saved", false);
		vizObj.view.savedCells = []
	}



    /*************************************************************
    * ////////////////////////////////////////////////////////////
    * ////////////////////////////////////////////////////////////
    * Interactions with heatmap to set active cell (one at a time)
    * ////////////////////////////////////////////////////////////
    * ////////////////////////////////////////////////////////////
    */


	/**
	* Stores cell ID as new active row
	* @param {Object} vizObj
	* @param {String} scID
	*/
	function _setActiveCellRow(vizObj, scID) {
		_unsetActiveCellRow(vizObj)
		d3.selectAll(".id-" + scID).classed("cell-active", true);
		vizObj.view.activeCell = scID;
	}


	/**
	* Removes current active row
	* @param {Object} vizObj
	*/
	function _unsetActiveCellRow(vizObj) {
		if (_hasActiveCell(vizObj)) {
			var oldCellID = vizObj.view.activeCell;
			d3.selectAll(".id-" + oldCellID).classed("cell-active", false);
		}
		vizObj.view.activeCell = null;
	}


	function _unsetActiveCellRowIfMatch(vizObj, scID) {
		if (_hasActiveCell(vizObj) && vizObj.view.activeCell === scID) {
			_unsetActiveCellRow(vizObj)
		}
	}


	/**
	* Determines whether there is any saved state
	* @param {Object} vizObj
	*/
	function _hasActiveCell(vizObj) {
		return vizObj.view.hasOwnProperty("activeCell") && vizObj.view.activeCell !== null
	}


    /*************************************************************
    * ////////////////////////////////////////////////////////////
    * ////////////////////////////////////////////////////////////
    * Queries
    * ////////////////////////////////////////////////////////////
    * ////////////////////////////////////////////////////////////
    */

    /**
    * Processes the data filters to apply to segment data
    * @param {Array} filters
    * @return {Array} segFilters
    */
    function _getSegFilters(filters) {
    	var segFilters = []
    	for (var i = 0; i < filters.length; i++) {
    		var filter = filters[i];
    		for (key in filter) {
    			// Sample ID or Caller (remove)
    			if (filter[key].hasOwnProperty(ESV.mappings.dataType) || filter[key].hasOwnProperty(ESV.mappings.sampleID)) {
    				
    			}

    			// Facades (bool, should, bool, must...), then process each one
    			else if (key == "bool") {
    				var facadeShoulds = filter.bool.should

    				$.map(facadeShoulds, function(facadeShould) {
    					var facadeMusts = facadeShould.bool.must;

    					var processedFacadeMusts = $.map(facadeMusts, function(facadeMust) {

							return _convertToEvents(facadeMust);

    					})
    				})
    			}

    			// else is data filter
    			else {
    				var eventFilter = _convertToEvents(filter);
    				segFilters.push(eventFilter);
    			}
    		}
    	}

    	var nestedFilters = {
    		"nested": {
    			"path": "events",
    			"filter": {
    				"bool": {
    					"must": segFilters
    				}
    			}
    		}
    	}

    	return nestedFilters

    }

    /**
    * Converts QC filter into events filter
    * @param {Object} filter
    * @param {Object} newFilter
    */
    function _convertToEvents(filter) {
		var newFilter = {};
		for (key in filter) {
			newFilter[key] = {};
			var fieldNames = filter[key];

			for (field in fieldNames) {
				newFilter[key]["events." + field] = fieldNames[field];
			}

		}
		return newFilter
    }


    /**
    * Returns query to get segment aggregations
    * @param {Object} vizObj
    * @returns {Object} query
    */
    function _getSegmentAggregationsQuery(vizObj) {
    	var query = {
			"size": 0,
			"aggs": {},
			"query": {
				"filtered": {
					"filter": {
						"bool": {
							"must": [
								{
									"terms": {
										"caller": [
											"single_cell_hmmcopy_seg"
										]
									}
								},
								{
									"terms": {
										"sample_id": vizObj.sampleIDs
									}
								}
							]
						}
					}
				}
			}
		}
		//query.query.filtered.filter.bool.must.push(vizObj.view.queryFilters)
		// NOTE: Removing this will cause errors when applying facades onto
		// heatmaps without any ordering

		return query;
    }

	/**
	* Adds aggregation to get all cell IDs into query
	* @param {Object} vizObj
	* @param {Object} query
	*/
	function _addCellCountQuery(vizObj, query) {
		query.aggs["cell_list"] = {
			"terms": {
				"field": ESV.mappings.singleCellID,
				"size": vizObj.view.config.maxQuerySize
			}
		}
	}

	/**
	* Adds aggregation to get min start and max end of every chromosome into query
	* @param {Object} vizObj
	* @param {Object} query
	*/
	function _addChromosomeRangesQuery(vizObj, query) {
		query.aggs["chrom_ranges"] = {
			"terms": {
				"field": ESV.mappings.chrom,
				"size": vizObj.view.config.maxQuerySize,
				"order": {
					"_term": "asc"
				}
			},
			"aggs": {
				"XMax": {
					"max": {
						"field": ESV.mappings.endPos
					}
				},
				"XMin": {
					"min": {
						"field": ESV.mappings.startPos
					}
				}
			}
		}
	}


    /**
    * Returns query to get segment records
    * @param {Object} vizObj
    * @returns {Object} query
    */
    function _getSegmentRecordQuery(vizObj) {
    	var query = {
			"size": vizObj.view.config.maxQuerySize,
			"fields": [
				ESV.mappings.singleCellID,
				ESV.mappings.startPos,
				ESV.mappings.endPos,
				ESV.mappings.chrom,
				ESV.mappings.singleCellState,
				vizObj.view.config.heatmapIntensityText
			],
			"query": {
				"filtered": {
					"filter": {
						"bool": {
							"must": [
								{
									"terms": {
										"caller": [
											"single_cell_hmmcopy_seg"
										]
									}
								}
							]
						}
					}
				}
			}
    	}

    	return query;
    }

    /**
    * Adds filter to query that select cells in cell list
    * @param {Object} query
    * @param {Array} cells
    */
    function _addQueryCellFilter(query, cells) {
    	// TODO: Ideally, we would like to call ESV.queries.addQueryFiltersAndRanges to account for chromosome range filters
    	// but it needs queryTrees
    	var terms = {
    		"terms": {}
    	};
    	terms.terms[ESV.mappings.singleCellID] = cells;

    	query.query.filtered.filter.bool.must.push(terms);
    }

	/**
	* Returns query for bin data
	* @param {Object} vizObj
	*/
	function _getBinDataQuery(vizObj) {
		var query = {
			"size": vizObj.view.config.maxQuerySize,
			"fields": [
				ESV.mappings.singleCellID,
				ESV.mappings.startPos,
				ESV.mappings.endPos,
				ESV.mappings.chrom,
				vizObj.view.config.genomeBinText,
				ESV.mappings.singleCellState
			],
			"query": {
				"filtered": {
					"filter": {
						"bool": {
							"must": [
								{
									"terms": {
										"caller": [
											"single_cell_hmmcopy_bin"
										]
									}
								}
							]
						}
					}
				}
			}
		}

		return query;
	}

    /*************************************************************
    * ////////////////////////////////////////////////////////////
    * ////////////////////////////////////////////////////////////
    * Processing queried data
    * ////////////////////////////////////////////////////////////
    * ////////////////////////////////////////////////////////////
    */

	/**
    * Parses qc data to get cell list
    * @param {Object} vizObj
    */
    function _parseQCCellList(vizObj) {
    	var qcRaw = vizObj.rawData[0].response.hits.hits;

    	var cellList = $.map(qcRaw, function(record) {
    		return record.fields[ESV.mappings.singleCellID][0];
    	})

    	vizObj.data.cells = cellList;
    }

    /**
    * Parses cell aggregation into sorted cell list
    * @param {Object} vizObj
    * @param {Object} cellAgg
    */
    function _parseSegCellList(vizObj, cellAgg) {
    	var cellBuckets = cellAgg.buckets;

    	var cellList = $.map(cellBuckets, function(bucket) {
    		return bucket.key;
    	})

    	vizObj.data.cells = cellList.sort(); // TODO: Will need to fix sorting to be numerical and not alphabetically (for numbers)
    }


    /**
    * Parses chromosome aggregations into sorted list of chromosome ranges
    * @param {Object} vizObj
    * @param {Object} chromAgg
    */
    function _parseChromRanges(vizObj, chromAgg) {
    	var chromBuckets = chromAgg.buckets;

    	var chromosomes = {};

    	for (var i = 0; i < chromBuckets.length; i++) {
    		var chromBucket = chromBuckets[i];
    		chromosomes[chromBucket.key] = {
    			chrom: chromBucket.key,
    			start: chromBucket.XMin.value,
    			end: chromBucket.XMax.value
    		}
    	}

    	var sortedChroms = $.map(Object.keys(chromosomes).sort(), function(chromNumber) {
    		return chromosomes[chromNumber];
    	})

    	vizObj.data.chromosomes = sortedChroms;
    }

    /**
    * Parses minimap data into data structure
    * @param {Object} vizObj
    * @param {Object} response
    */
    function _parseMinimapData(vizObj, response) {
    	var records = response.hits.hits;

    	for (var i = 0; i < records.length; i++) {
    		var segBox = _processSegmentData(vizObj, records[i], false);

			var cellID = segBox.id;
			var cell = vizObj.view.minimapCells[cellID];

			if (!cell.hasOwnProperty("segs")) {
				cell.segs = [];
			}
			if (segBox.width > 0) {
				cell.segs.push(segBox);
			}

    	}
    }


    /**
    * Parses heatmap data into data structure
    * @param {Object} vizObj
    * @param {Object} response
    */
    function _parseHeatmapData(vizObj, response) {
    	var records = response.hits.hits;

    	for (var i = 0; i < records.length; i++) {
    		var segBox = _processSegmentData(vizObj, records[i], true);

			var cellID = segBox.id;
			var cell = vizObj.view.plotCells[cellID];

			if (!cell.hasOwnProperty("segs")) {
				cell.segs = [];
			}

			// only push if you can actually view it (ie width > 0)
			if (segBox.width > 0) {
				cell.segs.push(segBox);
			}
    	}
    }

    /**
    * Processes a record into appropriate segment data
    * @param {Object} vizObj
    * @param {Object} segment
    * @param {Bool} isHeatmap
    */
    function _processSegmentData(vizObj, segment, isHeatmap) {
    	var bpPixelRatio = isHeatmap ? vizObj.view.config.plotBPRatio : vizObj.view.config.minimapBPRatio;

    	segment = segment.fields;
		for (var key in segment) {
				if ($.isArray(segment[key])) {
				segment[key] = segment[key][0];
			}
		}

		var chromNumber = segment[ESV.mappings.chrom];
		var start = segment[ESV.mappings.startPos];
		var end = segment[ESV.mappings.endPos];
		var chromBoxX = isHeatmap ? vizObj.view.chromosomeBoxes[chromNumber].x : vizObj.view.chromosomeBoxes[chromNumber].miniX;
		var x = Math.floor(start / bpPixelRatio) + chromBoxX;
		var width = Math.floor((end - start + 1) / bpPixelRatio);

		var cellID = segment[ESV.mappings.singleCellID];
		var segBox = {
			id: cellID,
			color: vizObj.view.scales.stateColor(segment[ESV.mappings.singleCellState]),
			x: x,
			width: width
		}

		// Add genome information if it is for heatmap
		if (isHeatmap) {
			segBox.genomeY = vizObj.view.scales.genomeY(segment[vizObj.view.config.heatmapIntensityText])
		}
		return segBox;
    }


    /**
    * Processes bin data
    * @param {Object} vizObj
    * @param {Object} response
    * @param {String} cellID
    */
	function _parseBinData(vizObj, response, cellID) {
		var data = $.map(response.hits.hits, function (record) {
			for (var key in record.fields) {
				if ($.isArray(record.fields[key])) {
					record.fields[key] = record.fields[key][0];
				}
			}
			return record.fields;
		})

		var bpPixelRatio = vizObj.view.config.plotBPRatio;
		var binData = $.map(data, function(bin) {
			if (bin.hasOwnProperty(vizObj.view.config.genomeBinText)) {
				var chromNumber = bin[ESV.mappings.chrom];
				var start = bin[ESV.mappings.startPos];
				var end = bin[ESV.mappings.endPos];

				var x = Math.floor(start / bpPixelRatio) + vizObj.view.chromosomeBoxes[chromNumber].x;
				var width = 1.5//Math.floor((end - start + 1) / bpPixelRatio);

				return {
					id: bin[ESV.mappings.singleCellID],
					x: x,
					width: width,
					genomeY: vizObj.view.scales.genomeY(bin[vizObj.view.config.genomeBinText]),
					color: vizObj.view.scales.stateColor(bin[ESV.mappings.singleCellState])
				}
			}
			else {
				return;
			}

		})
		vizObj.view.plotCells[cellID].bins = binData;

	}

    /*************************************************************
    * ////////////////////////////////////////////////////////////
    * ////////////////////////////////////////////////////////////
    * Scales
    * ////////////////////////////////////////////////////////////
    * ////////////////////////////////////////////////////////////
    */

	/**
	* Sets all scales for view
	* @param {Object} vizObj
	*/
	function _setScales(vizObj) {
		vizObj.view.scales = {};

		_setColorScales(vizObj);

  		_setHeatmapYRange(vizObj);
  		_setGenomeYScale(vizObj);

		_setMinimapToHeatmapScale(vizObj);
	}

	/**
	* Sets color scales (copy number and state)
	* @param {Object} vizObj
	*/
	function _setColorScales(vizObj) {
		var dim = vizObj.view.config;
		vizObj.view.scales.copyNumberColor = d3.scale.ordinal()
											.domain(dim.copyNumbers)
											.range(dim.colors)

		vizObj.view.scales.stateColor = d3.scale.ordinal()
										.domain(dim.states)
										.range(dim.colors)
	}



	/**
	* Sets y scale for genome plot
	* @param {Object} vizObj
	*/
	function _setGenomeYScale(vizObj) {
		var dim = vizObj.view.config;
		vizObj.view.scales.genomeY = d3.scale.linear()
									.domain(dim.genome.scaleDomain)
									.range([dim.genome.height, 0])

	}


	/**
	* Sets scale from minimap y-position to index in vizObj.data.cells
	* @param {Object} vizObj
	*/
	function _setMinimapToHeatmapScale(vizObj) {
		var dim = vizObj.view.config;

		vizObj.view.scales.minimapToHeatmap = d3.scale.linear()
												.domain([0, vizObj.data.cells.length - 1])
												.range([0, dim.minimap.rowHeight * (vizObj.data.minimapCells.length - 1)])

	}

	/**
	* Sets y-position scale for rows in heatmap
	* NOTE: range only. domain is dependent on minimap window
	* @param {Object} vizObj
	*/
	function _setHeatmapYRange(vizObj) {
		var dim = vizObj.view.config;

		var maxHeight = Math.min(dim.heatmap.height, vizObj.data.cells.length * dim.heatmap.rowHeight)
		vizObj.view.scales.heatmapY = d3.scale.ordinal()
										.rangeBands([0, maxHeight])
	}

    /**
    * Sets domain of heatmap y scale with cells
    * @param {Object} vizObj
    * @param {Array} cells
    */
    function _setHeatmapYDomain(vizObj, cells) {
    	vizObj.view.scales.heatmapY.domain(cells);
    }

	return esv;
}(ESV.cellscape2 || {}));

