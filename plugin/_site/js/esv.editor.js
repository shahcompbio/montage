/**
 * Editor
 * <br/><br/>
 * This namespace provides functionality related to rendering the forms for creating new or editing existing views (in
 * the modal panel in the centre of the window and the side panel), as well as the forms for configuring new and modifying existing
 * data filters/input widgets specific to individual analysis data types. Configuration generated while adding new data types
 * extends the original configuration settings found under _site/js/config.js and is stored in the backend data store.
 *
 * @author: Tom Jin
 * @namespace ESV.editor
 */

ESV.editor = (function (esv) {

    /**
     * @member {Array} structureStagingArray - This array holds all the temporary objects that have been created as part of making a new structure
	 * but have not actually been written into the ESV.nodes global scope
	 * Each item's index maps directly to the item with the same index in the template structure
     * @memberof ESV.editor
     */
	esv.structureStagingArray = [];

	/**
     * @member {Object} structureStagingIDMap - Structure templates have a temporary ID which must be converted to actual node IDs
     * We keep track of the all the temporary IDs to node IDs mapping
     * @memberof ESV.editor
     */
	esv.structureStagingIDMap = {};

	/**
     * @member {Object} storedConfiguration - Structure used to store and reference fetched configuration settings saved in the application
	 * back-end data. The configuration is an extension of the initial settings found in CONFIG.editor
     * @memberof ESV.editor
     */
	esv.storedConfiguration = {};

	var config = {};


	/**
	 * Initializing entry point, populating the default create panel
	 * @function init
	 * @param {Object} blockingObject - Deferred object
	 * @memberof ESV.editor
	 * @instance
	 */
	esv.init = function(blockingObject) {
		ESV.editor.renderCreatePanelWithNodes();
		ESV.editor.renderBrowsePanelWithViews();
		
		_initEditFieldHandlers();
		// In case saved confguration exists, override the one from the config file
		ESV.queries.getRecordByID(
			'config',
			ESV.config.URL_FRONTEND_CONFIG_SEARCH,
			function(response) {
				if (response.hits.hits.length) {
					var storedConfiguration = response.hits.hits[0]._source;
					if (typeof(storedConfiguration.CONFIG) == "string") {
						storedConfiguration = JSON.parse(storedConfiguration.CONFIG);
					}
					for (var field in storedConfiguration) {
						if (!CONFIG.editor[field]) {
							CONFIG.editor[field] = {};
						}
						$.extend(true, CONFIG.editor[field], storedConfiguration[field]);
					}
					esv.storedConfiguration = storedConfiguration;
				}
				if (typeof(blockingObject) == 'object' && $.isFunction(blockingObject.resolve)) {
					blockingObject.resolve();
				}
			},
			function(err) {
				$('#configure-data-types').trigger('click');
			}
		);
	};

	/**
	 * Manages realtime interactions with the edit panel
	 * Handles view refresh when fields are changed (eg. changed the textbox)
	 * @function _initEditFieldHandlers
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _initEditFieldHandlers() {

		// Listener for field changes, will cause views to update in realtime
		$("#sidebar").on("change", ".form-control", function() {
			var nodeID = $(this).data("id");
			var fieldID = $(this).data("fieldid");
			var dataType = $(this).data("datatype");
			var fieldValue = $(this).val();
			if (!$('#create-next').length && !$('#create-finish').length && nodeID !== undefined) {
				 console.log("Changed field: " + nodeID + " " + fieldID + " " + fieldValue);

				// As long as we're not creating a component, we'll edit this field
				_editFieldChanged(nodeID, fieldID, fieldValue, dataType);
			}
		});

		// Special case of field changes, the toggle button
		$('#sidebar').on('click', '.btn-toggle', function() {
			$(this).find('.btn').toggleClass('active');
			if ($(this).find('.btn-primary').size() > 0) {
				$(this).find('.btn').toggleClass('btn-primary');
			}
			$(this).find('.btn').toggleClass('btn-default');

			var $input = $(this).find('input');
			var currentInputVal = $input.val();
			if (currentInputVal == "T") {
				$input.val("F");
			} else {
				$input.val("T");
			}
			$input.change();
		});

		// Handles canceling of structure creation
		$('#tab-overlay a').click(function() {
			// Reset temporary structures
			ESV.editor.structureStagingArray = [];
			ESV.editor.structureStagingIDMap = {};
			ESV.editor.renderCreatePanelWithNodes();
		});
	}

	/**
	 * Handles when an edit field is modified (external hookin)
	 * @function editFieldChanged
	 * @param {Number} nodeID - The node that is associated with the modified field
	 * @param {String} fieldID - The field that was modified
	 * @param {String} fieldValue - The new value of the field
	 * @memberof ESV.editor
	 * @instance
	 */
	esv.editFieldChanged = function(nodeID, fieldID, fieldValue) {
		_editFieldChanged(nodeID, fieldID, fieldValue);
	};

	// === PRIVATE METHODS ===

	/**
	 * Ensures the order of the newFieldValues are the same as the existingFieldValues
	 * @param {Array} existingFieldValues
	 * @param {Array} newFieldValues
	 * @returns {Array} finalFieldValues
	 */
	function _preserveFieldValueOrder(existingFieldValues, newFieldValues) {
		var finalFieldValues = [];
		var newFieldValuesMap = {};
		var newFieldValuesUsedMap = {};
		existingFieldValues = existingFieldValues || [];

		if (newFieldValues !== null) {
			if (!$.isArray(newFieldValues)) {
				newFieldValues = newFieldValues.split(',');
			}
			if (!$.isArray(existingFieldValues)) {
				newFieldValues = [ existingFieldValues ];
			}

			for (var i = 0; i < newFieldValues.length; i++) {
				newFieldValuesMap[newFieldValues[i]] = true;
			}

			for (i = 0; i < existingFieldValues.length; i++) {
				if (newFieldValuesMap[existingFieldValues[i]]) {
					finalFieldValues.push(existingFieldValues[i]);
					newFieldValuesUsedMap[existingFieldValues[i]] = true;
				}
			}

			for (i = 0; i < newFieldValues.length; i++) {
				if (!newFieldValuesUsedMap.hasOwnProperty(newFieldValues[i])) {
					finalFieldValues.push(newFieldValues[i]);
					newFieldValuesUsedMap[newFieldValues[i]] = true;
				}
			}
		}

		return finalFieldValues;
	}

	/**
	 * Handles when an edit field is modified
	 * @function _editFieldChanged
	 * @param {Number} nodeID - The node that is associated with the modified field
	 * @param {String} fieldID - The field that was modified
	 * @param {String} fieldValue - The new value of the field
	 * @param {String} dataType - Analysis data type
	 * @param {Boolean} skipPlotRefresh - if 'true', affected plots will not be refreshed
	 * @memberof ESV.editor
	 * @instance
	 */
	function _editFieldChanged(nodeID, fieldID, fieldValue, dataType, skipPlotRefresh) {
		var type = ESV.nodes[nodeID].type;
		dataType = ESV.getUnderlyingDataTypes(nodeID)[0] || dataType;
		var fieldConfigs = {};
		if (CONFIG.editor[dataType].hasOwnProperty(type)) {
			$.extend(true, fieldConfigs, CONFIG.editor[dataType]);
		}
		else {
			$.extend(true, fieldConfigs, CONFIG.editor.common);
		}

		if (!$.isEmptyObject(ESV[type])) {
			$.extend(true, fieldConfigs[type], ESV[type]);
		}
		var field = fieldConfigs[type].fields[fieldID];

		if (field.query === false) {
			return;
		}

		// Fields to watch are those when changed, affect the visibility of other fields
		var fieldsToWatch = [];
		$.each(ESV.nodes[nodeID].filters, function(filterID, filter) {
			if (fieldConfigs[type].fields[filterID].hasOwnProperty("displayConditions")) {
				var keys = Object.keys(fieldConfigs[type].fields[filterID].displayConditions);
				for (var i = 0; i < keys.length; i++) {
					fieldsToWatch.push(keys[i]);
				}
			}
		});
		$.each(ESV.nodes[nodeID].info, function(infoID, filter) {
			if (fieldConfigs[type].fields[infoID].hasOwnProperty("displayConditions")) {
				var keys = Object.keys(fieldConfigs[type].fields[infoID].displayConditions);
				for (var i = 0; i < keys.length; i++) {
					fieldsToWatch.push(keys[i]);
				}
			}
		});

		if ($.inArray(fieldID, fieldsToWatch) > -1) {
			var toggleHidden = false;

			// This field is being watched. If no other fields that are watching this field
			// has their display condition satisfied, clear all those other fields
			$.each(ESV.nodes[nodeID].filters, function(filterID, filter) {
				if (fieldConfigs[type].fields[filterID].hasOwnProperty("displayConditions")) {
					if (fieldConfigs[type].fields[filterID].displayConditions.hasOwnProperty(fieldID)) {
						if (fieldConfigs[type].fields[filterID].displayConditions[fieldID] == fieldValue || (typeof(fieldConfigs[type].fields[filterID].displayConditions[fieldID]) == 'string' && fieldConfigs[type].fields[filterID].displayConditions[fieldID].match(/^\!/) && fieldConfigs[type].fields[filterID].displayConditions[fieldID] != '!' + fieldValue) || ($.isArray(fieldConfigs[type].fields[filterID].displayConditions[fieldID]) && $.inArray(fieldValue, fieldConfigs[type].fields[filterID].displayConditions[fieldID]) != -1)) {
							toggleHidden = true;
						}
					}
				}
			});
			$.each(ESV.nodes[nodeID].info, function(infoID, filter) {
				if (fieldConfigs[type].fields[infoID].hasOwnProperty("displayConditions")) {
					if (fieldConfigs[type].fields[infoID].displayConditions.hasOwnProperty(infoID)) {
						if (fieldConfigs[type].fields[infoID].displayConditions[fieldID] == fieldValue || (typeof(fieldConfigs[type].fields[infoID].displayConditions[fieldID]) == 'string' && fieldConfigs[type].fields[infoID].displayConditions[fieldID].match(/^\!/) && fieldConfigs[type].fields[infoID].displayConditions[fieldID] != '!' + fieldValue) || ($.isArray(fieldConfigs[type].fields[filterID].displayConditions[fieldID]) && $.inArray(fieldValue, fieldConfigs[type].fields[filterID].displayConditions[fieldID]) != -1)) {
							toggleHidden = true;
						}
					}
				}
			});

			if (toggleHidden) {
				config.hiddenToggled = true;
			} else {
				// No field depends on the current field with its current value. Thus clear all other
				// fields that depend on this field
				var $lastModifiedField;
				$.each(ESV.nodes[nodeID].filters, function(filterID, filter) {
					if (fieldConfigs[type].fields[filterID].hasOwnProperty("displayConditions")) {
						if (fieldConfigs[type].fields[filterID].displayConditions.hasOwnProperty(fieldID)) {
							// This filter should be cleared of its value
							var fieldValue = $('#field-' + nodeID + '-' + filterID).val();
							$('#field-' + nodeID + '-' + filterID).val("");
							ESV.nodes[nodeID].filters[filterID].fieldValues = [""];
							if (fieldConfigs[type].fields[filterID].fieldType == "predictivetext" && (fieldValue || $('#field-' + nodeID + '-' + filterID).data('field-updated'))) {
								$('#field-' + nodeID + '-' + filterID).on("change", function(e) {
									// Prevent triggering change event in the containing panel
									// in order to avoid unnecessary plot refreshing
									e.stopPropagation();
								});
								$('#field-' + nodeID + '-' + filterID).tagsinput('removeAll');
								$('#field-' + nodeID + '-' + filterID).unbind("change");
								$('#field-' + nodeID + '-' + filterID).data('field-updated', false);
								$lastModifiedField = $('#field-' + nodeID + '-' + filterID);
							}
						}
					}
				});
				$.each(ESV.nodes[nodeID].info, function(infoID, filter) {
					if (fieldConfigs[type].fields[infoID].hasOwnProperty("displayConditions")) {
						if (fieldConfigs[type].fields[infoID].displayConditions.hasOwnProperty(infoID)) {
							// This filter should be cleared of its value
							var fieldValue = $('#field-' + nodeID + '-' + filterID).val();
							$('#field-' + nodeID + '-' + filterID).val("");
							ESV.nodes[nodeID].filters[filterID].fieldValues = [""];
							if (fieldConfigs[type].fields[filterID].fieldType == "predictivetext" && (fieldValue || $('#field-' + nodeID + '-' + filterID).data('field-updated'))) {
								$('#field-' + nodeID + '-' + filterID).on("change", function(e) {
									// Prevent triggering change event in the containing panel
									// in order to avoid unnecessary plot refreshing
									e.stopPropagation();
								});
								$('#field-' + nodeID + '-' + filterID).tagsinput('removeAll');
								$('#field-' + nodeID + '-' + filterID).unbind("change");
								$('#field-' + nodeID + '-' + filterID).data('field-updated', false);
								$lastModifiedField = $('#field-' + nodeID + '-' + filterID);
							}
						}
					}
				});
				if ($lastModifiedField) {
					// Trigger only a single change event as multiple fields may have been cleared
					// which could cause redundant re-querying/plot refreshing
					$lastModifiedField.trigger("change");
				}
			}
		}

		var displayConditions;

		// If the fields violate the requirements, return with errors
		if (!ESV.editor.areRequiredFieldsCompleted({
					isStructure: false,
					vizObj: ESV.nodes[nodeID],
					type: ESV.nodes[nodeID].type
				})) { return; }
		else if (fieldConfigs[type].fields[fieldID].hasOwnProperty("displayConditions") && fieldConfigs[type].fields[fieldID].fieldType == "predictivetext") {
			displayConditions = fieldConfigs[type].fields[fieldID].displayConditions;
			for (var key in displayConditions) {
				ESV.nodes[nodeID].info[key] = [displayConditions[key]];
			}
		}



		if (fieldID == "title") {
			// Don't requery for the view if it's just a title change
			$("#container-" + nodeID + " .title").val(fieldValue);
			// Update the title on all tracks if applicable
			if (CONFIG.properties[ESV.nodes[nodeID].type].track) {
				var node = ESV.nodes[nodeID];
				var parentNodeId = node.currentTreeIndex === 0 ? node.id : ESV.nodes[node.parentNodeId].id;
				var tracks = node.currentTreeIndex === 0 ? node.tracks : ESV.nodes[node.parentNodeId].tracks;
				$.each(tracks, function() {
					ESV.nodes[this.id].info.title = fieldValue;
				});
				$("#container-" + parentNodeId + " .title").val(fieldValue);
			}

			ESV.nodes[nodeID].info[fieldID] = _preserveFieldValueOrder(ESV.nodes[nodeID].info[fieldID], fieldValue);
			return;
		}

		// If the field has a display condition, make sure that other fields with this display condition that are not satisfied are
		// cleared of its value and hidden
		if (config.hiddenToggled && field.hasOwnProperty("displayConditions")) {
			config.hiddenToggled = false;
			displayConditions = field.displayConditions;
			_clearFieldsWithDisplayCondition(nodeID, type, fieldID, displayConditions);
		}

		if ($.isArray(field.esid) && field.hasOwnProperty("post_processing")) {
			_processMaskedMultiESID(field, fieldValue, nodeID);
		} else if ($.isArray(field.esid)) {
			ESV.nodes[nodeID].filters[fieldID].fieldValues = _processMultiESIDField(field, fieldValue);
		} else if (_isFilter(nodeID, fieldID)) {
			// Save this value back into the ESV node object, keeping the order of the previous fieldValues if possible
			ESV.nodes[nodeID].filters[fieldID].fieldValues = _preserveFieldValueOrder(ESV.nodes[nodeID].filters[fieldID].fieldValues, fieldValue);
		} else {
			ESV.nodes[nodeID].info[fieldID] = _preserveFieldValueOrder(ESV.nodes[nodeID].info[fieldID], fieldValue);
		}


		if (!field.hasOwnProperty("post_processing")) {
			// Visualization updates resulting from fields that need to be post processed will be updated directly from the _processMaskedMultiESID function

			// If the item updated is in a track, then we need to get the parent view node id.
			// The track's view node is not part of the tree
			var id;
			if (ESV.nodes[nodeID].parentNodeId) {
				id = ESV.nodes[nodeID].parentNodeId;

				// Set the current tree index (ie. the track that triggered this update)
				var index = 0;
				$.each(ESV.nodes[id].tracks, function(i) {
					if (this.id == nodeID) {	
						index = i;
					}
				});
				ESV.nodes[id].currentTreeIndex = index;
			} else {
				id = nodeID;
			}
			if (!field.displayDependents && !skipPlotRefresh) {
				ESV.updateStaleVisualizations(id);
			}
		}

		// Remove any facades applied by the view that is being updated
		if(ESV.viewfacades.hasViewFacades()){
			var vizObj = ESV.nodes[ESV.viewfacades.getViewID()];
			if (nodeID == vizObj.id || _isParentOf(vizObj.id, nodeID)) {
				type = ESV.nodes[vizObj.id].type;
				ESV[type].clearViewFacade(vizObj);
			}
		}

		ESV.updateLocalTemplate();
	}

	/**
	 * Checks for parent/child relationship of two nodes traversing
	 * up the tree above the given child node
	 * @function isParentOf
	 * @param {Number} parentNodeID
	 * @param {Number} childNodeID
	 * @return {Boolean}
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */

	function _isParentOf(parentNodeID, childNodeID) {
		var childNode = ESV.nodes[childNodeID];
		var parentFound = false;
		for (var i = 0; i < childNode.parents.length; i++) {
			if (childNode.parents[i] == parentNodeID) {
				return true;
			}
			parentFound = parentFound || _isParentOf(parentNodeID, childNode.parents[i]);
		}
		return parentFound;
	}

	/**
	 * Clears of their values fields, which are conditionally displayed based on the value
	 * of another filter input and that field changes its value as to invalidate the condition
	 * @function _clearFieldsWithDisplayCondition
	 * @param {String} nodeID - Data, Datafilter, Viewfilter of View node ID
	 * @param {String} type - Node type (data, datafilter, viewfilter or one of the plot types)
	 * @param {String} fieldID - ID of updated input field resulting in this function call
	 * @param {Object} displayConditions
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _clearFieldsWithDisplayCondition(nodeID, type, fieldID, displayConditions) {
		$.each(ESV.nodes[nodeID].filters, function(filterID, filter) {
			if (filterID == fieldID) {
				return;
			}
			if (ESV[type].fields[filterID].hasOwnProperty("displayConditions")) {
				var filterDisplayConditions = ESV[type].fields[filterID].displayConditions;
				$.each(displayConditions, function(key, displayCondition) {
					if (filterDisplayConditions.hasOwnProperty(key)) {
						// This filter should be cleared of its value
						$('#field-' + nodeID + '-' + filterID).val("");
						ESV.nodes[nodeID].filters[filterID].fieldValues = [""];
						if (ESV[type].fields[filterID].fieldType == "predictivetext" && ($('#field-' + nodeID + '-' + filterID).data('field-updated') || $('#field-' + nodeID + '-' + filterID).val())) {
							// This filter should be cleared of its value
							$('#field-' + nodeID + '-' + filterID).on("change", function(e) {
								// Prevent triggering change event in the containing panel
								// in order to avoid unnecessary plot refreshing
								e.stopPropagation();
							});
							$('#field-' + nodeID + '-' + filterID).tagsinput('removeAll');
							$('#field-' + nodeID + '-' + filterID).unbind("change");
							$('#field-' + nodeID + '-' + filterID).data('field-updated', false);
						}
					}
				});
			}
		});

		// TODO: Code for info is not guaranteed to work
		$.each(ESV.nodes[nodeID].info, function(filterID, filter) {
			if (filterID == fieldID) {
				return;
			}
			if (ESV[type].fields[filterID].hasOwnProperty("displayConditions")) {
				var filterDisplayConditions = ESV[type].fields[filterID].displayConditions;
				$.each(displayConditions, function(key, displayCondition) {
					if (filterDisplayConditions.hasOwnProperty(key)) {
						// This filter should be cleared of its value
						$('#field-' + nodeID + '-' + filterID).val("");
						ESV.nodes[nodeID].info[filterID] = [""];
						if (ESV[type].fields[filterID].fieldType == "predictivetext") {
							$('#field-' + nodeID + '-' + filterID).tagsinput('removeAll');
						}
					}
				});
			}
		});
	}

	/**
	 * Determines whether a field is a filter
	 * @functon _isFilter
	 * @param {Number} nodeID - Visualization node ID
	 * @param {String} fieldID - Node field ID
	 * @returns {Boolean} - true if field is a filter
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _isFilter(nodeID, fieldID) {
		if (ESV.nodes[nodeID].filters[fieldID] !== null && ESV.nodes[nodeID].filters[fieldID] !== undefined) {
			return true;
		} else {
			return false;
		}
	}

	/**
	 * Runs any post processing of field values (ie. Gene names may need to be mapped to a start/end pos, and chrom num through a server call)
	 * @function _processMaskedMultiESID
	 * @param {Object} field - The field that has changed
	 * @param {String} fieldValue - The user inputted field value
	 * @param {Number} nodeID - The node that is associated with a field
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _processMaskedMultiESID(field, fieldValue, nodeID) {
		var fieldESID = field.esid;
		var fieldValueArray = fieldValue;
		if (fieldValueArray === null) {
			fieldValueArray = [];
		} else if (!$.isArray(fieldValueArray)) {
			fieldValueArray = fieldValueArray.split(",");
		}

		ESV.nodes[nodeID].filters[field.id].fieldValues = fieldValueArray;
		var blockingPromise = new $.Deferred();

		// Run any post processing on the field values
		field.post_processing.execute(field.id, ESV.nodes[nodeID], function(updatedNode) {
			ESV.nodes[nodeID] = updatedNode;
			blockingPromise.resolve();
		});

		// THe promise is resolved when all the server calls return
		$.when(blockingPromise).then(function() {
			ESV.updateStaleVisualizations(nodeID);
		});
	}

	/**
	 * Runs any pattern extraction on the field (ie. Coordinate info is extracted from a user inputted string using the pattern chr*:*-* where each star represents a queryable value)
	 * @function _processMultiESIDField
	 * @param {Object} field - The field that has changed
	 * @param {String} fieldValue - The user inputted field value
	 * @returns {Array} processedFieldValueArray - An array of extracted queryable values (w/ positions corresponding to the ESID array)
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _processMultiESIDField(field, fieldValue) {
		var fieldESID = field.esid;
		var fieldValueArray = fieldValue;
		if (fieldValueArray === null) {
			fieldValueArray = [];
		} else if (!$.isArray(fieldValueArray)) {
			fieldValueArray = fieldValueArray.split(",");
		}

		var pattern = fieldESID[0];
		var patterns = pattern.split("|");

		var processedFieldValueArray = [];
		for (var i = 0; i < fieldValueArray.length; i++) {
			var valueArr = _getValueArrayFromPatterns(patterns, fieldValueArray[i]);
			var fieldValueItemStr = "";
			for (var j = 0; j < valueArr.length; j++) {
				// Run any custom query terms processing
				if (field.hasOwnProperty("customQueryTerm")) {
					valueArr[j] = field.customQueryTerm(fieldESID[j + 1].esid, valueArr[j]);
				}

				fieldValueItemStr += valueArr[j];

				if (j < (valueArr.length - 1)) {
					fieldValueItemStr += ",";
				}
			}

			processedFieldValueArray.push(fieldValueItemStr);

		}

		return processedFieldValueArray;
	}

	// ===========================


	// --- Create Panel Functions ---

	/**
	 * Creates a structure, triggered by the user
	 * @function initStructureCreation
	 * @param {String} type - The particular structure type that is going to be created
	 * @memberof ESV.editor
	 * @instance
	 */
	esv.initStructureCreation = function(type) {
		ESV.editor.structureStagingArray = [];
		ESV.editor.structureStagingIDMap = {};

		var template = ESV.structures[type];
		var structureID = ESV.generateID();
		// We pre-create all of the nodes in this particular structure
		var nodeIDs = [];
		for (var i = 0; i < template.structure.length; i++) {
			// Creates a blank node that we will populate with data later
			var node = _createDefaultNode(null, structureID);

			// Ensure that the created node ID is unique
			while ($.inArray(node.id, nodeIDs) > -1) {
				node = _createDefaultNode(null, structureID);
			}
			nodeIDs.push(node.ID);

			// Push the node onto the staging area
			ESV.editor.structureStagingArray.push(node);

			// Map the temporary ID to the actual generated ID
			var tempID = template.structure[i].id;
			ESV.editor.structureStagingIDMap[tempID] = node.id;
		}

		ESV.editor.updateCreatePanel({
			structureType: type,
			multiStep: true,
			step: 0
		});
	};

	/**
	 * Updates the create panel tab contents (eg. displays which elements are allowed to be displayed and the fields to create these elements)
	 * @function updateCreatePanel
	 * @param {Object} params - Configuration input parameters
	 * @memberof ESV.editor
	 * @instance
	 */
	esv.updateCreatePanel = function(params) {
		var createPanelHTML = '';
		var title = '';
		var icon = '';
		var structureType = params.structureType;
		var step = params.step;
		var type = params.type;

		if ((type === null || type === undefined) && structureType !== undefined && structureType !== null) {
			type = ESV.structures[structureType].structure[step].type;
		}

		if (type == "view") {
			// Views are special during the structure creation process
			// The fields are preceeded by a page where the user selects the type of view they want to create
			ESV.editor.renderCreatePanelWithViews({
				structureType: structureType,
				type: "view",
				step: step
			});
		} else if (type == "template") {
			ESV.editor.renderCreatePanelWithTemplates(params);
		} else if (params.multiStep) {
			var totalSteps = ESV.structures[structureType].structure.length;
			var nodeID = ESV.editor.structureStagingArray[step].id;
			var dataType = ESV.getUnderlyingDataTypes(nodeID)[0] || 'common';

			$.each(ESV.editor.structureStagingArray, function() {
				if (CONFIG.properties[type].track && dataType != "common") {
					this.recordType = CONFIG.editor[dataType].recordType;
				}
				if (this.type === null) {
					this.type = type;
				}
			});

			if (CONFIG.properties[type].track) {
				if (ESV.cc.currentElement) {
					if (structureType == "viewFromViewFilter") {
						var node = ESV.nodes[ESV.cc.currentElement.id];
						var dataFilter = node.children[0];
						var dataNode = ESV.nodes[dataFilter].children[0];
						dataNode = ESV.nodes[dataNode];
						dataType = dataNode.filters["data-all-type"].fieldValues.join();
					}									
				}
			}

			createPanelHTML += _generatePagenationHTML(structureType, type, step, totalSteps);

			title = ESV.properties[type].title;
			icon = ESV.properties[type].icon;

			var dataType = ESV.getUnderlyingDataTypes()[0];

			createPanelHTML	+=	'<div class="sidebar-group-left">\
								<img src="' + icon + '" />\
							</div>\
							<div class="sidebar-group-right">\
								<div class="sidebar-group-title"><h5>' + title + (type == 'datafilter' ? '<a class="configure-field-link" data-node="datafilter" data-type="' + dataType + '"><span class="settings glyphicon glyphicon-cog"></span></a>' : '') + '</h5>' + '</div>\
								<div class="form-horizontal">\
									<fieldset id="create-' + type + '-form-0">\
									</fieldset>\
								</div>';

			if (type == 'view') {
			} else if (step == (totalSteps - 1)) {
				createPanelHTML	+=	'<button id="create-finish" data-structure="' + structureType + '" data-currenttype="' + type + '" data-currentstep="' + step + '" class="btn btn-primary pull-right">Finish</button>';
			} else {
				createPanelHTML	+=	'<button id="create-next" data-structure="' + structureType + '" data-currenttype="' + type + '" data-currentstep="' + step + '" class="btn btn-primary pull-right">Next</button>';
			}
			createPanelHTML	+=	'</div>';

			if($("body > #create-panel-popup").length > 0){
				ESV.createPanelPopup(ESV.structures[structureType].title, createPanelHTML, ' ');
			} else {
				var fade = " fade"
				ESV.createPanelPopup(ESV.structures[structureType].title, createPanelHTML, fade);
			}

			if (params.type !== 'view') {
				var fieldset = _createStructureFieldset(type, structureType);
				var filters = ESV.editor.structureStagingArray[step].filters;
				var info = ESV.editor.structureStagingArray[step].info;
				var fieldIDs = Object.keys(fieldset).sort(function(a, b) {
					var posA = parseInt(fieldset[a].position) || 1000;
					var posB = parseInt(fieldset[b].position) || 1000;
					if (posA > posB) {
						return 1;
					}
					if (posA < posB) {
						return -1;
					}
					return 0;
				});
				for (var idx in fieldIDs) {
					var fieldID = fieldIDs[idx];
					var field = fieldset[fieldID];
					// Find existing values if they exist (eg. user pressed the previous page button during structure creation)
					var existingValues = null;
					if (filters.hasOwnProperty(field.id)) {
						existingValues = filters[field.id].fieldValues;
					} else if (info.hasOwnProperty(field.id)) {
						existingValues = info[field.id];
					} else if (field.hasOwnProperty("setHiddenValue")) {
						existingValues = [field.setHiddenValue(dataType)];
					}

					_renderPanelField({
						panelType: 'create',
						nodeID: nodeID,
						structureType: structureType,
						nodeType: type,
						fieldObj: field,
						existingValues: existingValues,
						hidden: field.hidden == true || field.hidden == "create"
					});
				}
			}
		}
		$('.configure-field-link').on("click", function(e) {
			$('.modal').modal('hide');
			ESV.editor.configureFieldset($(this).data('type'), $(this).data('node'));
		});
	}

	/**
	 * Before a user can input the fields to create a new view, they must first specify the type of view they want to create. This renders those options
	 * @function renderCreatePanelWithViews
	 * @param {Object} params - Configuration input parameters
	 * @memberof ESV.editor
	 * @instance
	 */
	esv.renderCreatePanelWithViews = function(params) {
		var createPanelHTML = "";
		var active = '';
		var structureType = '';
		var type = '';
		var step = '';
		var sourceID = '';

		if (params != null) {
			if (params.hasOwnProperty("existingValue")) {
				active = 'create-view-active';
			}
			if (params.hasOwnProperty("type")) {
				type = params.type;
			}
			if (params.hasOwnProperty("step")) {
				step = params.step;
			}
			if (params.hasOwnProperty("structureType")) {
				structureType = params.structureType;
			}
			if (params.hasOwnProperty("sourceID")) {
				sourceID = params.sourceID;
			}
		}
		createPanelHTML += structureType !== ''
			? _generatePagenationHTML(structureType, type, step, ESV.structures[structureType].structure.length)
			: '';

		createPanelHTML	+=	'<div class="sidebar-group-left">\
							<img src="img/ic-view.png" />\
						</div>\
						<div class="sidebar-group-right">\
							<div class="sidebar-group-title"><h5>Select a Visualization Type</h5></div>\
						</div>';


		var dataTypes = ESV.getUnderlyingDataTypes();
		if (!dataTypes.length && ESV.cc.currentElement) {
			var currentElementID = parseInt(ESV.cc.currentElement.id);
			if (currentElementID){
				dataTypes = ESV.getUnderlyingDataTypes(currentElementID);
			}
		}

		_configureViews(dataTypes[0]);

		var properties = $.extend(true, {}, ESV.properties);
		if (structureType == "dataFromViewFilter") {
			var plotTypes = [];
			var currentElementID = parseInt(ESV.cc.currentElement.id);
			if (currentElementID){
				// this should eventually loop thru all the m
				var viewNodes = ESV.nodes[currentElementID].parents;
				$.each(viewNodes, function(idx, value) {
					var node = ESV.nodes[value];
					plotTypes.push(node.type);
				});
				$.each(properties, function(key, val) {
					if (plotTypes.indexOf(key) == -1) {
						delete properties[key];
					}
				});
			}
		}

		$.each(properties, function(key, elementInfo) {
			// If manually disabled, don't display at all
			if (elementInfo.disabled) {
				return;
			}

			if (elementInfo.type == "view") {
				var dependenciesSatisfied = true;
				// Skip views not listed in the specific data type configuration
				if (key && !CONFIG.editor[dataTypes[0]].hasOwnProperty(key)) {
					dependenciesSatisfied = false;
				}

				if (elementInfo.dependencies) {
					// Check if this element is allowed given the underlying data type
					if (structureType != '') {
						dependenciesSatisfied = _areStructureDependenciesSatisfied(elementInfo.dependencies, structureType);
					} else {
						dependenciesSatisfied = _areDependenciesSatisfied(elementInfo.dependencies, sourceID);
					}
				}

				if (dependenciesSatisfied) {
					if (structureType != '') {
						createPanelHTML += '<div class="create-view ' + active + '" data-structure="' + structureType + '" data-type="' + key + '" data-currentstep="' + step + '">';
					} else {
						createPanelHTML += '<div class="create-view ' + active + '" data-type="' + key + '">';
					}
					createPanelHTML += 	'<div class="create-element-left">\
											<img src="' + elementInfo.icon + '"  />\
										</div>\
										<div class="create-element-right">\
											' + (elementInfo.desc ? '' : '<br/>') + '<strong>' + elementInfo.title + '</strong><br />\
											' + elementInfo.desc + '\
										</div>\
									</div>';
				}
			}
		});

		ESV.createPanelPopup(ESV.structures[structureType].title, createPanelHTML, ' ');

	};

	/**
	 * Generates a list of available templates for given data type(s)
	 * TODO: remove redundant code used to generate published views and templates and merge
	 * functions that perform similar tasks
	 * @function renderCreatePanelWithTemplates
	 * @param {Object} params - Configuration input parameters
	 * @memberof ESV.editor
	 * @instance
	 */
	esv.configureTemplatesPanel = function(params) {
		var createPanelHTML = "";
		var active = '';
		var structureType = '';
		var type = '';
		var step = '';
		var sourceID = '';
		var includePatientTemplates = false;
		var patientSampleMap = {};
		var omittedSamples = []; // list of samples which will not be plotted when a patient template is used
		var dataTypes = [];

		if (params != null) {
			if (params.hasOwnProperty("existingValue")) {
				active = 'create-view-active';
			}
			if (params.hasOwnProperty("type")) {
				type = params.type;
			}
			if (params.hasOwnProperty("step")) {
				step = params.step;
			}
			if (params.hasOwnProperty("structureType")) {
				structureType = params.structureType;
			}
			if (params.hasOwnProperty("sourceID")) {
				sourceID = params.sourceID;
			}
		}

		createPanelHTML += structureType !== '' 
				? _generatePagenationHTML(structureType, type, step, ESV.structures[structureType].structure.length)
				: ''

		createPanelHTML	+=	'<div class="sidebar-group-left">\
							<img src="img/ic-view.png" />\
						</div>\
						<div class="sidebar-group-right">\
							<div class="sidebar-group-title"><h5>Select a Template</h5></div>\
						</div>\
							<div class="form-group" style="padding: 0 10px;">\
								<i class="fa fa-search"></i>\
								<input id="template-filter-term" type="text" placeholder="Filter templates by tag" class="form-control edit-text filter-term">\
							</div>\
							<div id="template-list" class="stored-view-list">\
						</div>';

		var panelTitle = structureType ? ESV.structures[structureType].title : "Configure Templates";
		ESV.createPanelPopup(panelTitle, createPanelHTML, ' ');

		var storedViewIndex = ESV.config["URL_" + params.storedViewType.toUpperCase() + "_INDEX_SEARCH"];
		
		// TODO: introduce a delay before the event handler is executed in order to avoid excessive querying,
		$('#template-filter-term').keyup(function() {
			var queryTerm = "*";
			if ($(this).val()) {
				queryTerm += $(this).val() + "*";
			}

			var query = ESV.queries.getSavedTemplatesMapping(queryTerm, dataTypes);

			if (!structureType) {
				query["query"] = query["query"]["bool"]["must"][0];
			} else if (!includePatientTemplates) {
				query["query"]["bool"]["must_not"] = [{
					"terms": {
						"patient_view": [true]
					}
				}];
			} else {
				$('#template-list').data('patient-map', patientSampleMap);
				$('#template-list').data('omitted-samples', omittedSamples);
			}

			ESV.queries.makeSimpleQuery(query, storedViewIndex, true, 
				function(response) {
					if (response.hits.total) {
						$('#template-list .alert').remove();
						_populateTemplatePanel(response, queryTerm == "*", !structureType)
					}
					else {
						esv.emptyPanel(CONFIG.messages.emptyTemplatePanel);
					}
				}, function(err){
					if (!$.isEmptyObject(err.responseJSON) && err.responseJSON.error.type == 'index_not_found_exception') {
						var newStoredViewIndex = ESV.config["URL_" + params.storedViewType.toUpperCase() + "_INDEX"];
						console.log('Creating index ' + newStoredViewIndex);
						
						ESV.queries.makeSimpleQuery(ESV.editor.getPublishedTemplatesMapping(), newStoredViewIndex, true,
							function(response) {
								console.log('Index ' + newStoredViewIndex + ' created');
							}
						);
					}
					esv.emptyPanel(CONFIG.messages.emptyTemplatePanel);
				}
			);
		});

		if (structureType) {
			// Determine if any of the selected samples are from the same patient, if so,
			// display only templates intended to be used with patiens, also patients with
			// only one sample ID selected will be omitted
			var selectedSampleIDs = ESV.getUnderlyingDataValues(null, null, "data-all-sample_id");
			var query = ESV.queries.getPatientMapping(ESV.mappings);
			query.query.terms[ESV.mappings.sampleID] = selectedSampleIDs;

			ESV.queries.makeSimpleQuery(query, null, true, function(response) {
				var patientBuckets = response.aggregations.patient_id.buckets;
				var dataTypeBuckets = response.aggregations.data_types.buckets;

				for (var i in patientBuckets) {
					var sampleBuckets = patientBuckets[i].sample_id.buckets;

					if (sampleBuckets.length < 2) {
						omittedSamples = omittedSamples.concat($.map(sampleBuckets, function(value) {
							return value.key;
						}));
						continue;
					}
					patientSampleMap[patientBuckets[i].key] = $.map(sampleBuckets, function(value) {
						return value.key;
					});
					omittedSamples = omittedSamples.concat(patientSampleMap[patientBuckets[i].key].splice(2));
				}
				if (!$.isEmptyObject(patientSampleMap)) {
					includePatientTemplates = true;
				}
				dataTypes = $.map(dataTypeBuckets, function(value) {
					return value.key;
				});

				$('#template-filter-term').trigger('keyup');
			});
		} else {
			$('#template-filter-term').trigger('keyup');
		}

		// Open a stored template
		$('#template-list').on('click', '.open-view', function(e) {
			if(e.target.id.match(/^delete-/)) {
				ESV.promptDeleteStoredViewConfirmation(e.target.id.replace('delete-', ''));
				return;
			}
			if (structureType) {
				ESV.restoreSavedState("template", $(this).data('view-id'), $('#template-list').data('patient-map'), $('#template-list').data('omitted-samples'));
				$('#create-panel-popup').modal('hide');
			}
			else {
				var viewID = $(this).data('view-id');
				ESV.showLoading();
				ESV.queries.getRecordByID(
					$(this).data('view-id'),
					storedViewIndex,
					function(response) {
						if (response.hits.hits.length) {
							var savedState = response.hits.hits[0]._source;
							ESV.hideLoading();
							savedState._id = viewID;
							delete savedState.timestamp;
							ESV.createTemplatePopup(savedState);
						}
						else {
							esv.notificationPopup('No saved state could be found.');
							ESV.hideLoading();
						}
					},
					function(error) {
						ESV.hideLoading();
					}
				);
			}
		});
	}

	/**
	 * Processes aggregations from elasticsearch published dashboard query
	 * @function _processPublishedViewRecords
	 * @param {Object} aggregations
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _processPublishedViewRecords(aggregations) {
		var processedRecords = []

		var dashboardBuckets = aggregations['dashboards'].buckets

		var processedDashboards = dashboardBuckets.map(function(dashboard) {
			var dashboardName = dashboard['key']
			var dashboardTags = dashboard['tags']['buckets'].map(function(tag) {
				var tagName = tag['key']
				return {
					dashboard: dashboardName,
					tag: tagName,
					title: tag.title['buckets'][0]['key'],
					sample_ids: tag.sample_ids['buckets'][0]['key'],
					description: tag.description['buckets'][0]['key']
				}
			})
			return dashboardTags
		})


		return processedDashboards
	}


	/**
	 * Generates a list of published views in the 'Browse' panel
	 * @function _populateBrowsePanel
	 * @param {Object} response - a query response object
	 * @param {Boolean} hideLinks - don't show view links, just the tags list
	 * @param {Boolean} enableEdit - whether the panel is rendered in edit mode
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _populateBrowsePanel(response, hideLinks, enableEdit) {
		var $container = $('#sidebar-browse');
		var browsePanelHTML = '<div id="browse-accordian">';
		var tags = [];

		// for each dashboard
		for (var idx in response) {
			var dashboard = response[idx]
			var dashboardName = dashboard[0]['dashboard']
			var dashboardID = "published-" + idx

			browsePanelHTML += 
				'<div class="panel-grouping"><div class="grouping-title open-menu-style" data-toggle="collapse" data-target="#' + 
					$container.attr('id') + "-" + dashboardID +'">' +
				'<a>' + dashboardName + '</a><i class="grouping-title-icon glyphicon glyphicon-minus icon-open-menu"></i></div>' +
				'<div id="' + $container.attr('id') + '-' + dashboardID + '" class="collapse in">';

			// for each tag in dashboard
			for (var recordIdx in dashboard) {

				var record = dashboard[recordIdx]
				var recordID = dashboardID + "-" + recordIdx
				browsePanelHTML += '<div class="sub-grouping">' +
										'<div class="sub-title" data-toggle="collapse" data-target="#published-tag-' + recordID + '">' +
											'<a>' + record.tag + '</a>' + 
											'<i class="sub-title-icon glyphicon-plus"></i>' + 
										'</div>' +
										'<div id="published-tag-'+ recordID +'" class="sub-content collapse">' +
											'<div class="open-view"' + 
												'data-filter-term="'+ record.sample_ids +
												'" data-sample-id="' + record.sample_ids + 
												'" data-template-id="' + dashboardName + 
											'">' +
												'<div class="browse-element">' +
													'<div class="view-title">' + record.title + '</div>' + 
													(record.description ? '<div class="view-description"> ' + record.description + '</div>' 
																	 : '') + 
												'</div>' + 
											'</div>' + 
										'</div>' + 
									'</div>'
			}


			browsePanelHTML += '</div></div>'

		}

		browsePanelHTML += '</div>'

 		$container.data('input-tags', tags);
 
 		$container.empty();
		$container.append(browsePanelHTML);
	}

	/**
	 * Generates a list of templates in a templates panel
	 * @function _populateTemplatePanel
	 * @param {Object} response - a query response object
	 * @param {Boolean} hideLinks - don't show view links, just the tags list
	 * @param {Boolean} enableEdit - whether the panel is rendered in edit mode
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _populateTemplatePanel(response, hideLinks, enableEdit) {
		var icon = "img/ic-structure-twoviews.png";
		var browsePanelHTML = "";
		var buckets = response.aggregations.tags.buckets;
		var $container = $('#template-list');
		var tags = [];

		for (var idx in buckets) {
			var tagID = 'template-tag-' + idx;

			if (enableEdit && hideLinks) {
				tags.push(buckets[idx].key)
			}
			browsePanelHTML += '<div class="panel-grouping"><div class="grouping-title"><span data-toggle="collapse" href="#' + $container.attr('id') + '-' + tagID + '"\
									><strong>' + buckets[idx].key + '</strong></span></div><div id="' + $container.attr('id') + '-' + tagID + '" class="collapse\
										' + ((hideLinks && idx != buckets.length - 1) ? '' : ' in') + '">';

			var savedViews = buckets[idx].saved_views.buckets;
			for (var i in savedViews) {
				var viewID = savedViews[i].key.replace(/^.*\#/, '');
				browsePanelHTML += '<div class="open-view"  data-view-id="' + viewID + '" data-view-type="template">';
				browsePanelHTML += '<div class="create-element-left">\
					<img src="' + icon + '"/>\
						</div>\
							<div class="create-element-right">';
				if (enableEdit) {
					browsePanelHTML += '<a class="delete-saved-view pull-right" href="#"><i id="delete-' + viewID + '" class="fa fa-times pull-right"></i></a>';
				}
				browsePanelHTML += (savedViews[i].description.buckets[0].key ? '' : '<br/>') + '<strong>' + savedViews[i].title.buckets[0].key + '</strong><br />\
							' + savedViews[i].description.buckets[0].key + '\
						</div>\
					</div>';
			}

			browsePanelHTML += '</div></div>'
		}
			$container.data('input-tags', tags);
			$container.empty();
			$container.append(browsePanelHTML);
	}

	/**
	* Populates the 'Browse' panel
	* @function renderBrowsePanelWithViews
	* @memberof ESV.editor
	* @instance
	*/
	esv.renderBrowsePanelWithViews = function() {
		if (!$('#sidebar-browse-filter #browse-filter-term').length) {
			var filterInputHTML = '<div class="form-group">\
					<i class="fa fa-search"></i>\
					<input id="browse-filter-term" type="text" placeholder="Filter stored views by tag" class="form-control edit-text filter-term">\
				</div>';
			$('#sidebar-browse-filter').addClass('sidebar-create').append(filterInputHTML);

			$('#browse-filter-term').keyup(function() {
				var queryTerm = "*";
				if ($(this).val()) {
					queryTerm += $(this).val() + "*";
				}
				var query = ESV.queries.getPublishedViewIndexMappings(queryTerm);
				ESV.queries.makeSimpleQuery(query, ESV.config.URL_DASHBOARD_PUBLISHED, true,
					function(response) {
						if (response.hits.total) { 
							$('#browse-element .alert').remove();
							var processedResponse = _processPublishedViewRecords(response.aggregations)
							_populateBrowsePanel(processedResponse, queryTerm == "*");
						}
						else {
							esv.emptyPanel(CONFIG.messages.emptyBrowsePanel);
						}
					}, function(err){
						if (!$.isEmptyObject(err.responseJSON) && err.responseJSON.error.type == 'index_not_found_exception') {
							console.log(ESV.config.URL_PUBLISHED_INDEX + " index does not exist!");
						}
						esv.emptyPanel(CONFIG.messages.emptyBrowsePanel);
					}
				);
			});

			$('#browse-filter-term').trigger('keyup');
		}
	}

	/**
	 * Deletes a template
	 * @function deleteStoredTemplate
	 * @param {String} storedViewID
	 * @memberof ESV.editor
	 * @instance
	 */

	esv.deleteStoredTemplate = function(storedViewID) {
		if (!storedViewID) {
			return;
		}
		var $container_el = $('.stored-view-list');
		$.ajax({
			url: ESV.config["URL_TEMPLATE_INDEX_SAVE"] + '/' + storedViewID,
			type: "DELETE",
			crossDomain: true,
			async: true,
			success: function(response) {
				if($container_el.find('.open-view').length == 1) {
					esv.emptyPanel(CONFIG.messages.emptyTemplatePanel);
				}
				else {
					if ($container_el.find('[data-view-id="' + storedViewID + '"]').siblings('.open-view').length) {
						$container_el.find('[data-view-id="' + storedViewID + '"]').remove();
					}
					else {
						$container_el.find('.panel-grouping').has('[data-view-id="' + storedViewID + '"]').remove();
					}
				}
			},
			error: function(err)  {
				ESV.notificationPopup('Unable to delete stored view.');
			}
		});
	}

	/**
	 * Open the interface for editing stored views and templates
	 * @function configureStoredViewsPanel
	 * @param {String} type 
	 * @memberof ESV.editor
	 * @instance
	 */

	esv.configureStoredViewsPanel = function(type) {
		esv.configureTemplatesPanel({
			"storedViewType": type
		});
	}

	/**
	 * _findTypeAhead external hookin
	 * @function findTypeAhead
	 * @param {String} q - The text search string
	 * @param {String} prid - The field in the database to search
	 * @param {String} pridURL (optional) - The URL to the database
	 * @memberof ESV.editor
	 * @instance
	 */
	esv.findTypeAhead = function(q, prid, pridURL) {
		return _findTypeAhead(q, prid, pridURL);
	}

	/**
	 * _configureViews external hookin
	 * @function configureViews
	 * @param {String} dataType - Analysis data type
	 * @memberof ESV.editor
	 * @instance
	 */
	esv.configureViews = function(dataType) {
		_configureViews(dataType);
	}

	/**
	 * Initializes views/plots configuratons for particular data type
	 * @function _configureViews
	 * @param {String} dataType - Analysis data type
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _configureViews(dataType) {

		var configurableViews = Object.keys(CONFIG.views);
		var configuredViews = Object.keys(CONFIG.editor[dataType]).filter(function(item) {
			return configurableViews.indexOf(item) != -1;
		});

		if (configuredViews.length) {
			return;
		}

		if (!configuredViews.length) {
			for (var idx in configurableViews) {
				var view = configurableViews[idx];
				if (!ESV[view]) {
					continue;
				}
				if (CONFIG.views[view].hasOwnProperty('fields')) {
					var viewTemplate = $.extend(true, {}, CONFIG.views[view]);
					$.each(viewTemplate.fields, function(key, value) {
						value.dataReference = dataType;
						value.labelHeader = CONFIG.editor[dataType].label;
						if (value.hasOwnProperty('fieldValues')) {
							value.fieldValues = value.fieldValues.concat(_populateFieldValues(dataType, view, key, value.isTableColumns));
							var notSorted = [];
							if (value.fieldValues.length && $.inArray(value.fieldValues[0][0], ['none', 'frequency', 'all']) != -1) {
								notSorted.push(value.fieldValues.shift());
							}
							if (!value.isTableColumns) {
								value.fieldValues.sort(function(a, b) {
									return a[0].toLowerCase().localeCompare(b[0].toLowerCase());
								});
							}
							while(notSorted.length) {
								value.fieldValues.unshift(notSorted.pop());
							}
							if (value.selectedOption) {
								var selectedOptionIdx = parseInt(value.selectedOption);
								if (!isNaN(selectedOptionIdx) && value.fieldValues.length >= selectedOptionIdx) {
									value.fieldValues[selectedOptionIdx - 1][3] = true;
								}
							}
						}
						if (value.hasOwnProperty('displayConditions')) {
							$.each(value.displayConditions, function(condition, clause) {
								viewCondition = condition.replace(/-/, '-' + dataType + '-');
								value.displayConditions[viewCondition] = clause;
								delete value.displayConditions[condition];
							})
						}
						value.id = key.replace(/-/, '-' + dataType + '-');
						if (value.linkedField) {
							value.linkedField = value.linkedField.replace(/-/, '-' + dataType + '-');
						}
						viewTemplate.fields[value.id] = value;
						delete viewTemplate.fields[key];
						if (value.hasOwnProperty('displayConditionType')) {
							$.each(value.displayConditionType, function(fieldID, fieldValueType) {
								if ($.isEmptyObject(value.displayConditions)) {
									value.displayConditions = _populateDisplayConditions(dataType, fieldID, fieldValueType);
								}
								else {
									$.extend(true, value.displayConditions, _populateDisplayConditions(dataType, fieldID, fieldValueType));
								}
							});
						}
					});
					CONFIG.editor[dataType][view] = viewTemplate;
				}
				$.extend(true, ESV[view].fields, CONFIG.editor[dataType][view].fields);
			}
		}

	}

	/**
	 * Populates the fieldValues attribute of a data type view
	 * @function _populateFieldValues
	 * @param {String} dataType - A data type
	 * @param {String} viewType - A view/plot type
	 * @param {String} fieldID - The field that needs to be populated
	 * @param {Boolean} isTableColumns - are the field values used as table columns
	 * @returns {Object} fieldValues - an array of selectable options
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */

	function _populateFieldValues(dataType, viewType, fieldID, isTableColumns) {
		if (!CONFIG.views.hasOwnProperty(viewType) || !CONFIG.views[viewType].fields.hasOwnProperty(fieldID)) {
			return []
		}
		var fieldValueType = CONFIG.views[viewType].fields[fieldID].inputType;
		var allowedFieldTypes = [];
		if (fieldValueType == 'categorical') {
			allowedFieldTypes = ["select", "multiselect", "predictivetext"];
		}
		else if (fieldValueType == 'numerical') {
			allowedFieldTypes = ["number"];
		}
		else if (fieldValueType == 'all') {
			allowedFieldTypes = ["number", "select", "multiselect", "predictivetext"];
		}

		var fieldValues  = [];
		$.each(CONFIG.editor[dataType].datafilter.fields, function(fieldID, field) {
			if (fieldValueType == 'categorical' && (!$.isArray(field.fieldValues) || field.fieldValues.length < 2)) {
				return;
			}
			if ($.inArray(field.fieldType, allowedFieldTypes) != -1) {
				if (isTableColumns) {
					if ($.inArray(fieldID, [CONFIG.mappings.startPos, CONFIG.mappings.endPos]) != -1) {
						return;
					}
					fieldValues = fieldValues.concat([[field.esid, field.label, field.label, false, false]]);
				}
				else {
					fieldValues = fieldValues.concat([[field.esid, "", field.label, false, false ]]);
				}
			}
		});
		if (isTableColumns) {
			fieldValues.sort(function(a, b) {
				return a[0].toLowerCase().localeCompare(b[0].toLowerCase());
			});
		}

		return fieldValues;
	}

	/**
	 * Given a data type, a field to be used as a condition and the type of value
	 * it should take, generates the displayConditions configuration settings
	 * @function _populateDisplayConditions
	 * @param {String} - dataType - Analysis data type
	 * @param {String} - conditionField - field that will be a display conditions
	 * @param {String} - conditionFieldType - numerical or categorical
	 * @returns {Object} - displayConditions
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _populateDisplayConditions(dataType, conditionField, conditionFieldType) {
		var allowedFieldTypes = ["number", "select", "multiselect", "predictivetext"];
		if (conditionFieldType == 'categorical') {
			allowedFieldTypes = ["select", "multiselect", "predictivetext"];
		}
		else if (conditionFieldType == 'numerical') {
			allowedFieldTypes = ["number"];
		}
		var displayConditions = {};
		displayConditions[conditionField.replace(/-/, '-' + dataType + '-')] = $.map(CONFIG.editor[dataType].datafilter.fields, function(field, idx) {
			if ($.inArray(field.fieldType, allowedFieldTypes) != -1) {
				return field.esid;
			}
		});
		return displayConditions;
	}

	/**
	 * Fills the create panel with structures that the user is able to add
	 * @function renderCreatePanelWithNodes
	 * @memberof ESV.editor
	 * @instance
	 */
	esv.renderCreatePanelWithNodes = function() {
		var structuresAllowedToBeAdded = _findStructuresAllowedToBeAdded();

		var elementsHTML = "";
		for (var i = 0; i < structuresAllowedToBeAdded.length; i++) {
			var structureInfo = ESV.structures[structuresAllowedToBeAdded[i]];
			elementsHTML += '<div data-id="' + structuresAllowedToBeAdded[i] + '" class="create-element">\
								<div class="create-element-left">\
									<img src="' + structureInfo.icon + '" />\
								</div>\
								<div class="create-element-right">\
									<strong>' + structureInfo.title + '</strong><br />\
									' + structureInfo.desc + '\
								</div>\
							</div>';
		}

		$('#sidebar-create').empty();
		$('#sidebar-create').append(elementsHTML);
		$('#tab-overlay').hide();
	}

	/**
	 * Returns the addable structures based on the current selected node
	 * @function _findStructuresAllowedToBeAdded
	 * @returns {Array} addableStructures
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _findStructuresAllowedToBeAdded() {
		var addableStructures = [];
		// Adds default addable structures

		// Disabled the option to add a Data source only, GV-527
		// addableStructures.push("data");
		$.each(ESV.structures, function(key, value) {
			if (value.core) {
				return;
			} else {
				addableStructures.push(key);
			}
		});

		return addableStructures;
	}


	// ================================
	// ----- Edit Panel Functions -----

	/**
	 * Renders the edit panel when a node or view is selected
	 * @function renderEditPanel
	 * @param {Object} nodeData
	 * @memberof ESV.editor
	 * @instance
	 */
	esv.renderEditPanel = function(nodeData) {
		$('#edit-element').empty();

		var nodeID = nodeData.id;
		var nodeObj = ESV.nodes[nodeData.id];
		var type = nodeData.type;

		// TODO: Check if the view type is supported
		_renderEditPanelTree(nodeID, 0, true);

		ESV.editor.renderCreatePanelWithNodes();
	}

	/**
	 * Empties the edit/browse/template panel and sets a default message to the user when no node is selected
	 * @param params - found in config file, appended element, emptied element and the message in html format
	 * @function emptyPanel
	 * @memberof ESV.editor
	 * @instance
	 */
	esv.emptyPanel = function(params) {
		if (!(params.appendElement+' .alert').length){
			return;
		} 
		$(params.emptyElement).empty();
		$(params.appendElement +' .alert').remove();
		$(params.appendElement).append(params.messageHTML);
	}

	/**
	 * Renders in the sidepanel all the different fields that constitute a particular node
	 * @function _renderEditPanelTree
	 * @param {Number} nodeID - The ID of a node whose fields should be displayed
	 * @param {Number} index - The index of the edit group (ie. there can be multiple branches, each branched group would have its own index)
	 * @param {Boolean} focus - true if the fields displayed should be editable
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _renderEditPanelTree(nodeID, index, focus) {
		var type = ESV.nodes[nodeID].type;
		if (type == "view") {
			type = ESV.nodes[nodeID].viewType;
		}

		if (ESV.nodes[nodeID]) {
			var children = ESV.nodes[nodeID].children;

			// Create a basic subgroup with no vertical line
			var title = ESV.properties[type].title;
			var icon = ESV.properties[type].icon;
			var subGroupHTML = '';
			var verticalLine = '';
			if (children.length > 0) {
				verticalLine = 'vertical-line';
			}

			if (focus) {
				// Create the first group to contain the focused element
				var headingHTML = '<div id="edit-group-' + index + '" class="sidebar-group"></div>';
				$('#edit-element').append(headingHTML);
			} else {
				title += ' (Inherited)';
				subGroupHTML += '<div class="sidebar-subgroup">';
			}

			var dataType = ESV.getUnderlyingDataTypes(nodeID)[0];

			subGroupHTML +=	'<div class="sidebar-group-left ' + verticalLine + '">\
									<img src="' + icon + '" />\
								</div>\
								<div class="sidebar-group-right">\
									<div class="sidebar-group-title"><h5>' + title + (type == 'datafilter' ? '<a class="configure-field-link" data-node="datafilter" data-type="' + dataType + '" style="margin-top: 0;"><span class="settings glyphicon glyphicon-cog"></span></a>' : '') + '</h5>' + '</div>\
									<div class="form-horizontal">\
										<fieldset id="edit-' + type + '-form-' + index + '">\
										</fieldset>\
									</div>\
								</div>';

			if (!focus) {
				subGroupHTML	+=	'</div>';
			}
			$('#edit-group-' + index).append(subGroupHTML);

			// Populate the current group with fields
			_populateEditPanel(nodeID, index, focus);

			if (children.length == 1) {
				// There is only one child.
				_renderEditPanelTree(children[0], index, false);
			} else {
				// There are multiple children; This is a branching point
				// Create a new group and put each child its own subgroup
				index += 1;
				var headingHTML = '<div id="edit-group-' + index + '" class="sidebar-group"></div>';
				$('#edit-element').append(headingHTML);
				for (var i = 0; i < children.length; i++) {
					_renderEditPanelTree(children[i], index + i, false);
				}
			}
		}
	}

	/**
	 * Renders a preview of a field (not editable)
	 * @function _renderEditPanelPreview
	 * @param {Object} params - Configuration input parameters
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _renderEditPanelPreview(params) {
		var displayValue = params.existingValues;
		if (displayValue == "") {
			displayValue = "n/a";
		}

		var previewHTML = '<span class="control-label"><strong>' + params.label + ' </strong>' + displayValue + '</span><br />';
		$('#edit-' + params.nodeType + '-form-' + params.index).append(previewHTML);
	}

	/**
	 * Extenral hookin for _populateEditPanel
	 * @function populateEditPanel
	 * @param {Number} nodeID - The ID of a node whose fields should be displayed
	 * @param {Number} index - The index of the edit group (ie. there can be multiple branches, each branched group would have its own index)
	 * @param {Boolean} focus - true if the fields displayed should be editable
	 * @param {String} dataType - Analysis data type
	 * @memberof ESV.editor
	 * @instance
	 */
	esv.populateEditPanel = function(nodeID, index, focus, dataType) {
		_populateEditPanel(nodeID, index, focus, dataType);
	}

	/**
	 * Renders edit panel and populates it with the applicable fields and their existing/default values
	 * @function _populateEditPanel
	 * @param {Number} nodeID - The ID of a node whose fields should be displayed
	 * @param {Number} index - The index of the edit group (ie. there can be multiple branches, each branched group would have its own index)
	 * @param {Boolean} focus - true if the fields displayed should be editable
	 * @param {String} dataType - Analysis data type
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _populateEditPanel(nodeID, index, focus, dataType) {
		var existingValues = {};
		var type = ESV.nodes[nodeID].type;

		// Looks for the user-inputted values for all the fields
		$.each(ESV.nodes[nodeID].filters, function(fieldID, value) {
			existingValues[fieldID] = value.fieldValues;
		});
		$.each(ESV.nodes[nodeID].info, function(fieldID, value) {
			existingValues[fieldID] = value;
		});

		var fieldset = _createFieldset(type, ESV.nodes[nodeID], dataType);
		var fieldIDs = Object.keys(fieldset).sort(function(a, b) {
			var posA = parseInt(fieldset[a].position) || 1000;
			var posB = parseInt(fieldset[b].position) || 1000;
			if (posA > posB) {
				return 1;
			}
			if (posA < posB) {
				return -1;
			}
			return 0;
		});

		for (var idx in fieldIDs) {
			var fieldID = fieldIDs[idx];
			var field  = fieldset[fieldID];
			var existingValuesMappedArray = [];

			// We don't want to display select and multiselect value IDs to the user - we want to display
			// the text values (eg. "Spliced Exon" would be a text value where "spliced_exon" would be a value ID)
			if (field.fieldType == "select" || field.fieldType == "multiselect") {
				var fieldValueID2fieldValue = {};
				for (var k = 0; k < field.fieldValues.length; k++) {
					fieldValueID2fieldValue[field.fieldValues[k][0]] = field.fieldValues[k][2];
				}
				if (existingValues.hasOwnProperty(fieldID)) {
					for (var k = 0; k < existingValues[field.id].length; k++) {
						var previousFieldValueID = existingValues[field.id][k];
						existingValuesMappedArray.push(fieldValueID2fieldValue[previousFieldValueID]);
					}
				} else {
					existingValues[field.id] = [];
				}
			} else {
				if (existingValues.hasOwnProperty(fieldID)) {
					existingValuesMappedArray = existingValues[field.id];
				} else {
					existingValuesMappedArray = [];
				}
			}
			// When a node is in "focus", we are allowed to edit fields directly related to that node
			if (focus && type != 'viewfilter') {
				_renderPanelField({
					panelType: 'edit',
					nodeType: type,
					index: index,
					nodeID: nodeID,
					fieldObj: field,
					existingValues: existingValues[field.id],
					dataType: dataType,
					hidden: field.hidden == true || field.hidden == "edit"
				});
			} else {
				_renderEditPanelPreview({
					nodeType: type,
					index: index,
					label: field.label,
					existingValues: existingValuesMappedArray.join(",").replace(/,/g, ', ')
				});
			}
		}

		$('.configure-field-link').on("click", function(e) {
			ESV.editor.configureFieldset($(this).data('type'), $(this).data('node'));
		});
	}

	/**
	 * Checks if a given dependency object is satisfied by the provided node
	 * @function _isDependencySatisfied
	 * @param {Object} dependency
	 * @param {Object} node
	 * @returns {Boolean} - true, if the dependency is of the same type as the node and that the node has the exact same field values (order n/a)
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _isDependencySatisfied(dependency, node) {
		if ($.isEmptyObject(dependency)) {
			return true;
		}
		if (node.type == dependency.type) {
			// This node has the data type the current node is dependent on, but
			// does it have the dependent field?
			if (node.filters[dependency.field]) {
				var fieldValues = node.filters[dependency.field].fieldValues;
				if (fieldValues.sort().join(',') == dependency.value.sort().join(',')) {
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * @function _areStructureDependenciesSatisfied
	 * @param {Array} dependencies - An array of dependency objects
	 * @param {String} structureID - The type of structure that is being created currently
	 * @returns {Boolean} - true, if at least one of the dependencies are satisfied in the current structure
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _areStructureDependenciesSatisfied(dependencies, structureID) {
		if (dependencies == null || dependencies == undefined || dependencies.length == 0) {
			return true;
		}

		var structure = ESV.structures[structureID];
		for (var i = 0; i < dependencies.length; i++) {
			var dependency = dependencies[i];

			// For each node in this structure, check if this dependency has been satisfied
			for (var j = 0; j < ESV.editor.structureStagingArray.length; j++) {
				var node = ESV.editor.structureStagingArray[j];
				if (_isDependencySatisfied(dependency, node)) {
					// This dependency was satisfied so need to look any further
					return true;
				}
			}
		}

		if (structure.linked == "bottom") {
			// Check if the current selected element is also satisfied
			if (ESV.cc.currentElement != null) {
				if (_areDependenciesSatisfied(dependencies, ESV.cc.currentElement.id)) {
					return true;
				}
			} else {
				return false;
			}
		}

		return false;
	}

	/**
	 * @function _areDependenciesSatisfied
	 * @param {Array} dependencies - An array of dependency objects
	 * @param {Number} sourceID - The node in the tree at which we start checking whether the dependencies have been satisfied
	 * @returns {Boolean} - true, if at least one of the dependencies are satisfied in the current tree
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _areDependenciesSatisfied(dependencies, sourceID) {
		if (dependencies == null || dependencies == undefined || dependencies.length == 0) {
			return true;
		}

		for (var i = 0; i < dependencies.length; i++) {
			var dependency = dependencies[i];
			var dependencySatisfied = false;

			var node = ESV.nodes[sourceID];
			if (_isDependencySatisfied(dependency, node)) {
				dependencySatisfied = true;
			}

			var children = _getAllChildrenNodes(sourceID);
			for (var j = 0; j < children.length; j++) {
				var child = children[j];
				if (_isDependencySatisfied(dependency, child)) {
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * Gets *all* the children (regardless of the level) going down the tree (external hookin)
	 * @function getAllChildrenNodes
	 * @param {Number} sourceID - The ID of the node which we want the children
	 * @returns {Array} children - true, if at least one of the dependencies are satisfied in the current tree
	 * @memberof ESV.editor
	 * @instance
	 */
	esv.getAllChildrenNodes = function(sourceID) {
		return _getAllChildrenNodes(sourceID);
	}

	/**
	 * Gets *all* the children (regardless of the level) going down the tree
	 * @function _getAllChildrenNodes
	 * @param {Number} sourceID - The ID of the node which we want the children
	 * @returns {Array} children - true, if at least one of the dependencies are satisfied in the current tree
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _getAllChildrenNodes(sourceID) {
		var node = ESV.nodes[sourceID];
		var children = [];
		children.push(node);
		for (var i = 0; i < node.children.length; i++) {
			children = children.concat(_getAllChildrenNodes(node.children[i]));
		}
		return children;
	}

	/**
	 * Creates a blank node object
	 * @function _createDefaultNode
	 * @param {Number} defaultID (optional) - The ID that should be assigned to this new node
	 * @returns {Object} node - A blank node that can be used in the creation of a tree, etc.
	 * @memberof ESV.editor
	 * @instance
	 */
	function _createDefaultNode(defaultID, structureID) {
		// Note:
		// Each node is created from a set of fields. However, the fields can change due to
		// certain dependencies (eg. certain fields may only be applicable to Titan datasets).
		var id = defaultID;
		if (id == null || id == undefined) {
			id = ESV.generateID();
		}

		var node = {
			id: id,
			type: null,
			parents: [],
			children: [],
			filters: {},
			info: {}, // General properties such as the title of the visualization, color, etc.
			view: {}, // Properties used to render the visualization and/or the visualization itself
			structureID: structureID // The id of the current tree
		}

		return node;
	}

	/**
	 * Given a new node, links it with the other nodes by creating an edge in the tree diagram and referencing it in the parents and children of the source nad target nodes passed in
	 * @function craeteLinkedNode
	 * @param {Number} sourceID
	 * @param {Number} targetID
	 * @memberof ESV.editor
	 * @instance
	 */
	esv.createLinkedNode = function(sourceID, targetID) {
		ESV.nodes[sourceID].parents.push(targetID);
		ESV.nodes[targetID].children.push(sourceID);
		ESV.cc.addEdge(targetID, sourceID);
		ESV.cc.reloadGraph(sourceID);
	}

	/**
	 * Called when a step in the structure process is finished, populating the default node with the user inputted values
	 * @function createStructureNode
	 * @param {Object} params - Configuration input parameters
	 * @param {Function} callback - A function that is run when the structure node is created
	 * @memberof ESV.editor
	 * @instance
	 */
	esv.createStructureNode = function(params, callback) {

		// Gets the structure template which we can use to get values to populate the blank nodes
		var template = ESV.structures[params.structureType].structure[params.step];

		var currentNode = ESV.editor.structureStagingArray[params.step];
		var structureID = currentNode.structureID;
		var existingID = currentNode.id;
		currentNode = _createDefaultNode(existingID, structureID);

		if (params.nodeType == null || params.nodeType == undefined || params.nodeType == "undefined" || params.nodeType == "view") {
			callback();
			return;
		}

		_populateNode(currentNode, params.nodeType, params.structureType, function(newNode) {
			// Determine all the node's parents
			for (var i = 0; i < template.parents.length; i++) {
				currentNode.parents.push(ESV.editor.structureStagingIDMap[template.parents[i]]);
			}

			// Determine all the node's children
			for (var i = 0; i < template.children.length; i++) {
				currentNode.children.push(ESV.editor.structureStagingIDMap[template.children[i]]);
			}

			ESV.editor.structureStagingArray[params.step] = currentNode;
			callback();
		});

	}

	/**
	 * Populates a node with the user inputted values
	 * @function _populateNode
	 * @param {Object} currentNode - Visualization node object
	 * @param {String} nodeType - Visualization node type - "data", "datafilter", "viewfilter" or specific "view" type
	 * @param {String} structureType - One of the types listed in CONFIG.structure
	 * @param {Function} callback - A function that is run when the structure node is created
	 * @memberof ESV.editor
	 * @instance
	 */
	function _populateNode(currentNode, nodeType, structureType, callback) {
		// Finds the fieldset for this particular step that satisfies all the dependencies
		var fieldset = _createStructureFieldset(nodeType, structureType);
		var id = currentNode.id;

		// These fields will require extra processing of their values
		var postProcessingFields = [];

		// For each field in the fieldset, try to find the corresponding input value
		$.each(fieldset, function(fieldID, field) {
			var fieldESID = field.esid;
			// Get value from the corresponding user input eg. field-0-title2
			var fieldValue = $('#field-' + id + '-' + fieldID).val();
			var fieldValueArray = fieldValue;
			if (fieldValueArray == null) {
				fieldValueArray = [];
			} else if (!$.isArray(fieldValueArray)) {
				fieldValueArray = fieldValueArray.split(",");
			}

			var isFilter = (fieldESID != null && fieldESID != undefined);

			if (!$.isArray(fieldESID)) {
				// Does the field have an 'esid' (an ID that maps the field to a database field) and does the fieldValue exists
				if (isFilter) {
					// Fields that correspond directly with the database are classified as 'filters'

					var isRange = false;
					if (field.isRange == true) {
						// Ranges are special due to how they are treated by Elastic Search and how their values are stored
						// Ranges must always have the format "min, max" (eg. "2, 4" or "x, 4" for less than 4 or "2, x" for greater than 2)
						isRange = true;
					}

					currentNode.filters[fieldID] = {
						nodeType: nodeType,
						esid: fieldESID,
						isRange: isRange,
						fieldType: field.fieldType,
						fieldValues: fieldValueArray,
						inequality: field.inequality
					};

				} else {
					// This is just a regular property of the element (eg. user defined title)
					currentNode.info[fieldID] = fieldValueArray;
				}
			} else {
				// ESID is an array. There are two cases where this can occur:
				// 1) Post Processing is needed to translate the input value into actual queriable values
				// 2) Pattern extraction is needed to extract input values of consequence

				var esids = "";
				var ranges = [];
				var ignoreIndex = -1;

				if (field.hasOwnProperty("post_processing")) {
					postProcessingFields.push(field.id);
				} else {
					// "esid": ["chr*:*-*", { esid: ESV.mappings.chrom }, { esid: ESV.mappings.startPos, range: "gt" }, { esid: ESV.mappings.endPos, range: "lt" }],
					// The first item in the array is the pattern
					ignoreIndex = 0;
				}


				for (var i = 0; i < fieldESID.length; i++) {
					if (i != ignoreIndex) {
						esids += fieldESID[i].esid;
						if (i < (fieldESID.length - 1)) {
							esids += ",";
						}

						if (fieldESID[i].hasOwnProperty("range")) {
							ranges.push(fieldESID[i].range);
						} else {
							ranges.push("");
						}
					}
				}

				if (field.hasOwnProperty("post_processing")) {
					currentNode.filters[fieldID] = {
						nodeType: nodeType,
						esid: esids,
						range: ranges,
						fieldType: field.fieldType,
						fieldValues: fieldValueArray
					};
				} else {
					currentNode.filters[fieldID] = {
						nodeType: nodeType,
						esid: esids,
						range: ranges,
						fieldType: field.fieldType,
						fieldValues: _processMultiESIDField(field, fieldValueArray)
					};
				}
			}
		});

		// Each options panel could have multiple versions depending on the underlying dataset. This
		// ID identifies the particular fieldset of interest
		currentNode.type = nodeType;

		if (postProcessingFields.length > 0) {
			var blockingPromise = new $.Deferred();
			var numBlocking = postProcessingFields.length;

			for (var i = 0; i < postProcessingFields.length; i++) {
				// Run any post processing on the field values
				fieldset[postProcessingFields[i]].post_processing.execute(postProcessingFields[i], currentNode, function(updatedNode) {
					currentNode = updatedNode;
					numBlocking--;
					if (numBlocking <= 0) {
						blockingPromise.resolve();
					}
				});
			}

			$.when(blockingPromise).then(function() {
				callback(currentNode);
			});
		} else {
			callback(currentNode);
		}
	}

	/**
	 * Extracts the values from the wildcard * character given a pattern (eg. chr*:*-*)
	 * @function _getValueArrayFromPatterns
	 * @param {Array/String} patterns - One of more patterns with stars as the wildcard
	 * @param {String} value - The string from which we should extract the values from
	 * @returns {Array} valueArr - The extracted values
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _getValueArrayFromPatterns(patterns, value) {
		if (!$.isArray(patterns)) {
			 patterns = [ patterns ];
		}

		var valueArr = null;
		for (var i = 0; i < patterns.length; i++) {
			valueArr = _getValueArrayFromPattern(patterns[i], value);
			if (valueArr != null) {
				if (valueArr.length > 0) {
					return valueArr;
				}
			}
		}
		return valueArr;
	}

	/**
	 * Extracts the values from the wildcard * character given a pattern (eg. chr*:*-*)
	 * @function _getValueArrayFromPattern
	 * @param {String} pattern - A pattern with stars as the wildcard
	 * @param {String} value - The string from which we should extract the values from
	 * @returns {Array} valueArr - The extracted values
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _getValueArrayFromPattern(pattern, value) {
		var valueArr = [];
		var pValue = 0;
		var pPattern = 0;

		while (pValue < value.length) {

			if (pattern.charAt(pPattern) != "\*") {
				if (pattern.charAt(pPattern) == value.charAt(pValue)) {
					pValue++;
					pPattern++;
				} else {
					return null;
				}
			} else {
				var pPatternPeek = pPattern + 1;
				var patternPeek = "";
				while ((pPatternPeek < pattern.length) && (pattern.charAt(pPatternPeek) != "\*")) {
					patternPeek += pattern.charAt(pPatternPeek);
					pPatternPeek++;
				}

				var pValueNext = -1;
				if (patternPeek != "") {
					 pValueNext = value.indexOf(patternPeek, pValue);

				} else {
					pValueNext = value.length;
				}

				var tmpValue = "";
				if (pValueNext < pValue) {
					pValueNext = value.length;
				}
				for (var i = pValue; i < pValueNext; i++) {
					tmpValue += value.charAt(i);
				}
				valueArr.push(tmpValue);
				pValue = pValueNext + patternPeek.length;
				pPattern = pPatternPeek;
			}
		}
		return valueArr;
	}

	/**
	 * Determines whether any fields need to be filled in and/or if any fields inputted are invalid
	 * @function getUnsatisfiedFieldRegex
	 * @param {Object} vizObj - Visualization configuration object
	 * @param {Object} filteredFieldset - The set of fields to search through to check if they've been satisfied
	 * @returns {Array} emptyRequiredFields
	 * @memberof ESV.editor
	 * @instance
	 */
	esv.getUnsatisfiedFieldRegex = function(vizObj, filteredFieldset) {
		var emptyRequiredFields = [];

		// For each visible field, check if the "regex" has been satisfied
		$.each(filteredFieldset, function(fieldID, field) {
			if (field.hasOwnProperty("regex")) {
				var value = $('#field-' + vizObj.id + '-' + fieldID).val();
				if (value == "" || value == undefined || value == null) {
					return;
				}
				var pattern = new RegExp(field.regex);
				// Lists are special in that we need to break it into items
				if (field.fieldType == "list") {
					var valueArr = value.split(",");
					for (var i = 0; i < valueArr.length; i++) {
						if (!pattern.test(valueArr[i])) {
							// This item doesn't match the pattern
							emptyRequiredFields.push({
								fieldID: fieldID,
								esid: filteredFieldset[fieldID].esid
							});
							break;
						}
					}
				} else {
					if (!pattern.test(value)) {
						// This item doesn't match the pattern
						emptyRequiredFields.push({
							fieldID: fieldID,
							esid: filteredFieldset[fieldID].esid
						});
					}
				}
			}
		});

		return emptyRequiredFields;
	}

	/**
	 * Determines whether any required fields are blank
	 * @function areRequiredFieldsCompleted
	 * @param {Object} params - Configuration input parameters
	 * @returns {Boolean} - true, if all the required fields are satisfied
	 * @memberof ESV.editor
	 * @instance
	 */
	esv.areRequiredFieldsCompleted = function(params) {
		var vizObj;
		var fieldset;
		var type = params.type;
		if (type == "view") {
			// Pages filled with views don't even have fields, so it must be satisfied
			return true;
		} else if (params.isStructure) {
		 	vizObj = ESV.editor.structureStagingArray[params.step];
			fieldset = _createStructureFieldset(type, params.structureType);
		} else {
			vizObj = params.vizObj;
			fieldset = _createFieldset(type, vizObj);
		}

		var filteredFieldset = {};

		// Filter the fieldset by only the relevant fields (eg. ignore the hidden fields)
		$.each(fieldset, function(fieldID, field) {
			if (field.hasOwnProperty("displayConditions")) {
				$.each(field.displayConditions, function(conditionKey, conditionValue) {
					// For each display condition, check if we need to consider it
					if (fieldset.hasOwnProperty(conditionKey)) {
						// Check if the condition value matches the actual value
						var value = $('#field-' + vizObj.id + '-' + conditionKey).val();
						if (value == conditionValue || ($.isArray(conditionValue) && $.inArray(value, conditionValue) != -1)) {
							filteredFieldset[fieldID] = field;
						}
					}
				});
			} else {
				filteredFieldset[fieldID] = field;
			}
		});

		var allRequiredCompleted = true;
		var completedESIDs = [];
		var emptyRequiredFields = [];

		var unsatisfiedRegexFields = ESV.editor.getUnsatisfiedFieldRegex(vizObj, filteredFieldset);
		emptyRequiredFields = emptyRequiredFields.concat(unsatisfiedRegexFields);
		if (unsatisfiedRegexFields.length > 0) {
			allRequiredCompleted = false;
		}

		if ($.isEmptyObject(ESV[type])) {
			var dataType = ESV.getUnderlyingDataTypes()[0];
			if (!dataType && ESV.cc.currentElement) {
				dataType = ESV.getUnderlyingDataTypes(ESV.cc.currentElement.id)[0];
			}
			var fieldConfigs = $.extend(true, {}, CONFIG.editor.common);
			if (dataType && CONFIG.editor[dataType].hasOwnProperty(type)) {
				$.extend(true, fieldConfigs, CONFIG.editor[dataType]);
			}
			ESV[type] = fieldConfigs[type];
		}

		if (ESV[type] && ESV[type].hasOwnProperty("required")) {
			// For each required field, check if the dependencies been satisfied
			for (var i = 0; i < ESV[type].required.length; i++) {
				var requiredItem = ESV[type].required[i];

				if ($.isArray(requiredItem)) {
					// Only one of the required fields need to be satisfied
					for (var j = 0; j < requiredItem.length; j++) {
						if (filteredFieldset.hasOwnProperty(requiredItem[j])) {
							// If the required item doesn't even exist, ignore it
							if (!$('#field-' + vizObj.id + '-' + requiredItem[j]).length) {
								continue;
							}

							var value = $('#field-' + vizObj.id + '-' + requiredItem[j]).val();
							if (value == "" || value == undefined || value == null) {
								allRequiredCompleted = false;
								emptyRequiredFields.push({
									fieldID: requiredItem[j],
									esid: filteredFieldset[requiredItem[j]].esid
								});
							}
						}
					}
				} else {
					// If the required item doesn't even exist, ignore it
					if (!$('#field-' + vizObj.id + '-' + requiredItem).length) {
						continue;
					}

					var value = $('#field-' + vizObj.id + '-' + requiredItem).val();
					if (value == "" || value == undefined || value == null) {
						allRequiredCompleted = false;
						emptyRequiredFields.push({
							fieldID: requiredItem,
							esid: filteredFieldset[requiredItem].esid
						});
					}
				}
			}
		}

		if (allRequiredCompleted) {
			$('.form-group').removeClass("has-error");
			return true;
		} else {
			$('.form-group').removeClass("has-error");
			for (var i = 0; i < emptyRequiredFields.length; i++) {
				$('#field-' + vizObj.id + '-' + emptyRequiredFields[i].fieldID).parent().addClass("has-error");
			}
			return false;
		}
	}

	/**
	 * Gets a set of fields all of whom are applicable to the given vizObj and have their dependencies satisfied (external hookin)
	 * @function createFieldset
	 * @param {Object} vizObj - Visualization configuration object
	 * @returns {Object} - The generated fieldset
	 * @memberof ESV.editor
	 * @instance
	 */
	esv.createFieldset = function(vizObj) {
		return _createFieldset(vizObj.type, vizObj);
	}

	/**
	 * Gets a set of fields all of whom are applicable to the given vizObj and have their dependencies satisfied
	 * @function _createFieldset
	 * @param {String} type - The type of object that we should generate the fields for
	 * @param {Object} vizObj - Visualization configuration object
	 * @returns {Object} fieldsetObj - The generated fieldset
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _createFieldset(type, vizObj, includeDataType) {
		var fieldsetObj = {};
		var defaultFieldset = true;
		var fieldset = {};
		$.extend(true, fieldset, CONFIG.editor.common);
		var dataTypes = ESV.getUnderlyingDataTypes(vizObj.id);
		if (includeDataType) {
			dataTypes = [includeDataType];
		}
		for (var idx in dataTypes) {
			$.extend(true, fieldset, CONFIG.editor[dataTypes[idx]]);
		}
		$.each(fieldset[type].fields, function(fieldID, field) {
			if (field.disabled) {
				return;
			}
			if (field.hasOwnProperty("dependencies")) {
				var dependencies = field.dependencies;
				if (_areDependenciesSatisfied(dependencies, vizObj.id)) {
					fieldsetObj[fieldID] = field;
				}
			} else {
				// No dependencies attached to this field, so add it by default to the fieldset
				fieldsetObj[fieldID] = field;
			}
		});
		return fieldsetObj;
	}

	/**
	 * Creates a set of fields that satisfy field dependencies in the structure
	 * @function _createStrucureFieldset
	 * @param {String} type - The type of object that we should generate the fields for
	 * @param {Object} structureID - The structure that is being created
	 * @returns {Object} fieldsetObj - The generated fieldset
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _createStructureFieldset(type, structureID) {
		var fieldsetObj = {};
		var dataTypes = []
		var fieldset = {};
		$.extend(true, fieldset, CONFIG.editor.common);
		for (var i = 0; i < ESV.editor.structureStagingArray.length; i++) {
			vizObj = ESV.editor.structureStagingArray[i];
			if (vizObj.filters.hasOwnProperty("data-all-type")) {
				for (var i = 0; i < vizObj.filters["data-all-type"].fieldValues.length; i++) {
					dataTypes.push(vizObj.filters["data-all-type"].fieldValues[i]);
				}
			}
		}

		if (!dataTypes.length && ESV.cc.currentElement) {
			var currentElementID = parseInt(ESV.cc.currentElement.id);
			if (currentElementID){
				dataTypes = ESV.getUnderlyingDataTypes(currentElementID);
			}
		}
		if (dataTypes.length) {
			$.extend(true, fieldset, CONFIG.editor[dataTypes[dataTypes.length - 1]]);
		}

		if ($.isEmptyObject(fieldset[type])) {
			return {};
		}

		$.each(fieldset[type].fields, function(fieldID, field) {
			if (field.disabled) {
				return;
			}
			if (field.hasOwnProperty("dependencies")) {
				var dependencies = field.dependencies;
				if (_areStructureDependenciesSatisfied(dependencies, structureID)) {
					fieldsetObj[fieldID] = field;
				}
			} else {
				// No dependencies attached to this field, so add it by default to the fieldset
				fieldsetObj[fieldID] = field;
			}
		});
		return fieldsetObj;
	}

	/**
	 * Returns a set of fields associated with a specific data type and node, if non provided,
	 * returns all data fields specific to the data type
	 * @function configureFieldset
	 * @param {String} dataType - Specifies in which configuration
	 * @param {String} step - 'data' or 'datafilter'
	 * @param {String} scrollToID - id of the element that the form has to scroll to upon loading
	 * @memberof ESV.editor
	 * @instance
	 */
	esv.configureFieldset = function(dataType, step, scrollToID) {
		ESV.editor.configuredType = dataType;
		if (step == 'data') {
			_configureDataFieldset(false)
		}
		else if (step == 'datafilter') {
			_configureDatafilterFieldset(dataType, step, scrollToID)
		}
	}

	/**
	 * Generates the form used to configure supported analysis data types
	 * @function _configureDataFieldset
	 * @param {Boolean} saveConfig - A flag specifying whethere the configuration should be saved at this point or passed to the form for configuring specific filter widgets
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */

	function _configureDataFieldset(saveConfig) {
		if (!esv.storedConfiguration) {
			esv.storedConfiguration = {};
		}
		if (!esv.storedConfiguration.common) {
			esv.storedConfiguration.common = {};
		}
		if (!esv.storedConfiguration.common.data) {
			esv.storedConfiguration.common.data = {};
		}
		// Attempt to load the saved state of a configuration in process
		var fieldset = esv.storedConfiguration.common.data.fields || CONFIG.editor.common.data.fields;

		var query = {
			"aggs": {
				"dataTypes": {
					"terms": {
						"field": ESV.mappings.dataType,
						"size": 1000,
						"order": {
							"_term": "asc"
						}
					}
				}
			},
			"size": 0
		};

		var dataTypes = [];

		ESV.queries.makeSimpleQuery(query, null, true, function(response) {
			var disabledOptions = {};
			dataTypes = $.map(response.aggregations.dataTypes.buckets, function(item) {
				var dataType = item.key;
				if ($.isEmptyObject(esv.storedConfiguration) || $.isEmptyObject(esv.storedConfiguration[dataType])) {
					disabledOptions[dataType] = true;
				}
				return dataType;
			}).sort();

			var counter = 1;
			for (var field in fieldset) {
				if (fieldset[field].displayConditions){
					continue;
				}

				if(fieldset[field].fieldType == 'select' && fieldset[field].esid == CONFIG.mappings.dataType) {
					var addedOptions = dataTypes;

					var configuredOptions = $.map(fieldset[field].fieldValues, function(item) { return item[0]; });

					var selectedOption = '';
					for (var idx in addedOptions) {
						if ($.inArray(addedOptions[idx], configuredOptions) == -1) {
							var optionLabel = addedOptions[idx].replace(/[\_|\-]+/g, ' ');
							optionLabel = optionLabel.replace(/^./, optionLabel[0].toUpperCase());
							if (fieldset[field].fieldValues.length == 0 && !selectedOption && !disabledOptions[addedOptions[idx]]) {
								selectedOption = addedOptions[idx];
							}
							var optionID = addedOptions[idx].replace(/[\.|\/]/, '-')
							if (fieldset[field].displayDependents) {
								var newDependent = {
									"id": "data-all-" + optionID,
									"esid": addedOptions[idx],
									"fieldType": "predictivetext",
									"limit": 0,
									"prid": addedOptions[idx],
									"label": optionLabel,
									"placeholder": optionLabel,
									"displayConditions": {},
									"freeInput": false
								};
								newDependent.displayConditions[fieldset[field].id] = addedOptions[idx];
								fieldset[newDependent.id] = newDependent;
								optionLabel = "Query by " + optionLabel;
							}
							fieldset[field].fieldValues.push([addedOptions[idx], "", optionLabel, selectedOption == addedOptions[idx], "", disabledOptions[addedOptions[idx]] || false]);
						}
					}

					for (var idx in fieldset[field].fieldValues) {
						var fieldOption = fieldset[field].fieldValues[idx];
						// If option disabled flag is set, skip
						if (fieldOption[5]) {
							continue;
						}
						if (fieldOption[3]) {
							selectedOption = fieldOption[0];
						}
					}
				}
			}

			esv.storedConfiguration.common.data.fields = fieldset;

			if (!saveConfig) {
				_configureDataFieldWidget("data-all-type", "common", "data");
				return;
			}


			CONFIG.editor.common.data.fields = fieldset;
			ESV.editor.structureStagingArray = [];
			ESV.editor.structureStagingIDMap = {};
			ESV.cc.unSelectAllNodes();
			ESV.queries.indexRecord(
				{"CONFIG": JSON.stringify(esv.storedConfiguration)},
				ESV.config.URL_FRONTEND_CONFIG_SAVE,
				function(response) {
					if (response.created || response._version) {
						ESV.notificationPopup('Configuration has been saved.');
						$('.sidebar-content').fadeIn();
					}
					else {
						ESV.notificationPopup('Unable to save configuration.');
					}
				},
				function(err) {
					var errorText = err.responseJSON.error ? err.responseJSON.error.reason : err.responseText;
					ESV.notificationPopup('Error: ' + errorText);
				}
			);
		});
	}

	/**
	 * Generates a form for configuring the input widget for a given field and analyis data type
	 * @function _configureDataFieldWidget
	 * @param {String} fieldName - Input field name
	 * @param {String} dataType - Analysis data type for which specific configuration will be generated,
	 * 			      or "common" if some of the inputs used by all data types are being configured
	 * @param {String} step - 'data' or 'datafilter'
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _configureDataFieldWidget(fieldName, dataType, step) {
		var fieldConfig = esv.storedConfiguration[dataType][step].fields[fieldName];

		var configPanelHTML = '<div id="widget-config" data-fieldid="' + fieldName + '" class="' + fieldName + '">';
		if (fieldConfig.esid != ESV.mappings.dataType) {
			configPanelHTML += '<div class="form-group">\
					<label class="control-label">Input</label><br/> \
					<span>' + fieldConfig.label + '</span> \
				</div>';
		}

		if (fieldConfig.fieldType == 'text') {
			configPanelHTML += '<div class="form-group">\
					<label class="control-label">Input value placeholder</label> \
					<input id="field-placeholder" data-fieldid="placeholder" class="form-control create-text" type="text" value="' + fieldConfig.placeholder + '"> \
				</div>';
		}
		else {
			var fieldset = esv.storedConfiguration[dataType][step].fields;
			var displayDependents = {};
			$.map(Object.keys(fieldset), function(key) {
				if (fieldset[key].hasOwnProperty('displayConditions') && fieldset[key].displayConditions.hasOwnProperty(fieldName)) {
					displayDependents[fieldset[key].displayConditions[fieldName]] = fieldset[key];
				}
			});

			configPanelHTML += '<div class="form-group">\
				<label class="control-label">Values</label> \
			</div>';
			configPanelHTML += '<div id="field-config" class="gridster"><ul>';
			var counter = 1;
			for (var idx in fieldConfig.fieldValues ) {
				var field = fieldConfig.fieldValues[idx];
				var fieldDisabled = field[5];
				var fieldLabel = field[0];
				var fieldID = field[0].replace(/[\.|\/]/g, '_');
				//Truncate long fields
				if (fieldLabel.length >= 30) {
					var fieldPosition = fieldLabel.length;
					fieldLabel = '...' + fieldLabel.substr(fieldPosition - 30, fieldPosition);
				}
				configPanelHTML += '<li ' + (fieldDisabled ? ' class="disabled" ' : '') + 'data-row="'+ counter + '" data-col="1", data-sizex="1" data-sizey="1" id="' + fieldID + '"><div class="field-settings form-group">\
					<input type="checkbox" class="toggle-field" id="' + fieldID + '-enabled"' + (fieldDisabled ? '' : ' checked="checked"') + 'data-toggle="toggle" data-size="mini" data-width="65"' + (fieldName == 'data-all-source' ||  (displayDependents[field[0]] && displayDependents[field[0]].esid == ESV.mappings.sampleID) ?  ' disabled="disabled"' : '') + '>\
					<div class="item info form-group">\
						<label class="control-label" data-toggle="tooltip" data-placement="top" title="Field value' + (fieldLabel.match(/^\.\.\./) ? ': ' + field[0] : '') + '">' + fieldLabel + '</label>';
				if (fieldName == 'data-all-type') {
					configPanelHTML += '<select id="' + fieldID + '-recordType" data-id="' + field[0] + '"class="multiselect form-control create-multiselect" style="display: none;">';
					$.map(["point", "range", "pair", "properties"], function(value, idx) {
						var selected = esv.storedConfiguration[field[0]] && esv.storedConfiguration[field[0]].recordType == value ? ' selected="selected"' : '';
						configPanelHTML += '<option value="' + value + '"' + selected + '>' + value + '</option>';
					});
					configPanelHTML += '</select>';
				}
				configPanelHTML += '<br/>';
				if (displayDependents.hasOwnProperty(field[0])) {
					configPanelHTML += '<input id="value-label" data-fieldid="fieldValues-' + field[0] + '" class="form-control create-text" type="text" placeholder="Value label" data-toggle="tooltip" data-placement="top" title="Field value label" value="' + displayDependents[field[0]].label + '">';
				}
				else {
					configPanelHTML += '<input id="value-label" data-fieldid="fieldValues-' + field[0] + '" class="form-control create-text" type="text" placeholder="Value label" data-toggle="tooltip" data-placement="top" title="Field value label" value="' + field[2] + '">';
				}
				if (fieldName == 'data-all-type') {
					configPanelHTML += '<a href="#" class="edit configure-panel" data-type="' + field[0] + '" data-node="datafilter" data-dismiss="modal" data-toggle="tooltip" data-placement="top" title="Edit widget"><span aria-hidden="true" class="glyphicon glyphicon-pencil"></span></a><br/>';
				}

				configPanelHTML += '<input id="' + fieldID + '-selected" type="checkbox"' + (field[3] ? ' checked="checked"' : '') + '><label for="' + fieldID + '-selected"> selected by default</label>\
					</div> \
					</div></li>';
				counter++;
			}
			configPanelHTML += '</ul></div>';
		}
		configPanelHTML += '</div>';

		ESV.panelSettingsPopup('Configure ' + (fieldConfig.esid == ESV.mappings.dataType ? "Data Types" : "Widget"), configPanelHTML);

		if (fieldConfig.fieldType == 'select') {
			$('#panel-settings-popup .modal-footer').append('<button class="btn btn-default pull-left toggle select-fields" type="button">Hide All</button>');
		}

		$('#panel-settings-popup .btn.save')
			.removeClass('btn-primary')
			.addClass('btn-default')
			.html('Done');

		$('#field-config  ul').gridster({
			"namespace": "#field-config",
			widget_margins: [0, 0],
			widget_base_dimensions: [450, 100]
		});

		if (fieldName == 'data-all-type') {
			$('[id$=-recordType]').multiselect();
			$('#panel-settings-popup button.multiselect').addClass('btn-xs').on('click', function() {
				var $gridWidget = $(this).parents('li.gs-w').first();
				$gridWidget.css('z-index', 1).siblings('li.gs-w').css('z-index', 0).on('mouseout', function() {
					if (!$(this).find('.btn-group.open').length) {
						$(this).css('z-index', 0);
					}
				});
			}).parent().addClass('pull-right');
			$('#panel-settings-popup button.multiselect').siblings('ul').css('margin-top', '0px').css('overflow-y', 'hidden');
			$('#panel-settings-popup select.multiselect').on('change', function() {
				esv.storedConfiguration[$(this).attr('data-id')].recordType = $(this).val();
			});
			$('#panel-settings-popup #value-label').on("keyup change blur", function() {
				esv.storedConfiguration[$(this).data('fieldid').replace(/^.*-/, '')].label = $(this).val();
			});
		}


		$('#widget-config input[id$=-selected]').on('change', function() {
			// When selected, uncheck all other 'selected by default' options
			if ($(this).prop('checked')) {
				$('#widget-config input[id$=-selected]').not($(this)).prop('checked', false).change();
			}
		});

		$('body > #panel-settings-popup').modal({'backdrop': 'static', 'keyboard': false});

		$('body > #panel-settings-popup input[type=checkbox][id$=-enabled]').on('change', function() {
			var parentWidget = $(this).parents('li').first();
			if ($(this).is(':checked')) {
				parentWidget.removeClass('disabled');
				if ($('#widget-config').hasClass('data-all-type')) {
					var dataType = $(this).parents('li.gs-w').first().attr('id');
					if ($.isEmptyObject(CONFIG.editor[dataType])) {
						esv.storedConfiguration[dataType] = {};
						var editLink = $('#' + dataType).find('a.edit').first();
						editLink.trigger('click');
					}
				}
			}
			else {
				parentWidget.addClass('disabled');
			}
		});

		$('#panel-settings-popup .modal-footer button.toggle').click(function() {
			var button = $(this);
			if (button.html() == 'Show All') {
				$('#panel-settings-popup input[type=checkbox][id$=-enabled]').not(':disabled').each(function() {
					$(this).prop('checked', true).change();
				});
				button.html('Hide All')
			}
			else {
				$('#panel-settings-popup input[type=checkbox][id$=-enabled]').not(':disabled').each(function() {
					$(this).prop('checked', false).change();
				});
				button.html('Show All')
			}
		});

		$('#widget-config a.edit').on('click', function() {
			var blockingObject = new $.Deferred();
			var $link = $(this);
			_saveDatafilterFieldConfig(blockingObject);
			$.when(blockingObject.promise()).then(function() {
				_configureDatafilterFieldset($link.attr('data-type'), $link.attr('data-node'));
			});
		});

		$('#panel-settings-popup .save').on('click', function() {
			_saveDatafilterFieldConfig();
			_configureDataFieldset(true);
		});


        /**
         * Saves the current datafilter input field configuration in esv.storedConfiguration variable
         * @function _saveDatafilterFieldConfig
         * @param {Object}  blockingObject - A deffered object to release upon completion
         * @memberof ESV.editor
         * @instance
         * @private
         * @inner
         */
		function _saveDatafilterFieldConfig(blockingObject) {
			var fieldSettings = {};
			var fieldID = $('#widget-config').attr('data-fieldid');
			$('#widget-config input:visible').each(function() {
				if ($(this).attr('data-fieldid') && !$(this).attr('data-fieldid').match(/^fieldValues-/)) {
					fieldSettings[$(this).attr('data-fieldid')] = $(this).val();
				}
			});
			fieldSettings.label = fieldSettings.placeholder;
			var fieldValues = [];
			$('#widget-config input[data-fieldid^=fieldValues]').sort(function(a, b){
				// Sort fields based on their current position, giving priority to enabled ones
				var parentA = $(a).parents('li').first();
				var parentB = $(b).parents('li').first();
				var posA = parseInt(parentA.attr('data-row')) + (parentA.find('input[id$=-enabled]:checkbox').first().prop('checked') ? 0 : 1000);
				var posB = parseInt(parentB.attr('data-row')) + (parentB.find('input[id$=-enabled]:checkbox').first().prop('checked') ? 0 : 1000);
				// Sort disabled fields alphabetically
				if (posA > 1000 && posB > 1000) {
					return parentA.attr('id').toLowerCase() > parentB.attr('id').toLowerCase();
				}
				if (posA > posB) {
					return 1;
				}
				if (posA < posB) {
					return -1;
				}
				return 0;
			})
			.each(function() {
				var optionValue = $(this).attr('data-fieldid').replace('fieldValues-', '');
				var optionID = optionValue.replace(/[\.|\/]/g, '_');
				var optionLabel = $(this).val();
				if (!$.isEmptyObject(displayDependents) && optionValue != 'all' && optionValue != 'none') {
					displayDependents[optionValue].label = optionLabel;
					displayDependents[optionValue].placeholder = optionLabel;
					optionLabel = "Query by " + optionLabel;
				}
				var optionDisabled = !$('#' + optionID + '-enabled:checkbox').prop('checked');
				var optionSelected = $('#' + optionID + '-selected:checkbox').prop('checked');
				fieldValues.push([optionValue, "", optionLabel, optionSelected, "", optionDisabled]);
			});
			fieldSettings.fieldValues = fieldValues;
			$.extend(true, fieldConfig, fieldSettings);
			if (blockingObject && $.isFunction(blockingObject.resolve)) {
				blockingObject.resolve();
			}
		}

	}

    /**
     * Generates a form for configuring the input widget for a given field and analyis data type
     * @function _configureDatafilterFieldset
     * @param {String} dataType - Data analysis type
     * @param {String} step - This function is always invoked with this parameter set to 'datafilter', could declare it as a local variable and remove it altogether
     * @param {String} scrollToID - (Optional) If provided the form will auto-scroll to the form field specified by the ID
     * @param {Boolean} recursiveCall - Flag specifying whether the function call originated in the same function
     * @memberof ESV.editor
     * @instance
     * @private
     */
	function _configureDatafilterFieldset(dataType, step, scrollToID, recursiveCall) {
		var fieldset = {};
		if (!esv.storedConfiguration) {
			esv.storedConfiguration = {};
		}
		if (!esv.storedConfiguration[dataType]) {
			esv.storedConfiguration[dataType] = {};
		}
		if (!esv.storedConfiguration[dataType][step]) {
			esv.storedConfiguration[dataType][step] = {};
		}
		// Attempt to load the saved state of a configuration in process
		fieldset = esv.storedConfiguration[dataType][step].fields || {};

		// In case of a first time configuraton, retreive field data from the backend
		if ($.isEmptyObject(fieldset)) {
			ESV.showLoading();
			var query = {
				"query": {
					"filtered": {
						"filter": {
							"terms": {}
						}
					}
				},
				"fields": ["*"],
				"size": 100
			};
			query.query.filtered.filter.terms[ESV.mappings.dataType] = [dataType];

			function _getFieldTypes(response) {
				if (response.hits.total > 0) {
										var fieldTypes = {};
					var reservedFields = {};
					for (var i in CONFIG.reserved) {
						reservedFields[ESV.mappings[CONFIG.reserved[i]]] = true;
					}

					var usedFields = $.map(Object.keys(CONFIG.editor.common.data.fields), function(key) {
						if (CONFIG.editor.common.data.fields[key].hasOwnProperty('esid')) {
							return CONFIG.editor.common.data.fields[key].esid;
						}
					});
					var pairedRecRegex = new RegExp('^' + CONFIG.mappings.pairedRecord + '.');



					var fields = {};
					for (var rec = 0; rec < response.hits.hits.length; rec++) {
						var recordFields = response.hits.hits[rec].fields;

						for (recordField in recordFields) {
							if (!fields.hasOwnProperty(recordField)) {
								fields[recordField] = recordFields[recordField];
							}
						}

					}
					var fieldNames = Object.keys(fields).sort(function(a, b) {
						return a.toLowerCase() > b.toLowerCase();
					});
					for (var idx in fieldNames) {
						var field = fieldNames[idx];
						if (reservedFields[field] || $.inArray(field, usedFields) >= 0 || field.match(pairedRecRegex)) {
							continue;
						}
						var fieldLabel = field.replace(/[\.|_]/g, ' ');
						fieldLabel = fieldLabel.replace(/^./, fieldLabel[0].toUpperCase());
						fieldset[field] = {
							'type': typeof(fields[field][0]),
							'esid': field,
							'id': field.replace(/\./g, '_'),
							'label': fieldLabel,
							'placeholder': fieldLabel
						};
					}
					var recordType = '';
					for (var idx in response.hits.hits) {
						var record = response.hits.hits[idx];
						if (!record.fields.hasOwnProperty(CONFIG.mappings.startPos)) {
							recordType = 'properties'
						}
						else if (record.fields[CONFIG.mappings.startPos][0] == record.fields[CONFIG.mappings.endPos][0]) {
							if (!recordType) {
								recordType = 'point'
							}
						}
						else {
							recordType = 'range';
						}
						if (record.fields.hasOwnProperty(CONFIG.mappings.pairedRecord + '.' + CONFIG.mappings.startPos)) {
							recordType = 'pair';
							break;
						}
					}
					esv.storedConfiguration[dataType].recordType = recordType;
					$.extend(true, esv.storedConfiguration[dataType][step], {'fields': fieldset});
					if (!recursiveCall) {
						_configureDatafilterFieldset(dataType, step, scrollToID, true)
					}
				}
				else {
					ESV.notificationPopup('No data of type <strong>' + dataType + '</strong> has been found.');
					_configureDataFieldset();
				}
				ESV.hideLoading();
			}

			ESV.queries.makeSimpleQuery(query, null, true, _getFieldTypes);

			if (!recursiveCall) {
				return;
			}
		}
		else {
			ESV.showProgress();
		}


		var configPanelHTML = '<div id="panel-config" class="gridster">\
			<form>\
			<ul>\n';

		var counter = 1;
		for (var field in fieldset) {
			if (!fieldset[field].position) {
				fieldset[field].position = counter++;
			}
			configPanelHTML += '<li class="disabled" data-row="'+ fieldset[field].position + '" data-col="1" data-sizex="1" data-sizey="1" id="' + fieldset[field].id + '" data-fieldid="' + field + '"><div class="field-settings form-group">\
			        <input type="checkbox" id="' + fieldset[field].id + '-enabled" class="toggle-field" data-toggle="toggle" data-size="mini" data-width="65">\
				<div class="item info form-group">\
					<label>' + fieldset[field].esid + '</label><br/>\
					<button data-toggle="dropdown" class="multiselect dropdown-toggle btn btn-default disabled" type="button" title="No filter selected">No filter selected <b class="caret"></b></button>\
					<a href="#" class="edit"><span aria-hidden="true" class="glyphicon glyphicon-pencil"></span></a>\
				</div>\
			</div></li>';
		}
		configPanelHTML += '</ul></form></div>';
		var panelTitle = 'Configure ' + dataType.replace(/^./, dataType[0].toUpperCase()) + ' Data Filters';
		ESV.panelSettingsPopup(panelTitle, configPanelHTML);

		$('body > #panel-settings-popup .save').click(function() {
			var configFields = esv.storedConfiguration[dataType][step].fields;
			var fieldset = {};
			var position = 1;
			$('#panel-config li.gs-w').sort(function(a, b) {
				// Sort fields based on their current position, giving priority to enabled ones
				var posA = parseInt($(a).attr('data-row')) + ($(a).find('input[id$=-enabled]:checkbox').first().prop('checked') ? 0 : 1000);
				var posB = parseInt($(b).attr('data-row')) + ($(b).find('input[id$=-enabled]:checkbox').first().prop('checked') ? 0 : 1000);
				// Sort disabled fields alphabetically
				if (posA > 1000 && posB > 1000) {
					return a.id.toLowerCase() > b.id.toLowerCase();
				}
				if (posA > posB) {
					return 1;
				}
				if (posA < posB) {
					return -1;
				}
				return 0;
			})
			.each(function() {
				var field = $(this).attr('data-fieldid');
				configFields[field].disabled = true;
				configFields[field].position = position++;
				if ($(this).find('input[type=checkbox][id$=-enabled]:checked').length) {
					configFields[field].disabled = false;
				}
				fieldset[configFields[field].id] = configFields[field];
			});
			if (!CONFIG.editor[dataType]) {
				CONFIG.editor[dataType] = {};
			}
			if (!CONFIG.editor[dataType][step]) {
				CONFIG.editor[dataType][step] = {};
			}
			CONFIG.editor[dataType][step].fields = fieldset;
			esv.storedConfiguration[dataType][step].fields = fieldset;
			$('body > #panel-settings-popup').modal('hide');
			ESV.editor.structureStagingArray = [];
			ESV.editor.structureStagingIDMap = {};
			ESV.cc.unSelectAllNodes();
			ESV.queries.indexRecord(
				{"CONFIG": JSON.stringify(esv.storedConfiguration)},
				ESV.config.URL_FRONTEND_CONFIG_SAVE,
				function(response) {
					if (response.created || response._version) {
						_configureDataFieldset(ESV.editor.configuredType == dataType);
					}
					else {
						ESV.notificationPopup('Unable to save configuration.');
					}
				},
				function(err) {
					var errorText = err.responseJSON.error ? err.responseJSON.error.reason : err.responseText;
					ESV.notificationPopup('Error: ' + errorText);
				}
			);
		});

		$('body > #panel-settings-popup li').on('click', '.edit', function() {
			var button = $(this);
			var fieldID = button.parents('li').first().attr('data-fieldid');
			_configureFieldWidget(fieldID, dataType, step);
		});

		$('body > #panel-settings-popup input[type=checkbox][id$=-enabled]').on('change', function() {
			var fieldName = $(this).parents('li').first().attr('data-fieldid');
			esv.storedConfiguration[dataType][step].fields[fieldName].disabled = !$(this).is(':checked');
			var parentWidget = $(this).parents('li').first();
			if ($(this).is(':checked')) {
				parentWidget.removeClass('disabled');
			}
			else {
				parentWidget.addClass('disabled');
			}
		});

		$('#panel-settings-popup .modal-footer').append('<button class="btn btn-default pull-left toggle select-fields" type="button">Hide All</button>');

		$('#panel-settings-popup .modal-footer .toggle').click(function() {
			var button = $(this);
			if (button.html() == 'Show All') {
				$('#panel-config input[type=checkbox][id$=-enabled]').not(':disabled').each(function() {
					$(this).prop('checked', true).change();
				});
				button.html('Hide All')
			}
			else {
				$('#panel-config input[type=checkbox][id$=-enabled]').not(':disabled').each(function() {
					$(this).prop('checked', false).change();
				});
				button.html('Show All')
			}
		});

		var panelConfigGrid = $('#panel-config  ul').gridster({
			"namespace": "#panel-config",
			widget_margins: [0, 0],
			widget_base_dimensions: [450, 80],
			draggable: {
				stop: function(e, ui) {
					// Update the widget position in case the fields have been reordered
					var fieldset = esv.storedConfiguration[dataType][step].fields;
					$('#panel-config ul > li.gs-w').each(function() {
						var fieldID = $(this).attr('data-fieldid');
						var fieldPosition = $(this).attr('data-row');
						esv.storedConfiguration[dataType][step].fields[fieldID].position = parseInt(fieldPosition);
					})
				}
			}
		}).data('gridster');

        /**
         * Autopopulates a configuration field widget based on the values in the specific field aggregation query response
         * @function _populateField
         * @param {Object} response - Query response object
         * @memberof ESV.editor
         * @instance
         * @private
         * @inner
         */
		function _populateField(response) {
			var field;
			for (var key in response.aggregations) {
				if (response.aggregations[key].hasOwnProperty('buckets')) {
					field = key;
					break;
				}
			}
			var fieldID = field.replace(/\./g, '_');
			$('body > #panel-settings-popup li#' + fieldID).removeClass('disabled');
			$('body > #panel-settings-popup li#' + fieldID + ' :checkbox').prop('checked', true);
			var inputHTML = '';
			if (!response.aggregations.hasOwnProperty('min')) {
				var fieldValues = $.map(response.aggregations[field].buckets, function(value) {
					if (value.key) {
						return value.key;
					}});
				var sampleValues = [fieldValues[0]];

				var fieldConfig = esv.storedConfiguration[dataType][step].fields[field];
				if (response.aggregations[field].buckets.length == 50) {
					fieldset[field] = $.extend(true, {}, CONFIG.widgets.predictivetext, fieldConfig);
					fieldset[field].prid = field;
					inputHTML = '<label>' + fieldset[field].label + '</label><br/>' +
						'<input data-role="tagsinput" data-id="" data-fieldid="' + field + '" class="form-control create-predictivetext" type="text" placeholder="' + field + '" value="' + sampleValues.join(',') + '" style="display:none;">';
					if (sampleValues[0].length > 20) {
						sampleValues[0] = sampleValues[0].substr(0, 20) + '..';
					}
					inputHTML += '<div class="bootstrap-tagsinput bootstrap-tagsinput-max"><span class="tag label label-info">' + sampleValues.join('<span data-role="remove"></span></span><span class="tag label label-info">') + '<span data-role="remove"></span></span> <input type="text" placeholder="" style="display: none;" class="form-control edit-predictivetext"></div>';
				}
				else {
					fieldset[field] = $.extend(true, {}, CONFIG.widgets.multiselect, fieldConfig);
				}

				fieldset[field].fieldValues = $.map(fieldValues, function(value, idx) {
					return  [
						// Set the 'selected' flag to true for only the first option in select fields
						[value, "", value.toString().replace(/\_/g, ' '), fieldset[field].fieldType != "multiselect" && idx == 0, "", false]
					]
				});
				if (fieldset[field].fieldType != 'predictivetext') {
					inputHTML = '<label>' + fieldset[field].label + '</label><br/> \
						<select class="multiselect form-control create-multiselect" data-fieldid="' + fieldset[field].id + '" multiple="multiple" style="display: none;">';
					for (var idx in fieldset[field].fieldValues) {
						var fieldOption = fieldset[field].fieldValues[idx];
						inputHTML += '<option value="' + fieldOption[0] + '"' + (fieldOption[3] ? ' selected="selected"' : '') + '>' + fieldOption[2] + '</option>';
					}
					inputHTML += '</select>';
				}
			}
			else {
				var fieldConfig = esv.storedConfiguration[dataType][step].fields[field];
				fieldset[field] = $.extend(true, {}, CONFIG.widgets.number, fieldConfig);
				fieldset[field].minValue = response.aggregations.min.value;
				fieldset[field].defaultValue = response.aggregations.min.value;
				fieldset[field].maxValue = response.aggregations.max.value;
				var range = fieldset[field].maxValue - fieldset[field].minValue;
				if (range > 1000) {
					fieldset[field].step = 100;
				}
				else if (range > 100) {
					fieldset[field].step = 10;
				}
				else if (range > 10) {
					fieldset[field].step = 1;
				}
				else {
					fieldset[field].step = 0.1;
				}

				var fieldValues = $.map(response.aggregations[field].buckets, function(value) {
					return value.key;
				}).sort();
				// In case a numeric field takes limited number of values,
				// allow configuring it as a select/multiselect input
				if (response.aggregations[field].buckets.length < 50) {
					fieldset[field].fieldValues = $.map(fieldValues, function(value, idx) {
						return  [
							// Set the 'selected' flag to true for all multiselect field options or for the first one for select fields
							["" + value, "", "" + value, true, "", false]
						]
					});
				}
				var inputHTML = '<label class="control-label">' + fieldset[field].label + '</label><br/>\
					<input data-fieldid="' + field + '" class="form-control create-number" type="number" placeholder="' + field + '" value="' + fieldset[field].defaultValue + '" step="' + fieldset[field].step + '" ' + ' min="' + fieldset[field].minValue + '" max="' + fieldset[field].maxValue + '" disabled="true"> \
					</div>';
			}
			fieldset[field].cardinality = response.aggregations[field + '_cardinality'].value;
			$.extend(true, esv.storedConfiguration[dataType][step].fields, fieldset);
			if (inputHTML) {
				$('body > #panel-settings-popup li#' + fieldID + ' input[type=checkbox][class=toggle-field]').prop('checked', true).change();
				inputHTML += '<a href="#" class="duplicate" data-toggle="tooltip" data-placement="top" title="Copy widget"><span aria-hidden="true" class="glyphicon glyphicon-duplicate"></span></a>';
				inputHTML += '<a href="#" class="edit" data-toggle="tooltip" data-placement="top" title="Edit widget"><span aria-hidden="true" class="glyphicon glyphicon-pencil"></span></a>';
				$('body > #panel-settings-popup li#' + fieldID + ' .info').html(inputHTML);
			}
		}

		function _deactivateField(field) {
			var fieldID = field.replace(/\./g, '_');
			$('body > #panel-settings-popup li#' + fieldID).addClass('deactivated');
			$('body > #panel-settings-popup li#' + fieldID + ' :checkbox').prop('disabled', 'disabled');
			$('body > #panel-settings-popup li#' + fieldID)
				.attr('data-toggle', "tooltip")
				.attr('data-placement', "top")
				.attr('title', "Inconsistent mapping detected.");
			inputHTML = '<label>' + fieldset[field].label + '</label><br/><span>Field deactivated.</span>';
			$('body > #panel-settings-popup li#' + fieldID + ' .info').html(inputHTML);
		}

		function _updateField(fieldName, dataType, step, blockingObject) {
			var field = esv.storedConfiguration[dataType][step].fields[fieldName];
			if (!field.disabled) {
				$('body > #panel-settings-popup li#' + fieldID).removeClass('disabled');
				$('body > #panel-settings-popup li#' + fieldID + ' :checkbox').prop('checked', true).change();
			}
			var fieldConfig = esv.storedConfiguration[dataType][step].fields[fieldName];
			var inputHTML = '';
			if (fieldConfig.fieldType != 'number') {
				var fieldValues = fieldConfig.fieldValues;
				var sampleValues = fieldValues[0] ? [fieldValues[0][2]] : "";
				inputHTML += '<label>' + fieldConfig.label + '</label><br/>';

				if (fieldConfig.fieldType == 'predictivetext') {
					inputHTML += '<input data-role="tagsinput" data-id="" data-fieldid="' + fieldConfig.esid + '" class="form-control create-predictivetext" type="text" placeholder="' + fieldConfig.placeholder + '" value="' + sampleValues.join(',') + '" style="display:none;">';
					if (sampleValues[0].length > 20) {
						sampleValues[0] = [sampleValues[0].substr(0, 20) + '..'];
					}
					inputHTML += '<div class="bootstrap-tagsinput bootstrap-tagsinput-max"><span class="tag label label-info">' + sampleValues.join('<span data-role="remove"></span></span><span class="tag label label-info">') + '<span data-role="remove"></span></span> <input type="text" placeholder="" style="display: none;" class="form-control edit-predictivetext"></div>';
				}
				else {
					if (fieldConfig.fieldType == 'select') {
						inputHTML += '<select class="form-control create-select" data-fieldid="' + fieldConfig.id + '" >';
					}
					else {
						inputHTML += '<select class="multiselect form-control create-multiselect" data-fieldid="' + fieldConfig.id + '" multiple="multiple" style="display: none;">';
					}
					for (var idx in fieldConfig.fieldValues) {
						var fieldOption = fieldConfig.fieldValues[idx];
						// If option disabled flag is set, skip
						if (fieldOption[5]) {
							continue;
						}
						inputHTML += '<option value="' + fieldOption[0] + '"' + (fieldOption[3] ? ' selected="selected"' : '') + '>' + fieldOption[2] + '</option>';
					}
					inputHTML += '</select>';
				}
			}
			else {
				var inputHTML = '<label class="control-label">' + fieldConfig.label + '</label><br/> \
					<input data-fieldid="' + fieldConfig.esid + '" class="form-control create-number" type="number" placeholder=" "value="' + fieldConfig.defaultValue + '" step="' + fieldConfig.step + '" ' + ' min="' + fieldConfig.minValue + '" max="' + fieldConfig.maxValue + '" disabled="true"> \
					</div>';
			}
			if (inputHTML) {
				if (fieldName.match(/\_copy$/)) {
					inputHTML += '<a href="#" class="remove" data-toggle="tooltip" data-placement="top" title="Remove widget"><span aria-hidden="true" class="glyphicon glyphicon-remove"></span></a>';
				}
				inputHTML += '<a href="#" class="duplicate" data-toggle="tooltip" data-placement="top" title="Copy widget"><span aria-hidden="true" class="glyphicon glyphicon-duplicate"></span></a>';
				inputHTML += '<a href="#" class="edit" data-toggle="tooltip" data-placement="top" title="Edit widget"><span aria-hidden="true" class="glyphicon glyphicon-pencil"></span></a>';
				$('body > #panel-settings-popup li#' + fieldID + ' .info').html(inputHTML);
				inputHTML = '';
			}
			blockingObject.resolve();
		}

		var newFields = {};
		var blockingObjects = [];
		var fieldsTotal = Object.keys(fieldset).length;
		var fieldsProcessed = 0;
		var delay = 0;

		// Disable pointer events while widgets are being configured
		$('#panel-settings-popup .modal-body').addClass('disabled');

		for (var field in fieldset) {
			var fieldID = field.replace(/\./g, '_');
			if (fieldset[field].hasOwnProperty('fieldType')) {
				var blockingObject = new $.Deferred();
				blockingObjects.push(blockingObject.promise());
				_updateField(field, dataType, step, blockingObject);
				ESV.updateProgress(Math.round(++fieldsProcessed/fieldsTotal*100));
			}
			else {
				// TODO: update the code to retrieve fields' information in a manner requiring minimal
				// number of calls to the backend as the current solution results
				// in excessive number of requests. This was implemented as a workaround
				// for cases when different data type is specified for the same field across
				// indices under the same alias
				blockingObjects.push(_getFieldData(field, fieldset[field].type, function(response) {
						for (var key in response.aggregations) {
							if (response.aggregations[key].hasOwnProperty('buckets')) {
								newFields[key] = response;
							}
						}
						ESV.updateProgress(Math.round(++fieldsProcessed/fieldsTotal*100));
					},
					function(err) {
						ESV.updateProgress(Math.round(++fieldsProcessed/fieldsTotal*100));
					},
					delay
				));
				delay += 500;
			}
		}

		$.when.apply($, blockingObjects).then(function() {
			ESV.updateProgress(100);
			for (var key in fieldset) {
				if (newFields.hasOwnProperty(key)) {
					_populateField(newFields[key]);
				}
				else if (!fieldset[key].hasOwnProperty('fieldType')) {
					_deactivateField(key);
				}
			}
			$('#panel-settings-popup .multiselect').multiselect({
				includeSelectAllOption: true
			});
			// Workaround for case where multiselect fields didn't show up
			// properly within the grid
			$('#panel-config button.multiselect').click(function() {
				var $gridWidget = $(this).parents('li.gs-w').first();
				$gridWidget.css('z-index', 1).siblings('li.gs-w').css('z-index', 0);
			});
			// Re-enable pointer events
			$('#panel-settings-popup .modal-body').removeClass('disabled');

			// Select/multiselect options should serve only as previews and therefore disabled
			$('#panel-config select > option').prop('disabled', true);
			$('#panel-config .multiselect-container input[type=checkbox]').prop('disabled', true);

			$(function () {
				$('[data-toggle="tooltip"]').tooltip();
			});

		});

		$('body > #panel-settings-popup').modal({'backdrop': 'static', 'keyboard': false});

		if (scrollToID) {
			$('#panel-config #' + scrollToID).addClass('active');
			var scrollToOffset = $('#panel-config #' + scrollToID).offset().top;
			if (scrollToOffset == 0 && $('#panel-config #' + scrollToID).attr('data-row')) {
				scrollToOffset = ($('#panel-config #' + scrollToID).attr('data-row')) * 80 - 200;
			}
			$('#panel-settings-popup').animate({'scrollTop': scrollToOffset}, 'slow');
		}

		$('#panel-config select').on('change', function() {
			var selectInput = $(this);
			var fieldID = selectInput.attr('data-fieldid');
			var field = esv.storedConfiguration[dataType][step].fields[fieldID];
			var fieldValues = [];
			selectInput.find('option').each(function() {
				fieldValues.push([$(this).val(), "", $(this).html(), $(this).is(':selected'), "", false]);
			});
			// add any disabled options at the end
			for (var idx in field.fieldValues) {
				var option = field.fieldValues[idx];
				if (option[5]) {
					fieldValues.push(option);
				}
			}
			field.fieldValues = fieldValues;
		});

		$('#panel-config li.gs-w').on('click', '.duplicate', function() {
			$(this).trigger('mouseout');
			var fieldItem = $(this).parents('li.gs-w').first().clone(true);
			var fieldID = fieldItem.attr('data-fieldid');
			var field = esv.storedConfiguration[dataType][step].fields[fieldID];
			var newFieldID = fieldID + '_copy';
			if (esv.storedConfiguration[dataType][step].fields.hasOwnProperty(newFieldID)) {
				ESV.notificationPopup('Field ' + fieldID + ' has been replicated already.');
				return;
			}

			var newField = $.extend(true, {}, field);
			var fieldPosition = parseInt(fieldItem.attr('data-row')) + 1;
			newField.id += '_copy';
			newField.position = field.position;
			newField.label += ' Copy';
			esv.storedConfiguration[dataType][step].fields[newFieldID] = newField;

			fieldItem.attr('id', newField.id);
			fieldItem.attr('data-fieldid', fieldItem.attr('data-fieldid') + '_copy');
			var itemLabel = fieldItem.find('.info > label').html(newField.label);
			// Tooltips don't seem to work as expected after cloning the widget,
			// a workaround is to remove/add back the links
			fieldItem.find('.toggle').remove();
			fieldItem.find('.info').before('<input type="checkbox" class="toggle-field" id="' + newField.id + '-enabled"' + (newField.disabled ? '' : ' checked="checked"') + 'data-toggle="toggle" data-size="mini" data-width="65">');
			fieldItem.find('.tooltip').remove();
			fieldItem.find('.info a').remove();
			fieldItem.find('.info').append('<a href="#" class="remove" data-toggle="tooltip" data-placement="top" title="Remove widget"><span aria-hidden="true" class="glyphicon glyphicon-remove"></span></a>');
			fieldItem.find('.info').append('<a href="#" class="duplicate" data-toggle="tooltip" data-placement="top" title="Copy widget"><span aria-hidden="true" class="glyphicon glyphicon-duplicate"></span></a>');
			fieldItem.find('.info').append('<a href="#" class="edit" data-toggle="tooltip" data-placement="top" title="Edit widget"><span aria-hidden="true" class="glyphicon glyphicon-pencil"></span></a>');
			fieldItem.removeAttr('data-row').removeAttr('data-col');
			panelConfigGrid.add_widget(fieldItem, 1, 1, 1, fieldPosition);
			$(function () {
				$('[data-toggle="tooltip"]').tooltip();
			});
			$(function() {
				$('.toggle-field').bootstrapToggle({
					on: 'Show',
					off: 'Hide'
				});
			});
		});

		$('#panel-config li.gs-w').on('click', '.remove', function() {
			var fieldItem = $(this).parents('li.gs-w').first();
			var fieldID = fieldItem.attr('data-fieldid');
			var fieldPosition = parseInt(fieldItem.attr('data-row')) + 1;
			panelConfigGrid.remove_widget(fieldItem, false, function() {
				delete esv.storedConfiguration[dataType][step].fields[fieldID];
			});
		});

		$.extend(true, esv.storedConfiguration[dataType][step].fields, fieldset);
	}

	/**
	 * Retreives data for a given field
	 * TODO: All code related to querying the backend should be moved to ESV.queries
	 * @param {String} fieldName - Input field name
	 * @param {String} fieldType - 'number' or 'string'
	 * @param {Function} callback - The function to run when the Ajax call returns (errors will not trigger this)
	 * @param {Function} errorHandler - The function to run when the Ajax call returns an error
	 * @param {Number} delay - delay in ms before sending the request
	 */
	function _getFieldData(fieldName, fieldType, callback, errorHandler, delay) {
		var aggregations = {};
		aggregations[fieldName] = {
			"terms": {
				"field": fieldName,
				"size": 50,
				"order": {
					"_term": "asc"
				}
			}
		};
		if (fieldType == 'number') {
			aggregations.max = {
				"max": {
					'field': fieldName
				}
			};
			aggregations.min = {
				"min": {
					'field': fieldName
				}
			};
		}
		aggregations[fieldName + '_cardinality'] = {
			"cardinality": {
				"field": fieldName
			}
		};
		var blockingObject = new $.Deferred();

		setTimeout(function()  {
			ESV.queries.makeSimpleQuery({"aggs": aggregations, "size": 0}, null, true, function(response) {
					callback(response);
					blockingObject.resolve();
				},
				function(err) {
					if ($.isFunction(errorHandler)) {
						errorHandler(err);
					}
					blockingObject.resolve();
				});
			}, delay);
		return blockingObject;
	}


	/* Generates a form for configuring the input widget for a given field
	 * @function _configureFieldWidget
	 * @param {String} fieldName - Input field name
	 * @param {String} dataType
	 * @param {String} step - 'data' or 'datafilter'
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _configureFieldWidget(fieldName, dataType, step) {
		var fieldConfig = esv.storedConfiguration[dataType][step].fields[fieldName];
		var numericWidgetTypes = ["number"];
		if (fieldConfig.hasOwnProperty('fieldValues')) {
			numericWidgetTypes.push("multiselect", "select");
		}
		var stringWidgetTypes = ["multiselect", "predictivetext", "select"];
		var configPanelHTML = '<div id="widget-config" data-fieldid="' + fieldName + '">\
				<div class="form-group">\
					<label class="control-label">Field</label><br/> \
					<span>' + fieldConfig.esid + '</span> \
				</div>\
				<div class="form-group">\
					<label class="control-label">Field label</label> \
					<input id="field-label" data-fieldid="label" class="form-control create-text" type="text" placeholder="Field label" value="' + fieldConfig.label + '"> \
				</div>\
				<div class="form-group">\
					<label class="control-label">Widget type</label>\
					<select id="field-type" class="form-control create-select" data-fieldid="fieldType">';
		if (fieldConfig.type == "number") {
			$.each(numericWidgetTypes, function(idx, value) {
				configPanelHTML += '<option value="' + value + '"' + (value == fieldConfig.fieldType ? ' selected="selected"' : '') + '>' + value + '</option>';
			});
		}
		else {
			$.each(stringWidgetTypes, function(idx, value) {
				configPanelHTML += '<option value="' + value + '"' + (value == fieldConfig.fieldType ? ' selected="selected"' : '') + '>' + value + '</option>';
			});
		}
		configPanelHTML += '</select>\
				</div>\
				<div class="form-group predictivetext-fields'+ (fieldConfig.fieldType == 'predictivetext' ? '' : ' hidden')+ '">\
					<label class="control-label">Field placeholder</label> \
					<input id="field-label" data-fieldid="placeholder" class="form-control create-text" type="text" placeholder="' + fieldConfig.placeholder + '" value="' + fieldConfig.placeholder + '"> \
				</div>\
				<div class="form-group predictivetext-fields'+ (fieldConfig.fieldType == 'predictivetext' ? '' : ' hidden')+ '">\
					<label class="control-label">Input limit</label> \
					<input id="field-limit" data-fieldid="limit" class="form-control create-text" type="number" min="0" data-toggle="tooltip" title="Set to 0 for no limit" placeholder="' + fieldConfig.limit + '" value="' + (fieldConfig.placeholder || 0) + '"> \
				</div>';

		if (fieldConfig.type == 'number') {
			var hidden = fieldConfig.fieldType != 'number' ? ' hidden' : '';
			configPanelHTML += '<div class="form-group number-fields' + hidden + '">\
				<label class="control-label">Minimal value</label> \
				<input id="field-min" data-fieldid="minValue" class="form-control create-text" type="number" placeholder="' + fieldConfig.minValue + '" value="' + fieldConfig.minValue + '"> \
			</div>\
			<div class="form-group number-fields' + hidden + '">\
				<label class="control-label">Maximal value</label> \
				<input id="field-max" data-fieldid="maxValue" class="form-control create-text" type="number" placeholder="' + fieldConfig.maxValue + '" value="' + fieldConfig.maxValue + '"> \
			</div>\
			<div class="form-group number-fields' + hidden + '">\
				<label class="control-label">Default value</label> \
				<input id="field-defaultValue" data-fieldid="defaultValue" class="form-control create-text" type="number" placeholder="' + fieldConfig.defaultValue + '" value="' + fieldConfig.defaultValue + '"> \
			</div>\
			<div class="form-group number-fields' + hidden + '">\
				<label class="control-label">Increment step</label> \
				<input id="field-step" data-fieldid="step" class="form-control create-text" type="number" placeholder="' + fieldConfig.step + '" value="' + fieldConfig.step + '"> \
			</div>\
			<div class="form-group number-fields' + hidden + '">\
				<input type="checkbox" id="field-isRange" data-fieldid="isRange"' + (fieldConfig.isRange ? ' checked="checked"' : '')+ '> \
				<label class="control-label">Field represents a range</label> \
			</div>\
			<div class="form-group number-fields' + hidden + '">\
				<input type="checkbox" id="field-inequality" data-fieldid="inequality"' + (fieldConfig.inequality ? ' checked="checked"' : '')+ '> \
				<label class="control-label">Greater or equal than?</label> \
			</div>';
		}
		var hideValueSettings = $.inArray(fieldConfig.fieldType, ['number', 'predictivetext']) >= 0;
		configPanelHTML += '<div class="form-group' + (hideValueSettings ? ' hidden' : '') + ' select-fields">\
			<label class="control-label">Values</label> \
		</div>';
		configPanelHTML += '<div id="field-config" class="gridster' + (hideValueSettings ? ' hidden' : '') + ' select-fields"><ul>';
		var counter = 1;
		for (var idx in fieldConfig.fieldValues ) {
			field = fieldConfig.fieldValues[idx];
			var fieldDisabled = field[5];
			var fieldLabel = field[0];
			var fieldID = field[0];
			// Truncate long fields
			if (fieldLabel.length >= 30) {
				var fieldPosition = fieldLabel.length;
				fieldLabel = '...' + fieldLabel.substr(fieldPosition - 30, fieldPosition);
			}
			configPanelHTML += '<li ' + (fieldDisabled ? ' class="disabled"' : '') + 'data-row="'+ counter + '" data-col="1", data-sizex="1", data-sizey="1" id="' + fieldID + '"><div class="field-settings form-group">\
				<input type="checkbox" class="toggle-field" id="' + fieldID + '-enabled"' + (fieldDisabled ? '' : ' checked="checked"') + 'data-toggle="toggle" data-size="mini" data-width="65">\
				<div class="item info form-group">\
					<label class="control-label" data-toggle="tooltip" data-placement="top" title="Field value' + (fieldConfig.type != 'number' && fieldLabel.match(/^\.\.\./) ? ': ' + field[0] : '') + '">' + fieldLabel + '</label>\
					<input id="value-label" data-fieldid="fieldValues-' + field[0] + '" class="form-control create-text" type="text" placeholder="Value label" data-toggle="tooltip" data-placement="top" title="Field value label" data-selected="' + field[3]  + '" value="' + field[2] + '"> \
					<input id="' + fieldID + '-selected" type="checkbox"' + (field[3] ? ' checked="checked"' : '') + '><label for="' + fieldID + '-selected"> selected by default</label>\
				</div>\
			</div></li>';
			counter++;
		}
		configPanelHTML += '</ul></div>';
		configPanelHTML += '</div>';

		ESV.panelSettingsPopup('Configure Widget', configPanelHTML);
		$('body > #panel-settings-popup').modal({'backdrop': 'static', 'keyboard': false});

		$(function () {
			$('[data-toggle="tooltip"]').tooltip();
		});

		$('#panel-settings-popup button[data-dismiss=modal]').remove();
		$('#panel-settings-popup .modal-footer button').remove();
		var disableShowHideAll = $.inArray(fieldConfig.fieldType, ["number", "predictivetext"]) >= 0;
		var allHidden = $('#panel-settings-popup li input[data-toggle=toggle]:checked').length == 0;
		var disableSelectAll = fieldConfig.fieldType != 'multiselect';
		var allOptionsUnselected = $('#panel-settings-popup li input[id$=-selected]:checked').length == 0;
		$('#panel-settings-popup .modal-footer').append('<button class="btn btn-default pull-left toggle select-fields' + (disableShowHideAll ? ' hidden' : '') + '" type="button">' + (allHidden ? 'Show All' : 'Hide All') + '</button>');
		$('#panel-settings-popup .modal-footer').append('<button class="btn btn-default pull-left toggle select-options' + (disableSelectAll ? ' hidden' : '') + '" type="button">' + (allOptionsUnselected ? 'Select All' : 'Unselect All') + '</button>')
		$('#panel-settings-popup .modal-footer').append('<button class="btn btn-default done" type="button">Done</button>');
		$('#field-config  ul').gridster({
			"namespace": "#field-config",
			widget_margins: [0, 0],
			widget_base_dimensions: [450, 100]
		});

		$('body > #panel-settings-popup button').on('click', function() {
			var button = $(this);
			if (button.hasClass('toggle') && button.hasClass('select-fields')) {
				if (button.html() == 'Show All') {
					$('#panel-settings-popup li.gs-w input[data-toggle=toggle]').prop('checked', true).change();
					button.html('Hide All');
				}
				else {
					$('#panel-settings-popup li.gs-w input[data-toggle=toggle]').prop('checked', false).change();
					button.html('Show All');
				}
			}
			else if (button.hasClass('done')) {
				$('body > #panel-settings-popup').modal('hide');
				_saveFieldConfig();
				var fieldID = esv.storedConfiguration[dataType][step].fields[fieldName].id;
				_configureDatafilterFieldset(dataType, step, fieldID);
			}
			else if (button.hasClass('toggle') && button.hasClass('select-options')) {
				if (button.html() == 'Select All') {
					$('#panel-settings-popup li.gs-w:not(.disabled) input[id$=-selected]').prop('checked', true).change();
					button.html('Unselect All');
				}
				else {
					$('#panel-settings-popup li.gs-w:not(.disabled) input[id$=-selected]').prop('checked', false).change();
					button.html('Select All');
				}
			}
		});

		$('#widget-config select#field-type').on('change', function() {
			fieldConfig.isRange = false;
			delete fieldConfig.prid;
			if ($.inArray($(this).val(), ["number", "predictivetext"]) >= 0) {
				$('#panel-settings-popup .select-options').addClass('hidden');
				$('#panel-settings-popup .select-fields').addClass('hidden');
				if ($(this).val() == 'predictivetext') {
					$('#panel-settings-popup .predictivetext-fields').removeClass('hidden');
					fieldConfig.prid = fieldConfig.esid;
				}
				else {
					$('#panel-settings-popup .number-fields').removeClass('hidden');
					fieldConfig.isRange = true;
				}
			}
			else {
				$('#panel-settings-popup .predictivetext-fields').addClass('hidden');
				$('#panel-settings-popup .number-fields').addClass('hidden');
				$('#panel-settings-popup .select-fields').removeClass('hidden');
				// mark all options as selected for field type multiselect, only the first one for type select
				if ($(this).val() == 'multiselect') {
					$('#panel-settings-popup input[id$=-selected]').prop('checked', false).change();
					$('#panel-settings-popup .select-options').removeClass('hidden');
				}
				else {
					$('#panel-settings-popup input[id$=-selected]').prop('checked', false).change();
					$('#panel-settings-popup input[id$=-selected]').first().prop('checked', true).change();
					$('#panel-settings-popup .select-options').addClass('hidden');
				}
			}
		});

		$('#widget-config input[id$=-selected]').on('change', function() {
			// For widget type select, uncheck all other 'selected by default' options
			if ($(this).prop('checked') && $('#widget-config select#field-type').val() == 'select') {
				$('#widget-config input[id$=-selected]').not($(this)).prop('checked', false).change();
			}
		});

		$('#widget-config input[id$=-enabled]').on('change', function() {
			var parentWidget = $(this).parents('li').first();
			if ($(this).is(':checked')) {
				parentWidget.removeClass('disabled');
				$('#panel-settings-popup .btn.select-options.disabled').removeClass('disabled');
			}
			else {
				parentWidget.addClass('disabled');
				if ($('#widget-config input[id$=-enabled]:checked').length == 0) {
					$('#panel-settings-popup .btn.select-options').addClass('disabled');
				}
			}
		});

		/**
		 * Saves the current input field configuration in esv.storedConfiguration variable
		 * @function _saveFieldConfig
		 * @memberof ESV.editor
		 * @instance
		 * @private
		 * @inner
		 */
		function _saveFieldConfig() {
			var fieldSettings = {};
			var fieldID = $('#widget-config').attr('data-fieldid');
			$('#widget-config select:visible,#widget-config input:visible').each(function() {
				if ($(this).attr('data-fieldid') && !$(this).attr('data-fieldid').match(/^fieldValues-/)) {

					if ($(this).attr('data-fieldid') == "inequality") {
						fieldSettings[$(this).attr('data-fieldid')] = $(this).is(':checked') ? ">=" : "<=";
					} 
					else {
						fieldSettings[$(this).attr('data-fieldid')] = $(this).is(':checkbox') ? $(this).is(':checked') : $(this).val();
					}
				}
			});
			var fieldValues = [];
			$('#widget-config input[data-fieldid^=fieldValues]:visible').sort(function(a, b){
				// Sort fields based on their current position, giving priority to enabled ones
				var parentA = $(a).parents('li').first();
				var parentB = $(b).parents('li').first();
				var posA = parseInt(parentA.attr('data-row')) + (parentA.find('input[id$=-enabled]:checkbox').first().prop('checked') ? 0 : 1000);
				var posB = parseInt(parentB.attr('data-row')) + (parentB.find('input[id$=-enabled]:checkbox').first().prop('checked') ? 0 : 1000);
				// Sort disabled fields alphabetically
				if (posA > 1000 && posB > 1000) {
					return parentA.attr('id').toLowerCase() > parentB.attr('id').toLowerCase();
				}
				if (posA > posB) {
					return 1;
				}
				if (posA < posB) {
					return -1;
				}
				return 0;
			})
			.each(function() {
				var optionValue = $(this).attr('data-fieldid').replace('fieldValues-', '');
				// Seems that getElementById handles better special characters in object
				// IDs then jQuery selectors, even if properly escaped
				var optionDisabled = !document.getElementById(optionValue + '-enabled').checked;
				var optionSelected = document.getElementById(optionValue + '-selected').checked;

				fieldValues.push([optionValue, "", $(this).val(), optionSelected, "", optionDisabled]);
			});
			fieldSettings.fieldValues = fieldValues;
			$.extend(true, esv.storedConfiguration[dataType][step].fields[fieldID], fieldSettings);
		}
	}

    /**
     * Generates an array of addable views
     * @function _getExistingViewsAllowedToBeAdded
     * @param {Number} ignoreID - The ID of the view that we cannot add (ie. we cannot add an existing view that shares the same view filter, other we end up with duplicate views)
     * @returns {Array} existingViews - List of existing view configuration objects
     * @memberof ESV.editor
     * @instance
     * @private
     */
	function _getExistingViewsAllowedToBeAdded(ignoreID) {
		var existingViews = [];
		var viewsInTree = ESV.getStaleVisualizationIDsTree(ignoreID);
		$.each(ESV.nodes, function(nodeID, node) {
			if (node.type != 'data' && node.type != 'datafilter' && node.type != 'viewfilter') {
				if ($.inArray(node.id, viewsInTree) == -1) {
					existingViews.push(node);
				}
			}
		});
		return existingViews;
	}


    /**
     * Looks at all the nodes top down, checks if all dependent fields exist and if any needs to be updated
     * @function updateTreeConsistency
     * @param {String} type (optional) - The type of nodes being processed
     * @memberof ESV.editor
     * @instance
     */
	esv.updateTreeConsistency = function(type) {
		if (type == null || type == undefined || type == "") {
			type = "view";
		}
		$.each(ESV.nodes, function(vizID, vizObj) {
			var trueVizObjType = vizObj.type;
			if (vizObj.type != "viewfilter" && vizObj.type != "datafilter" && vizObj.type != "data") {
				trueVizObjType = "view";
			}

			if (type == trueVizObjType) {
				// Add any newly accessible filters and remove any unnecessary filters due to changed dependencies
				_updateNodeConsistency(vizObj, function(newVizObj) {
					vizObj = newVizObj;
				});
			}
		});

		if (type == "view") {
			ESV.editor.updateTreeConsistency("viewfilter");
		} else if (type == "viewfilter") {
			ESV.editor.updateTreeConsistency("datafilter");
		} else if (type == "datafilter") {
			ESV.editor.updateTreeConsistency("data");
		}
	}

    /**
     * Looks at all the nodes top down, checks if all dependent fields exist and if any needs to be updated
     * @function _updateNodeConsistency
     * @param {String} type (optional) - The type of nodes being processed (ie. "data" or "viewfilter")
     * @memberof ESV.editor
     * @instance
     * @private
     */
	function _updateNodeConsistency(currentNode, callback) {
		var nodeType = currentNode.type;

		// Finds the fieldset for this particular step that satisfies all the dependencies
		var fieldset = _createFieldset(currentNode.type, currentNode);

		// These fields will require extra processing of their values
		var postProcessingFields = [];

		// For each field in the fieldset, try to find the corresponding input value
		$.each(fieldset, function(fieldID, field) {

			// Only add the default values if the currentNode doesn't have this field to begin with
			if (currentNode.filters.hasOwnProperty(fieldID) || currentNode.info.hasOwnProperty(fieldID)) {
				return;
			}

			var fieldESID = field.esid;
			var fieldValue = [];
			// Find if there's any default values we need to populate this node with
			if (field.fieldType == "select" || field.fieldType == "multiselect") {
				for (var i = 0; i < field.fieldValues.length; i++) {
					if (field.fieldValues[i][3]) {
						// The default for this select/option value is 'true'
						fieldValue.push(field.fieldValues[i][0]);
					}
				}
			} else {
				if (field.hasOwnProperty("defaultValue")) {
					fieldValue = field.defaultValue;
				}
			}

			var fieldValueArray = fieldValue;
			if (fieldValueArray == null || fieldValueArray == undefined) {
				fieldValueArray = [];
			} else if (!$.isArray(fieldValueArray)) {
				fieldValueArray = fieldValueArray.toString().split(",");
			}

			var isFilter = (fieldESID != null && fieldESID != undefined);
// 			if ((fieldValue == null || fieldValue == undefined || fieldValue == "")
// 				&& (field.queryIfEmpty !== true && isFilter)) {
// 				return;
// 			}

			if (!$.isArray(fieldESID)) {
				// Does the field have an 'esid' (an ID that maps the field to a database field) and does the fieldValue exists
				if (isFilter) {
					// Fields that correspond directly with the database are classified as 'filters'

					var isRange = false;
					if (field.isRange == true) {
						// Ranges are special due to how they are treated by Elastic Search and how their values are stored
						// Ranges must always have the format "min, max" (eg. "2, 4" or "x, 4" for less than 4 or "2, x" for greater than 2)
						isRange = true;
					}

					currentNode.filters[fieldID] = {
						nodeType: nodeType,
						esid: fieldESID,
						isRange: isRange,
						fieldType: field.fieldType,
						fieldValues: fieldValueArray,
						inequality: field.inequality
					};
				} else {
					currentNode.info[fieldID] = fieldValueArray;
				}
			} else {
				// ESID is an array. There are two cases where this can occur:
				// 1) Post Processing is needed to translate the input value into actual queriable values
				// 2) Pattern extraction is needed to extract input values of consequence

				var esids = "";
				var ranges = [];
				var ignoreIndex = -1;

				if (field.hasOwnProperty("post_processing")) {
					postProcessingFields.push(field.id);
				} else {
					// "esid": ["chr*:*-*", { esid: ESV.mappings.chrom }, { esid: ESV.mappings.startPos, range: "gt" }, { esid: ESV.mappings.endPos, range: "lt" }],
					// The first item in the array is the pattern
					ignoreIndex = 0;
				}

				for (var i = 0; i < fieldESID.length; i++) {
					if (i != ignoreIndex) {
						esids += fieldESID[i].esid;
						if (i < (fieldESID.length - 1)) {
							esids += ",";
						}

						if (fieldESID[i].hasOwnProperty("range")) {
							ranges.push(fieldESID[i].range);
						} else {
							ranges.push("");
						}
					}
				}

				if (field.hasOwnProperty("post_processing")) {
					currentNode.filters[fieldID] = {
						nodeType: nodeType,
						esid: esids,
						range: ranges,
						fieldType: field.fieldType,
						fieldValues: fieldValueArray
					};
				} else {
					currentNode.filters[fieldID] = {
						nodeType: nodeType,
						esid: esids,
						range: ranges,
						fieldType: field.fieldType,
						fieldValues: _processMultiESIDField(field, fieldValueArray)
					};
				}
			}
		});

		// Remove any filters that do not satisfy a dependency
		var filtersToRemove = [];
		$.each(currentNode.filters, function(fieldID, field) {
			if (!fieldset.hasOwnProperty(fieldID)) {
				// We should remove this filter as it doesn't exist in the correct fieldset
				filtersToRemove.push(fieldID);
			}
		});
		for (var i = 0; i < filtersToRemove.length; i++) {
			delete currentNode.filters[filtersToRemove[i]];
		}

		filtersToRemove = [];
		$.each(currentNode.info, function(fieldID, field) {
			if (!fieldset.hasOwnProperty(fieldID)) {
				// We should remove this filter as it doesn't exist in the correct fieldset
				filtersToRemove.push(fieldID);
			}
		});
		for (var i = 0; i < filtersToRemove.length; i++) {
			delete currentNode.info[filtersToRemove[i]];
		}

		if (postProcessingFields.length > 0) {
			var blockingPromise = new $.Deferred();
			var numBlocking = postProcessingFields.length;

			for (var i = 0; i < postProcessingFields.length; i++) {
				// Run any post processing on the field values
				fieldset[postProcessingFields[i]].post_processing.execute(postProcessingFields[i], currentNode, function(updatedNode) {
					currentNode = updatedNode;
					numBlocking--;
					if (numBlocking <= 0) {
						blockingPromise.resolve();
					}
				});
			}

			$.when(blockingPromise).then(function() {
				callback(currentNode);
			});
		} else {
			callback(currentNode);
		}
	};

	// ----- General Component Builders -----
	/**
	 * Renders a particular field according to its type
	 * @function _renderPanelField
	 * @param {Object} params - Configuration input parameters<br/>
	 *                  * {String} params.panelType - 'create' or 'edit' depending on which panel this field being rendered for<br/>
	 *					* {Number} params.nodeID - The ID of the node which the fields will be a part of<br/>
	 *					* {String} params.nodeType - The type of the node which the fields will be a part of<br/>
	 *					* {Object} params.fieldObj - The field object, derived from the ESV[nodeType].fields corresponding to this field (contains info such as its label, default values, etc)<br/>
	 *					* {Array} params.existingValues - If panel is in 'edit' mode, there may be existing values (previously user inputted values) - these values should be derived from the vizObj<br/>
	 *					* {String} params.structureType (required if panelType is 'create') - The type of structure that is being created<br/>
	 *					* {Number} params.index (optional) - The field group # (defaults to 0)<br/>
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _renderPanelField(params) {
		if (params.fieldObj.disabled || (params.fieldObj.editOnly && params.panelType != "edit")) {
			return;
		}
		var fieldHTML = "";

		// Used to hide an element if necessary
		var display = "";

		// view, viewfilter, datafilter, data, etc
		var nodeType = params.nodeType;

		// The field type (eg. input text box, select dropdown, etc)
		var fieldType = params.fieldObj.fieldType;

		// Is this an create or edit panel?
		var panelType = params.panelType;

		// The ID of the field (eg. an input text box could have an id of 'PR')
		var fieldObjID = params.fieldObj.id;

		// The value a field should default to (applicable to text/number input only)
		var defaultValue = [""];
		if (params.fieldObj.defaultValue != null && params.fieldObj.defaultValue !== undefined) {
			defaultValue = params.fieldObj.defaultValue;
		}

		// Existing values are what the user inputted
		var existingValue = null;
		if (params.existingValues != null && params.existingValues != undefined) {
			// Sets the default value to an existing value
			existingValue = params.existingValues;
		}

		// Existing values should always override the default value
		var displayedValue = [""];
		if (existingValue !== null && existingValue != undefined) {
			displayedValue = existingValue;

			// If there is a custom ESID pattern, we'll fill it in here
			if ($.isArray(params.fieldObj.esid)) {
				var processedDisplayedValueArr = [];
				if (params.fieldObj.hasOwnProperty("post_processing")) {
					for (var i = 0; i < displayedValue.length; i++) {
						// Display the last element in the comma separated displayedValue[i] as this should represent the actual display value
						var displayedValueStrArr = displayedValue[i].split(",");
						processedDisplayedValueArr.push(displayedValueStrArr[displayedValueStrArr.length - 1]);
					}
				} else {
					for (var i = 0; i < displayedValue.length; i++) {
						processedDisplayedValueArr.push(_fillInPattern(params.fieldObj.esid[0], displayedValue[i]));
					}
				}
				displayedValue = processedDisplayedValueArr;
			}
		} else if (params.fieldObj.defaultValue !== null && params.fieldObj.defaultValue !== undefined) {
			// Applicable to text/number only
			displayedValue = params.fieldObj.defaultValue;
		}

		// Editing index may vary due to multiple field groups on one page
		var index = 0;
		if (params.index) {
			index = params.index;
		}

		// A default nodeID of 0 is used if there is no node ID given (should not happen)
		var nodeID = "0";
		if (params.nodeID) {
			nodeID = params.nodeID;
		}

		var fieldValues = [];
		if (params.fieldObj.hasOwnProperty("fieldValues")) {
			fieldValues = params.fieldObj.fieldValues;
		}

		// Custom field values
		if (params.fieldObj.hasOwnProperty("customFieldValues")) {
			fieldValues = params.fieldObj.customFieldValues(nodeID, params.structureType);
		}

		if (params.fieldObj.hasOwnProperty("displayConditions")) {
			// This node will only be displayed if the dependent node satisfies a certain condition
			for (var key in params.fieldObj.displayConditions) {
				if ($('#field-' + nodeID + '-' + key).length) {
					var conditionValues = params.fieldObj.displayConditions[key];
					var displayConditionFieldValue = $('#field-' + nodeID + '-' + key).data('selected-value') || $('#field-' + nodeID + '-' + key).val();
					if ((typeof(conditionValues) == 'string' && ((!conditionValues.match(/^\!/) && displayConditionFieldValue != conditionValues) || (conditionValues.match(/^\!/) && '!' + displayConditionFieldValue == conditionValues))) || ($.isArray(conditionValues) && $.inArray(displayConditionFieldValue, conditionValues) == -1)) {
						display = "hide";
					}

					$('#field-' + nodeID + '-' + key).change(function() {
						// Only if the value of the dependent node is equal to the value of the dependent condition do we show the current node
						var allDisplayConditionsSatisfied = true;
						for (var fieldKey in params.fieldObj.displayConditions) {
							var dcFieldValue = $('#field-' + nodeID + '-' + fieldKey).val();
							var dcValues = params.fieldObj.displayConditions[fieldKey];
							allDisplayConditionsSatisfied = allDisplayConditionsSatisfied && ((dcFieldValue == dcValues || (typeof(dcValues) == 'string' && dcValues.match(/^\!/) && '!' + dcFieldValue != dcValues)) || ($.isArray(dcValues) && $.inArray(dcFieldValue, dcValues) != -1));
						}
						if (allDisplayConditionsSatisfied) {
							$('#container-' + nodeID + '-' + fieldObjID).removeClass('hide');
						} else {
							$('#container-' + nodeID + '-' + fieldObjID).addClass('hide');
						}
					});
				}
			}
		}

		// For select/multiselects, enabling this option means that the field would be hidden if it only contains one option
		if ((fieldType == "select" || fieldType == "multiselect") && params.fieldObj.hideWhenSingleItem == true) {
			if (fieldValues.length <= 1) {
				display = "hide";
			}
		}

		// If the field should be hidden
		if (params.hidden || ($.isArray(params.fieldObj.hiddenIn) && $.inArray(params.structureType, params.fieldObj.hiddenIn) != -1)) {
			display = "hide";
		}

		var dataType = "";
		if (params.dataType) {
			dataType = params.dataType;
		}

		var fieldModifiable = params.panelType == 'create' || !params.fieldObj.hasOwnProperty('modifiable') || params.fieldObj.modifiable;
		
		switch (fieldType) {
			case "text":
				fieldHTML = '<div id="container-' + nodeID + '-' + fieldObjID + '" class="form-group ' + display + '"> \
							  <label class="control-label">' + params.fieldObj.label + '</label> \
							  <input id="field-' + nodeID + '-' + fieldObjID + '" data-id="' + nodeID + '" data-fieldid="' + fieldObjID + '" class="form-control ' + panelType + '-text" type="text" placeholder="' + params.fieldObj.placeholder + '" value="' + displayedValue + '" data-datatype="' + dataType + '"> \
							</div>';

				$('#' + panelType + '-' + nodeType + '-form-' + index).append(fieldHTML);
				break;

			case "number":
				var stepValue = 0.1;
				var minValue = params.fieldObj.minValue;
				var maxValue = params.fieldObj.maxValue;
				if (maxValue === minValue) {
					maxValue = minValue = "";
				}
				if (params.fieldObj.hasOwnProperty("step")) {
					stepValue = params.fieldObj.step;
				}

				fieldHTML = '<div id="container-' + nodeID + '-' + fieldObjID + '" class="form-group ' + display + '"> \
							  <label class="control-label">' + params.fieldObj.label + '</label> \
							  <input id="field-' + nodeID + '-' + fieldObjID + '" data-id="' + nodeID + '" data-fieldid="' + fieldObjID + '" class="form-control ' + panelType + '-number" type="number" placeholder="' + params.fieldObj.placeholder + '" value="' + displayedValue + '" step="' + stepValue + '" ' + ' min="' + minValue + '" max="' + maxValue +  '" data-datatype="' + dataType + '"> \
							</div>';

				$('#' + panelType + '-' + nodeType + '-form-' + index).append(fieldHTML);
				break;

			case "select":
				if (params.fieldObj.dynamic) {
					display = "hide";
				}
				fieldHTML = '<div id="container-' + nodeID + '-' + fieldObjID + '" class="form-group ' + display + '">\
								<label class="control-label">' + params.fieldObj.label + '</label>\
								<select id="field-' + nodeID + '-' + fieldObjID + '" class="form-control ' + panelType + '-select' + (params.fieldObj.configurable ? " configurable" : "") + '"  data-id="' + nodeID + '" data-fieldid="' + fieldObjID + '" ' + (fieldModifiable ? '' : 'disabled') + ' data-datatype="' + dataType + '">';

				for (var i = 0; i < fieldValues.length; i++) {
					var optionValue = fieldValues[i];

					// Skip options marked as disabled
					if (optionValue[5]) {
						continue;
					}

					if (existingValue != null) {
						// User is likely editing an existing field with an existing value
						if ($.inArray(optionValue[0], existingValue) > -1) {
							fieldHTML += '<option value="' + optionValue[0] + '" selected="selected">' + optionValue[2] + '</option>';
						} else {
							fieldHTML += '<option value="' + optionValue[0] + '">' + optionValue[2] + '</option>';
						}
					} else {
						// User is creating a brand new field (no existingValue), we look to the default property
						if (optionValue[3]) {
							// This option value is defaulted to true
							fieldHTML += '<option value="' + optionValue[0] + '" selected="selected">' + optionValue[2] + '</option>';
						} else {
							fieldHTML += '<option value="' + optionValue[0] + '">' + optionValue[2] + '</option>';
						}
					}
				}

				fieldHTML += '	</select>';

				if (params.fieldObj.configurable) {
					fieldHTML += '<a class="configure-field-link" data-node="' + params.fieldObj.configureNode + '" data-type="' + params.fieldObj.configureType + '"><span class="settings glyphicon glyphicon-cog"></span></a>';
				}

				fieldHTML += '</div>';

				$('#' + panelType + '-' + nodeType + '-form-' + index).append(fieldHTML);
				if (params.fieldObj.dynamic) {
					if (existingValue != null) {
						// specify the selected value in case the field is a display dependency for another one as all
						// options (including the seleted one) might not be populated corectly at the time of look up
						$('#field-' + nodeID + '-' + fieldObjID).data('selected-value', existingValue.toString());
					}
					_populateDynamicField(params.nodeID, params.fieldObj, '#field-' + nodeID + '-' + fieldObjID, existingValue);
				}
				if (params.fieldObj.linkedField) {
					$('#field-' + nodeID + '-' + fieldObjID).on('change', function(e) {
						// In case there is an associated linked field suppress the change event associated
						// with the current element, trigger the one for the linked field instead
						if (!e.isTrigger) {
							var $linkedField = $('#field-' + nodeID + '-' + params.fieldObj.linkedField);
							var fieldValue = $(this).val();
							var linkedFieldValue;
							if (fieldValue == 'none') {
								linkedFieldValue = fieldValue;
							}
							else if (fieldValue == $linkedField.val() || $linkedField.val() == 'none') {
								linkedFieldValue = $(this).children('option:selected').next().val() || $(this).children('option:selected').prev().val();
							}
							if (linkedFieldValue != null) {
								if (params.panelType == 'edit') {
									_editFieldChanged(nodeID, fieldObjID, fieldValue, params.dataType, true);
								}
								$linkedField.val(linkedFieldValue).trigger("change");
								return false;
							}
						}
					});
				}
				break;

			case "multiselect":
				fieldHTML = '<div id="container-' + nodeID + '-' + fieldObjID + '" class="form-group ' + display + '">\
								<label class="control-label">' + params.fieldObj.label + '</label><br />\
								<select id="field-' + nodeID + '-' + fieldObjID + '" class="multiselect form-control ' + panelType + '-multiselect" data-id="' + nodeID + '" data-fieldid="' + fieldObjID + '" multiple="multiple" style="display: none;" data-datatype="' + dataType + '">';

				for (var i = 0; i < fieldValues.length; i++) {
					var optionValue = fieldValues[i];
					// Skip options marked as disabled
					if (optionValue[5]) {
						continue;
					}

					if (existingValue != null) {
						// User is likely editing an existing field with an existing value
						if ($.inArray(optionValue[0], existingValue) > -1) {
							fieldHTML += '<option value="' + optionValue[0] + '" selected="selected">' + optionValue[2] + '</option>';
						} else {
							fieldHTML += '<option value="' + optionValue[0] + '">' + optionValue[2] + '</option>';
						}
					} 
					else if (params.fieldObj.selectFirstOption == false) {
						fieldHTML += '<option value="' + optionValue[0] + '">' + optionValue[2] + '</option>';
					}
					else {
						// User is creating a brand new field (no existingValue), we look to the default property
						if (optionValue[3]) {
							// This option value is defaulted to true
							fieldHTML += '<option value="' + optionValue[0] + '" selected="selected">' + optionValue[2] + '</option>';
						} else {
							fieldHTML += '<option value="' + optionValue[0] + '">' + optionValue[2] + '</option>';
						}
					}
				}

				fieldHTML += '	</select>\
							</div>';

				$('#' + panelType + '-' + nodeType + '-form-' + index).append(fieldHTML);

				var multiselectOptions = {
					includeSelectAllOption: true,			
				};

				if (params.fieldObj.includeSelectAll == false) {
					delete multiselectOptions["includeSelectAllOption"];
				}

				if (params.fieldObj.hasOwnProperty("nonSelectedText")) {
					multiselectOptions.nonSelectedText = params.fieldObj.nonSelectedText;
				}

				if (params.fieldObj.filterable) {
					multiselectOptions.enableFiltering = true;
					multiselectOptions.enableCaseInsensitiveFiltering = true	
				}

				$('#field-' + nodeID + '-' + fieldObjID).multiselect(multiselectOptions);
				break;

			case "predictivetext":
				fieldHTML = '<div id="container-' + nodeID + '-' + fieldObjID + '" class="form-group ' + display + '"> \
							  <label class="control-label">' + params.fieldObj.label + '</label><br /> \
							  <input data-role="tagsinput" data-id="' + nodeID + '" data-fieldid="' + fieldObjID + '" class="form-control ' + panelType + '-predictivetext" type="text" placeholder="' + params.fieldObj.placeholder + '" value="' + displayedValue.join(",") + '" data-datatype="' + dataType + '"> \
							</div>';

				$('#' + panelType + '-' + nodeType + '-form-' + index).append(fieldHTML);

				$('#container-' + nodeID + '-' + fieldObjID + ' input').addClass('form-control edit-predictivetext');
				$('#container-' + nodeID + '-' + fieldObjID + ' input').attr('id', 'field-' + nodeID + '-' + fieldObjID);

				if (params.fieldObj.hasOwnProperty("prid")) {
					// Prevent containing panel from detecting change events while intializing
					// typeahead in order to avoid unnecessary plot refreshing
					$('#container-' + nodeID + '-' + fieldObjID + ' input').on("change", function(e){
						e.stopPropagation();
					});
					_initTypeAhead(params.fieldObj.prid, nodeID, params.fieldObj);
					$('#container-' + nodeID + '-' + fieldObjID + ' input').unbind('change');
				}

				break;

			case "list":
				fieldHTML = '<div id="container-' + nodeID + '-' + fieldObjID + '" class="form-group ' + display + '"> \
							  <label class="control-label">' + params.fieldObj.label + '</label><br /> \
							  <input data-role="tagsinput" data-id="' + nodeID + '" data-fieldid="' + fieldObjID + '" class="form-control ' + panelType + '-predictivetext" type="text" placeholder="' + params.fieldObj.placeholder + '" value="' + displayedValue.join(",") + '" data-datatype="' + dataType + '"> \
							</div>';

				$('#' + panelType + '-' + nodeType + '-form-' + index).append(fieldHTML);

				$('#container-' + nodeID + '-' + fieldObjID + ' input').addClass('form-control edit-predictivetext');
				$('#container-' + nodeID + '-' + fieldObjID + ' input').attr('id', 'field-' + nodeID + '-' + fieldObjID);

				$('#field-' + nodeID + '-' + fieldObjID).tagsinput({});
				$('#container-' + nodeID + '-' + fieldObjID + ' input').addClass('form-control edit-predictivetext');
				$('#container-' + nodeID + '-' + fieldObjID + ' .bootstrap-tagsinput input').attr('style', '');

				break;

			case "truefalse":
				fieldHTML = '<div class="btn-group btn-toggle" class="form-group ' + display + '">\
								<label class="control-label">' + params.fieldObj.label + '</label><br />';
				if (displayedValue == "true") {
					fieldHTML += '<button type="button" class="btn btn-primary active">True</button><button type="button" class="btn btn-default">False</button>';
				} else {
					fieldHTML += '<button type="button" class="btn btn-default">True</button><button type="button" class="btn btn-primary active">False</button>';
				}
				fieldHTML += '<input class="form-control ' + panelType + '-truefalse" id="field-' + nodeID + '-' + fieldObjID + '" data-id="' + nodeID + '" data-fieldid="' + fieldObjID + '" type="hidden" value="' + displayedValue + '" data-datatype="' + dataType + '">';
				fieldHTML += '</div>';

				$('#' + panelType + '-' + nodeType + '-form-' + index).append(fieldHTML);
				break;

			case "slider":
				var stepValue = 1;
				var minValue = params.fieldObj.minValue;
				var maxValue = params.fieldObj.maxValue;
				if (maxValue === minValue) {
					maxValue = minValue = "";
					break;
				}
				if (params.fieldObj.hasOwnProperty("step")) {
					stepValue = params.fieldObj.step;
				}

				var sliderValue = displayedValue;
				fieldHTML = '<div id="container-' + nodeID + '-' + fieldObjID + '" class="form-group ' + display + '"> \
							  <label class="control-label">' + params.fieldObj.label + '</label> \
							  <input id="field-' + nodeID + '-' + fieldObjID + '" data-slider-id="field-' + nodeID + '-' + fieldObjID + '-slider" data-id="' + nodeID + '" data-fieldid="' + fieldObjID + '" class="slider form-control ' + panelType + '-slider" type="text" value="' + displayedValue +  '" data-slider-value="' + sliderValue + '" data-slider-step="' + stepValue + '" ' + ' data-slider-min="' + minValue + '" data-slider-max="' + maxValue +  '" data-datatype="' + dataType + '"> \
							</div>';

				$('#' + panelType + '-' + nodeType + '-form-' + index).append(fieldHTML);

				if ($('#field-' + nodeID + '-' + fieldObjID).slider()) {
					$('#field-' + nodeID + '-' + fieldObjID).slider()
					.on('change', function(event) {
						return false;
					})
					.on('click', function() { return false; })
					.on('slideStart', function(event) {
						$(this).attr('data-start-value', $(this).val());
					})
					.on('slideStop', function(event) {
						if ($(this).attr('data-start-value') != $(this).val()) {
							$(this).unbind('change');
							$(this).val(event.value).trigger('change');
							$(this).on('change', function(event) {
								return false;
							});
						}
					});
				}
				break;

			case "slideToggle":
				var state = '';	
				if(displayedValue == "T"){
					state = 'checked';
				} else {
					state = '';
				}
				
				fieldHTML = '<div id="container-' + nodeID + '-' + fieldObjID + '" class="form-group ' + display + '">\
							<label for="field-' + nodeID + '-' + fieldObjID + '" class="control-label">' + params.fieldObj.label + '</label><br />\
							<input class="toggle-slide" data-target-id="field-' + nodeID + '-' + fieldObjID + '" type="checkbox" '+ state + ' data-toggle="toggle" data-size="small">\
							<input class="form-control ' + panelType + '-slideToggle" id="field-' + nodeID + '-' + fieldObjID + '" data-id="' + nodeID + '" data-fieldid="' + fieldObjID + '" type="hidden" value="' + displayedValue + '">\
						</div>';

				$('#' + panelType + '-' + nodeType + '-form-' + index).append(fieldHTML);

				$('.toggle-slide').bootstrapToggle({
					on: 'on',
					off: 'off'
				}).on('change', function() {
					$('#' + $(this).data('target-id'))
						.val($(this).is(':checked') ? 'T' : 'F')
						.trigger('change');
				});

				break;			

			case "tree":

				fieldHTML = '<div id="container-' + nodeID + '-' + fieldObjID + '" class="form-group ' + display + ' tree-input"> \
							<label for="field-' + nodeID + '-' + fieldObjID + '" class="control-label">' + params.fieldObj.label + '</label> \
							<i class="fa fa-search"></i> \
							<input id="field-' + nodeID + '-' + fieldObjID + '" class="form-control ' + panelType + '-text" data-id="' + nodeID + '" data-fieldid="' + fieldObjID + '" type="hidden" value="' + displayedValue + '"> \
							<input id="field-' + nodeID + '-' + fieldObjID + '-tree-filter" class="form-control ' + panelType + '-text filter-term" type="text" placeholder="Filter tree" value=""> \
							<div id="field-' + nodeID + '-' + fieldObjID + '-tree"><i class="fa fa-circle-o-notch fa-refresh-animate"></i> Loading ...</div> \
					</div>';

				$('#' + panelType + '-' + nodeType + '-form-' + index).append(fieldHTML);
				var treeQuery = {"size": 0};
				var treeHierarchy = params.fieldObj.hierarchy;
				var query = treeQuery;
				for (var idx in treeHierarchy) {
					query["aggs"] = {};
					query["aggs"][treeHierarchy[idx]] = {
						"terms": {
							"field": treeHierarchy[idx],
							"missing": "not_applicable",
							"size": 10000,
							"order" : { "_term" : "asc" }
						}
					};
					query = query["aggs"][treeHierarchy[idx]];
				}
				query["aggs"] = {};
				query["aggs"][params.fieldObj.esid] = {
					"terms": {
						"field": params.fieldObj.esid,
						"size": 10000,
						"order" : { "_term" : "asc" }
					}
				};

				var $treeInput = $('#field-' + nodeID + '-' + fieldObjID);
				var $tree = $('#field-' + nodeID + '-' + fieldObjID + '-tree');
				var $treeFilter = $('#field-' + nodeID + '-' + fieldObjID + '-tree-filter');

				if (displayedValue[0] == [""]) {
					displayedValue.shift();
				}

				var pridURL = params.fieldObj.pridURL;
				if (ESV.queryParams.search_index || !pridURL) {
					pridURL = ESV.config.URL_COMBINED_INDEX;
				}

				ESV.queries.makeSimpleQuery(treeQuery,pridURL,true,
					function(response) {
						var treeData = _generateTreeInputData(response, displayedValue);
						$tree.treeview({
							data: treeData,
							showBorder: false,
							showCheckbox: true,
							highlightSelected: false,
							highlightSearchResults: false,
							levels: 1,
							showTags: true,
							onhoverColor: '#fff',
							"onSearchComplete": function(event, data) {
								// Hide all nodes except for search results
								$tree.addClass('tree-filtered');
								$.each(data, function(nodeID, node) {
									_addParentsToSearchResults(node);
									_addChildrenToSearchResults(node);
								});
							},
							"onNodeChecked": function(event, node) {
								_checkNode(node, true);
							},
							"onNodeUnchecked": function(event, node) {
								_checkNode(node, false);
							},
							"onNodeSelected": function(event, node) {
								$tree.treeview("toggleNodeChecked", node.nodeId);
								$tree.treeview("unselectNode", node.nodeId);
							}
						});

						$treeFilter.on("keyup", function() {
							var filterTerm = $(this).val();
							$tree.treeview('clearSearch')
								.treeview('collapseAll', { silent: true });
							if (!filterTerm) {
								$tree.removeClass('tree-filtered')
								return;
							}

							$tree.treeview('search', [filterTerm, {
								ignoreCase: true,
								exactMatch: false,
								revealResults: true,
							}]);
						});
					}
				);

				/**
				 * Checks/unchecks the specified node
				 * @function _checkNode
				 * @param {Object} node
				 * @param {Boolean} checked
				 * @memberof ESV.editor
				 * @instance
				 * @private
				 * @inner
				 */
				function _checkNode(node, checked) {
					_checkChildren(node, checked);
					_checkParents(node, checked);
					if (node.nodes) {
						var checkedChildNodes = 0;
						if (node.searchResult) {
							for (var i in node.nodes) {
								if (node.nodes[i].searchResult) {
									checkedChildNodes += 1;
								}
							}
						}
						else {
							checkedChildNodes = node.nodes.length;
						}
					}
					_updateTreeInputValue();
				}

				/**
				 * Marks the given node's parents as search results
				 * @function _addPaerentsToSearchResults
				 * @param {Object} node - tree node object
				 * @memberof ESV.editor
				 * @instance
				 * @private
				 * @inner
				 */
				function _addParentsToSearchResults(node) {
					var nodeParent = $tree.treeview('getParent', node.nodeId);
					if (nodeParent && !nodeParent.searchResult)  {
						nodeParent.searchResult = true;
						$tree.find('li[data-nodeid=' + nodeParent.nodeId + ']')
							.addClass('search-result');
						if (new RegExp('^\\d+$').test(nodeParent.parentId)) {
							_addParentsToSearchResults(nodeParent);
						}
					}

				}

				/**
				 * marks the given node's as search results
				 * @function _addChildrenToSearchResults
				 * @param {Object} node - tree node object
				 * @memberof ESV.editor
				 * @instance
				 * @private
				 * @inner
				 */
				function _addChildrenToSearchResults(node) {
					for (var i in node.nodes) {
						var childNode = $tree.treeview('getNode', node.nodes[i].nodeId);
						if (childNode) {
							childNode.searchResult = true;
							$tree.find('li[data-nodeid=' + childNode.nodeId + ']').addClass('search-result');
							_addChildrenToSearchResults(childNode);
						}
					}
				}

				/**
				 * Selects/un-selects the entire tree branch from the given node up
				 * @function _checkParents
				 * @param {Object} node - tree node object
				 * @param {Boolean} checked - check/uncheck the branch
				 * @memberof ESV.editor
				 * @instance
				 * @private
				 * @inner
				 */
				function _checkParents(node, checked) {
					var nodeParent = $tree.treeview('getParent', node.nodeId);
					if (nodeParent.hasOwnProperty('state') && nodeParent.state.checked != checked) {
						var updateParent = true;
						if (!checked) {
							var nodeSiblings = $tree.treeview('getSiblings', node.nodeId);
							for (var i in nodeSiblings) {
								if (nodeSiblings[i].state.checked) {
									updateParent = false;
								}
							}
						}
						if (updateParent) {
							nodeParent.state.checked = checked;
							_checkParents(nodeParent, checked);
						}
					}

					while (nodeParent.tags) {
						nodeParent.tags = _generateTreeNodeTag(nodeParent);
						if (nodeParent.parentId == 0 || nodeParent.parentId) {
							nodeParent = $tree.treeview('getNode', nodeParent.parentId);
						}
						else {
							break;
						}
					}
				}

				/**
				 * Selects/un-selects the entire tree branch the given node belongs to
				 * @function _checkChildren
				 * @param {Object} node - tree node object
				 * @param {Boolean} checked - check/uncheck the branch
				 * @memberof ESV.editor
				 * @instance
				 * @private
				 * @inner
				 */
				function _checkChildren(node, checked) {
					for (var i in node.nodes) {
						var childNode = $tree.treeview('getNode', node.nodes[i].nodeId);
						if (node.searchResult && !childNode.searchResult) {
							continue;
						}
						childNode.state.checked = checked;
						_checkChildren(childNode, checked);
						childNode.tags = _generateTreeNodeTag(childNode);
					}
					var updatedNode = $tree.treeview("getNode", node.nodeId);
					updatedNode.tags = _generateTreeNodeTag(updatedNode);
				}

				/**
				 * Updates the input with the values of the selected leaf nodes and
				 * the selection description
				 * @function _updateTreeInputValue
				 * @memberof ESV.editor
				 * @instance
				 * @private
				 * @inner
				 */
				function _updateTreeInputValue() {
					var rootNodes = [];
					var selectedValues = $.map($tree.treeview('getChecked'), function(node) {
						if (node.parentId == undefined) {
							rootNodes.push(node);
						}
						if (!node.nodes) {
							return node.text;
						}
					});
					$treeInput.data('description', $.map(rootNodes, function(node) {
						return node.text + (node.tags.length ? ' (' + node.tags[0] + ')' : '');
					}).join(", "));
					$treeInput.val(selectedValues.join(',')).trigger('change');
				}

				break;

			default:
				//console.log("default");
		}

		// Bind events to the sampleID and dataType fields so that the title field is auto-populated
		if (params.panelType == "create") {
			if (params.fieldObj.esid == ESV.mappings.sampleID) {
				var fieldObjID = params.fieldObj.id;
				$(document).on("change", '#field-' + params.nodeID + '-' + fieldObjID, function(event) {
					var sourceData = $(this).data('description') || "All";
					var dataType = $('#container-' + params.nodeID + '-data-all-type' + ' option:selected').text();
					var text = dataType + " - " + sourceData;
					$('#container-' + params.nodeID + '-data-all-title input').val(text);
				});
			}
			else if (params.fieldObj.esid == ESV.mappings.dataType) {
				var fieldObjID = params.fieldObj.id;
				$(document).on("focus", '#field-' + params.nodeID + '-' + fieldObjID, function(event) {
					var previousValue = $(this).find("option:selected").text();
					$(this).data('previous-value', previousValue);
				}).on("change", '#field-' + params.nodeID + '-' + fieldObjID, function(event) {
					var currentValue = $(this).find("option:selected").text();
					var previousValue = $(this).data('previous-value');
					var viewTitle = $('#container-' + params.nodeID + '-data-all-title input').val();
					$('#container-' + params.nodeID + '-data-all-title input').val(viewTitle.replace(previousValue, currentValue));
					$(this).data('previous-value', currentValue);
				});
			}
		}
	}

	/**
	 * Given a pattern, fills in the wildcards with values derived from a comma separated string
	 * @function _fillInPattern
	 * @param {String} pattern - String representation of the pattern
	 * @param {String} valueStr - Comma separated string, must contain <= # of wildcards in the pattern
	 * @returns {String} filledInPattern
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _fillInPattern(pattern, valueStr) {
		if (pattern == undefined || pattern == "" || valueStr == undefined || valueStr == "") {
			return "";
		}

		var patternArr = pattern.split("\*");
		var valueArr = valueStr.split(",");
		var filledInPattern = "";

		for (var i = 0; i < patternArr.length; i++) {
			if (valueArr.length <= i) {
				continue;
			}
			filledInPattern += patternArr[i];
			if (i < (patternArr.length - 1)) {
				filledInPattern += valueArr[i];
			}
		}
		return filledInPattern;
	}

	/**
	 * For a predictive text fields, initiates the type ahead by setting the source to query the database for predictive text values
	 * @function _initTypeAhead
	 * @param {String} prid - The field in the server with which we should query in order to get the predictive text results
	 * @param {Number} nodeID - The ID of the node that
	 * @param {Object} fieldObj - The field object containing information about the field
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _initTypeAhead(prid, nodeID, fieldObj) {
		var fieldObjID = fieldObj.id;
		var limitInput = undefined;
		if (fieldObj.hasOwnProperty("limit") && fieldObj.limit > 0) {
			limitInput = fieldObj.limit;
		}
		var freeInput = true;
		if (fieldObj.hasOwnProperty("freeInput")) {
			freeInput = fieldObj.freeInput;
		}
		var pridURL = undefined;
		if (fieldObj.hasOwnProperty("pridURL")) {
			pridURL = fieldObj.pridURL;
		}

		var fieldObjectIDs = 0;

		(function(prid){
			$('#field-' + nodeID + '-' + fieldObjID).tagsinput({
				freeInput: freeInput,
				maxTags: limitInput,
				typeahead: {
					minLength: 0,
					delay: 200,
					source: function(q) {
						// If there are values saved in the configuration, use those instead of re-querying as you type
						if (fieldObj.fieldValues) {
							var values = [];
							$.each(fieldObj.fieldValues, function() {
								values.push(this[0]);
							});
							return values;
						}
						return _findTypeAhead(q, prid, pridURL);
					}
				}
			});
 		})(prid);

		$('#field-' + nodeID + '-' + fieldObjID).on('itemAdded', function(event) {
			$('#container-' + nodeID + '-' + fieldObjID + ' label').css('margin-bottom', '8px');
			$('#container-' + nodeID + '-' + fieldObjID + ' .bootstrap-tagsinput input').css('margin-top', '6px');

			var currNumItems = $('#field-' + nodeID + '-' + fieldObjID).val().split(',').length;
			if (limitInput != undefined) {
				if (limitInput <= currNumItems && currNumItems > 0) {
					$('#field-' + nodeID + '-' + fieldObjID).css('display', 'none');
					$('#container-' + nodeID + '-' + fieldObjID + ' .bootstrap-tagsinput input').css('display', 'none');
					$('#container-' + nodeID + '-' + fieldObjID).append('<label class="tagsinput-info" for="#field-' + nodeID + '-' + fieldObjID + '">Max Elements Inputted</label>');
				}
			}
			$('#field-' + nodeID + '-' + fieldObjID).data('field-updated', true);
		});

		$('#field-' + nodeID + '-' + fieldObjID).on('itemRemoved', function(event) {
			if ($('#field-' + nodeID + '-' + fieldObjID).val() == "") {
				$('#container-' + nodeID + '-' + fieldObjID + ' label').attr('style', '');
				$('#container-' + nodeID + '-' + fieldObjID + ' .bootstrap-tagsinput input').attr('style', '');
			} else {
				$('#container-' + nodeID + '-' + fieldObjID + ' .bootstrap-tagsinput input').css('display', 'block');
			}
			$('#container-' + nodeID + '-' + fieldObjID + ' .tagsinput-info').remove();
			$('#field-' + nodeID + '-' + fieldObjID).data('field-updated', true);
		});

		(function(prid){
			$('#container-' + nodeID + '-' + fieldObjID + ' .bootstrap-tagsinput input').focus(function() {
				$('#field-' + nodeID + '-' + fieldObjID).typeahead('lookup', '');
 			});
 		})(prid);

		$('#container-' + nodeID + '-' + fieldObjID + ' input').addClass('form-control edit-predictivetext');
		$('#container-' + nodeID + '-' + fieldObjID + ' .bootstrap-tagsinput input').attr('style', '');

		// Hide the typeahead the existing values exceed the limit
		if (fieldObj.hasOwnProperty("limit")) {
			if ($('#field-' + nodeID + '-' + fieldObjID).val() != "") {
				var currNumItems = $('#field-' + nodeID + '-' + fieldObjID).val().split(',').length;
				if (limitInput <= currNumItems && currNumItems > 0) {
					$('#field-' + nodeID + '-' + fieldObjID).css('display', 'none');
					$('#container-' + nodeID + '-' + fieldObjID + ' .bootstrap-tagsinput input').css('display', 'none');
					$('#container-' + nodeID + '-' + fieldObjID).append('<label class="tagsinput-info" for="#field-' + nodeID + '-' + fieldObjID + '">Max Elements Inputted</label>');
				}
			}
		}
	}

	/**
	 * Queries the database for the matching type ahead values
	 * @function _findTypeAhead
	 * @param {String} q - The text search string
	 * @param {String} prid - The field in the database to search
	 * @param {String} pridURL (optional) - The URL to the database
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _findTypeAhead(q, prid, pridURL) {
		var tPromise = new $.Deferred();
		var query = ESV.queries.getTypeAhead(prid,q);

		if (pridURL == undefined || pridURL == null || pridURL == "") {
			pridURL = ESV.config.URL_COMBINED_INDEX;
		}
		ESV.queries.makeSimpleQuery(query, pridURL, true, function(response) {
				var source = [];
				var buckets = response.aggregations.typeahead.buckets;
				if (buckets.length > 0) {
					for (var i = 0; i < buckets.length; i++) {
						source.push(buckets[i].key);
					}
				}
				tPromise.resolve(source);
			},
			function(err){
				tPromise.reject([]);
			});

		return tPromise.promise();
	}

	/**
	 * Each view spawns a query tree for every underlying data source that constitutes the view. For example, if
	 * a view has both a MutationSeq and a TITAN data source, two separate query trees corresponding to each data
	 * source will be generated so that two separate queries can be performed and their results eventually handled
	 * by the view itself (ie. the view can choose to combine the results or deal with the results of the queries separately)
	 * @function _buildQueryTrees
	 * @param {Object} vizObj - Visualization configuration object
	 * @returns {Array} queryTrees
	 * @memberof ESV.editor
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
	 * Generates the query tree for views that are being built from scratch
	 * using the 'Create View' link
	 * @function _buildStagingQueryTrees
	 * @param {Object} vizObj - Visualization configuration object
	 * @returns {Array} queryTrees - List of nodes that make up the query
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */

	function _buildStagingQueryTrees(vizObj) {
		var queryTrees = [];
		var children = vizObj.children;
		var nodes = {};
		$.map(esv.structureStagingArray, function(value, idx) {
			nodes[value.id] = value;
		});
		if (children.length > 0) {
			// Each child represents its own tree and thus its own query
			for (var i = 0; i < children.length; i++) {
				var subQueryTrees = _buildStagingQueryTrees(nodes[children[i]]);
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
	 * Populates a field configured as dynamic based on the underlying query trees
	 * @function _populateDynamicField
	 * @param {Number} nodeID - Visualization node ID
	 * @param {Object} fieldObject - configured field object
	 * @param {String} fieldID - field DOM ID
	 * @param {String} existingValue - field value
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _populateDynamicField(nodeID, fieldObj, fieldID, existingValue) {
		var queryTrees = [];
		if (ESV.nodes[nodeID]) {
			for (var idx in ESV.nodes[nodeID].children) {
				queryTrees = queryTrees.concat(_buildQueryTrees(ESV.nodes[ESV.nodes[nodeID].children[idx]]));
			}
		}
		else if (ESV.cc.currentElement) {
			queryTrees = queryTrees.concat(_buildQueryTrees(ESV.nodes[ESV.cc.currentElement.id]));
		}
		else {
			var previousNode = esv.structureStagingArray[esv.structureStagingArray.length - 2];
			queryTrees = _buildStagingQueryTrees(previousNode);
		}
		ESV.queries.getAggregationQuery([fieldObj.dynamic],20);

		var queries = ESV.queries.addQueryFiltersAndRanges(queryTrees, query, []);
		var blockingObjects = [];
		var values = [];
		for (var query_idx in queries) {
			blockingObjects.push(ESV.queries.makeSimpleQuery(queries[query_idx], null, true, function(response) {
				var buckets = response.aggregations[fieldObj.dynamic].buckets;
				for (var idx in buckets) {
					values.push(buckets[idx].key);
				}
			}));
		}
		$.when.apply($, blockingObjects).then(function() {
			if (fieldObj.minValues && values.length < fieldObj.minValues) {
				return;
			}
			var uniqueKeys = {}
			for (var idx in values) {
				uniqueKeys[values[idx]] = 1;
			}
			values = Object.keys(uniqueKeys).sort();
			for (var idx in values) {
				$(fieldID).append('<option value="' + values[idx] + '">' + values[idx] + '</option>');
			}
			if (existingValue) {
				$(fieldID + ' option').filter(function() {
					return $(this).text() == existingValue;
				}).prop('selected', true);
			}
			else if (fieldObj.selectedOption) {
				$(fieldID + ' option:eq(' + (fieldObj.selectedOption - 1) + ')').prop('selected', true);
			}
			$(fieldID).parent().removeClass('hide');
		});
	}

	/**
	 * Generates tree widget data from an aggregated query response
	 * @function _generateTreeInputData
	 * @param {Object} aggregation - Query response aggregation object
	 * @param {String} displayedValue - comma separated list of values that should be shown
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	function _generateTreeInputData(aggregations, displayedValue) {
		if (aggregations.hasOwnProperty("aggregations")) {
			aggregations = aggregations.aggregations;
		}
		var treeData = [];
		var aggTerm = $.map(Object.keys(aggregations), function(key) {
			if ($.inArray(key, ["key", "doc_count"]) == -1) {
				return key;
			}
		})[0];
		var aggregation = aggregations[aggTerm];
		if (aggregation && aggregation.hasOwnProperty("buckets") && aggregation.buckets.length) {
			for (var idx in aggregation.buckets) {
				var bucket = aggregation.buckets[idx]
				var node = {
					"text": bucket.key,
					"nodes": _generateTreeInputData(bucket, displayedValue)
				};
				if (!node.nodes.length) {
					delete node.nodes;
				}
				else {
					// remove single node levels and push their children one level up
					while (node.nodes.length == 1 && node.nodes[0].nodes) {
						node.nodes = node.nodes[0].nodes;
					}
					var checkedChildNodes = $.map(node.nodes, function(childNode) {
						if (childNode.state && childNode.state.checked) {
							return childNode;
						}
					});
					if (checkedChildNodes.length) {
						node.state = {
							checked: true,
							expanded: true
						};
					}
				}
				if ($.inArray(node.text, displayedValue) != -1) {
					node.state = {checked: true};
				}
				if (node.text == 'not_applicable') {
					treeData = treeData.concat(node.nodes);
				}
				else {
					treeData.push(node);
				}
				node.tags = _generateTreeNodeTag(node);
			}
		}

		return treeData;
	}

	/**
	 * Generats the tree input node tags
	 * @function _generateTreeNodeTag
	 * @param {Object} node - Tree node object
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	 function _generateTreeNodeTag(node) {
		if (node.nodes) {
			var childNodesTags = [];
			var checkedChildNodes = $.map(node.nodes, function(childNode) {
				if (childNode.tags) {
					childNodesTags = childNodesTags.concat(childNode.tags);
				}
				if (childNode.state && childNode.state.checked) {
					return childNode;
				}
			});
			if (childNodesTags.length) {
				var checkedNodes = 0, totalNodes = 0;
				for (var i in childNodesTags) {
					var counts = childNodesTags[i].split('/');
					checkedNodes += +counts[0];
					totalNodes += +counts[1];
				}
				return [checkedNodes + '/' + totalNodes];
			}

			return [checkedChildNodes.length + '/' + node.nodes.length];
		}
		return [];
	 }

	 /**
	 * Generates HTML for popup windows that require pages 
	 * @function _generatePagenationHTML
	 * @param {String} structureType 
	 * @param {String} type
	 * @param {Number} step - current step
	 * @param {NUmber} totalSteps - total # of pages 
	 * @memberof ESV.editor
	 * @instance
	 * @private
	 */
	 function _generatePagenationHTML(structureType, type, step, totalSteps){
	 	var pagingHTML = "";
	 	if (structureType !== '' && totalSteps > 1) {
			// We have to add the pagination steps for structures
			pagingHTML += '<div class="pagination-container"><ul class="pagination pagination-sm">';
			if (step != 0) {
				pagingHTML += '<li><a class="page-previous" data-structure="' + structureType + '" data-currenttype="' + type + '" data-currentstep="' + step + '" href="#">&laquo;</a></li>';
			}
			for (var i = 0; i < totalSteps; i++) {
				if (i == step) {
					pagingHTML += '<li class="active"><a href="#">' + (i + 1) + '</a></li>';
				} else {
					pagingHTML += '<li class="disabled"><a href="#">' + (i + 1) + '</a></li>';
				}
			}
			if (step != (totalSteps - 1)) {
				pagingHTML += '<li><a class="page-next" data-structure="' + structureType + '" data-currenttype="' + type + '" data-currentstep="' + step + '" href="#">&raquo;</a></li>';
			}
			return pagingHTML += '</ul></div>';
		}
	 }

	return esv;
}(ESV.editor || {}));
