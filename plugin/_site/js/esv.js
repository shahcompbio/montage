/**
 * ESV Core
 * <br/><br/>
 * This module acts as an overall controller of the Montage application, providing functionality related
 * to initialization of key components and their associated event handlers - the structure diagram (top left)
 * and the editor panel (bottom left), setting up and managing the grid layout of the large visualization
 * area where individual plots are rendered, handling events stemming from actions applied to the top
 * navigation bar, task related to visualization state serialization/de-serialization for the purposes of
 * generating shared/stored views and templates. The namespace also provides a number of auxiliary functions,
 * many of which are invoked by components throughout the applicatoion.
 *
 *
 * @author: Tom Jin
 * @namespace ESV
 */

var ESV = (function (esv) {

	// === CONFIG + PROPERTIES ===

	esv.mappings = $.extend({}, CONFIG.mappings);
	esv.config = $.extend({}, CONFIG.config);

    /**
     * @member {Object} gridster - An object which manages the layout of the view
     * area where individual plots are rendered. Plots' parents' containers represent
     * individual grid items, that allow to be manually rearranged and resized.
     * @memberof ESV.
     */
	esv.gridster = {};

    /**
     * @member {Object} nodes - Holds references to all existing nodes - data,
     * datafilter, viewfilter or specific view ones
     * @memberof ESV
     */
	esv.nodes = {};

    /**
     * @member {Array} viewFacades - An array of facade objects representing all
     * filters applied through seleciton on a specific plot currently in effect
     * @memberof ESV
     */
	esv.loading = false;

	esv.properties = $.extend({}, CONFIG.properties);

	esv.structures = $.extend({}, CONFIG.structures);

	esv.queryParams = {};

	$.each(location.search.replace(/\?/, '').split('&'), function(key, value) {
		var params = value.split('=');
		esv.queryParams[params[0]] = params[1];
	});

	if (esv.queryParams.search_index) {
		for (var option in esv.config) {
			esv.config[option] = esv.config[option].replace(ES_INDEX, esv.queryParams.search_index);
		}
	}


    /**
     * Initializes the main view area, the structure diagram and editor panel, registers
     * event handlers for various UI components/DOM objects.
     * @function init
     * @memberof ESV
     * @instance
     */
	esv.init = function() {
		// Attaches handlers to key elements
		_initHandlers();

		ESV.viewfacades.getViewFacades();
		// Initializes 3rd party libraries
		ESV.gridster = $("#view-area > ul").gridster({
			namespace: "#view-area",
			widget_margins: [5, 5],
			widget_base_dimensions: [120, 120],
			autogrow_cols: true,
			draggable: {
				ignore_dragging: function (event) {
					if (event.target.className == "panel-heading" || event.target.className == "panel-title" || event.target.className == "panel-heading panel-blue") {
						return false;
					} else {
						return true;
					}
				}
			  },
		resize:{
			enabled: true,
			max_size_x: 35, // Removing the max size limit
			min_size: [4,3], // Removing the min size limit
			start: function(e, ui, $widget){
				var plotID = $widget[0].getAttribute('data-id');
				var vizObj = ESV.nodes[plotID];

				if ($.isEmptyObject(vizObj.view.origDimensions)) {
					vizObj.view.origDimensions = {
						'width': this.resize_coords.original_coords.width,
						'height': this.resize_coords.original_coords.height,
					};
				}
			},
			resize:function(e, ui, $widget){
				var plotID = $widget[0].getAttribute('data-id');
				var vizObj = ESV.nodes[plotID];

				$('[id^=viz-' + plotID + ']').fadeOut();
			},
			stop: function(e, ui, $widget){
				var plotID = $widget[0].getAttribute('data-id');
				var vizObj = ESV.nodes[plotID];

				var dimensionChange = {
					"width": this.resize_coords.coords.width/vizObj.view.origDimensions.width,
					"height": this.resize_coords.coords.height/vizObj.view.origDimensions.height,
				};
				delete vizObj.view.origDimensions;

				if ($.isFunction(ESV[vizObj.type].resizeView)) {
					ESV[vizObj.type].resizeView(vizObj, dimensionChange);
				}
			}
		  },
        avoid_overlapped_widgets: true
		}).data('gridster');

		$('.multiselect').multiselect({
			includeSelectAllOption: true
		});

		$('[data-toggle="tooltip"]').tooltip();

		// Hide the side bar while configuration is loading
		$('.sidebar-content').hide();

		// Initializes the edit panel
		var blockingObject = new $.Deferred();
		ESV.editor.init(blockingObject);

		// Initializes the CC graph
		var elements = {nodes: [], edges: []};
		ESV.cc.init(elements);

		// Load saved state
		$.when(blockingObject.promise()).then(function() {
			$('.sidebar-content').fadeIn();
			esv.restoreSavedState();
		});

		// Versioning
		$('#version').html("version " + ESV.config.version);
	};

	/**
	 * Generates a random ID, this ID is guarenteed to be unique among the ESV.nodes
	 * @function generateID
	 * @memberof ESV
	 * @instance
	 */
	esv.generateID = function() {
		var unique = false;
		var ID = 0;
		while (!unique) {
			ID = Math.floor(Math.random() * 100000000);
			if (!esv.nodes[ID]) {
				unique = true;
			}
		}
		return ID;
	};

	/**
	 * Generates a random HEX color that's not #FFFFFF
	 * @function generateRandomColor
	 * @memberof ESV
	 * @instance
	 */
	esv.generateRandomColor = function(){
		var hex = '0123456789ABCDEF'.split('');
		var color = '#';
		for (var i = 0; i < 6; i++ ) {
			color += hex[Math.floor(Math.random() * 16)];
		}
		if (color == "#FFFFFF") {
			return ESV.generateRandomColor();
		} else {
			return color;
		}
	};

	/**
	 * Generates gray scale colour
	 * @function generateGrayScale
	 * @memberof ESV
	 * @instance
	 */
	esv.generateGrayScale = function(){
		var value = Math.random() * 0xFF | 0;
		var grayScale = (value << 16) | (value << 8) | value;
		var color = '#' + grayScale.toString(16);

		return color;
	};

	/**
	 * Creates the basic view container in the right view area
	 * @param {Object} vizObj - Visualization object
	 * @param {String} viewHTML - Any additional view specific HTML
	 * @param {Number} width - The gridster width
	 * @param {Number} height - The gridster height
	 * @function initBaseView
	 * @memberof ESV
	 * @instance
	 */
	esv.initBaseView = function(vizObj, viewHTML, width, height) {
		// Show the loading icon if needed
		ESV.showLoading();

        /* jshint multistr: true */
		var baseHTML = '<li id="container-' + vizObj.id + '" data-id="' + vizObj.id + '"> \
							<div class="panel panel-default"> \
								<div class="panel-heading">\
									<span class="panel-title"></span>\
									<input type="text" class="title form-control pull-left" style="width: 30%; height: 20px; box-shadow: none;" value="' + vizObj.info.title + '">\
									<a class="close-viz pull-right" href="#" data-id="' + vizObj.id + '"><i id="close-' + vizObj.id + '" class="fa fa-times pull-right"></i></a></h3> \
									<div class="plotMenu"> \
										<span class="dropdownMenu dropdown">\
									</div> \
								</div>  \
								<div class="panel-body no-pad" data-id="' + vizObj.id + '"> \
									<div class="loading">Loading...</div>'
									+ viewHTML +
									'<div class="error-overlay"><i class="fa fa-bar-chart-o"></i><br /><span class="error-message">No Data</span></div> \
								</div> \
							</div> \
						</li>';

		ESV.gridster.add_widget.apply(ESV.gridster, [baseHTML, width, height]);

		// To create a handler for clicking on the view
		$('#container-' + vizObj.id).click(function(e) {
			if (e.target.id == 'close-' + vizObj.id) {
				if($('.filter-pill').attr('data-viewid') == vizObj.id){

					// If vizObj has selections then delete the facades
					 ESV.promptDeleteSelectionConfirmation(vizObj.id, vizObj);
				}else{
					ESV.promptDeleteConfirmation(vizObj.id);
				}
			} else {
				// Check if the node is already set as active
				ESV.cc.setActiveView(vizObj.id);
			}
		});

		$('#container-' + vizObj.id).on("change", ".title", function() {
			var val = $(this).val();
			vizObj.info.title = val;

			if (vizObj.isTrack) {
				$.each(vizObj.tracks, function() {
					ESV.nodes[this.id].info.title = val;
				});
			}
		});

		// prevent triggering refresh of the plot when clicking on the error overlay
		$('.error-overlay').on('click', function(e) {
			e.stopPropagation();
		});
	};

	/**
	 * Asks the user if they really want to delete the node with the vizID
	 * @function promptDeleteConfirmation
	 * @param {Number} vizID - Visualization object ID
	 * @memberof ESV
	 * @instance
	 */
	esv.promptDeleteConfirmation = function(vizID) {
		var type = ESV.nodes[vizID].type;
		if (type == "data") {
			type = "Data";
		} else if (type == "datafilter") {
			type = "Data Filter";
		} else if (type == "viewfilter") {
			type = "View Filter";
		} else {
			type = "View";
		}

        /* jshint multistr: true */
		var confirmPopupHTML = '<div id="whiteout"></div>\
							<div id="warning-popup" class="thumbnail warning-popup">\
								<div class="caption">\
									<br />\
									<h5>Delete this ' + type + '?</h5><br />\
									<p>';

		if (type == "Data") {
			confirmPopupHTML +=	'<a id="delete-view" href="#" class="btn btn-primary" role="button">Delete ' + type + ' Source</a><br />';
		} else if (!_isParentBranchedTree(vizID, true)) {
			confirmPopupHTML +=	'<a id="delete-view" href="#" class="btn btn-primary" role="button">Delete ' + type + ' + Delete Data Source</a><br />';
		}

		if (type != "Data") {
			confirmPopupHTML += '<a id="delete-keep-source" href="#" class="btn btn-primary" role="button">Delete ' + type + ' + Keep Data Source</a><br />';
		}
		confirmPopupHTML += '<a id="delete-cancel" href="#" class="btn btn-default" role="button">Cancel</a>\
						</p>\
					</div>\
				</div>';

		if (!$('body > #whiteout').length) {
			$('body').append(confirmPopupHTML);
		}
		$('#delete-view').click(function() {
			$('body > #whiteout').remove();
			$('#warning-popup').remove();
			ESV.cc.deleteNode(vizID, true);
		});
		$('#delete-keep-source').click(function() {
			$('body > #whiteout').remove();
			$('#warning-popup').remove();
			ESV.cc.deleteNode(vizID, false);
		});
		$('#delete-cancel').click(function() {
			$('body > #whiteout').remove();
			$('#warning-popup').remove();
		});
	};

	/**
	 * Asks the user for confirmation before deleting a published view
	 * @function promptDeleteStoredViewConfirmation
	 * @param {String} storedViewID - Stored view record ID
	 * @memberof ESV
	 * @instance
	 */
	esv.promptDeleteStoredViewConfirmation = function(storedViewID) {

        /* jshint multistr: true */
		var confirmPopupHTML = '<div id="whiteout"></div>\
							<div id="warning-popup" class="thumbnail warning-popup">\
								<div class="caption">\
									<br />\
									<h5>Delete stored view?</h5><br />\
									<p>\
									<a id="delete-stored-view" href="#" class="btn btn-primary" role="button">Delete</a><br />\
									<a id="delete-cancel" href="#" class="btn btn-default" role="button">Cancel</a>\
						</p>\
					</div>\
				</div>';

		if (!$('body > #whiteout').length) {
			$('body').append(confirmPopupHTML);
		}
		$('#delete-stored-view').click(function() {
			ESV.editor.deleteStoredTemplate(storedViewID);
			$('body > #whiteout').remove();
			$('#warning-popup').remove();
		});

		$('#delete-cancel').click(function() {
			$('body > #whiteout').remove();
			$('#warning-popup').remove();
		});
	};

    /**
     * Prompt the user for confirmation before deleting the view, and remove all the selections they have on the plot
     * <br/>
     * FIXME: Redundant arguments, ither use only vizID and get vizObj from ESV.nodes, or get the ID can be found in vizObj.id
     * @param {Number} vizID - Unique visualization ID
     * @param {Object} vizObj - Visualization configuration object of the view to be deleted
     * @function prompteDeleteSelectionConfirmation
     * @memberof ESV
     * @instance
     */
	esv.promptDeleteSelectionConfirmation = function(vizID, vizObj){
		var type = ESV.nodes[vizID].type;
		var plot = vizObj.type;
		if (type == "data") {
			type = "Data";
		} else if (type == "datafilter") {
			type = "Data Filter";
		} else if (type == "viewfilter") {
			type = "View Filter";
		} else {
			type = "View";
		}

        /* jshint multistr: true */
		var confirmPopupHTML = '<div id="whiteout"></div>\
							<div id="warning-popup" class="thumbnail warning-popup-wide">\
								<div class="caption">\
									<br />\
									<h5>Delete this ' + type + '?</h5><br />\
									<h6> All selection(s) made on this plot will be removed </h6>\
									<p>';

		if (type != "Data") {
			confirmPopupHTML += '<a id="remove-selections-delete-keep-source" href="#" class="btn btn-primary" role="button"> Remove Selections + Delete ' + type + ' </a><br />';
		}

		confirmPopupHTML += '<a id="delete-cancel" href="#" class="btn btn-default" role="button">Cancel</a>\
						</p>\
					</div>\
				</div>';

		if (!$('body > #whiteout').length) {
			$('body').append(confirmPopupHTML);
		}
		$('#remove-selections-delete-keep-source').click(function() {
			$('body > #whiteout').remove();
			$('#warning-popup').remove();
			ESV.cc.deleteNode(vizID, false);
			ESV.viewlibs.clearViewFacade(vizObj); // clear all the facades
		});
		$('#delete-cancel').click(function() {
			$('body > #whiteout').remove();
			$('#warning-popup').remove();
		});
	};

	/**
	 * Prompt the user form confirmation before cancelling building the visualization
	 * @function promptStructureCreationConfirmation
	 * @memberof ESV
	 * @instance
	 */
	esv.promptStructureCreationConfirmation = function() {
        /* jshint multistr: true */
		var confirmPopupHTML = '<div id="whiteout"></div>\
							<div id="warning-popup" class="thumbnail warning-popup">\
								<div class="caption">\
									<h5>Discard Changes?</h5><br />\
									<p>';

		confirmPopupHTML +=	'<a id="discard-confirm" href="#" class="btn btn-primary" role="button">Discard</a><br />';
		confirmPopupHTML += '<a id="discard-cancel" href="#" class="btn btn-default" role="button">Cancel</a>\
						</p>\
					</div>\
				</div>';

		if (!$('body > #whiteout').length) {
			$('body').append(confirmPopupHTML);
		}
		$('#discard-confirm').click(function(e) {
			$('body > #whiteout').remove();
			$('#warning-popup').remove();
			ESV.editor.structureStagingArray = [];
			ESV.editor.structureStagingIDMap = {};
			ESV.cc.unSelectAllNodes();
		});
		$('#discard-cancel').click(function(e) {
			$('body > #whiteout').remove();
			$('#warning-popup').remove();
		});
	};

	/**
	* Display notification that multiple facades can only be applied from a single view/plot
	* @function filterAlert
	* @memberof ESV
	* @instance
	*/
	esv.filterAlert = function(){
		var viewID = ESV.viewfacades.getViewID;
        /* jshint multistr: true */
		var confirmPopupHTML =  '<div id="whiteout"></div>\
								<div id="warning-popup" class="thumbnail warning-popup">\
									<div class="caption"><br />\
										<h6> Selections can only be applied to one view </h6><br />\
										<p> Release selection(s) from previous plot </p>\
										<p>';
		confirmPopupHTML += '<a id="discard-cancel" href="#" class="btn btn-primary" role="button"> Close</a>\
							 			</p>\
							 		</div>\
							 	</div>';

		if(!$('body > #whiteout').length){
			$('body').append(confirmPopupHTML);
		}

		$('#discard-cancel').click(function(e){
			$('body > #whiteout').remove();
			$('#warning-popup').remove();
			setTimeout(function(){ESV.showOnlyOneViewFacadePopup();},200);
		});
	};

	/**
	 * Displays a pop-up with the provided message
	 * @param {String} message - Text to be displayed in the popup
	 * @function notificationPopup
	 * @memberof ESV
	 * @instance
	 */
	esv.notificationPopup = function(message){
        /* jshint multistr: true */
		var notificationPopupHTML =  '<div id="whiteout"></div>\
					<div id="warning-popup" class="thumbnail warning-popup">\
						<div class="caption">\
							<br/><br/>\
							<h6>' +
								message +
							'</h6>\
							<br/>\
							<p>\
								<a id="discard-cancel" href="#" class="btn btn-primary" role="button"> Close</a>\
							</p>\
						</div>\
					</div>';

		if(!$('body > #whiteout').length){
			$('body').append(notificationPopupHTML);
		}

		$('#discard-cancel').click(function(e){
			$('body > #whiteout').remove();
			$('#warning-popup').remove();
		});
	};

	/**
	 * Opens a 'share link' pop up with the provided URL
	 * @function shareLinkPopup
	 * @param {String} shareUrl - A complete URL where the stored visualizatoin can be accessed/viewd
	 * @memberof ESV
	 * @instance
	 */
	esv.shareLinkPopup = function(shareUrl) {
        /* jshint multistr: true */
		var shareLinkPopupHTML = '<div id="share-link-popup" aria-hidden="true" role="dialog" tabindex="-1" class="modal fade" style="display: none;">\
			<div class="modal-dialog modal-md">\
				<div class="modal-content">\
					<div class="modal-header">\
						<button data-dismiss="modal" class="close" type="button"><span aria-hidden="true">×</span></button>\
						<h5 class="modal-title">Share Link</h5>\
					</div>\
					<div class="modal-body">\
						<div class="form-group">\
							<input id="link-url" type="text" value="' + shareUrl + '" class="form-control">\
							<h6>The above session will expire after 2 weeks.</h6>\
						</div>\
					</div>\
				</div>\
			</div>\
		</div>';
		if ($('body > #share-link-popup').length > 0) {
			$('body > #share-link-popup').remove();
		}
		$('body').append(shareLinkPopupHTML);
		$('body > #share-link-popup').modal({'backdrop': 'static', 'keyboard': false});
		$('body > #share-link-popup').on('shown.bs.modal', function() {
			$('body > #share-link-popup #link-url').focus().select();
		});
	};

	/**
	 * Opens a form for creating a template from the top drop down menu
	 * @function createTemplatePopup
	 * @param {Object} viewProperties - (Optional) Stored record to edit. If provided the related record will be updated.
	 * @memberof ESV
	 * @instance
	 */
	esv.createTemplatePopup = function(viewProperties) {

		if ($.isEmptyObject(viewProperties)) {
			viewProperties = {
				"title": "",
				"description": "",
				"tags": []
			};
		}

		var popupTitle;
		var buttonLabel = '';
		var pridURL;
		var recordIdTitleRef = {};

		popupTitle = viewProperties.title ? "Edit Template": "Create Template";
		buttonLabel = viewProperties.title ? "Save" : "Create";
		pridURL = esv.config.URL_TEMPLATE_INDEX_SEARCH;
		if (!viewProperties.title) {
			ESV.editor.configureStoredViewsPanel("template");
			// In case there is at least one view plotting data from different samples
			// in each dimension, mark the template as patient cenrtic
			viewProperties.patient_view = false;
			for (var nodeID in ESV.nodes) {
				var node = ESV.nodes[nodeID];
				if ($.inArray(node.type, ["data", "datafilter", "viewfilter"]) == -1 && !$.isEmptyObject(node.view)) {
					var dataNodes = _getViewDataNodes(ESV.nodes, nodeID);
					if (node.view.sampleX && node.view.sampleY && node.view.sampleX != 'none' && node.view.sampleY != 'none' && node.view.sampleX != node.view.sampleY) {
						viewProperties.patient_view = true;
						break;
					}
				if (dataNodes.length == 2 && dataNodes[0].filters["data-all-type"].fieldValues[0] == dataNodes[1].filters["data-all-type"].fieldValues[0]) {
					viewProperties.patient_view = true;
					}
				}
			}
		}
        /* jshint multistr: true */
		var publishTemplatePopupHTML = '<div id="share-view-popup" aria-hidden="true" role="dialog" tabindex="-1" class="modal fade" style="display: none;">\
			<div class="modal-dialog">\
				<div class="modal-content">\
					<div class="modal-header">\
						<button data-dismiss="modal" class="close" type="button"><span aria-hidden="true">×</span></button>\
						<h5 class="modal-title">' + popupTitle + '</h5>\
					</div>\
					<div class="modal-body">' +
						(viewProperties.title ? '<div id="title-input" class="form-group">\
							<label class="control-label">Template ID</label>\
							<input readonly type="text" class="form-control" value="' + viewProperties._id + '">\
						</div>' : '') +
						'<div id="title-input" class="form-group">\
							<label class="control-label">Title</label>\
							<input type="text" id="view-title" class="form-control" value="' + viewProperties.title + '">\
						</div>\
						<div class="form-group">\
							<label>Description</label>\
							<input type="text" id="view-description" class="form-control" value="' + viewProperties.description + '">\
						</div>\
						<div id="tags-input" class="form-group">\
							<label>Tags</label>\
							<input type="text" id="view-tags" class="form-control" value="' + viewProperties.tags.join(',') + '">\
						</div>' + (viewProperties.screenshot ?  '\
						<div class="form-group">\
							<label>Screenshot</label>\
							<img style="width: 340px" src="' + viewProperties.screenshot + '">\
						</div>' : '') + '\
						<div class="form-group">\
							<br/>\
							<input type="checkbox" id="patient-view"' + (viewProperties.patient_view ? ' checked="checked"' : '') + '">\
							<label>Patient view</label>\
						</div>\
					</div>\
					<div class="modal-footer">\
						<button class="btn btn-primary save" type="button">' + buttonLabel + '</button>\
					</div>\
				</div>\
			</div>\
		</div>';
		if ($('body > #share-view-popup').length > 0) {
			$('body > #share-view-popup').remove();
		}
		$('body').append(publishTemplatePopupHTML);
		$('body > #share-view-popup').modal({'backdrop': 'static', 'keyboard': false});
		// Ensure that there is only one modal backdrop visible
		$('.modal-backdrop').not(':first').css('opacity', 0);
		$('body > #share-view-popup').on('shown.bs.modal', function() {
			$('body > #share-view-popup #view-title').focus();
		});
		$('body > #share-view-popup #view-tags').tagsinput({
			freeInput: true,
			maxTags: 1,
			delay: 200,
			typeahead: {
				minLength: 0,
				delay: 0,
				source: function(q) {
					if ($('#template-list').data('input-tags')) {
						return $('#template-list').data('input-tags');
					}
					return ESV.editor.findTypeAhead(q, "tags", pridURL);
				}
			}
		});
		$('body > #share-view-popup #view-tags').siblings('.bootstrap-tagsinput')
			.find('input').css('width', '').addClass('form-control');

		$('body > #share-view-popup .save').on('click', function() {
			$(this).addClass('disabled');
			var viewTitle = $('body > #share-view-popup #view-title').val();
			var viewDescription = $('body > #share-view-popup #view-description').val();
			var viewTags = $('body > #share-view-popup #view-tags').val();
			viewTitle = viewTitle.replace(/(^\s+|\s+$)/g, '');
			viewDescription = viewDescription.replace(/(^\s+|\s+$)/g, '');
			viewTags = viewTags.replace(/(^\s+|\s+$)/g, '').split(/\s*\,\s*/);
			if (!viewTitle) {
				$('body > #share-view-popup #title-input').addClass('has-error');
				$('body > #share-view-popup #view-title').focus();
			}
			else {
				$('body > #share-view-popup #title-input').removeClass('has-error');
			}
			if (!viewTags[0]) {
				$('body > #share-view-popup #tags-input').addClass('has-error');
				if (viewTitle) {
					$('body > #share-view-popup #view-tags').siblings('.bootstrap-tagsinput')
						.find('input').focus();
				}
			}
			else {
				$('body > #share-view-popup #tags-input').removeClass('has-error');
			}
			if (!viewTitle || !viewTags[0]) {
				$(this).removeClass('disabled');
				return;
			}
			var storedViewType = "template";
			$.extend(viewProperties, {
				"title": viewTitle,
				"description": viewDescription,
				"tags": viewTags
			});

			viewProperties.patient_view = $('#patient-view').is(':checked');
			
			if (!viewProperties._id && recordIdTitleRef[viewProperties.title]) {
				var confirmReplacePopupHTML = '<div id="warning-popup" class="thumbnail warning-popup">\
								<div class="caption">\
									<br />\
									<h5>Replace existing view?</h5>\
									<p style="margin: 20px 0 25px;">There is an existing configuration with this title.</p>\
									<a id="replace-stored-view" href="#" class="btn btn-primary" role="button">Replace</a><br />\
									<a id="replace-cancel" href="#" class="btn btn-default" role="button">Cancel</a>\
							</div>\
						</div>';

				if (!$('body > #whiteout').length) {
					$('body').append('<div id="whiteout"></div>');
				}
				$('body').append(confirmReplacePopupHTML);
				$('#replace-stored-view').click(function() {
					viewProperties._id = recordIdTitleRef[viewProperties.title];
					$('#warning-popup').remove();
					$('body > #whiteout').remove();
					_storeView(storedViewType, viewProperties);
					$('body > #share-view-popup').modal('hide');
				});
				$('#replace-cancel').click(function() {
					$('#warning-popup').remove();
					$('body > #whiteout').remove();
					$('body > #share-view-popup .save').removeClass('disabled');
				});
			}
			else {
				_storeView(storedViewType, viewProperties);
				$('body > #share-view-popup').modal('hide');
			}
		});

		// When a new record is being created, generate a list of existing views' titles/ids, newly crated records should
		// existing ones with the same title
		if (!viewProperties._id) {
			ESV.queries.makeSimpleQuery({"fields": ["title"], "size": "10000"}, pridURL + "?request_cache=true", true, function(response) {
				for (var idx in response.hits.hits) {
					var storedViewRecord = response.hits.hits[idx];
					recordIdTitleRef[storedViewRecord.fields.title[0]] = storedViewRecord._id;
				}
			});
		}
	};

	/**
	 * Brings up the interface for configuring filters for the available data types
	 * @function panelSettingsPopup
	 * @param {String} formTitle - The panel title
	 * @param {String} formHTML - The form HTML to be placed in the modal panel body
	 * @memberof ESV
	 * @instance
	 */
	esv.panelSettingsPopup = function(formTitle, formHTML) {
        /* jshint multistr: true */
		var panelSettingsPopupHTML = '<div id="panel-settings-popup" class="modal fade" tabindex="-1" role="dialog" aria-hidden="true">\
			<div class="modal-dialog">\
				<div class="modal-content">\
					<div class="modal-header">\
						<button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>\
						<h4 class="modal-title">' + formTitle + '</h4>\
					</div>\
					<div class="modal-body">' +
						formHTML +
					'</div>\
					<div class="modal-footer">\
						<button type="button" class="btn btn-primary save" data-dismiss="modal">Save settings</button>\
					</div>\
				</div>\
			</div>\
		</div>';
		if ($('body > #panel-settings-popup').length > 0) {
			$('body > #panel-settings-popup').modal('hide');
			$('body > #panel-settings-popup').remove();
			$('body > .modal-backdrop').remove();
		}
		$('body').append(panelSettingsPopupHTML);
		_initPanelSettingsPopup();
	};

	/**
	 * Initialize functionality common for all configuration widgets
	 * @function _initPanelSettingsPopup
	 * @memberof ESV
	 * @private
	 * @instance
	 */
	function _initPanelSettingsPopup() {
		$(function() {
			$('.toggle-field').bootstrapToggle({
				on: 'Show',
				off: 'Hide'
			});
		});

		$(function () {
			$('[data-toggle="tooltip"]').tooltip();
		});

		$('#panel-settings-popup ul li').on('mousedown', function() {
			$('#panel-settings-popup ul li').removeClass('active');
			$(this).addClass('active');
		});

	}

	/**
	* Opens the form for creating views in a modal popup in the centre of the window
	* @param {String} createTitle - Panel title to be displayed
	* @param {String} createBody - The HTML to be placed in the modal body
	* @function createPanelPopup
	* @memberof ESV
	* @instance
	*/
	esv.createPanelPopup = function(createTitle, createBody) {
        /* jshint multistr: true */
		var createPanelPopupHTML = '<div id="create-panel-popup" class="modal" tabindex="-1" role="dialog" aria-hidden="true">\
			<div class="modal-dialog">\
				<div class="modal-content">\
					<div class="modal-header">\
						<button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>\
						<h4 class="modal-title">' + createTitle + '</h4>\
					</div>\
					<div class="modal-body">' + createBody + '</div>\
				</div>\
			</div>\
		</div>';

		if($('body > #create-panel-popup').length > 0){
			$('body > .modal-backdrop').remove();
			$('body > #create-panel-popup').remove();
		}
		$('body').append(createPanelPopupHTML);
		$('body > #create-panel-popup').modal({'backdrop': 'static', 'keyboard': false});
		$('body > #create-panel-popup').modal('show');
		$('#create-panel-popup').on('hidden.bs.modal', function () { $(this).remove(); });
	};

	/**
	 * Renders the error overlay
	 * @param {Object} vizObj - Visualization object
	 * @param {String} message - The error message to be displayed to the user
	 * @function errorView
	 * @memberof ESV
	 * @instance
	 */
	esv.errorView = function(vizObj, message) {
		ESV.hideLoading();
		$('#container-' + vizObj.id + ' .error-message').text(message);
		$('#container-' + vizObj.id + ' .error-overlay').show();
	};

	/**
	* Disables the specified view object applying a whiteout overlay
	* @function disableView
	* @param {Object} vizObj - Visualization object
	* @memberof ESV
	* @instance
	*/
	esv.disableView = function(vizObj) {
		if (vizObj.disabled) { return; }
		$('#container-' + vizObj.id).append('<div id="whiteout"></div>');
		$('#container-' + vizObj.id  + ' #whiteout')

			.hide()
			.click(function(event) { event.stopPropagation();})
			.fadeTo(500, 0.75);
		vizObj.disabled = true;
	};

	/**
	* Removes the whiteout overlay from the specified view
	* @function enableView
	* @param {Object} vizObj - Visualization object
	* @memberof ESV
	* @instance
	*/
	esv.enableView = function(vizObj) {
		$('#container-' + vizObj.id + ' #whiteout').fadeOut(500, function() {
			$(this).remove();
		});
		vizObj.disabled = false;
	};

	/**
	 * Shows/updates an indicator in the title heading of the view used to apply facades/filters
     * through burshing or selection
	 * @function updateViewFacadeIndicator
	 * @memberof ESV
	 * @instance
	 */
	esv.updateViewFacadeIndicator = function() {
		if (ESV.viewfacades.hasViewFacades()) {
			var filterPillsHTML = '';
			var uniqueFacades = [];
            var getUniqueFacades = function(idx, facade) {
				if (uniqueFacades.indexOf(facade.id) == -1) {
					uniqueFacades.push(facade.id);
				}
            };

            var allViewFacades = ESV.viewfacades.getViewFacades();
			$.each(allViewFacades, getUniqueFacades);

			for(var i = 0; i < allViewFacades.length; i++){

				var viewFacade = allViewFacades[0].viewID;
				var currentPlot = $('#container-' + allViewFacades[0].viewID);
				if (!currentPlot[0]) {
					return;
				}
				if(viewFacade == parseInt(currentPlot[0].id.slice(10,18))){

					if (uniqueFacades.length > 1) {
						$('.menu').remove();
						_removeStuff();

						$('#container-' + viewFacade.viewID + ' .panel').addClass('panel-focus'); // to create the blue shadowy look

						filterPillsHTML = '<ul class = "menu">';

						if(allViewFacades.length < 99){
							filterPillsHTML += '<li class="multifilter-pill mf-small" href="#"><strong>' + allViewFacades.length + '</strong> selections';
						} else if (allViewFacades.length > 99){
							filterPillsHTML += '<li class="multifilter-pill mf-big" href="#"><strong>' + allViewFacades.length + '</strong> selections';
						}

						filterPillsHTML += '<ul class= "dropdown-menu ddbackground">';

						for (var i = 0; i < allViewFacades.length; i++) {
							var viewFacade = allViewFacades[i];
							var facadeAttributes = $.map(Object.keys(viewFacade), function(facadeAttr) {
								if (typeof(viewFacade[facadeAttr]) != 'object') {
									return 'data-' + facadeAttr + '="' + viewFacade[facadeAttr] + '"';
								}
							}).join(' ');
							filterPillsHTML += '<li><span class="filter-pill"  href="#" ' + facadeAttributes + '>';
							var index = 0;
							$.each(viewFacade.fields, function(fieldID, value) {
								filterPillsHTML += value.label + ': <strong>';
								var fieldValues = value.fieldValuesLabels || value.fieldValues;
								for (var j = 0; j < fieldValues.length; j++) {
									if (j < (fieldValues.length - 1)) {
										filterPillsHTML += fieldValues[j] + ', ';
									} else {
										filterPillsHTML += fieldValues[j];
									}
								}
								if (index < (Object.keys(viewFacade.fields).length - 1)) {
									filterPillsHTML += '</strong>,&nbsp;';
								} else {
									filterPillsHTML += '</strong>';
								}
								index++;
							});

							filterPillsHTML += '</span></li>';
						}
						filterPillsHTML += '</ul></li></div></div>';

						$('#container-' + viewFacade.viewID).find('.panel').addClass('panel-focus');
						$('#container-' + viewFacade.viewID).find('.panel-heading').addClass('panel-blue').append(filterPillsHTML);

					} else {
						for (var i = 0; i < allViewFacades.length; i++) {
							var viewFacade = allViewFacades[i];
							var sameFacade = false;
							var ids = [];
							$.each(allViewFacades, function() {
								if (ids.length === 0) {
									ids.push(this.id);
									ids.push(this.viewID);
								} else {
									sameFacade = this.id == ids[0] && this.viewID == ids[1];
								}
							});
							var fields = viewFacade.fields;
							if (sameFacade === true) {
								var combined = {};
								$.extend(combined, allViewFacades[0].fields, allViewFacades[1].fields);
								fields = combined;
							}

							_removeStuff();
							$('#container-' + viewFacade.viewID + ' .panel').addClass('panel-focus');

							var facadeAttributes = $.map(Object.keys(viewFacade), function(facadeAttr) {
								if (typeof(viewFacade[facadeAttr]) != 'object') {
									return 'data-' + facadeAttr + '="' + viewFacade[facadeAttr] + '"';
								}
							}).join(' ');
							filterPillsHTML += '<li class="filter-tab" style="list-style-type: none;"><li><span class="filter-pill" href="#" ' + facadeAttributes + '>';
							var index = 0;
							var counter = 0;

							$.each(viewFacade.fields, function(fieldID, value) {
								filterPillsHTML += value.label + ': <strong>';
								var fieldValues = value.fieldValuesLabels || value.fieldValues;
								for (var j = 0; j < fieldValues.length; j++) {
									if (j < (fieldValues.length - 1)) {
										filterPillsHTML += fieldValues[j] + ', ';
									} else {
										filterPillsHTML += fieldValues[j];
									}
								}
								if (index < (Object.keys(viewFacade.fields).length - 1)) {
									filterPillsHTML += '</strong>,&nbsp;&nbsp;';
								} else if (sameFacade && counter === 0) {
									filterPillsHTML += '</strong>,&nbsp;&nbsp;';
									counter++;
								} else {
									filterPillsHTML += '</strong>';
								}
								index++;
							});


							filterPillsHTML += '</span></li></li>';
						}
						$('#container-' + viewFacade.viewID).find('.panel-heading').append(filterPillsHTML);
						$('#container-' + viewFacade.viewID).find('.panel').addClass('panel-focus');
						$('#container-' + viewFacade.viewID).find('.panel-heading').addClass('panel-blue');
					}

					$('.panel-heading').removeClass('hide');

					// Adjust the filter dropdown menu width based on the content width
					$('#container-' + viewFacade.viewID + ' .multifilter-pill').on('mouseover', function() {
						var $multifilter = $(this);
						$multifilter.find('.dropdown-menu').width($('#container-' + viewFacade.viewID).width() * 0.8);
						var $filterPills = $multifilter.find('.filter-pill');
						var filterPillWidth = 0;
						$filterPills.each(function() {
							if ($(this).width() > filterPillWidth) {
								filterPillWidth = $(this).width();
							}
						});
						$multifilter.find('.dropdown-menu').width(filterPillWidth + 50);
						if ($filterPills.length <= 4) {
							$multifilter.find('.dropdown-menu').css('overflow-y', 'hidden');
						}
					});
				}
			}
		} else {
			$('.panel').removeClass('panel-focus');
			$('.menu').remove();
			_removeStuff();
		}

		// remove any extra empty li tags
		$('ul li:empty').remove();
		$('#view-facade-warning').remove();
	};

	/**
	 * Shows the loading icon - loading icons are unnecessary if items take less than 200ms to load
	 * @function showLoading
	 * @memberof ESV
	 * @instance
	 */
	esv.showLoading = function() {
		ESV.loading = true;

		setTimeout(function() {
			if (ESV.loading) {
				$('#loading').show();
			} else {
				$('#loading').hide();
			}
		}, 200);
	};

	/**
	 * Hides the loading indicator
	 * @function showLoading
	 * @memberof ESV
	 * @instance
	 */
	esv.hideLoading = function() {
		ESV.loading = false;
		$('#loading').hide();
	};

	/**
	 * Shows a progress bar
	 * @function showProgressBar
	 * @memberof ESV
	 * @instance
	 */
	esv.showProgress = function() {
		ESV.updateProgress(0);
		setTimeout(function() {
			if (parseInt($("#progress .progress-bar").attr("aria-valuenow")) < 90) {
				$('#progress').show();
			}
		}, 100);
	}

	/**
	 * Hides progress bar
	 * @function showProgressBar
	 * @memberof ESV
	 * @instance
	 */
	esv.hideProgress = function() {
		$('#progress').hide();
	}

	/**
	 * Updates the progress bar to the specified value (%)
	 * @function showProgressBar
	 * @param {Number} value - Progress, value between 1 and 100
	 * @memberof ESV
	 * @instance
	 */
	esv.updateProgress = function(value) {
		if (value > 100) {
			value = 100;
		}
		$("#progress .progress-bar").css("width", value + "%");
	        $("#progress .progress-bar").attr("aria-valuenow", value + "%");
		if (value == 100) {
			setTimeout(function() {
				esv.hideProgress();
				$("#progress .progress-bar").css("width", "0%");
			        $("#progress .progress-bar").attr("aria-valuenow", "0%");
			}, 800);
		}
	}


	/**
	 * Displays a warning bubble indicator where previous plot selections are made where an attempt is made to apply a facade from a second view.
	 * @function showOnlyOneViewFacadePopup
	 * @memberof ESV
	 * @instance
	 */
	esv.showOnlyOneViewFacadePopup = function() {
		var currentFacadeVizObj = ESV.viewfacades.getViewID();
		if ($('#view-facade-warning').length <= 0) {
			if($('#container-'+ currentFacadeVizObj).attr('data-sizex') == 7 ){
				if (($('.filter-pill').length)){
					$('.filter-pill').after('<div id="view-facade-warning" class="arrow-box arrow-box-7 animated pulse"><p>Clear current selection(s)</p></div>');
				} else{
					$('.multifilter-pill').after('<div id="view-facade-warning" class=" arrow-box arrow-box-7 animated pulse"><p>Clear current selection(s)</p></div>');
				}

			}else if($('#container-'+ currentFacadeVizObj).attr('data-sizex') > 7){
				if (($('.filter-pill').length)){
					$('.filter-pill').after('<div id="view-facade-warning" class=" arrow-box arrow-box-7plus animated pulse"><p>Clear current selection(s)</p></div>');
				} else{
					$('.multifilter-pill').after('<div id="view-facade-warning" class=" arrow-box arrow-box-7plus animated pulse"><p>Clear current selection(s)</p></div>');
				}
			} else if($('#container-'+ currentFacadeVizObj).attr('data-sizex') == 4  || $('#container-'+ currentFacadeVizObj).attr('data-sizex') == 5){
				if ($('.filter-pill').length){
					$('.filter-pill').after('<div id="view-facade-warning" class="arrow-box arrow-box-4 animated pulse"><p>Clear current selection(s)</p></div>');
				} else{
					$('.multifilter-pill').after('<div id="view-facade-warning" class="arrow-box arrow-box-4 animated pulse"><p>Clear current selection(s)</p></div>');
				}
			}
		}
	}

	/**
	* A warning bubble indicating the length of a label is too long. Suggests user to configure the labels
	* @param - {Array}
	*/
esv.labelLengthWarning = function(vizObj, str1, str2, str3){
	// Calculate how far away from the right the popup should appear
		var moveRight = (vizObj.view.config.gridWidth * 9) + 10;

		if(str3){
			if($('#view-area').length){
				$('#container-' + vizObj.id).find('.panel-heading').after('<div id="label-length-warning" class="arrow-box-length animated bounce" style="left:'+ moveRight +'%; width: 270px;">\
					<p> Please re-configure <strong>'+ str1 +'</strong>,<strong>'+ str2 + '</strong> and <strong>'+ str3 +'</strong> field values (labels need to be 20 chars or less). \
						To edit, click <span class= "settings glyphicon glyphicon-cog"></span> </p></div>');
			}
		}else if(str1 && str2){
			if($('#view-area').length){
				$('#container-' + vizObj.id).find('.panel-heading').after('<div id="label-length-warning" class="arrow-box-length animated bounce" style="left:'+ moveRight +'%; width: 270px;">\
					<p> Please re-configure <strong>'+ str1 +'</strong> and <strong>'+ str2 + '</strong> field values (labels need to be 20 chars or less). \
						To edit, click <span class= "settings glyphicon glyphicon-cog"></span> </p></div>');
			}
		}else {
			if($('#view-area').length){
				$('#container-' + vizObj.id).find('.panel-heading').after('<div id="label-length-warning" class="arrow-box-length animated bounce" style="left:'+ moveRight +'%; width: 270px;">\
					<p> Please re-configure <strong>'+ str1 + '</strong> field values (labels need to be 20 chars or less). \
						To edit, click <span class= "settings glyphicon glyphicon-cog"></span> </p></div>');
			}
		}
	}

	/**
	 * Saves the current portrait by serializing all visualization objects in it
	 * @function serializeState
	 * @memberof ESV
	 * @instance
	 */
	esv.serializeState = function() {
		var serializedObj = {};
		serializedObj.elements = ESV.cc.elements;
		serializedObj.nodes = {};
		if (ESV.viewfacades.hasViewFacades()) {
			serializedObj.viewFacades = ESV.viewfacades.getViewFacades();
		}

		// Make a deep copy of the ESV.nodes - Do NOT copy the view as this will exceed the JS callstack
		$.each(ESV.nodes, function(id, node) {
			var strippedNode = {};
			$.each(node, function(attrKey, attrValue) {
				if (attrKey == "view" || attrKey == "rawData" || attrKey == "data") {
					return;
				}
				if (attrKey == "tracks") {
					var tracks = [];
					$.each(attrValue, function(i, track) {
						var obj = $.extend(true, {}, track);
						obj.view = {
							dataFormat: obj.view.dataFormat,
							dataType: obj.view.dataType,
							info: obj.view.info,
							sampleIDs: obj.sampleIDs,
							sourceIDs: obj.sourceIDs
						};
						delete obj["data"];
						delete obj["bins"];
						delete obj["originalResponse"];
						delete obj["query"];
						tracks.push(obj);
					});
					attrValue = tracks;
				}
				strippedNode[attrKey] = attrValue;
			});
			serializedObj.nodes[id] = strippedNode;
		});
		// Remove the IDs from cytoscape edges as having them around seems to
		// cause problems once the saved state is restored and subsequently more
		// plots are added, GV-479
		var strippedEdges = [];
		$.each(serializedObj.elements.edges, function(idx, edge) {
			var strippedEdge = {"data": {}};
			$.each(edge.data, function(attrKey, attrValue) {
				if (attrKey == "id") {
					return;
				}
				strippedEdge.data[attrKey] = attrValue;
			});
			strippedEdges.push(strippedEdge);
		});
		serializedObj.elements.edges = strippedEdges;

		return serializedObj;
	}

	/**
	 * Restores a previusly saved portrait from a serialized state
	 * @function openSerializedState
	 * @param {String} serializedState - A serialized visualization state
	 * @memberof ESV
	 * @instance
	 */
	esv.openSerializedState = function(serializedObj) {
		ESV.showLoading();

		ESV.cc.elements = serializedObj.elements;
		ESV.nodes = serializedObj.nodes;
		if (serializedObj.viewFacades) {
			ESV.viewfacades.setViewFacades(serializedObj.viewFacades)
		}

		// Sort the node IDs in a manner ensuring that the data nodes are processed
		// first as to allow for proper configuration of views prior to their rendering
		var nodeIDs = Object.keys(ESV.nodes).sort(function(a, b) {
			if (ESV.nodes[a].type == 'data' && ESV.nodes[b].type != 'data') {
				return -1;
			}
			else if (ESV.nodes[a].type != 'data' && ESV.nodes[b].type == 'data') {
				return 1;
			}
			else {
				return 0;
			}
		});

		var sampleIDs = [];
		// Renders the actual view
		$.each(nodeIDs, function(index, id) {
			var nodeObj = ESV.nodes[id]
			if (nodeObj.type != 'data' && nodeObj.type != 'datafilter' && nodeObj.type != 'viewfilter') {
				if (!nodeObj.ignore) {
					nodeObj.sampleIDs = sampleIDs;
					ESV[nodeObj.type].init({
						'vizID': id
					});
					if (ESV.viewfacades.hasViewFacades() && ESV.viewfacades.getViewID() == id) {
						esv.updateViewFacadeIndicator();
					}
				}
			}
			else if (nodeObj.type == 'data') {
				var dataTypes = ESV.getUnderlyingDataTypes(nodeObj.id);
				for (var idx in dataTypes) {
					ESV.editor.configureViews(dataTypes[idx])

				}
				sampleIDs = nodeObj.filters["data-all-sample_id"].fieldValues;
			}
		});

		// In case there are restored facades, disable views they shouldn't be applied to
		if (ESV.viewfacades.hasViewFacades()) {
			for (var key in ESV.nodes) {
				if (key != ESV.viewfacades.getViewID()) {
					var staleVizObj = ESV.nodes[key];
					var trackID = ESV.viewfacades.getTrackID();
					if (staleVizObj.type != "data" && staleVizObj.type != "datafilter" && staleVizObj.type != "viewfilter" && !staleVizObj.ignore) {
						if (!ESV.dataOverlaps(staleVizObj.id, ESV.viewfacades.getViewID(), "sampleIDs", trackID).length) {
							ESV.disableView(staleVizObj);
							continue;
						}
					}
				}
			}
		}

		// Reload cy graph
		ESV.cc.reloadGraph();

		ESV.hideLoading();
	}

	// === PRIVATE FUNCTIONS ===

	/**
	 * Sets general listeners to DOM elements
	 * @function _initHandlers
	 * @memberof ESV
	 * @private
	 * @instance
	 */
	function _initHandlers() {

		$('body').click(function() {
			$('#view-facade-warning').remove();
			$("#label-length-warning").remove();
		});
		$('#sidebar').click(function(){
			$("#label-length-warning").remove();
		})

		$('#open-views').click(function(e) {
			e.preventDefault();
			$('#open-views-input').trigger('click');
		});

		$('#open-views-input').change(function() {
			var reader = new FileReader();

			reader.onload = function(e) {
				var serializedObj = JSON.parse(reader.result);
				ESV.openSerializedState(serializedObj);
			}

			if (this.files[0] != undefined) {
				reader.readAsText(this.files[0]);
			}
		});

		$('#share-view').click(function(e) {
			if ($.inArray(e.target.id, ["save-view", "create-template"]) == -1) {
				return;
			}
			if ($.isEmptyObject(esv.nodes)) {
				var message = "No visualization objects have been created yet.";
				ESV.notificationPopup(message);
				return;
			}
			if ($.inArray(e.target.id, ["create-template"]) != -1) {
				esv.createTemplatePopup();
				return;
			}
			_storeView();
		});

		$(document).on('click','#browse-accordian .grouping-title', function(e) {
			_styleBrowseMenu(this, "main-grouping");
		});

		$(document).on('click','#browse-accordian .sub-title', function(e) {
			_styleBrowseMenu(this,"sub-grouping");
		});

		$('#remove-all-plots').on('click', function() {
			_removeAllPlots();
			$(this).blur();
			$('#sidebar .open-view-active').addClass('open-view').removeClass('open-view-active');
		});

		$('#configuration-options').click(function(e) {
			 var $link = $(e.target);
			 if ($.inArray($link.attr('data-type'), ["template"]) != -1) {
				ESV.editor.configureStoredViewsPanel($link.attr('data-type'));
			 }
			 ESV.editor.configureFieldset($link.attr('data-type'), $link.attr('data-node'));
		});

		$('#configuration-options-section').on('show.bs.dropdown', function (e) {
			var dataTypeField = $.map(Object.keys(ESV.editor.storedConfiguration.common.data.fields), function(field) {
				var fieldObj = ESV.editor.storedConfiguration.common.data.fields[field];
				if (fieldObj.esid == ESV.mappings.dataType) {
					return fieldObj;
				}
			})[0];
			if (dataTypeField && $.isArray(dataTypeField.fieldValues) && dataTypeField.fieldValues.length) {
				$(this).find('.dropdown-submenu').removeClass('disabled');
				var $dataTypeConfigMenu = $(this).find('.dropdown-submenu ul').first();
				$dataTypeConfigMenu.empty();
				for (var i in dataTypeField.fieldValues) {
					var fieldValue = dataTypeField.fieldValues[i];
					if (fieldValue[5]) {
						continue;
					}
					$dataTypeConfigMenu.append('<li><a href="#" data-type="' + fieldValue[0] + '" data-node="datafilter">' + fieldValue[2] + '</a></li>');
				}
				if (!$dataTypeConfigMenu.find('li').length) {
					$(this).find('.dropdown-submenu').addClass('disabled');
				}
			}
			else {
				$(this).find('.dropdown-submenu').addClass('disabled');
			}
		}).on('hide.bs.dropdown', function(e) {
			$(this).find('.dropdown-submenu ul').hide();
		});

		$('#configure-data-filters').on("click", function(e){
			$(this).next('ul').toggle();
			e.stopPropagation();
			e.preventDefault();
		});

		$('#hide-editor').click(function() {
			if ($('#hide-editor i').hasClass('rotate90')) {
				$('#sidebar').removeClass('animated fadeOutLeft');
				$('#sidebar').addClass('animated fadeInLeft');
				$('#hide-editor i').removeClass('rotate90');
				$('#wrapper').removeClass('no-pad');
				// A workaround for a specific case where the cytoscape panel becomes unresponsive
				// after hiding the edit panel and resizing the browser window, GV-527
				$('#sidebar').one('webkitAnimationEnd mozAnimationEnd MSAnimationEnd oanimationend animationend', function() {
					var nodeID;
					if (ESV.cc.currentElement) {
						nodeID = ESV.cc.currentElement.id;
					}
					ESV.cc.reloadGraph(nodeID);
					$(this).children('#cy').removeClass('disabled-view');
				});
			} else {
				$('#sidebar').removeClass('animated fadeInLeft');
				$('#sidebar').addClass('animated fadeOutLeft');
				$('#hide-editor i').addClass('rotate90');
				$('#wrapper').addClass('no-pad');
				$('#sidebar').one('webkitAnimationEnd mozAnimationEnd MSAnimationEnd oanimationend animationend', function() {
					$(this).children('#cy').addClass('disabled-view');
				});
			}
		});

		$('a[data-toggle="tab"][href="#browse-element"]').on('shown.bs.tab', function(e) {
			ESV.editor.renderBrowsePanelWithViews();
		});

		//  This is used to remove all the view facades that are currently in place.
		$("#page-wrapper").on("click", ".filter-pill", function(event) {
			event.stopPropagation();

			var viewFacadeVizID = $(this).data('viewid');
			var viewFacadeToRemove = null;

			$('.panel-heading').removeClass('open');
			viewFacadeToRemove = ESV.viewfacades.getViewFacadeByID($(this).data('id'))

			// There are no more view facade elements, make sure no more elements are highlighted in the original view
			var vizObj = ESV.nodes[viewFacadeVizID];
			ESV[vizObj.type].clearViewFacade(vizObj, viewFacadeToRemove);
		});

		// Unselect selected elements when the user clicks on an element that's not part of
		// the sidebar or the viz itself
		$(document).mouseup(function (e) {
			var sidebar = $("#sidebar");
			var cyToolbar = $("#cy-toolbar");
			var panel = $(".panel");

			if ($('.navbar *').is(e.target) || $('body > .modal:visible').length) {
				return;
			}
			if (!sidebar.is(e.target) && sidebar.has(e.target).length === 0
				&& !cyToolbar.is(e.target) && cyToolbar.has(e.target).length === 0
				&& !panel.is(e.target) && panel.has(e.target).length === 0) {

				//if the panel already has a blue glow or a blue header then remove these attributes b/c you clicked elsewhere
				if($('.panel-heading').is('.panel-blue') || $('.panel').is('.panel-focus')){
					$('.panel-heading').removeClass('panel-blue');
					$('.panel').removeClass('panel-focus');
				}

				// If the user is building a structure, make sure that the user confirms before
				// unselecting all the nodes
				if (ESV.editor.structureStagingArray.length > 0) {
					// ESV.promptStructureCreationConfirmation();
					// alert("Discard Changes Popup");
				} else {
					ESV.cc.unSelectAllNodes(true);
				}
			}
		});

		_initCreateElementHandlers();
	}

	/**
	 * Sets listeners to the create element options
	 * @function _initCreateElementHandlers
	 * @memberof ESV
	 * @private
	 * @instance
	 */
	function _initCreateElementHandlers() {
		$('.sidebar-create').on('click', '.create-element', function() {
			ESV.cc.unSelectAllNodes(true);
			var elementType = $(this).data('id');
			ESV.editor.initStructureCreation(elementType);
		});

		$('body').on('click', '.create-view', function() {
			var viewType = $(this).data('type');
			if ($(this).data('structure') === null) {
				ESV.editor.updateCreatePanel({
					multiStep: false,
					type: viewType
				});
			} else {
				var structureType = $(this).data('structure');
				var currentStep = $(this).data('currentstep');

				// This is part of creating a structure so treat it as such
				ESV.editor.updateCreatePanel({
					structureType: structureType,
					multiStep: true,
					step: currentStep,
					type: viewType
				});
			}
		});

		$('.sidebar-create').on('click', '.create-existing-view', function() {
			var structureType = $(this).data('structuretype');
			var step = $(this).data('step');
			var existingViewID = $(this).data('existingviewid');

			// Make the current structure link to the selected existing view
			var prevTempID = ESV.editor.structureStagingArray[step].id;
			ESV.editor.structureStagingArray[step] = ESV.nodes[existingViewID];

			for (var i = 0; i < ESV.editor.structureStagingArray.length; i++) {
				if ($.inArray(prevTempID, ESV.editor.structureStagingArray[i].parents) > -1) {
					ESV.editor.structureStagingArray[i].parents.splice( $.inArray(prevTempID, ESV.editor.structureStagingArray[i].children), 1 );
					ESV.editor.structureStagingArray[i].parents.push(existingViewID);
				}
			}
			var template = ESV.structures[structureType].structure[step];
			var newChildrenIDs = [];
			for (var i = 0; i < template.children.length; i++) {
				ESV.editor.structureStagingArray[step].children.push(ESV.editor.structureStagingIDMap[template.children[i]]);
				newChildrenIDs.push(ESV.editor.structureStagingIDMap[template.children[i]]);
			}
			if (template.children.length == 0) {
				newChildrenIDs.push(parseInt(ESV.cc.currentElement.id));
			}

			// Write out all the temporary structures into the actual structure
			for (var i = 0; i < ESV.editor.structureStagingArray.length; i++) {
				var tempNode = ESV.editor.structureStagingArray[i];
				ESV.nodes[tempNode.id] = tempNode;
			}

			// If the structure is 'linked' bottom it means that the indicated linked node is linked to the currently selected node
			var linked = ESV.structures[structureType].linked;
			if (linked == "bottom" && ESV.cc.currentElement != null) {
				var selectedElementID = parseInt(ESV.cc.currentElement.id);
				var targetNodeID = ESV.editor.structureStagingArray[0].id;
				ESV.nodes[selectedElementID].parents.push(targetNodeID);
				ESV.nodes[targetNodeID].children.push(selectedElementID);
			}

			// Creates the CC nodes and edges
			for (var i = 0; i < ESV.editor.structureStagingArray.length; i++) {
				if (i == step) {
					continue;
				}
				var tempNode = ESV.editor.structureStagingArray[i];
				ESV.cc.addNode(tempNode.id, tempNode.type);

				// Create an edge to each of its children
				for (var j = 0; j < tempNode.children.length; j++) {
					ESV.cc.addEdge(tempNode.id, tempNode.children[j]);
				}
			}

			for (var i = 0; i < newChildrenIDs.length; i++) {
				ESV.cc.addEdge(ESV.editor.structureStagingArray[step].id, newChildrenIDs[i]);
			}


			// We should refresh this newly linked graph
			var node = ESV.nodes[existingViewID];
			ESV[node.type].update(node);

			// Reload cy graph
			ESV.cc.reloadGraph();

			// Resets the temporary structures
			ESV.editor.structureStagingArray = [];
			ESV.editor.structureStagingIDMap = {};

			// Reset the create panel
			ESV.editor.renderCreatePanelWithNodes();
		});

		// Open a stored view
		$('#sidebar-browse').on('click', '.open-view', function(e) {
			$('.open-view-active').addClass('open-view').removeClass('open-view-active');
			$(this).addClass('open-view-active').removeClass('open-view');
			esv.loadViewFromTemplate($(this).data('template-id'), $(this).data('sample-id'));
		});

		// Structure creation
		$('body').on('click', '#create-next', function() {
			// Write the current step into the temporary structure
			var structureType = $(this).data('structure');
			var type = $(this).data('currenttype');
			var step = $(this).data('currentstep');

			if (ESV.editor.areRequiredFieldsCompleted({
					isStructure: true,
					structureType: structureType,
					step: step,
					type: type
				})) {

				ESV.showLoading();

				ESV.editor.createStructureNode({
					structureType: structureType,
					nodeType: type,
					step: step
				}, function() {
					ESV.editor.updateCreatePanel({
						structureType: structureType,
						multiStep: true,
						step: step + 1
					});
					ESV.hideLoading();
				});
			}
		});

		$('body').on('click', '.page-previous', function() {
			// Write the current step into the temporary structure
			var structureType = $(this).data('structure');
			var type = $(this).data('currenttype');
			var step = $(this).data('currentstep');

			if (ESV.editor.areRequiredFieldsCompleted({
					isStructure: true,
					structureType: structureType,
					step: step,
					type: type
				})) {

				ESV.showLoading();

				ESV.editor.createStructureNode({
					structureType: structureType,
					nodeType: type,
					step: step
				}, function() {
					ESV.editor.updateCreatePanel({
						structureType: structureType,
						multiStep: true,
						step: step - 1
					});
					ESV.hideLoading();
				});
			}
		});

		$('body').on('click', '.page-next', function() {
			// Write the current step into the temporary structure
			var structureType = $(this).data('structure');
			var type = $(this).data('currenttype');
			var step = $(this).data('currentstep');

			if (ESV.editor.areRequiredFieldsCompleted({
					isStructure: true,
					structureType: structureType,
					step: step,
					type: type
				})) {

				ESV.showLoading();

				ESV.editor.createStructureNode({
					structureType: structureType,
					nodeType: type,
					step: step
				}, function() {
					ESV.editor.updateCreatePanel({
						structureType: structureType,
						multiStep: true,
						step: step + 1
					});
					ESV.hideLoading();
				});
			}
		});

		$('body').on('click', '#create-finish', function(event) {
			// Write the current step into the temporary structure
			var structureType = $(this).data('structure');
			var type = $(this).data('currenttype');
			var step = $(this).data('currentstep');

			if (structureType == undefined || structureType == null) {
				ESV.editor.createNode(type);
			} else {

				if (!ESV.editor.areRequiredFieldsCompleted({
						isStructure: true,
						structureType: structureType,
						step: step,
						type: type
					})) { return; }
				var sampleIDs = [];
				ESV.showLoading();

				ESV.editor.createStructureNode({
					structureType: structureType,
					nodeType: type,
					step: step
				}, function() {
					var treeID = ESV.generateID();

					var isTrack = false;
					if (ESV.cc.currentElement) {
						if (structureType == "dataFromViewFilter" && ESV.nodes[ESV.cc.currentElement.id].isTrack) {
							isTrack = true;
						}
					}
					// Preprocess the tree if this is a track view (the "dataFromViewFilter" option is for tracks)
					var viewNode, parentNode;
					var newTrackNode = {};
					if (isTrack || structureType == "dataFromViewFilter") {
						viewNode = ESV.editor.structureStagingArray.pop();
					}

					if (isTrack) {
						// The parent node is the general genomewide view node that contains info about all the tracks
						parentNode = ESV.nodes[ESV.nodes[ESV.cc.currentElement.id].parents[0]];

						// Get the data type and data node
						var dataNode = ESV.editor.structureStagingArray[0];
						var dataType = dataNode.filters["data-all-type"].fieldValues.join();
						newTrackNode.dataType = dataType;
						newTrackNode.dataNode = ESV.editor.structureStagingArray[0];

						$.each(viewNode.info, function(key, val) {
							// Get the data format (range, point, pair)
							var format = "format";
							var endsWithFormat = key.slice(-format.length) == format;
							if (endsWithFormat) {
								newTrackNode.dataFormat = val;
								newTrackNode.id = viewNode.id;
								newTrackNode.viewNode = viewNode;
								newTrackNode.parentNodeId = parentNode.id;
								newTrackNode.viewNode.parentNodeId = parentNode.id;
							}
						});

						// Set the tree index for the new track
						$.each(ESV.editor.structureStagingArray, function() {
							this.treeIndex = parentNode.tracks.length;
							this.isTrack = true;
						});
					}

					// Write out all the temporary structures into the actual structure
					for (var i = 0; i < ESV.editor.structureStagingArray.length; i++) {
						var tempNode = ESV.editor.structureStagingArray[i];
						ESV.nodes[tempNode.id] = tempNode;
					}

					if (structureType == "viewFromViewFilter"){
						var viewfilterId = ESV.cc.currentElement.id;
						var datafilterId = ESV.nodes[viewfilterId].children;
						var dataId = ESV.nodes[datafilterId].children;
						sampleIDs = ESV.nodes[dataId].filters["data-all-sample_id"].fieldValues;
					}
					// If the structure is 'linked' top it means that the indicated linked node is linked to the currently selected node
					var linked = ESV.structures[structureType].linked;

					var newNodes = [];
					if (linked == "bottom" && ESV.cc.currentElement != null) {
						var selectedElementID = parseInt(ESV.cc.currentElement.id);
						var targetNodeID = ESV.editor.structureStagingArray[0].id;
						ESV.nodes[selectedElementID].parents.push(targetNodeID);

						ESV.nodes[targetNodeID].children.push(selectedElementID);

					} else if (linked == "top" && ESV.cc.currentElement != null) {
						var selectedElementID = parseInt(ESV.cc.currentElement.id);
						var targetNodeID = parseInt(ESV.editor.structureStagingArray[ESV.editor.structureStagingArray.length - 1].id);
						newNodes.push(targetNodeID);

						if (isTrack) {
							ESV.nodes[selectedElementID].children.push(targetNodeID);
							ESV.nodes[targetNodeID].parents = [];
							ESV.nodes[targetNodeID].parents.push(selectedElementID);

							ESV.cc.addEdge(selectedElementID, targetNodeID);
						} else {
							ESV.nodes[selectedElementID].children.push(targetNodeID);
							ESV.nodes[targetNodeID].parents.push(selectedElementID);

							ESV.cc.addEdge(selectedElementID, targetNodeID);
						}
					}

					// When we add a new data source or filter, we need to update all the existing views that depend on it
					var viewsToUpdate = [];

					// Creates the CC nodes, edges, and any new visualizations

					for (var i = 0; i  < ESV.editor.structureStagingArray.length; i++) {
						var tempNode = ESV.editor.structureStagingArray[i];

						if(ESV.cc.currentElement != null && linked){

							if(ESV.cc.findElement(ESV.cc.currentElement.id)){
								var dataNode = ESV.cc.findElement(ESV.cc.currentElement.id);
								if(tempNode.type != "data"){
									var treeID = dataNode._private.data.treeID;
								}
								else {
									var treeID = ESV.generateID();
								}
							}

					}
						if(tempNode.type == "data"){
							sampleIDs = tempNode.filters["data-all-sample_id"].fieldValues;
						}

						ESV.cc.addNode(tempNode.id, tempNode.type, treeID);

						// Create an edge to each of its children
						for (var j = 0; j < tempNode.children.length; j++) {
							ESV.cc.addEdge(tempNode.id, tempNode.children[j]);
						}

						// --- Creates the actual visualization ---
						if (tempNode.type != "viewfilter" && tempNode.type != "datafilter" && tempNode.type != "data" && !isTrack) {
							//debugger
							ESV.nodes[tempNode.id].sampleIDs = sampleIDs;
							ESV[tempNode.type].init({
								'vizID': tempNode.id
							});
						}

						// When we add a new data source or filter, we need to update all the existing views that depend on it
						if (!isTrack) {
							var tempViewsToUpdate = ESV.getStaleVisualizationIDsTree(tempNode.id);

							for (var j = 0; j < tempViewsToUpdate.length; j++) {
								if ($.inArray(tempViewsToUpdate[j], viewsToUpdate) < 0) {
									viewsToUpdate.push(tempViewsToUpdate[j]);
								}
							}
						}

						// Avoid updating newly created visualizations
						var arrayIndex = $.inArray(tempNode.id, viewsToUpdate);
						if (arrayIndex > -1) {
							viewsToUpdate.splice(arrayIndex, 1);
						}
					}

					// Checks and updates all nodes in the tree making sure that all the nodes are consistent
					if (!isTrack) {
						ESV.editor.updateTreeConsistency();
					}

					// Hide the loading icon
					ESV.hideLoading();

					// Update all the necessary views
					for (var i = 0; i < viewsToUpdate.length; i++) {
						var node = ESV.nodes[viewsToUpdate[i]];
						ESV[node.type].update(node);
					}

					// Reload cy graph
					ESV.cc.reloadGraph();

					// Manually update the view if we are updating one of the tracks
					if (isTrack) {
						// Specify the track index
						var currentTreeIndex = parentNode.tracks.length;
						parentNode.currentTreeIndex = currentTreeIndex;

						// Write out the newly added track into the list of nodes
						parentNode.newTrackNode = newTrackNode;
						ESV.nodes[newTrackNode.viewNode.id] = newTrackNode.viewNode;
						ESV.nodes[newTrackNode.viewNode.id].ignore = true;

						// Update the view with the new track
						ESV[parentNode.type].update(parentNode);
					}

					// Resets the temporary structures
					ESV.editor.structureStagingArray = [];
					ESV.editor.structureStagingIDMap = {};

					// Reset the create panel
					ESV.editor.renderCreatePanelWithNodes();
				});

				$('#create-panel-popup').modal('hide');
				$('#create-finish').remove();
			}
		});
	}
	/**
	* Removing unnecessary elements from DOM
	* @function _removeStuff
	* @memberof ESV
	* @private
	* @instance
	*/
	function _removeStuff(){
		$('.multifilter-pill').remove();
		$('.mf-small').remove();
		$('.mf-big').remove();
		$('.filter-pill').remove();
		$('.filter-tab').remove();
	}

	/**
	* @function _styleBrowseMenu
	* @memberof ESV
	* @private
	* @instance
	*/
	function _styleBrowseMenu(element, type){
		if ($(element).children('i').hasClass('glyphicon-minus')) {
			$(element).children('i').removeClass('icon-open-menu');
			$(element).children('i').removeClass('glyphicon-minus');
			$(element).children('i').addClass('glyphicon-plus');			
			if (type == "main-grouping"){
				$(element).parent().addClass("panel-closed");
				$(element).removeClass('open-menu-style');
			}
		} else {
			$(element).children('i').removeClass('glyphicon-plus');
			$(element).children('i').addClass('glyphicon-minus');
			$(element).children('i').addClass('icon-open-menu');			
			if (type == "main-grouping"){
				$(element).parent().removeClass("panel-closed");
				$(element).addClass('open-menu-style');
			}
		}
	}

	/**
	 * Updates any view which is not the view that triggered the update or in the tree if applicable
	 * @function updateStaleVisualizations
	 * @param {Number} vizID - Ignores updating of the view with this ID
	 * @param {Number} update - true if the update should consider all the nodes
	 * @param {Boolean} isTriggeredByViewFacade - true if all the views that lie above the node with the vizID in the current tree should be updated
	 * @memberof ESV
	 * @instance
	 */
	esv.updateStaleVisualizations = function(vizID, update, isTriggeredByViewFacade) {
		ESV.showLoading(true);

		if (update) {
			var numNodesToUpdate = 0;
			for (var key in ESV.nodes) {
				if (key != vizID) {
					var staleVizObj = ESV.nodes[key];
					if (staleVizObj.type != "data" && staleVizObj.type != "datafilter" && staleVizObj.type != "viewfilter") {
						if (ESV.viewfacades.hasViewFacades() && !ESV.dataOverlaps(staleVizObj.id, ESV.viewfacades.getViewID(), "sampleIDs").length) {
							ESV.disableView(staleVizObj);
							continue;
						}
						if (!staleVizObj.ignore) {
							if (CONFIG.properties[staleVizObj.viewType].track) {
								staleVizObj.includeAll = true;
							}
							// Avoid re-querying disabled views, just enable them
							if (staleVizObj.disabled) {
								ESV.enableView(staleVizObj);
								continue;
							}
							ESV[staleVizObj.viewType].update(staleVizObj, null, isTriggeredByViewFacade, staleVizObj.hasOwnProperty('tracks'));
							numNodesToUpdate++;
						}
					}
				}
			}
			if (numNodesToUpdate == 0) {
				ESV.hideLoading();
			}
		} else {
			// All other updates should be when the underlying data has changed (eg. when a data filter has changed)
			_updateStaleVisualizationsTree(vizID);
		}

		$( document ).ajaxStop(function() {
			ESV.hideLoading();
		});
	};

	/**
	 * Walks up the tree, updating all the visualizations which it finds
	 * @function _updateStaleVisualizationsTree
	 * @param {Number} nodeID - Unique identifier for an object stored in ESV.nodes
	 * @memberof ESV
	 * @instance
	 */
	function _updateStaleVisualizationsTree(nodeID) {
		var node = ESV.nodes[nodeID];
		if (node) {
			if (node.type != "view" && node.type != "viewfilter" && node.type != "datafilter" && node.type != "data") {
				// We've reached a view that we need to update
				var viewType = node.viewType || node.type;
				ESV[viewType].update(node);
			} else {
				for (var i = 0; i < node.parents.length; i++) {
					_updateStaleVisualizationsTree(node.parents[i]);
				}
			}
		}
	}

	/**
	 * Walks up the tree, returning an array of visualization IDs
	 * @function getStaleVisualizationIDsTree
	 * @param {Number} nodeID - Visualization object ID
	 * @returns {Array} vizIDs - List of visualization object IDs connected to the same data set
	 * @memberof ESV
	 * @instance
	 */
	esv.getStaleVisualizationIDsTree = function(nodeID) {
		var vizIDs = [];
		var node = ESV.nodes[nodeID];
		if (node.type != "view" && node.type != "viewfilter" && node.type != "datafilter" && node.type != "data") {
			vizIDs.push(node.id);
		} else {
			for (var i = 0; i < node.parents.length; i++) {
				vizIDs = vizIDs.concat(ESV.getStaleVisualizationIDsTree(node.parents[i]));
			}
		}
		return vizIDs;
	}

	/**
	 * Removes a given view facade from the global scope
	 * @funciton removeViewFacadeByID
	 * @param {Number} facadeID - Facade object ID
	 * @memberof ESV
	 * @instance
	 */
	esv.removeViewFacadeByID = function(facadeID) {
		ESV.viewfacades.removeViewFacadeByID(facadeID);
	}

	/**
	 * Removes a given view facade, updates the bottom right indicator, and any views as needed
	 * @function removeViewFacades
	 * @param {Object} vizObj - Visualization object
	 * @param {Object} viewFacadeToRemove - Facade object to be removed
	 * @param {Boolean} update - Flag specifying whether stale plots should be updated
	 * @memberof ESV
	 * @instance
	 */
	esv.removeViewFacades = function(vizObj, viewFacadeToRemove, update) {
        ESV.viewfacades.removeViewFacades(vizObj, viewFacadeToRemove, update)
	}

	/**
	 * Walks down the tree, returns true if any nodes have more than two parent nodes
	 * @function _isParentBranchedTree
	 * @param {Number} nodeID - Unique ID of a data, datafilter, viewfilter or view node
	 * @param {Boolean} isRoot - Is this the traversal starting point
	 * @returns {Boolean}
	 * @memberof ESV
	 * @private
	 * @instance
	 */
	function _isParentBranchedTree(nodeID, isRoot) {
		var node = ESV.nodes[nodeID];
		if (node.parents.length > 1 && !isRoot) {
			return true;
		} else {
			for (var i = 0; i < node.children.length; i++) {
				if (_isParentBranchedTree(node.children[i], false)) {
					return true;
				}
			}
			return false;
		}
	}

	/**
	 * Finds all underlying analysis data types (specified in connected data nodes) for
     * a given visualization node
	 * @function getUnderlyingDataTypes
	 * @param {Number} nodeID - Unique visualization node ID
	 * @param {String} structureType - (Optional) One of the structures listed in CONFIG.structures
	 * @returns {Array} dataTypes - List of underlying analysis data types
	 * @memberof ESV
	 * @instance
	 */
	esv.getUnderlyingDataTypes = function(nodeID, structureType) {
		var vizObj = null;
		var dataTypes = [];
		if (ESV.nodes.hasOwnProperty(nodeID)) {
			vizObj = ESV.nodes[nodeID];
			if (vizObj != null) {
				if (vizObj.filters.hasOwnProperty("data-all-type")) {
					for (var i = 0; i < vizObj.filters["data-all-type"].fieldValues.length; i++) {
						dataTypes.push(vizObj.filters["data-all-type"].fieldValues[i]);
					}
				} else {
					for (var i = 0; i < vizObj.children.length; i++) {
						var underlyingDataTypes = ESV.getUnderlyingDataTypes(vizObj.children[i]);
						for (var j = 0; j < underlyingDataTypes.length; j++) {
							if ($.inArray(underlyingDataTypes[j], dataTypes) == -1) {
								// This is a unique data type
								dataTypes.push(underlyingDataTypes[j]);
							}
						}
					}
				}
			}
		} else {
			for (var i = 0; i < ESV.editor.structureStagingArray.length; i++) {
				vizObj = ESV.editor.structureStagingArray[i];
				if (vizObj.filters.hasOwnProperty("data-all-type")) {
					for (var i = 0; i < vizObj.filters["data-all-type"].fieldValues.length; i++) {
						dataTypes.push(vizObj.filters["data-all-type"].fieldValues[i]);
					}
				}
			}

			if (structureType != undefined && structureType != null && structureType != "") {
				// Check if the structure is linked to anything
				var linked = ESV.structures[structureType].linked;
				if ((linked == "bottom" || linked == "top") && ESV.cc.currentElement != null) {
					var underlyingDataTypes = ESV.getUnderlyingDataTypes(ESV.cc.currentElement.id);
					for (var j = 0; j < underlyingDataTypes.length; j++) {
						if ($.inArray(underlyingDataTypes[j], dataTypes) == -1) {
							// This is a unique data type
							dataTypes.push(underlyingDataTypes[j]);
						}
					}
				}
			}
		}

		return dataTypes;
	}

	/**
	 * Finds all underlying data in the specifed field given a nodeID
	 * (a generalized version of method getUnderlyingDataTypes)
	 * @function getUnderlyingDataValues
	 * @param {Number} nodeID - Unique visualization node ID
	 * @param {String} structureType - (Optional) One of the structures listed in CONFIG.structures
	 * @param {String} fieldName - Field/attribute name to search the connected child nodes for
	 * @returns {Array} fieldValues - List of values for the searched field
	 * @memberof ESV
	 * @instance
	 */

	esv.getUnderlyingDataValues = function(nodeID, structureType, fieldName) {
		var vizObj = null;
		var dataValues = [];
		if (ESV.nodes.hasOwnProperty(nodeID)) {
			vizObj = ESV.nodes[nodeID];
			if (vizObj != null) {
				if (vizObj.filters.hasOwnProperty(fieldName)) {
					for (var i = 0; i < vizObj.filters[fieldName].fieldValues.length; i++) {
						dataValues.push(vizObj.filters[fieldName].fieldValues[i]);
					}
				} else {
					for (var i = 0; i < vizObj.children.length; i++) {
						var underlyingDataValues = ESV.getUnderlyingDataValues(vizObj.children[i], null, fieldName);
						for (var j = 0; j < underlyingDataValues.length; j++) {
							if ($.inArray(underlyingDataValues[j], dataValues) == -1) {
								// This is a unique data type
								dataValues.push(underlyingDataValues[j]);
							}
						}
					}
				}
			}
		} else {
			for (var i = 0; i < ESV.editor.structureStagingArray.length; i++) {
				vizObj = ESV.editor.structureStagingArray[i];
				if (vizObj.filters.hasOwnProperty(fieldName)) {
					for (var i = 0; i < vizObj.filters[fieldName].fieldValues.length; i++) {
						dataValues.push(vizObj.filters[fieldName].fieldValues[i]);
					}
				}
			}

			if (structureType != undefined && structureType != null && structureType != "") {
				// Check if the structure is linked to anything
				var linked = ESV.structures[structureType].linked;
				if ((linked == "bottom" || linked == "top") && ESV.cc.currentElement != null) {
					var underlyingDataValues = ESV.getUnderlyingDataValues(ESV.cc.currentElement.id, null, fieldName);
					for (var j = 0; j < underlyingDataValues.length; j++) {
						if ($.inArray(underlyingDataValues[j], dataValues) == -1) {
							// This is a unique data type
							dataValues.push(underlyingDataValues[j]);
						}
					}
				}
			}
		}

		return dataValues;
	}

	/**
	 * Returns a list of refrences to child nodes of the specified type
	 * @function getChildNodes
	 * @param {Number} nodeID - Unique visualization node ID
	 * @param {String} structureType - (Optional) One of the structures listed in CONFIG.structures
	 * @param {String} nodeType - Visualization node type to search for among child nodes - "data", "datafilter"
     * or "viewfilter" (the "view" nodes have no "parent" references)
	 * @returns {Array} nodes - List of visualization node configuration objects of the given type
	 * @memberof ESV
	 * @instance
	 */

	esv.getChildNodes = function(nodeID, structureType, nodeType) {
		var vizObj = null;
		var children = [];
		if (ESV.nodes.hasOwnProperty(nodeID)) {
			vizObj = ESV.nodes[nodeID];
			if (vizObj != null) {
				if ($.isArray(vizObj.children)) {
					for (var i = 0; i < vizObj.children.length; i++) {
						if (ESV.nodes[vizObj.children[i]].type == nodeType) {
							children.push(ESV.nodes[vizObj.children[i]]);
						}
						else {
							children = children.concat(esv.getChildNodes(ESV.nodes[vizObj.children[i]].id, structureType, nodeType));
						}
					}
				}
			}
		} else {
			if (structureType != undefined && structureType != null && structureType != "") {
				// Check if the structure is linked to anything
				var linked = ESV.structures[structureType].linked;
				if ((linked == "bottom" || linked == "top") && ESV.cc.currentElement != null) {
					children = children.concat(ESV.getChildNodes(ESV.cc.currentElement.id, null, nodeType));
				}
			}

			for (var i = 0; i < ESV.editor.structureStagingArray.length; i++) {
				vizObj = ESV.editor.structureStagingArray[i];
				if (vizObj.type == nodeType && vizObj.parents.length) {
					children.push(vizObj);
				}
			}

		}

		return children;
	}

	/**
	* Searches for overlapping data sets in the specified field
	* within two visualization objects, currently handles list data only
	* @function getOverlaps
	* @param {Number} vizObjID1 - First visualization node object ID
	* @param {Number} vizObjID2 - Virst visualization node object ID
	* @param {String} commonField - Field/attribute present in both nodes to compare
	* @param {Number} trackID - (Optional) Track object ID (found in visualization objects with multiple tracks, i.e. genomewide plot)
	* @returns {Array} - List of values found in the specified field/attribute in both nodes
	* @memberof ESV
	* @instance
	*/
	esv.dataOverlaps = function(vizObjID1, vizObjID2, commonField, trackID) {
		var dataSetCommon = [];
		if (!commonField) {
			return dataSetCommon;
		}

		var dataSet1 = ESV.nodes[vizObjID1][commonField];
		var dataSet2 = ESV.nodes[vizObjID2][commonField];

		if (trackID) {
			if (ESV.nodes[vizObjID1].isTrack) {
				for (var idx in ESV.nodes[vizObjID1].tracks) {
					if (ESV.nodes[vizObjID1].tracks[idx].id == trackID) {
						dataSet1 = ESV.nodes[vizObjID1].tracks[idx][commonField];
						break;
					}
				}
			}
			if (ESV.nodes[vizObjID2].isTrack) {
				for (var idx in ESV.nodes[vizObjID2].tracks) {
					if (ESV.nodes[vizObjID2].tracks[idx].id == trackID) {
						dataSet2 = ESV.nodes[vizObjID2].tracks[idx][commonField];
						break;
					}
				}
			}
		}

		if (!dataSet1 || !dataSet2) {
			return dataSetCommon;
		}
		for (var idx in dataSet1) {
			if (dataSet2.indexOf(dataSet1[idx]) != -1) {
				dataSetCommon.push(dataSet1[idx]);
			}
		}
		return dataSetCommon;
	}

	/**
	 * Returns the corresponding field configuraton given
	 * a data type and a field ID
	 * @function getFieldConfig
	 * @param {String} dataType - Analysis data type, e.g. mutationseq, titan
	 * @param {String} esid - Attribute field
	 * @returns {Object} - fieldConfig - Attribute field configuration
	 * @memberof ESV
	 * @instance
	 */
	 esv.getFieldConfig = function(dataType, esid) {
		var fieldConfig = {};
		if (CONFIG.editor.hasOwnProperty(dataType) && CONFIG.editor[dataType].hasOwnProperty('datafilter')) {
			var fieldIDs = Object.keys(CONFIG.editor[dataType].datafilter.fields);
			for (var idx in fieldIDs) {
				var field = CONFIG.editor[dataType].datafilter.fields[fieldIDs[idx]];
				if (field.hasOwnProperty('esid') && field.esid == esid) {
					fieldConfig = $.extend(true, {}, field);
					break;
				}
			}
		}
		return fieldConfig;
	 }

	/**
	 * Attempts to restore a saved state in case parameter visualization is present
	 * @function restoreSavedState
	 * @param {String} type - Stored configuration type - shared (default), published or template
	 * @param {String} storedViewID - (Optional) Stored configuration record ID
	 * @param {Object} patientSampleMap - (Optional) Object providing mapping patient to sample IDs, needed when generating per-patient view links
	 * @param {Array} omittedSamples - (Optional) - A list of samples which will be omitted when populating patient templates, generally in cases
     * when the specific patient ID doesn't have exactly two sample IDs assiciated with it
	 * @memberof ESV
	 * @instance
	 */
	esv.restoreSavedState = function(type, storedViewID, patientSampleMap, omittedSamples) {
		if ($.inArray(type, ["shared", "published", "template"]) == -1) {
			type = "shared";
		}
		storedViewID = storedViewID || esv.queryParams.visualization;

		if (!storedViewID && esv.queryParams.template_id) {
			storedViewID = esv.queryParams.template_id;
			type = "template";
		}
		else if (!storedViewID && esv.queryParams.dashboard) {
			storedViewID = esv.queryParams.dashboard.replace(/-/g, "");
			type = "dashboard";
		} 

		//get view by tag name, with the "dashboard=" url param
		if (storedViewID && type === "dashboard") {
			ESV.showLoading();				
			ESV.queries.getRecordByTagName(
				storedViewID,
				esv.config["URL_"+ type.toUpperCase() + "_PUBLISHED"],
				function(response) {
					var sample_ids = response.hits.hits[0]._source.sample_ids.join(" ");
					esv.loadViewFromTemplate(response.hits.hits[0]._source.dashboard, sample_ids);
					},
				function(error) {
					ESV.hideLoading();
				}
			);
		}//shared a link
		else if (storedViewID && type === "shared") {	
			ESV.showLoading();				
			ESV.queries.getRecordByID(
				storedViewID,
				esv.config["URL_"+ type.toUpperCase() + "_INDEX_SEARCH"],
				function(response) {
					ESV.viewTemplate = response;
					_restoreSavedState(response);
				},
				function(error) {
					ESV.hideLoading();
				}
			);

		}//acess view from browse menu 
		else if (storedViewID) {			
			ESV.showLoading();
			ESV.queries.getRecordByName(
				storedViewID,
				esv.config["URL_"+ type.toUpperCase() + "_INDEX_SEARCH"],
				function(response) {
					ESV.viewTemplate = response;
					_restoreSavedState(response);
				},
				function(error) {
					ESV.hideLoading();
					}
				);
		}
	
        /**
         * Invoked in the callback function upon fethcing the serialized state record,
         * de-serializes and restores the saved state.
         * @function _restoreSavedState
         * @param {Object} response - Query response object
         * @memberof ESV
         * @instance
         * @private
         * @inner
         */
		function _restoreSavedState(response) {
			if (response.hits.hits.length) {
				var timeout = Object.keys(ESV.nodes).length * 100;
				_removeAllPlots();
				setTimeout(function() {
					var savedState = response.hits.hits[0]._source;
					var viewTitle = savedState.title;
					var isPatientView = savedState.patient_view;

					savedState = savedState.hasOwnProperty('SAVED_STATE') ? JSON.parse(savedState.SAVED_STATE) : savedState;
					ESV.viewFromTemplate = type == "template";
					savedState = _populateTemplateNodes(savedState, viewTitle, isPatientView);
					var allSamples = ESV.getUnderlyingDataValues(null, null, "data-all-sample_id");
					var templateLinks = [];
					if ($.isEmptyObject(patientSampleMap) || !isPatientView) {
						$.each(allSamples, function(idx, sampleID) {
							templateLinks.push({
								title: sampleID,
								description: 'Data for sample ' + sampleID,
								templateID: storedViewID,
								sampleID: sampleID
							});
						});
					}
					esv.queryParams = {};
					if ($.isEmptyObject(patientSampleMap) || !isPatientView) {
						esv.openSerializedState(savedState);
					}
					ESV.hideLoading();
				}, timeout);
			}
			else {
				esv.notificationPopup('No saved state could be found.');
				ESV.hideLoading();
			}
		}
	}

	/**
	 * Generates a view given a template and a sample ID
	 * @function loadViewFromTemplate
	 * @param {String} templateID - Template record ID
	 * @param {String} sampleID - Tumour sample ID
	 * @memberof ESV
	 * @instance
	 */
	esv.loadViewFromTemplate = function(templateID, sampleID) {
		esv.queryParams.template_id = templateID;
		esv.queryParams.sample_id = sampleID;
		ESV.editor.structureStagingArray = [];
		ESV.editor.structureStagingIDMap = {};
		ESV.restoreSavedState();
	}

	/**
	 * Shows a hint popup below the given DOM object
	 * @function showHint
	 * @param {Object} $domObject - A DOM object beneath which the Hint will be displayed
	 * @param {String} hintMessage - Message text
	 * @param {Object} stylingOptions - any additional styling options to be applied to the help message pop-up
	 * @memberof ESV
	 * @instance
	 */
	esv.showHint = function($domObject, hintMessage, stylingOptions) {
		$('body > #hint-popup').remove();
		var domObjectPosition = $domObject.position();
		var popupTop = domObjectPosition.top + $domObject.height() + 10;
		var popupLeft = domObjectPosition.left - $domObject.width()/2;
		var popupStyling = 'top: ' + popupTop + 'px; left: ' + popupLeft + 'px; ';
		if (!$.isEmptyObject(stylingOptions)) {
			$.each(stylingOptions, function(key, value) {
				popupStyling += key + ': ' + value + '; '
			});
		}
		$('body').append('<div id="hint-popup" class="arrow-box arrow-box-7 animated pulse" style="' + popupStyling + '"><p>' + hintMessage + '</p></div>');
		// Remove the hint popup immediately after the element it's associated with is clicked
		$domObject.on('click', function(){
			$('body > #hint-popup').remove();
		});
		setTimeout(function() {
			$('body > #hint-popup').fadeOut(1000, function() { $(this).remove(); });
		}, 5000);
	}

	/**
	 * Updates the locally stored template
	 * @function updateLocalTemplate
	 * @memberof ESV
	 * @instance
	 */
	esv.updateLocalTemplate = function() {
		if (!ESV.viewFromTemplate || $.isEmptyObject(ESV.viewTemplate)) {
			return;
		}
		setTimeout(function() {
			console.log("Updating the locally stored template");
			_generateStoredViewConfig("template", ESV.viewTemplate.hits.hits[0]._source, true);
		}, 200);
	}

	/**
	 * Fills the missing data entries in a template before rendering the view/portrait
	 * @function _populateTemplateNodes
	 * @param {Object} storedTemplate - Template object containing all
	 * @param {String} viewTitle - Title for the generated view
	 * @param {Boolean} isPatientView - Specifies whether the template contains views with data from different samples in each dimension
	 * @memberof ESV
	 * @private
	 * @instance
	 */
	function _populateTemplateNodes(storedTemplate, viewTitle, isPatientView) {
		var sampleIDs = [];
		var viewDataNodes = {};
		if (esv.queryParams.sample_id) {
			sampleIDs = esv.queryParams.sample_id.split(/\s*\,\s*/);
		}
		for (var nodeID in storedTemplate.nodes) {
			if (storedTemplate.nodes[nodeID].type == "data") {
				if (!$.isEmptyObject(ESV.editor.structureStagingArray)) {
					storedTemplate.nodes[nodeID] = $.extend(true, {}, ESV.editor.structureStagingArray[0], storedTemplate.nodes[nodeID]);
				}
				else if (sampleIDs.length) {
					storedTemplate.nodes[nodeID].filters["data-all-sample_id"] = {};
					var templateField = ESV.editor.storedConfiguration.common.data.fields['data-all-sample_id'];
					for (var key in templateField) {
						if ($.inArray(key, ["esid", "id", "label", "fieldType"]) != -1) {
							storedTemplate.nodes[nodeID].filters["data-all-sample_id"][key] = templateField[key];
						}
					}
					storedTemplate.nodes[nodeID].filters["data-all-sample_id"].fieldValues = esv.queryParams.sample_id.split(/\s*\,\s*/);
					storedTemplate.nodes[nodeID].filters["data-all-sample_id"].nodeType = "data";
					storedTemplate.nodes[nodeID].info["data-all-title"] = [esv.queryParams.sample_id + ' - ' + viewTitle];
				}
			}
			else if ($.inArray(storedTemplate.nodes[nodeID].type, ["datafilter", "viewfilter"]) == -1) {
				$.each(storedTemplate.nodes[nodeID].info, function(key, value) {
					if (key == 'undefined') {
						delete storedTemplate.nodes[nodeID].info[key];
						return;
					}


					// Populate views which plot data from different samples in each axis (these are saved as empty arrays)
					if (!isPatientView && key.match(/sample-[x|y]$/)) {
						storedTemplate.nodes[nodeID].info[key] = ["none"];
					}
					else if (sampleIDs.length >= 2 && key.match(/sample-x$/) && storedTemplate.nodes[nodeID].info[key][0] == "template_field") {
						storedTemplate.nodes[nodeID].info[key] = [sampleIDs[0]];
					}
					else if (sampleIDs.length >= 2 && key.match(/sample-y$/) && storedTemplate.nodes[nodeID].info[key][0] == "template_field") {
						storedTemplate.nodes[nodeID].info[key] = [sampleIDs[1]];
					}
					else if (key == 'title') {
						if (isPatientView) {
							viewDataNodes[nodeID] = _getViewDataNodes(storedTemplate.nodes, nodeID);
						}
						else if (sampleIDs.length) {
							var viewTitle = storedTemplate.nodes[nodeID].info[key];
							if ($.isArray(viewTitle)) {
								viewTitle = viewTitle.join();
							}
							viewTitle = viewTitle.trim();
							viewTitle = sampleIDs.join(', ');
							storedTemplate.nodes[nodeID].info[key] = [viewTitle];
						}
					}		
				});					
				//Store the sample IDs
				storedTemplate.nodes[nodeID].sampleIDs = sampleIDs;
			}	
		}
		if (!$.isEmptyObject(viewDataNodes)) {
			for (var nodeID in viewDataNodes) {
				var dataNodes = viewDataNodes[nodeID];
				// in case a patient view is connected to two data nodes with the same data type, split the sampels
				if (sampleIDs.length == 2 && dataNodes.length == 2 && dataNodes[0].filters["data-all-type"].fieldValues[0] == dataNodes[0].filters["data-all-type"].fieldValues[0]) {
					for (var idx in dataNodes) {
						// In case the pair of nodes is connected to more than one view they might have been processed already
						if (dataNodes[idx].filters["data-all-sample_id"].fieldValues.length < 2) {
							break;
						}
						dataNodes[idx].filters["data-all-sample_id"].fieldValues = [dataNodes[idx].filters["data-all-sample_id"].fieldValues[idx]];
						var dataNodeTitle = dataNodes[idx].info["data-all-title"][0].trim();
						dataNodeTitle = dataNodes[idx].filters["data-all-sample_id"].fieldValues[0] + (dataNodeTitle ? ' -' + dataNodeTitle.split(/-/).splice(1) : '');
						dataNodes[idx].info["data-all-title"] = [dataNodeTitle];
					}
				}
			}
			// Now that the data sets have been properly configured, updated the view titles accordingly
			for (var nodeID in viewDataNodes) {
				var viewTitle = storedTemplate.nodes[nodeID].info["title"];
				if ($.isArray(viewTitle)) {
					viewTitle = viewTitle.join();
				}
				viewTitle = viewTitle.trim();
				var dataNodesSamples = $.map(viewDataNodes[nodeID], function(node) {
					if (node.filters["data-all-sample_id"]) {
						return node.filters["data-all-sample_id"].fieldValues.join(', ');
					}
				}).join(', ');
				viewTitle = dataNodesSamples;
				storedTemplate.nodes[nodeID].info["title"] = [viewTitle];
			}
		}

		return storedTemplate;
	}

	/**
	 * Returns a list of data nodes connected to the node with the given node IDs
	 * @function _getViewDataNodes
	 * @param {Object} nodes - Object with references to all nodes
	 * @param {String} nodeID - Unique identifier for the node
	 * @returns {Array} dataNodes - An array of nodes connected to the one with the provided ID
	 * @memberof ESV
	 * @instance
	 * @private
	 */
	function _getViewDataNodes(nodes, nodeID) {
		var dataNodes = [];
		if (nodes[nodeID].type == "data") {
			dataNodes.push(nodes[nodeID]);
		}
		else if (nodes[nodeID].children.length) {
			for (var idx in nodes[nodeID].children) {
				var childNodeID = nodes[nodeID].children[idx];
				dataNodes = dataNodes.concat(_getViewDataNodes(nodes, childNodeID));
			}
		}
		return dataNodes;
	}

	/**
	 * Stores a serialized view configuration for subsequent retreival or updates an existing one's title, description or search tag
	 * @function _storeView
	 * @param {String} type - stored configuration type - shared (default), published or template
	 * @param {object} viewProperties - (optional) Provided when an existing view or template is being updated
	 * @memberof ESV
	 * @private
	 * @instance
	 */

	function _storeView(type, viewProperties) {

		if ($.inArray(type, ["shared", "template"]) == -1) {
			type = "shared";
		}

		ESV.showLoading();

		var _id;
		if (!$.isEmptyObject(viewProperties)) {
			_id = viewProperties._id;
			delete viewProperties._id;
		}

		var storedObject = !$.isEmptyObject(viewProperties) && viewProperties.SAVED_CONFIG ? viewProperties : _generateStoredViewConfig(type, viewProperties);

		ESV.queries.indexRecord(
			storedObject,
			esv.config["URL_" + type.toUpperCase() + "_INDEX_SAVE"] + (_id ? "/" + _id : ""),
			function(response) {
				ESV.hideLoading();

				if (response.created) {
					if (type == "template") {
						esv.notificationPopup("Template with record ID <strong>" + response._id + "</strong><br/>has been created.");
						setTimeout(function() {
							$('#template-filter-term').trigger('keyup');
						}, 1200);
					}
					else {
						var linkUrl = location.href.replace(location.search, '').replace('#', '') +
							"?visualization=" + response._id;
						esv.shareLinkPopup(linkUrl);
					}
				}
				else if (response._version > 1) {
					if (type == "template") {
						esv.notificationPopup("Template with record ID  <strong>" + response._id + "</strong><br/>has been updated.");
					}
					setTimeout(function() {
						$('#template-filter-term').trigger('keyup');
					}, 1200);
				}
				else {
					esv.notificationPopup('');
				}
			}
		);
	}

	/**
	 * Generates serialized view configuration for subsequent retreival,
	 * @function _generateStoredViewConfig
	 * @param {String} type - Stored configuration type - shared (default), published or template
	 * @param {Object} viewProperties - (Optional) Existing stored configuration to edit. If provided the related record will be updated.
	 * @param {Boolean} updatingLocalTemplate - (Options) Flag specifying whether a locally stored template is being updated
	 * @memberof ESV
	 * @instance
	 * @private
	 */

	function _generateStoredViewConfig(type, viewProperties, updatingLocalTemplate) {

		var timestamp = new Date().toJSON();
		var storedObject = {"timestamp": timestamp};

		var serializedObj = ESV.serializeState();

		// Get the data types and replace any sample/project/tumor type specific
		// data in case the configuration will be saved as a template
		if (type == "template") {
			serializedObj = $.extend(true, {}, serializedObj);
			storedObject[ESV.mappings.dataType] = $.map(Object.keys(serializedObj.nodes), function(key){
				var node = serializedObj.nodes[key];
				if (node.type == 'data') {
					for (var filter in node.filters) {
						if (filter != 'data-all-type') {
							delete node.filters[filter];
						}
					}
					for (var infoItem in node.info) {
						delete node.info[infoItem];
					}
					return node.filters['data-all-type'].fieldValues[0];
				}
				else if ($.inArray(node.type, ["datafilter", "viewfilter"]) == -1) {
					for (var key in node) {
						if ($.inArray(key, ["sampleIDs", "sourceIDs", "sampleIndex", "indexList", "searchIndex"]) != -1) {
							delete node[key];
						}
					}
					var sampleInputs = $.map(Object.keys(node.info), function(key) {
						if (key == "title" && updatingLocalTemplate) {
							// Remove any added sample references to the view
							var origTitle = $.isArray(node.info[key]) ? node.info[key][0].split(/\s*\-\s*/) : node.info[key].split(/\s*\-\s*/);
							if (origTitle.length < 2) {
								origTitle = [""];
							}
							else {
								origTitle.shift();
							}
							node.info[key] = origTitle;
						}
						if (key.match(/-sample-[x|y]$/)) {
							return key;
						}
					});
					if (sampleInputs.length == 2) {
						if (node.info[sampleInputs[0]] != 'none' && node.info[sampleInputs[1]] != 'none' && node.info[sampleInputs[0]] != node.info[sampleInputs[1]]) {
							node.info[sampleInputs[0]] = ["template_field"];
							node.info[sampleInputs[1]] = ["template_field"];
						}
						else {
							node.info[sampleInputs[0]] = ["none"];
							node.info[sampleInputs[1]] = ["none"];
						}
					}
				}

			});
		}

		storedObject["SAVED_STATE"] = JSON.stringify(serializedObj);

		return $.extend(true, viewProperties, storedObject);
	}

	/**
	 * Removes all plots from the view area
	 * function _removeAllPlosts
	 * @memberof ESV
	 * @private
	 * @instance
	 */
	function _removeAllPlots() {
		ESV.viewfacades.resetViewFacades();
		ESV.nodes = {};
		ESV.viewFromTemplate = false;
		$($('#view-area [id^=container-]').get().reverse()).each(function() {
			ESV.gridster.remove_widget($(this).hide());
		});
		var elements = {nodes: [], edges: []};
		ESV.cc.init(elements);
		ESV.editor.emptyPanel(CONFIG.messages.emptyEditPanel);
	}


	return esv;
}(ESV || {}));
