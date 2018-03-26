/**
 * Configuration/settings
 */

// === CONFIG + PROPERTIES ===

/**
 * Elasticsearch backend server URL, should be left blank (empty string)
 * when the code is bundled and deployed as a plug-in so the application
 * would use relative URLs.
 */
var ES_SERVER = '';

/**
 * Main Elasticsearch index/alias that queries are run against to generate
 * the data used for plotting. Currently data is placed in separate indices
 * collectively referenced by a common alias.
 */

var ES_INDEX = 'denormalized_data';

/**
 * Reference index containing sample specific information, i.e. project,
 * tumour type, experiment type, etc..
 */
var SAMPLE_INDEX = 'sample_index';

/**
 * Main application configuration object, during initial application setup it is
 * being extended and stored in a separate index associated with the configured data index,
 * the full record URL is specified under CONFIG.config.URL_FRONTEND_CONFIG_SAVE .
 * @namespace
 */
var CONFIG = {
    /**
     * @property {Object} config - Contains specific URLs associated with the main search/index alias used
     * for searching data and storing/retreiving configuration objects
     */
	"config": {
		"version": "1.0",
		"URL_COMBINED_INDEX": ES_SERVER + "/" + ES_INDEX + "/_search?request_cache=true",
		"URL_GENE_ANNOTATIONS": ES_SERVER + "/gene_annotations/_search",
		"URL_SHARED_INDEX": ES_SERVER + "/" + ES_INDEX + "_shared",
		"URL_SHARED_INDEX_SAVE": ES_SERVER + "/" + ES_INDEX + "_shared/session_data",
		"URL_SHARED_INDEX_SEARCH": ES_SERVER + "/" + ES_INDEX + "_shared/session_data/_search",
		"URL_PUBLISHED_INDEX": ES_SERVER + "/" + ES_INDEX + "_published",
		"URL_PUBLISHED_INDEX_SAVE": ES_SERVER + "/" + ES_INDEX + "_published/session_data",
		"URL_PUBLISHED_INDEX_SEARCH": ES_SERVER + "/" + ES_INDEX + "_published/session_data/_search",
		"URL_TEMPLATE_INDEX": ES_SERVER + "/" + ES_INDEX + "_templates",
		"URL_TEMPLATE_INDEX_SAVE": ES_SERVER + "/" + ES_INDEX + "_templates/session_data",
		"URL_TEMPLATE_INDEX_SEARCH": ES_SERVER + "/" + ES_INDEX + "_templates/session_data/_search",
		"URL_TEMPLATE_INDEX_TEMP_PANEL_DATA": ES_SERVER + "/" + ES_INDEX + "_templates/temporary_panel/data",
		"URL_FIND_OVERLAPS": ES_SERVER + "/_overlap?",
		"URL_SAMPLE_INDEX": ES_SERVER + "/" + SAMPLE_INDEX + "/_search",
		"URL_SAMPLE_INDEX_MAPPING": ES_SERVER + "/" + SAMPLE_INDEX + "/_mapping",
		"URL_FRONTEND_CONFIG_SAVE": ES_SERVER + "/" + ES_INDEX + "_config/config_type/config",
		"URL_FRONTEND_CONFIG_SEARCH": ES_SERVER + "/" + ES_INDEX + "_config/config_type/_search?request_cache=true",
		"URL_DASHBOARD_INDEX_SEARCH": ES_SERVER + "/" + ES_INDEX + "_published/session_data/_search",
		"URL_DASHBOARD_PUBLISHED": ES_SERVER + "/published_dashboards/_search",
		"URL_DASHBOARD_PUBLISHED_SAVE": ES_SERVER + "/published_dashboards"
	},

    /**
     * @property {Object} mappings - Sets aliases to be used in queries in place of actual specific data fields,
     * allows potentially configuring the application with data sets that use different field naming conventions
     */
	"mappings": {
		"startPos": "start",
		"endPos": "end",
		"chrom": "chrom_number",
		"sampleID": "sample_id",
		"dataType": "caller",
		"geneName": "gene_name",
		"sourceID": "source_id",
		"nestedRecords": "events",
		"patientID": "patient_id",
		"pairedRecord": "paired_record",
		"strand": "strand",
		"project": "project",
		"cancerType": "tumor_type",
		"copyNumber": "copy_number",
		"singleCellID": "cell_id",
		"singleCellParent": "parent",
		"singleCellDistance": "dist",
		"singleCellTimepoint": "timepoint",
		"singleCellGenotype": "genotype",
		"singleCellVAF": "VAF",
		"singleCellState": "state"
	},

    /**
     * @property {Object} required - Specifies which of the fields configured under property mappings
     * have to be present in order to ensure the essential functionality of the application
     */
	"required": {
		"startPos": true,
		"endPos": true,
		"chrom": true,
		"sampleID": true,
		"dataType": true,
		"sourceID": true,
		"nestedRecords": true,
		"project": false,
		"cancerType": false,
		"geneName": false,
		"patientID": false,
		"pairedRecord": false,
		"strand": true,
		"singleCellID": false
	},

    /**
     * @property {Array} reserved - List of fields not to be used as data filters
     */
	"reserved": [
		"dataType", "sourceID", "nestedRecords", "pairedRecord", "patientID", "chrom", "geneName"
	],

    /**
     * @property {Object} - widgets - Widget configuration templates to be used during
     * data filter configuration when adding support for new analysis data types
     */
	"widgets": {
		"number": {
			"id": "",
			"esid": "",
			"label": "",
			"fieldType": "number",
			"placeholder": "",
			"isRange": true,
			"inequality": ">=",
			"defaultValue": 0,
			"step": 1,
			"max": 0,
			"min": 0,
			"disabled": false,
			"modifiable":true,
		},
		"predictivetext": {
			"id": "",
			"esid": "",
			"fieldType": "predictivetext",
			"limit": 1,
			"prid": "",
			"label": "",
			"placeholder": "",
			"modifiable":true,
		},
		"multiselect": {
			"id": "",
			"esid": "",
			"fieldType": "multiselect",
			"fieldValues": [],
			"disabled": false,
			"modifiable":true,
		},
	},
	
	"messages":{
		"emptyBrowsePanel":{
			"appendElement":"#browse-element",
			"emptyElement":"#sidebar-browse",
			"messageHTML":'<div class="alert alert-info notification"><strong>No saved views found!</strong></div>'
		},
		"emptyEditPanel":{
			"appendElement":"#edit-element",
			"emptyElement":"#edit-element",
			"messageHTML":'<div class="alert alert-info notification"><strong>No node selected!</strong>\
								<br />Select a visualization or a node to edit.</div>'
		},
		"emptyTemplatePanel":{
			"appendElement":"#template-list",
			"emptyElement":"#template-list",
			"messageHTML":'<div class="alert alert-info notification"><strong>No saved templates found!\
								</strong><br />To add a view go to <strong>Share -> Create Template</strong>.</div>'
		}
	},
    /**
     * @property {Object} properties - Visualization tree nodes' properties - data associated with
     * data, datafilter, viewfilter and specific view nodes stored under ESV.nodes
     */
	"properties": {
		"view": {
			type: "view",
			icon: "img/ic-view.png",
			title: "View",
			desc: "Creates a visualization for the underlying data",
			disabled: true
		},
		"viewfilter": {
			type: "viewfilter",
			icon: "img/ic-viewfilter.png",
			title: "Region Filter",
			desc: "Filters the data specifically for the visualization"
		},
		"datafilter": {
			type: "datafilter",
			icon: "img/ic-datafilter.png",
			title: "Data Filter",
			desc: "Filters an underlying dataset",
			configurable: true
		},
		"data": {
			type: "data",
			icon: "img/ic-data.png",
			title: "Data",
			desc: "Adds a specific data source",
			configurable: true
		},
		"chipheatmap": {
			type: "view",
			icon: "img/ic-view-trinheatmap.png",
			title: "Chip Heatmap",
			desc: "",
			maxDataSources: 1,
			multiViewFacadeSupported: true
		},
		"scatterplot": {
			type: "view",
			icon: "img/ic-view-heatmap.png",
			title: "Scatterplot",
			desc: "",
			maxDataSources: 1
		},
		"cellscape2": {
			type: "view",
			icon: "img/ic-view-timescape.png",
			title: "Cellscape",
			desc: "",
			maxDataSources: 1,
			multiViewFacadeSupported: true
		},
		"violin": {
			type: "view",
			icon: "img/ic-view-violin.png",
			title: "Violin",
			desc: "",
			maxDataSources: 1
		}
	},

    /**
     * @property {Object} structures - Configuration objects used to build and extend visualization trees
     */
	"structures": {
		"data": {
			core: true,
			icon: "img/ic-data.png",
			title: "Data",
			desc: "Adds a data source",
			structure: [
				{
					id: 1,
					desc: "",
					type: "data",
					parents: [],
					children: []
				}
			]
		},
		"viewFromData": {
			core: true,
			linked: "bottom",
			icon: "img/ic-view.png",
			title: "Visualization",
			desc: "Builds a visualization on top of this dataset",
			structure: [
				{
					id: 1,
					desc: "",
					type: "datafilter",
					parents: [2],
					children: []
				},
				{
					id: 2,
					desc: "",
					type: "viewfilter",
					parents: [3],
					children: [1]
				},
				{
					id: 3,
					desc: "",
					type: "view",
					parents: [],
					children: [2]
				}
			]
		},
		"viewFromDataFilter": {
			core: true,
			linked: "bottom",
			icon: "img/ic-view.png",
			title: "Visualization",
			desc: "Builds a visualization on top of this data filter",
			structure: [
				{
					id: 2,
					desc: "",
					type: "viewfilter",
					parents: [3],
					children: []
				},
				{
					id: 3,
					desc: "",
					type: "view",
					parents: [],
					children: [2]
				}
			]
		},
		"viewFromViewFilter": {
			core: true,
			linked: "bottom",
			icon: "img/ic-view.png",
			title: "Visualization",
			desc: "Builds a visualization on top of this view filter",
			structure: [
				{
					id: 3,
					desc: "",
					type: "view",
					parents: [],
					children: []
				}
			]
		},
		"existingViewFromData": {
			core: true,
			linked: "bottom",
			icon: "img/ic-view.png",
			title: "Existing View",
			desc: "Connects an existing view to this dataset",
			structure: [
				{
					id: 1,
					desc: "",
					type: "datafilter",
					parents: [2],
					children: []
				},
				{
					id: 2,
					desc: "",
					type: "viewfilter",
					parents: [3],
					children: [1]
				},
				{
					id: 3,
					desc: "",
					type: "existing-view",
					parents: [],
					children: [2]
				}
			]
		},
		"existingViewFromDataFilter": {
			core: true,
			linked: "bottom",
			icon: "img/ic-view.png",
			title: "Existing View",
			desc: "Connects an existing view to this data filter",
			structure: [
				{
					id: 2,
					desc: "",
					type: "viewfilter",
					parents: [3],
					children: []
				},
				{
					id: 3,
					desc: "",
					type: "existing-view",
					parents: [],
					children: [2]
				}
			]
		},
		"existingViewFromViewFilter": {
			core: true,
			linked: "bottom",
			icon: "img/ic-view.png",
			title: "Existing View",
			desc: "Connects an existing view to this view filter",
			structure: [
				{
					id: 3,
					desc: "",
					type: "existing-view",
					parents: [],
					children: []
				}
			]
		},
		"dataFromView": {
			core: true,
			linked: "track",
			icon: "img/ic-data.png",
			title: "Data",
			desc: "Adds a data source to a view",
			structure: [
				{
					id: 1,
					desc: "",
					type: "data",
					parents: [2],
					children: []
				},
				{
					id: 2,
					desc: "",
					type: "datafilter",
					parents: [3],
					children: [1]
				},
				{
					id: 3,
					desc: "",
					type: "viewfilter",
					parents: [],
					children: [2]
				},
				{
					id: 4,
					desc: "",
					type: "view",
					parents: [],
					children: [],
				}
			]
		},
		"dataFromViewFilter": {
			core: true,
			linked: "top",
			icon: "img/ic-data.png",
			title: "Data",
			desc: "Adds a data source to a view filter",
			structure: [
				{
					id: 1,
					desc: "",
					type: "data",
					parents: [2],
					children: []
				},
				{
					id: 2,
					desc: "",
					type: "datafilter",
					parents: [],
					children: [1]
				},
				{
					id: 3,
					desc: "",
					type: "view",
					parents: [],
					children: [],
				}
			]
		},
		"dataFromDataFilter": {
			core: true,
			linked: "top",
			icon: "img/ic-data.png",
			title: "Data",
			desc: "Adds a data source to a data filter",
			structure: [
				{
					id: 1,
					desc: "",
					type: "data",
					parents: [],
					children: []
				}
			]
		},
		"basic": {
			icon: "img/ic-structure-simple.png",
			title: "Create View",
			desc: "Builds a visualization from a single datasource",
			structure: [
				{
					id: 0,
					desc: "",
					type: "data",
					parents: [1],
					children: []
				},
				{
					id: 1,
					desc: "",
					type: "datafilter",
					parents: [2],
					children: [0]
				},
				{
					id: 2,
					desc: "",
					type: "viewfilter",
					parents: [3],
					children: [1]
				},
				{
					id: 3,
					desc: "",
					type: "view",
					parents: [],
					children: [2]
				}
			]
		}
	}
};

