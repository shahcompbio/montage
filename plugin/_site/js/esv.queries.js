/**
 * Query Engine
 * <br/><br/>
 * This namespace provides auxiliary methods for generating and executing queries, from separate clause segments - filters and ranges -
 * which are translated from individual widget selections/inputs, to entire query trees, which correspond to branches in interconnected plots,
 * as presented in the structure diagram found in the upper left corner of the Montage application. Generated query trees combine clauses that
 * are specified through providing specific inputs in the Create/Edit view panels, as well as applied filters/facades through selection on other,
 * related visualizatoins with intersecting data sets.
 *
 * @author: Tom Jin
 * @namespace ESV.queries
 */

ESV.queries = (function (esv) {

	var config = {
		dataTypeFieldID: "data-all-type"
	};
	
	/**
	 * Checks if a view facade queried is allowed. View facade queries are not allowed if there is an existing view facade applied to another view
	 * @function isQueryAllowed
	 * @param {Object} vizObj - Visualization configuration object
	 * @memberof ESV.queries
	 * @instance
	 */
	esv.isQueryAllowed = function(vizObj) {
		// Check if there's a previous view facade applied
		if (ESV.viewfacades.hasViewFacades()) {
			if (ESV.viewfacades.getViewID() != vizObj.id) {
				ESV.filterAlert();
				return false;
			}
		}
		return true
	}
	
	/**
	 * Builds the query tree and asks the calling view to generate the full query. Updates other views as necessary
	 * @function query
	 * @param {Object} vizObj - Visualization configuration object
	 * @param {Array} viewFacades (optional) - An array of view facades that are currently applied on this view
	 * @param {Boolean} isTriggeredByViewFacade (optional) - true if this view was updated as a view facade was applied (ie. useful if you want to ensure scales don't change when a view facade is applied)
	 * @memberof ESV.queries
	 * @instance
	 */ 
	esv.query = function(vizObj, viewFacades, isTriggeredByViewFacade, executeAllQueries) {
		if (viewFacades != null) {
			if (ESV.properties[vizObj.type].multiViewFacadeSupported) {
			} else {
				ESV.viewfacades.resetViewFacades();
			}
			if ($.isArray(viewFacades)) {
				for (var i = 0; i < viewFacades.length; i++) {
					ESV.viewfacades.addViewFacade(viewFacades[i]);
				}
			} else {
				ESV.viewfacades.addViewFacade(viewFacades);
			}
			ESV.updateViewFacadeIndicator();
			
			// Update other viz except this one
			ESV.updateStaleVisualizations(vizObj.id, true, true);
			return;
		}
		
		var queryTrees = _buildQueryTrees(vizObj);
		ESV[vizObj.type].query(vizObj, queryTrees, viewFacades, isTriggeredByViewFacade, executeAllQueries);
	}
	
	/**
	 * Makes an Ajax call to the server with a given query
	 * @function _makeSimpleQuery
	 * @param {String} query - The formatted query to the server
	 * @param {String} url - The URL to send the query to
	 * @param {Boolean} async - true if this call should be asynchronous
	 * @param {Function} callback - The function to run when the Ajax call returns (errors will not trigger this)
	 * @param {Function} errorCallback - The function to run when the Ajax call returns (errors will not trigger this)
	 * @memberof ESV.queries
	 * @instance
	 * @private
	 */ 
	function _makeSimpleQuery(query, url, async, callback, errorCallback) {
		$.ajax({
			url: url,
			type: "POST",
			crossDomain: true,
			dataType: 'json',
			data: JSON.stringify(query),
			async: async,
			success: function(response) {
				callback(response);
			},
			error: function(err){
				console.log("Error: Problems loading data from server.");
				console.log(err);
				if ($.isFunction(errorCallback)) {
					errorCallback(err);
				}
			}
		});
	}

	esv.makeSimpleQuery = function(query, url, async, callback, errorCallback) {
		if (!url) {
			url = CONFIG.config.URL_COMBINED_INDEX;
		}
		_makeSimpleQuery(query, url, async, callback, errorCallback);
	}

	/**
	 * Makes an Ajax call to the server for an array of query trees
	 * @function makeQueries
	 * @param {Object} vizObj - Visualization configuration object
	 * @param {Array} queryTrees - Each query tree will spawn a new query. The number of query trees correspond to the number of data nodes.
	 * @param {Array} queries - An array of queries that directly maps to each queryTree of the queryTrees array (ie. the first query tree will use the first query in this query array)
	 * @param {String} url (optional) - The URL to send the query to, uses the default index url if it is not passed in
	 * @param {Boolean} isTriggeredByViewFacade (optional) - true if query was needed as a view facade was applied, false by default
	 * @memberof ESV.queries
	 * @instance
	 */ 
	esv.makeQueries = function(vizObj, queryTrees, queries, url, isTriggeredByViewFacade) {
    	var queryURL = url;
    	if (url == null || url == undefined) {
    		queryURL = ESV.config.URL_COMBINED_INDEX;
    	}
    	
    	ESV.nodes[vizObj.id] = vizObj;
    	ESV.nodes[vizObj.id].rawData = [];
    	
		for (var i = 0; i < queries.length; i++) {
			ESV.queries.makeQuery(vizObj, queryTrees[i], queries[i], url, queries.length, isTriggeredByViewFacade);
		}
	}
	
	/**
	 * Makes an individual Ajax call to the server with a given query tree and query
	 * @function makeQuery
	 * @param {Object} vizObj - Visualization configuration object
	 * @param {Array} queryTree - The array of nodes that make up a query tree
	 * @param {Object} query - The query that will be sent to the server for this queryTree
	 * @param {String} url (optional) - The URL to send the query to, uses the default index url if it is not passed in
	 * @param {Number} numTrees (optional) - The total number of query trees that have to be run
	 * @param {Boolean} isTriggeredByViewFacade - true if query was needed as a view facade was applied, false by default
	 * @memberof ESV.queries
	 * @instance
	 */ 
	esv.makeQuery = function(vizObj, queryTree, query, url, numTrees, isTriggeredByViewFacade, deferred) {
		var queryURL = url;
    	if (url == null || url == undefined) {
    		queryURL = ESV.config.URL_COMBINED_INDEX;
    	}

		$.ajax({
			url: queryURL,
			type: "POST",
			crossDomain: true,
			dataType: 'json',
			data: JSON.stringify(query),
			async: true,
			success: function(response) {
				if (deferred) {
					deferred.resolve(response);
				} else {	
					ESV.nodes[vizObj.id].rawData.push({
						queryTree: queryTree,
						response: response
					});
					if (ESV.nodes[vizObj.id].rawData.length == numTrees) {
						ESV[vizObj.type].updateView(ESV.nodes[vizObj.id], isTriggeredByViewFacade);
					}
				}
			},
			error: function(err){
				ESV.errorView(vizObj, "No Data");
				console.log("Error: Problems loading data from server.");
				console.log(err);
			}
		});
	}
	
	/**
	 * Finds the start/end/chrom_number info from the Gene Annotations index for each of the given gene names
	 * @function getGeneInfo
	 * @param {Array} genes - An array of gene names, each of which its start/end/chrom_number will be queried for
	 * @param {Function} callback - The method to run after the Ajax call returns
	 * @memberof ESV.queries
	 * @instance
	 */ 
	esv.getGeneInfo = function(genes, callback) {
		var query = {
			"size": 0,
			"aggs": {
				"geneName": {
					"terms": {
						"field": CONFIG.mappings.geneName
					},
					"aggs": {
						"chrom_number": {
							"terms": {
								"field": ESV.mappings.chrom
							},
							"aggs": {
								"start": {
									"min": {
										"field": ESV.mappings.startPos
									}
								},
								"end": {
									"max": {
										"field": ESV.mappings.endPos
									}
								}
							}
						}
					}
				}
			},
			"query": {
				"filtered": {
					"filter": {
						"bool": {
							"must": [
								{
									"terms": {}
								}
							]
						}
					}
				}
			}
		};
		
		query.query.filtered.filter.bool.must[0].terms[CONFIG.mappings.geneName] = [];

		for (var i = 0; i < genes.length; i++) {
			query.query.filtered.filter.bool.must[0].terms[CONFIG.mappings.geneName].push(genes[i]);
		}
		
		_makeSimpleQuery(query, ESV.config.URL_GENE_ANNOTATIONS, true, function(response) {
			var source = [];
			var buckets = response.aggregations.geneName.buckets;
			if (buckets.length > 0) {
				for (var i = 0; i < buckets.length; i++) {
					var chromBuckets = buckets[i].chrom_number.buckets;
					for (var j = 0; j < chromBuckets.length; j++) {
						var geneObj = {};
						geneObj.name = buckets[i].key;
						geneObj.chrom_number = chromBuckets[j].key;
						geneObj.start = chromBuckets[j].start.value;
						geneObj.end = chromBuckets[j].end.value;
						source.push(geneObj);
					}
				}
			}
			callback(source);
		});
	}
	


	// ===== General Query Builders =====
	
	/**
	 * Makes the query trees (external hookin)
	 * @function buildQueryTrees
	 * @param {Object} vizObj - Visualization configuration object
	 * @memberof ESV.queries
	 * @instance
	 */ 
	esv.buildQueryTrees = function(vizObj) {
		_buildQueryTrees(vizObj);
	}

	/**
	 * Each view spawns a query tree for every underlying data source that constitutes the view. For example, if 
	 * a view has both a MutationSeq and a TITAN data source, two separate query trees corresponding to each data 
	 * source will be generated so that two separate queries can be performed and their results eventually handled
	 * by the view itself (ie. the view can choose to combine the results or deal with the results of the queries separately)
	 * @function _buildQueryTrees
	 * @param {Object} vizObj - Visualization configuration object
	 * @returns {Array} queryTrees - The array of nodes that make up a query tree
	 * @memberof ESV.queries
	 * @instance
	 * @private
	 */ 
	function _buildQueryTrees(vizObj) {
		var queryTrees = [];
		var children = vizObj.children;
		if (children.length > 0) {
			// Each child represents its own tree and thus its own query
			for (var i = 0; i < children.length; i++) {
				var subQueryTrees = _buildQueryTrees(ESV.nodes[children[i]]);
				for (var j = 0; j < subQueryTrees.length; j++) {
					if (subQueryTrees[j].length > 0) {
						subQueryTrees[j].push(vizObj)
						queryTrees.push(subQueryTrees[j]);
					} else {
						queryTrees.push([vizObj]);
					}
				}
			}
		} else {
			// Base node
			queryTrees.push([vizObj]);
		}
		
		return queryTrees;
	}
	
	/**
	 * Adds a clause to range query filter
	 * Interprets ranges of numeric fields and appends it with the appropriate prefix
	 * @function _addNumericRange
	 * @param {Object} ranges - Existing ranges
	 * @param {Object} fielda - Input field
	 * @returns {Object} ranges - Updated ranges
	 * @memberof ESV.queries
	 * @instance
	 * @private
	 */ 
	function _addNumericRange(ranges, field) {
		if (field.fieldType == "number") {
			var inequality = "gt";
			switch (field.inequality) {
				case ">":
					inequality = "gt";
					break;
				case ">=":
					inequality = "gte";
					break;
				case "<":
					inequality = "lt";
					break;
				case "<=":
					inequality = "lte";
					break;
			}
			ranges[field.esid] = {};
			ranges[field.esid][inequality] = field.fieldValues[0];
		} 
		return ranges;
	}
	
	/**
	 * Adds a clause to a query filter
	 * Adds a generic filter on to the filters object which will eventually be incorporated in the final query
	 * @funcion _addFilter
	 * @param {Object} filters - Existing filters
	 * @param {Object} field - Input field
	 * @returns {Object} filters - Updated filters
	 * @memberof ESV.queries
	 * @instance
	 * @private
	 */ 
	function _addFilter(filters, field) {
		if (field.fieldType == "truefalse") {
			// True / false values in this program are stored as "true" or "false" but fields in ESV
			// are set as "T" or "F" so we will make this change before putting it back into the query. 
			if (field.fieldValues[0] == "true") {
				field.fieldValues[0] = "T";
			}
			if (field.fieldValues[0] == "false") {
				field.fieldValues[0] = "F";
			}
		}
		
		// Some fields may have to be appended together
		if (filters[field.esid]) {
			// The ESID indexed filter already exists, we'll merge the existing filter values with the current filter values
			filters[field.esid] = filters[field.esid].concat(field.fieldValues);
		} else {
			filters[field.esid] = field.fieldValues;
		}
		return filters;
	}
	
	/**
	 * Adds a range filter given an upper and lower bound
	 * @function getRangeFilter
	 * @param {String/Number} lower (optional) - The lower bound of the range, if not passed in, range will be "< upper"
	 * @param {String/Number} upper (optional) - The upper bound of the range, if not passed in, range will be "> lower"
	 * @returns {Object} 
	 * @memberof ESV.queries
	 * @instance
	 */ 
	esv.getRangeFilter = function(lower, upper) {
		// Attempt to convert any numeric values provided as strings to actual number types.
		// Note: function Number returns 0 when the input is an empty string
		if (typeof(lower) == "string") {
			var lvalue = Number(lower);
			lower = isNaN(lvalue) ? lower : lvalue;
		}
		if (typeof(upper) == "string") {
			var uvalue = Number(upper);
			upper = isNaN(uvalue) ? upper : uvalue;
		}
		if ((upper || upper === 0) && (lower || lower === 0)) {
			return {"gte" : lower, "lte" : upper};
		} else if (upper || upper === 0) {
			return {"lte" : upper};
		} else if (lower || lower === 0) {
			return {"gte" : lower};
		} else {
			return null;
		}
	}

	/**
	 * Adds the sort functionality on to a filter
	 * @function _addQuerySort
	 * @param {Object} vizObj - Visualization configuration object
	 * @param {String} query - The query onto which the sort should be appended to
	 * @param {String/Number} sortFieldID - The ID of the field that should have the sort appended to it
	 * @param {Boolean} sortAsc - true if the sort should be sorted upwards, false by default
	 * @returns {Object} query - The query with the sort appended onto it
	 * @memberof ESV.queries
	 * @instance
	 * @private
	 */ 
	function _addQuerySort(vizObj, query, sortFieldID, sortAsc) {
		if (query == null) {
			return query;
		}

		var sortObj = {};
		var sortDir = "desc";
		if (sortAsc) {
			sortDir = "asc";
		}
		sortObj[sortFieldID] = {
			"order": sortDir
		};
		
		query.sort = [];
		query.sort.push(sortObj);
		
		return query;
	}

	/**
	 * Gets the underlying data type in a query tree
	 * @function _getDataType
	 * @param {Array} queryTree - The array of nodes that make up a query tree
	 * @returns {String} dataType - Underlying analysis data type 
	 * @memberof ESV.queries
	 * @instance
	 * @private
	 */ 
	function _getDataType(queryTree) {
		if (config.dataTypeFieldID == "" || config.dataTypeFieldID == undefined || config.dataTypeFieldID == null) {
			return null;
		}
		
		for (var i = 0; i < queryTree.length; i++) {
			var node = ESV.nodes[queryTree[i].id];
			if (node.filters.hasOwnProperty(config.dataTypeFieldID)) {
				if (node.filters[config.dataTypeFieldID].fieldValues[0] != undefined) {
					return node.filters[config.dataTypeFieldID].fieldValues[0];
				}
			}
		}
		return null;
	}
	
    /**
     * Gets all the filters contained in the provided query tree
     * @function _getQueryTreeFiltersAndRanges
     * @param {Array} queryTree - Represents a complete branch of the tree as presented in the visualization
     * tree graph ("data", "datafilter", "viewfilter" and specific "view" node type)
     * @returns {Object} filters - References to the input fields associated with nodes in the given tree,
     * including the selected field values
     * @memberof ESV.queries
     * @instance
     * @private
     */ 
	function _getQueryTreeFiltersAndRanges(queryTree) {
		var filters = {};
		
		// For each child, append their filters with the current filters
		for (var i = 0; i < queryTree.length; i++) {		
			var node = queryTree[i];
			var fieldset = $.extend(true, {}, CONFIG.editor.common);
			var dataTypes = ESV.getUnderlyingDataTypes(node.id);
			for (var idx in dataTypes) {
				$.extend(true, fieldset, CONFIG.editor[dataTypes[idx]]);
			}
			$.each(node.filters, function(key, value) {
				// Check if this filter is allowed in the given query tree (check if its dependencies are satisfied
				var satisfied = false;
				
				var field = fieldset[node.type].fields[key];
				if (field && field.hasOwnProperty("dependencies")) {
					var dependencies = field.dependencies;
					
					for (var j = 0; j < dependencies.length; j++) {
						var dependency = dependencies[j];
						for (var k = 0; k < queryTree.length; k++) {	
							if (k != i) {
								if (queryTree[k].type == dependency.type) {
									// This node has the data type the current node is dependent on, but 
									// does it have the dependent field?
									if (queryTree[k].filters[dependency.field]) {
										var fieldValues = queryTree[k].filters[dependency.field].fieldValues;
										if (fieldValues.sort().join(',') == dependency.value.sort().join(',')) {
											satisfied = true;
										}
									}
								}
							}
						}						
					}
				} else {
					satisfied = true;
				}
				
				if (!satisfied) {
					return;
				}
				
				if (filters.hasOwnProperty(key)) {
					// Append the field value if it already exists as part of the filters
					var fieldValues = value.fieldValues;
					for (var j = 0; j < fieldValues.length; j++) {
						if ($.inArray(fieldValues[j], filters[key].fieldValues) < 0) {
							filters[key].fieldValues.push(fieldValues[j]);
						}
					}
				} else {
					filters[key] = value;
				}
			});
		}
		
		return filters;
	}
	
	/**
	 * Appends all the filters and ranges on to the base query for each query tree in the queryTrees array
	 * @function addQueryFiltersAndRanges
	 * @param {Array} queryTrees - Each query tree will spawn a new query. The number of query trees correspond to the number of data nodes.
	 * @param {Array} baseQueries - An array of queries that directly maps to each query tree in the queryTrees array on to which the filters and ranges will be applied to
	 * @param {Array} viewFacades - An array of view facades whose values will also be applied to the query (relies on the denormalized data structure)
	 * @param {Object} overrides - A map of field IDs to values that will be used, regardless of what the user inputted value corresponding to the field
	 * @param {Boolean} skipFacade - A flag specifying whether the facade queries should be skipped
	 * @returns {Object} queries - An array of processed queries with all the filters and ranges added 
	 * @memberof ESV.queries
	 * @instance
	 */ 
	esv.addQueryFiltersAndRanges = function(queryTrees, baseQueries, viewFacades, overrides, skipFacade) {
		if (queryTrees == null) {
			return [];
		}
		
		if (overrides == null) {
			overrides = {};
		}

		var queries = [];
		for (var i = 0; i < queryTrees.length; i++) {
			var globalFilters = _getQueryTreeFiltersAndRanges(queryTrees[i]);
		
			var filters = {};
			var ranges = {};
			var mustFilters = [];	

			var baseQuery = baseQueries;
			if ($.isArray(baseQuery)) {
				baseQuery = baseQueries[i];
			}
			var query = $.extend({}, baseQuery);
			query.query = {
				"filtered": {
					"filter": {
						"bool": {
							"must": []
						}
					},
					"query": {
						"match_all": {}
					}
				}
			};
			
			var dataTypes = ESV.getUnderlyingDataTypes(queryTrees[i][0].id);
			var fieldset = {};
			$.extend(true, fieldset, CONFIG.editor.common);
			if (!dataTypes.length && ESV.cc.currentElement) {
				var currentElementID = parseInt(ESV.cc.currentElement.id);
				if (currentElementID){
					dataTypes = ESV.getUnderlyingDataTypes(currentElementID);
				}
			}

			if (dataTypes.length) {
				$.extend(true, fieldset, CONFIG.editor[dataTypes[0]]);
			}
			$.each(globalFilters, function(key, value) {
				if (!value.esid) {
					return;
				}
				
				// If the field is empty (no field values), only include the field as part of the query if the flag is set
				var isEmpty = true;
				for (var i = 0; i < value.fieldValues.length; i++) {
					if (value.fieldValues[i] != "") {
						isEmpty = false;
					}
				}
				
				var queryIfEmpty = false;
				if (fieldset[value.nodeType].fields[key].hasOwnProperty("queryIfEmpty")) {
					queryIfEmpty = fieldset[value.nodeType].fields[key].queryIfEmpty;
				}
				if (isEmpty && queryIfEmpty !== true) {
					return;
				}
				
				if (fieldset[value.nodeType].fields[key].hasOwnProperty("customFieldQuery")) {
					var customFilters = fieldset[value.nodeType].fields[key].customFieldQuery(key, value.fieldValues);
					if (customFilters != null) {
						mustFilters.push(customFilters); 
					}
				} else if (value.esid.indexOf(',') === -1) {
					// ESID has no comma
					if (value.isRange) {
						ranges = _addNumericRange(ranges, value);
					} else {
						filters = _addFilter(filters, value);
					}
				} else {
					// ESID has a comma indicating that there are multiple ESIDs associated with this field value
					var ESIDArr = value.esid.split(",");
					var shouldFilters = {
						bool: {
							should: []
						}   
					};
					for (var i = 0; i < value.fieldValues.length; i++) {
						var outerFieldValues = value.fieldValues[i].split("|");
						for (var k = 0; k < outerFieldValues.length; k++) {
							var fieldValue = outerFieldValues[k];
							var fieldValueArr = fieldValue.split(",");
							var mustObj = {
								bool: {
									must: []
								}
							};
							
							// Check for terms or ranges
							for (var j = 0; j < fieldValueArr.length; j++) {
								if (fieldValueArr[j] == "") {
									continue;
								}
								if (j >= ESIDArr.length) {
									// If this is a post processed field, we should not use the last item in the fieldValueArr as 
									// that item represents the display value
									continue;
								}
								
								var rangeType = "";
								if (value.hasOwnProperty("range")) {
									if (value.range[j] != "") {
										rangeType = value.range[j];
									}
								}
								
								if (rangeType == "") {
									var mustTermsObj = {
										terms: {}
									};
									mustTermsObj.terms[ESIDArr[j]] = [ fieldValueArr[j] ];
									mustObj.bool.must.push(mustTermsObj);
								} else {
									var mustRangeObj = {
										range: {}
									};
									mustRangeObj.range[ESIDArr[j]] = {};
									mustRangeObj.range[ESIDArr[j]][rangeType] = fieldValueArr[j];
									mustObj.bool.must.push(mustRangeObj);
								}
							}
							shouldFilters.bool.should.push(mustObj);
						}
					}
					mustFilters.push(shouldFilters);
					
					// If there's no should filters, we need to apply a default blank value
					if (shouldFilters.bool.should.length == 0) {
						for (var i = 0; i < ESIDArr.length; i++) {
							var mustFilter = {
								"terms": {}
							};
							mustFilter.terms[ESIDArr[i]] = [];
							mustFilters.push(mustFilter);
						}
					}
				}
			});
			
			$.each(filters, function(key, value) {
				var termsObj = {
					terms: {}
				};
				
				if (overrides.hasOwnProperty(key)) {
					termsObj.terms[key] = overrides[key];
					mustFilters.push(termsObj);
				} else {
					termsObj.terms[key] = value;
					mustFilters.push(termsObj);
				}
			});
			
			$.each(ranges, function(key, value) {
				var rangeObj = {
					range: {}
				};
				
				if (overrides.hasOwnProperty(key)) {
					rangeObj.range[key] = overrides[key];
				} else {
					rangeObj.range[key] = value;
				}
				
				mustFilters.push(rangeObj);
			});
			
			var shouldFilters = [];
			shouldClause = {};
			
			// Add the viewFacades filters on to any queries but the one that initiated it
			var filteredVizObj = ESV.nodes[queryTrees[i][queryTrees[i].length - 1].id];
			if ((viewFacades == null || viewFacades == undefined) 
				&& ESV.viewfacades.hasViewFacades() && !skipFacade) {
				var commonData = ESV.dataOverlaps(ESV.viewfacades.getViewID(), filteredVizObj.id, 'sampleIDs');
				if (ESV.viewfacades.getViewID() != filteredVizObj.id && commonData.length) {
					var commonDataType;
					var facadeQueryTrees = _buildQueryTrees(ESV.nodes[ESV.viewfacades.getViewID()]);
					var facadeQueries = esv.addQueryFiltersAndRanges(facadeQueryTrees, {}, []);
					// In case of multiple data sets, determine the correct query tree branch to use
					var facadeTreeIndex = ESV.nodes[ESV.viewfacades.getViewID()].activeTreeIndex;
					if (!facadeTreeIndex) {
						facadeTreeIndex = 0;
					}
					var allViewFacades = ESV.viewfacades.getViewFacades();
					for (var j = 0; j < allViewFacades.length; j++) {
						commonDataType = true;
						var viewFacade = allViewFacades[j];
						var includeSubFilters = viewFacade.includeNested == false ? false : true;
						var filtersIncluded = viewFacade.nestedFilters && viewFacade.nestedFilters.length;
						var mustSubFilters = [];
						$.each(viewFacade.fields, function(fieldID, value) {
							if (value.outermostMustClause) {
								mustFilters.push({
									"bool": value.outermostMustClause
								});
								if (value.includeNested == false) {
									return;
								}
							} 
							if (value.isRange) {
								var rangeObj = {
									range: {}
								};
								var dataType = _getDataType(queryTrees[i]);
								commonDataType = (dataType === value.dataSourceType || $.inArray(dataType, value.dataSourceType) != -1);
								if (!commonDataType) {
									rangeObj.range[ESV.mappings.nestedRecords + "." + fieldID] = ESV.queries.getRangeFilter(value.fieldValues[0], value.fieldValues[1]);
								} else {
									rangeObj.range[fieldID] = ESV.queries.getRangeFilter(value.fieldValues[0], value.fieldValues[1]);
								}
								mustSubFilters.push(rangeObj);
							} else {
								var termsObj = {
									terms: {}
								};
								var dataType = _getDataType(queryTrees[i]);
								commonDataType = (dataType === value.dataSourceType || $.inArray(dataType, value.dataSourceType) != -1);
								if (!commonDataType) {
									termsObj.terms[ESV.mappings.nestedRecords + "." + fieldID] = value.fieldValues;
								} else {
									termsObj.terms[fieldID] = value.fieldValues;
								}
								mustSubFilters.push(termsObj);
							}
						});
						if (includeSubFilters) {
							
							if (!commonDataType) {
								facadeQueries = _prefixQuery(facadeQueries, ESV.mappings.nestedRecords + '.');
							}

							if (filtersIncluded) {
								mustSubFilters = mustSubFilters.concat(viewFacade.nestedFilters);
							} else {
								mustSubFilters = mustSubFilters.concat(facadeQueries[facadeTreeIndex].query.filtered.filter.bool.must);
							}
							shouldFilters.push({
								"bool": {
									"must": mustSubFilters
								}
							});
						}
						else if (viewFacade.includeMustSubfilters) {
							shouldFilters.push({
								"bool": {
									"must": mustSubFilters
								}
							});
						}

					}
					if (!commonDataType) {
						shouldClause = {
							"nested": {
								"path": ESV.mappings.nestedRecords,
								"filter": {
									"bool": {
										"should": shouldFilters
									}
								}
							}
						};
					}
					else {
						shouldClause = {
							"bool": {
								"should": shouldFilters
							}
						};
					}
				}

				// Disable the view in case there is no overlapping data with the filtering view
				if(!commonData.length) {
					ESV.disableView(filteredVizObj);
				}
			}
			
			if(!$.isEmptyObject(shouldClause)) {
				mustFilters.push(shouldClause);
			}
			
			// Add these must-have filters to the existing overall filters
			mustFilters = mustFilters.concat(query.query.filtered.filter.bool.must);
			query.query.filtered.filter.bool.must = mustFilters;
		
			queries.push(query);
		}
		return queries;
	}

	/**
	* Given a node, aggregate on the fields of interest, returning a structure containing
	* all available values for the specific field within the subset determined by the
	* generated query tree
	* @function getAggregations
	* @param {Object} vizObj - Vizualization object
	* @param {String} url - Query URL
	* @param {Array} fields - Fields/attributes to aggregate on
	* @return {Object} - Aggregated data
	* @memberof ESV.queries
	* @instance
	* @private
	*/
	esv.getAggregations = function(vizObj, url, fields) {
		var queryURL = url;
		if (url == null || url == undefined) {
			queryURL = ESV.config.URL_COMBINED_INDEX;
		}
		var _query = _getAggregationQuery(fields, 1000);

		var queryTrees = _buildQueryTrees(vizObj);
		// the third argument - viewFacades - will have to be an empty array
		// as to ensure no facades are being considered
		var queries = esv.addQueryFiltersAndRanges(queryTrees, _query, []);
		var aggregations = [];
		for (var query_idx in queries) {
			_makeSimpleQuery(queries[query_idx], queryURL, false, function(response) {
				if (!aggregations[query_idx]) {
					aggregations[query_idx] = {};
				}
				for (var idx in fields) {
					if (!aggregations[query_idx][fields[idx]]) {
						aggregations[query_idx][fields[idx]] = [];
					}
					for (var bucket_idx in response.aggregations[fields[idx]].buckets) {
						aggregations[query_idx][fields[idx]].unshift(response.aggregations[fields[idx]].buckets[bucket_idx].key);
					}
				}
			});
		}
		return aggregations;
	}
	
	esv.getAggregationQuery = function(fields, size){
		return _getAggregationQuery(size, fields);
	}

	function _getAggregationQuery(fields, size){
		var _query = {
			"size": 0,
			"aggs": {}
		};

		for (var idx in fields) {
			_query.aggs[fields[idx]] = {
				"terms": {
					"field": fields[idx],
					"size": size
				}
			}
		}
		return _query;
	}
	/**
	* _prefixQuery external hookin
	* @function prefixQuery
	* @param {Array} queryTree - The array of nodes that make up a query tree
	* @param {String} termPrefix - Usually a field containing nested records to search
	* @return {Object} - Modified query
	* @memberof ESV.queries
	* @instance
	*/
        esv.prefixQuery = function(queryTree, termPrefix) {
		return _prefixQuery(queryTree, termPrefix);
	}

	/**
	* Given a query tree, modifies its terms/ranges by
	* prepending their field values with the provided prefix
	* as to make the search criteria applicable to nested records
	* @function prefixQuery
	* @param {Array} queryTree - The array of nodes that make up a query tree
	* @param {String} termPrefix - Usually a field containing nested records to search
	* @return {Object} - Modified query
	* @memberof ESV.queries
	* @instance
	* @private
	*/
	function _prefixQuery(queryTree, termPrefix) {

		if (!termPrefix) {
			return queryTree;
		}
		queryString = JSON.stringify(queryTree);
		if (!queryString.match(termPrefix.replace(/\./g, '\\\.'))) {
			queryString = queryString.replace(/"range":{"/g, '"range":{"' + termPrefix);
			queryString = queryString.replace(/"terms":{"/g, '"terms":{"' + termPrefix);
		}
		return JSON.parse(queryString);
	}

	/**
	 * Adds the provided record to the index specified in the url parameter and
	 * runs the provided callback function with the response as an input
	 * @function indexRecord
	 * @param {Object} record - Record object to add to the index
	 * @param {String} url - URL of the index the record is to be added to
	 * @param {Function} callback - Function to execute in case of successful query
	 * @param {Function} error_callback - (Optional) Function to execute upon error
	 * @memberof ESV.queries
	 * @instance
	 */
	esv.indexRecord = function(record, url, callback, error_callback) {
		if ($.isEmptyObject(record) || !url) {
			return;
		}
		_makeSimpleQuery(record, url, true, callback, error_callback);
	}

	/**
	 * Queries an index by record ID
	 * @function getRecordByID
	 * @param {String} recordID - Record ID to search for
	 * @param {String} url - URL of the index to search
	 * @param {Function} callback - Function to execute in case of successful query
	 * @param {Function} error_callback - (Optional) Function to execute upon error
	 * @memberof ESV.queries
	 * @instance
	 */
	esv.getRecordByID = function(recordID, url, callback, errorCallback) {
		if (!recordID || !url) {
			return;
		}
		var query = {
			"query": {
				"match": {
					"_id": recordID
				}
			}
		};

		_makeSimpleQuery(query, url, true, function(response) {
			callback(response);
		},
		function(err) {
			if ($.isFunction(errorCallback)) {
				errorCallback(err);
			}
		});
	}

	/**
	 * Queries an index by name
	 * @function getRecordByName
	 * @param {String} recordName - Record name to search for
	 * @param {String} url - URL of the index to search
	 * @param {Function} callback - Function to execute in case of successful query
	 * @param {Function} error_callback - (Optional) Function to execute upon error
	 * @memberof ESV.queries
	 * @instance
	 */
	esv.getRecordByName = function(recordName, url, callback, errorCallback) {
		if (!recordName || !url) {
			return;
		}
		var query = {
			"query": {
				"match": {
					"title": recordName
				}
			}
		};

		_makeSimpleQuery(query, url, true, function(response) {
			callback(response);
		},
		function(err) {
			if ($.isFunction(errorCallback)) {
				errorCallback(err);
			}
		});
	}

	/**
	 * Queries an index by tag name
	 * @function getRecordByTagName
	 * @param {String} tagName - tag to search for
	 * @param {String} url - URL of the index to search
	 * @param {Function} callback - Function to execute in case of successful query
	 * @param {Function} error_callback - (Optional) Function to execute upon error
	 * @memberof ESV.queries
	 * @instance
	 */
	esv.getRecordByTagName = function(tagName, url, callback, errorCallback) {
		if (!tagName || !url) {
			return;
		}
		var query = {
			"query": {
				"match": {
					"tags": tagName
				}
			}
		};

		_makeSimpleQuery(query, url, true, function(response) {
			callback(response);
		},
		function(err) {
			if ($.isFunction(errorCallback)) {
				errorCallback(err);
			}
		});
	}

	/**
	 * Queries an index by dashboardID
	 * @function getRecordByDashboardID
	 * @param {String} dashboardID - Record ID to search for
	 * @param {String} url - URL of the index to search
	 * @param {Function} callback - Function to execute in case of successful query
	 * @param {Function} error_callback - (Optional) Function to execute upon error
	 * @memberof ESV.queries
	 * @instance
	 */
	esv.getRecordByDashboardID = function(dashboardID, url, callback, errorCallback){
		if (!dashboardID || !url) {
			return;
		}
		var query = {
			"query": {
				"match": {
					"tags": dashboardID
				}
			}
		};

		_makeSimpleQuery(query, url, true, function(response) {
			callback(response);
		},
		function(err) {
			if ($.isFunction(errorCallback)) {
				errorCallback(err);
			}
		});
	}
	esv.getPatientMapping = function(mappings){
		return {
				"query": {
					"terms": {}
				},
				"aggs": {
					"patient_id": {
						"terms": {
							"field": mappings.patientID,
							"size": 10000,
							"order": {
								"_term": "asc"
							}
						},
						"aggs": {
							"sample_id": {
								"terms": {
									"field": mappings.sampleID,
									"size": 10000,
									"order": {
										"_term": "asc"
									}
								}
							}
						}
					},
					"data_types": {
						"terms": {
							"field": mappings.dataType,
							"size": 10000
						}
					}
				},
				"size": 0
			};

	}

	esv.getSavedTemplatesMapping = function(queryTerm, dataTypes){
		return {
				"size": 0,
				"query": {
					"bool": {
						"must": [
							{
								"wildcard": {
									"tags": {
										"value": queryTerm.toLowerCase()
									}
								}
							},
							{
								"terms": {
									"caller": dataTypes
								}
							}
						]
					}
				},
				"aggs": {
					"tags": {
						"terms": {
							"field": "tags.raw",
							"order": {
								"_term": "asc"
							},
							"size": 10000
						},
						"aggs": {
							"saved_views": {
								"terms": {
									"field": "_uid",
									"size": 100
								},
								"aggs": {
									"title": {
										"terms": {
											"field": "title",
											"size": 1
										}
									},
									"description": {
										"terms": {
											"field": "description",
											"size": 1
										}
									}
								}
							}
						}
					}
				}
			};
	}
	esv.getPublishedTemplatesMapping = function(){
		return { "query" : {
        			"query" : { 
          			"match_all" : {} 
        			}
   			 	}
			}
	};
	/**
	* Returns the index mappings for the published indices
	* @function getPublishedViewIndexMapping
	* @memberof ESV.queries
	* @instance
	*/
	esv.getPublishedViewIndexMappings = function(queryTerm){
		return {
		  "size": 0,
			"query": {
				"wildcard": {
					"tags": {
						"value": queryTerm.toLowerCase()
					}
				}
			},
		  "aggs": {
		    "dashboards": {
		      "terms": {
		        "field": "dashboard",
		        "order": {
		          "_term": "asc"
		        },
		        "size": 10000
		      },
		      "aggs": {
		        "tags": {
		          "terms": {
		            "field": "tags.raw", // NOTE: this assumes that string has no delimiters ("-", " ", etc)
		            "order": {
		              "_term": "asc"
		            },
		            "size": 10000
		          },
		          "aggs": {
		            "title": {
		              "terms": {
		                "field": "title",
		                "size": 1
		              }
		            },
		            "description": {
		              "terms": {
		                "field": "description",
		                "size": 1
		              }
		            },
		            "sample_ids": {
		              "terms": {
		                "field": "sample_ids.raw",
		                "size": 1
		              }
		            }
		          }
		        }
		      }
		    }
		  }
		}
	}

	/**
	* Returns the index mappings for the published, shared and template indices
	* @function getStoredViewIndexMappings
	* @memberof ESV.queries
	* @instance
	*/
	esv.getStoredViewIndexMappings = function() {
		return {
	    "mappings": {
	      "session_data": {
	        "properties": {
	          "description": {
	            "type": "string",
	            "index": "not_analyzed"
	          },
	          "dashboard": {
	            "type": "string",
	            "index": "not_analyzed"
	          },
	          "sample_ids": {
	            "type": "string",
	            "fields": {
	              "raw": {
	                "type": "string",
	                "index": "not_analyzed"
	              }
	            }
	          },
	          "tags": {
	            "type": "string",
	            "fields": {
	              "raw": {
	                "type": "string",
	                "index": "not_analyzed"
	              }
	            }
	          },
	          "title": {
	            "type": "string",
	            "index": "not_analyzed"
	          }
	        }
	      }
	    }
	}
};

	return esv;
}(ESV.queries || {}));