$.extend(true, CONFIG, {
    /**
     * @property {Object} views - View nodes' specific input fields/widget configuration settings.
     * @memberof CONFIG
     */
	"views" : {
		"table": {
			"fields": {
				"table-columns": {
					"id": "table-columns",
					"esid": "",
					"label": "Columns",
					"labelHeader": "",
					"dataReference": "",
					"fieldType": "multiselect",
					"inputType": "all",
					"fieldValues": [
						[CONFIG.mappings.sampleID, "Sample", "Tumour Sample ID", true, true],
						[CONFIG.mappings.chrom, "Chr", "Chromosome", true, true],
						[CONFIG.mappings.startPos, "Start", "Start", true, true],
						[CONFIG.mappings.endPos, "End", "End", true, true],
					],
					"isTableColumns": true
				},
			}
		},
		"violin": {
			"fields": {
				"violin-dimension-x": {
					id: "violin-dimension-x",
					label: "x-axis",
					dataReference: "",
					fieldType: "select",
					inputType: "categorical",
					fieldValues: [
						["all", "", "All", true, false]
					],
				},
				"violin-dimension-y": {
					id: "violin-dimension-y",
					label: "y-axis",
					dataReference: "",
					fieldType: "select",
					inputType: "numerical",
					fieldValues: [],
					selectedOption: 2
				},
				"violin-subsets": {
					id: "violin-subsets",
					label: "subsets",
					dataReference: "",
					fieldType: "select",
					inputType: "categorical",
					fieldValues: [
						["none", "", "None", true, false]
					],
					displayConditions: {
						"violin-dimension-x": "!all"
					}
				}
			}
		},
		"cellscape2": {
			"fields": {
				"cellscape2-data-format": {
					id: "cellscape2-data-format",
					label: "data format",
					dataReference: "",
					fieldType: "select",
					inputType: "none",
					fieldValues: [
						["point", "", "Point Data", true, false],
						["range", "", "Range Data", false, false]
					],
					hidden: true,
					setHiddenValue: function() {
						return CONFIG.editor[this.dataReference].recordType;
					}
				},
				"cellscape2-show-node-ids":{
					id: "cellscape2-show-node-ids",
					label: "show tree node IDs",
					dataReference: "",
					fieldType: "slideToggle",
					fieldValues: [],
					defaultValue: "F",
					position: 2
				}
			}
		},
		"scatterplot": {
			"fields": {
				"scatterplot-dimension-x": {
					id: "scatterplot-dimension-x",
					label: "x-axis",
					dataReference: "",
					fieldType: "select",
					inputType: "numerical",
					fieldValues: []
				},
				"scatterplot-dimension-y": {
					id: "scatterplot-dimension-y",
					label: "y-axis",
					dataReference: "",
					fieldType: "select",
					inputType: "numerical",
					fieldValues: []
				},
				"scatterplot-subsets": {
					id: "scatterplot-subsets",
					label: "subsets",
					dataReference: "",
					fieldType: "select",
					inputType: "categorical",
					fieldValues: [
						["none", "", "None", true, false],
						[CONFIG.mappings.sampleID, "Sample", "Tumour Sample ID", false, false],
						[CONFIG.mappings.chrom, "Chr", "Chromosome", false, false],
						[CONFIG.mappings.patientID, "PatientID", "Patient ID", false, false]
					]
				}
			}
		},
		"chipheatmap": {
			"fields": {
				"chipheatmap-intensity": {
					id: "chipheatmap-intensity",
					label: "intensity",
					dataReference: "",
					fieldType: "select",
					inputType: "numerical",
					fieldValues: [
						["count", "", "Count", true, false]
					]
				},
				"chipheatmap-subsets": {
					id: "chipheatmap-subsets",
					label: "subsets",
					dataReference: "",
					fieldType: "select",
					inputType: "categorical",
					fieldValues: [
						["none", "", "None", true, false],
						[CONFIG.mappings.sampleID, "Sample", "Tumour Sample ID", false, false],
						[CONFIG.mappings.chrom, "Chr", "Chromosome", false, false],
						[CONFIG.mappings.patientID, "PatientID", "Patient ID", false, false]
					]
				}
			}
		}
	},
    /**
     * @property {Object} editor - Holds the configuration settings for the Editor panel input widgets
     * corresponding to the data, datafilter (only common to all analysis data types properties) and
     * viewfilter/region filter nodes in a visualization tree branch. This property is further extended
     * when new analysis data types are conifigured through the interface, the updated settings are added
     * under property editor.storedCnfiguration and stored in the backend.
     * @memberof CONFIG
     */
	"editor": {
		"common": {
			"data": {
				"required": ["data-all-title", "data-all-type", "data-all-sample_id"],
				"fields": {
					"data-all-sample_id": {
						"id": "data-all-sample_id",
						"label": "Data Source",
						"fieldType": "tree",
						"position": 1,
						"hierarchy": [CONFIG.mappings.project, CONFIG.mappings.cancerType, CONFIG.mappings.patientID],
						"esid": CONFIG.mappings.sampleID
					},
					"data-all-type": {
						"id": "data-all-type",
						"esid": CONFIG.mappings.dataType,
						"label": "Data Type",
						"fieldType": "select",
						"fieldValues": [],
						"position": 3,
						"modifiable": false, // is field value modifiable once set (currently supported only for fieldType 'select'
						"configurable": true, // also implemented only for type select
						"configureNode": "data",
						"configureType": "common" // structure types in which the widget is omitted
					},
					"data-all-title": {
						"id": "data-all-title",
						"label": "Dataset Title",
						"required": true,
						"fieldType": "text",
						"placeholder": "Dataset Title",
						"position": 4
					}
				}
			},
			// --- Integral ESV components ---
			"viewfilter": {
				"fields": {
					"geneName": {
						"disabled": !CONFIG.config.URL_GENE_ANNOTATIONS || !CONFIG.mappings.geneName,
						"id": "geneName",
						"label": "Gene",
						"esid": [{ esid: CONFIG.mappings.chrom }, { esid: CONFIG.mappings.startPos, range: "gte" }, { esid: CONFIG.mappings.endPos, range: "lte" }],
						"fieldType": "predictivetext",
						"queryIfEmpty": false,
						"prid": CONFIG.mappings.geneName,
						"pridURL": CONFIG.config.URL_GENE_ANNOTATIONS,
						"freeInput": false,
						"placeholder": "Gene Name",
						"post_processing": {
							"execute": function(fieldID, currentNode, callback) {
								var originalFieldValueArray = currentNode.filters[fieldID].fieldValues;
								if (originalFieldValueArray.length === 0) {
									callback(currentNode);
									return;
								}

								ESV.queries.getGeneInfo(originalFieldValueArray, function(source) {
									var newFieldValueArray = [];
									for (var i = 0; i < source.length; i++) {
										var infoArr = [source[i][CONFIG.mappings.chrom], source[i][CONFIG.mappings.startPos], source[i][CONFIG.mappings.endPos], source[i].name];
										newFieldValueArray.push(infoArr.join());
									}
									currentNode.filters[fieldID].fieldValues = newFieldValueArray;
									currentNode.filters[fieldID].post_proccessing_esid = [{ esid: CONFIG.mappings.chrom }, { esid: CONFIG.mappings.startPos, range: "gt" }, { esid: CONFIG.mappings.endPos, range: "lt" }];
									callback(currentNode);
								});
							}
						},
						"customFieldQuery": function(fieldID, fieldValues) {
							if (fieldID == 'geneName') {
								var outerShouldFilters = {
									"bool": {
										"should": []
									}
								};

								for (var i = 0; i < fieldValues.length; i++) {
									var fieldValue = fieldValues[i].split(",");
									var chromNum = fieldValue[0];
									var start = fieldValue[1];
									var end = fieldValue[2];

									var customMustFilter = {
										"bool": {
											"must": []
										}
									};

									// Add chrom number
									var filterClause = {"terms": {}};
									filterClause.terms[CONFIG.mappings.chrom] = [chromNum];
									customMustFilter.bool.must.push(filterClause);

									// Add various should filters to search for overlapping genes
									var customShouldFilter = {
										"bool": {
											"should": []
										}
									};

									// search for:    -------------
									// gene:              ----
									filterClause = {"bool": {"must": [{"range": {}}, {"range": {}}]}};
									filterClause.bool.must[0].range[CONFIG.mappings.startPos] = {"lte": start};
									filterClause.bool.must[1].range[CONFIG.mappings.endPos] = {"gte": end};
									customShouldFilter.bool.should.push(filterClause);

									// search for:      -------
									// gene:        -------
									filterClause = {"bool": {"must": [{"range": {}}, {"range": {}}]}};
									filterClause.bool.must[0].range[CONFIG.mappings.startPos] = {"lte": end};
									filterClause.bool.must[1].range[CONFIG.mappings.startPos] = {"gte": start};
									customShouldFilter.bool.should.push(filterClause);

									// search for:   -------
									// gene:             -------
									filterClause = {"bool": {"must": [{"range": {}}, {"range": {}}]}};
									filterClause.bool.must[0].range[CONFIG.mappings.endPos] = {"gte": start};
									filterClause.bool.must[1].range[CONFIG.mappings.endPos] = {"lte": end};
									customShouldFilter.bool.should.push(filterClause);

									customMustFilter.bool.must.push(customShouldFilter);
									outerShouldFilters.bool.should.push(customMustFilter);
								}

								return outerShouldFilters;
							}

							return null;
						}
					},
					"coordinate": {
						"id": "coordinate",
						"label": "Coordinate List",
						"fieldType": "list",
						"queryIfEmpty": false,
						"placeholder": "eg. chr1,chr12:10-1000,1:1-100",
						"esid": ["chr*:*-*|*:*-*", { esid: CONFIG.mappings.chrom }, { esid: CONFIG.mappings.startPos, range: "gt" }, { esid: CONFIG.mappings.endPos, range: "lt" }],
						"customQueryTerm": function(esid, originalTerm) {
							var queryTerm = originalTerm;
							if (esid == CONFIG.mappings.chrom) {
								if (parseInt(queryTerm) < 10 && parseInt(queryTerm) > 0) {
									queryTerm = "0" + parseInt(queryTerm);
								} else {
									// Make sure all the X, Y chromosome are queried using their lowercase values
									//queryTerm = queryTerm.toLowerCase();

									// Doesn't seem to work when it's lowercase..
									queryTerm = queryTerm.toUpperCase();
								}
							}
							return queryTerm;
						},
						"regex": "^((chr)?((0?[1-9])|1\\d|2[012]|[xyXY]))(:\\d+-\\d+)?" // Note the double escape
					}
				}
			},

			"table": {
				"fields": {
					"title": {
						"id": "title",
						"label": "Title",
						"fieldType": "text",
						"placeholder": "Title"
					},
					"table-all-focus": {
						id: "table-all-focus",
						label: "Focused Dataset",
						fieldType: "select",
						fieldValues: [],
						hideWhenSingleItem: true,
						customFieldValues: function(vizID, structureType) {
							var dataNodes = ESV.getChildNodes(vizID, structureType, "data");
							var customFieldValues = [];
							for (var i = 0; i < dataNodes.length; i++) {
								customFieldValues.push([dataNodes[i].id, "", dataNodes[i].info["data-all-title"][0], false]);
							}

							return customFieldValues;
						}
					}
				}
			},
			"cellscape2": {
				"fields": {
					"title": {
						id: "title",
						label: "Title",
						fieldType: "text",
						placeholder: "Title",
						position: 1
					}
				}
			},
			"scatterplot": {
				"fields": {
					"title": {
						"id": "title",
						"label": "Title",
						"fieldType": "text",
						"placeholder": "Title",
						"position": 1
					}
				}
			},
			"chipheatmap": {
				"fields": {
					"title": {
						"id": "title",
						"label": "Title",
						"fieldType": "text",
						"placeholder": "Title"
					}
				}
			},
			"violin": {
				"fields": {
					"title": {
						"id": "title",
						"label": "Title",
						"fieldType": "text",
						"placeholder": "Title",
						"position": 1
					}
				}
			}
		},
	}
});
