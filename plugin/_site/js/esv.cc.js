/**
 * ESV CC
 * <br/><br/>
 * This modules provides functions used to generate, interract and manipulate the structure diagram depicting
 * related plots and visualization portraits. The nodes in a complete branch (from data to view node) represent
 * the individual steps involved in building a specific visualization. Each node is associated with an actual
 * data, datafilter, viewfilter or a specific view node, which are in turn translated into query clauses. Similarly,
 * structure diagram graph trees can be associated with corresponding query trees produced by the 'queries' module.
 * Through the underlying data, graph nodes can interact with the ESV.editor module as clicking on a node would open
 * the relevant form in the editor panel allowing to edit the applied query filters.
 * This functionality is implemented using cytoscape.js.
 *
 * @author: Tom Jin
 * @namespace ESV.cc
 */

ESV.cc = (function (esv) {
	
	// Local properties related to the cytoscape diagram
	var config = {
	}
	
	/**
	 * Initializes the CC plugin (the top left diagram)
	 * @function init
 	 * @param {Object} elements - Contains two arrays, edges and nodes that defines the CC diagram
 	 * @param {Number} activeViewID (optional) - The id of the node that should be highlighted by default
	 * @memberof ESV.cc
	 * @instance
	 */
	esv.init = function(elements, activeViewID) {

		esv.elements = elements;
		esv.currentElement = null; // currentElement is the node that is currently being clicked or hovered over 
	
		// Sets the default properties of the cytoscape plugin
		$('#cy').cytoscape({
		  	style: function() {
		  		var style = cytoscape.stylesheet();
				style = style.selector('.cy-viz-node').css({
					'content': 'v',
					'shape': 'data(shape)',
					'color': '#2196f3',
					'font-size': '14px',
					'width': '32px',
					'height': '32px',
					'text-valign': 'center',
					'text-outline-width': 0,
					'text-outline-color': '#2196f3',
					'background-color': '#F8F7F3',
					'border-color': '#2196f3',
					'border-width': 3,
					'border-opacity': 1.0
				})
				.selector('.cy-data-node').css({
					'content': 'd',
					'shape': 'data(shape)',
					'color': '#ac205e',
					'font-size': '14px',
					'width': '24px',
					'height': '24px',
					'text-valign': 'center',
					'text-outline-width': 0,
					'text-outline-color': '#ac205e',
					'background-color': '#F8F7F3',
					'border-color': '#ac205e',
					'border-width': 3,
					'border-opacity': 1.0
				})
				.selector('.cy-vizfilter-node').css({
					'content': '',
					'shape': 'data(shape)',
					'color': '#2196f3',
					'font-size': '8px',
					'width': '14px',
					'height': '14px',
					'background-color': '#5cb85c',
					'border-color': '#5cb85c',
					'border-width': 0,
					'opacity': 1.0
				})
				.selector('.cy-datafilter-node').css({
					'content': '',
					'shape': 'data(shape)',
					'color': '#2196f3',
					'font-size': '8px',
					'width': '14px',
					'height': '14px',
					'background-color': '#5cb85c',
					'border-color': '#5cb85c',
					'border-width': 0,
					'opacity': 1.0
				})
				.selector('.cy-highlight').css({
					'overlay-color': '#7e7e7e',
					'overlay-padding': '8px',
					'overlay-opacity': 0.4
				})
				.selector(".cy-highlight-path").css({
					'width': 5
				});
				
				// Find the appropriate icon to display if the node is a specific view (ie. histogram)
				$.each(ESV.properties, function(type, property) {
					if (type != 'view' && type != 'data' && type != 'datafilter' && type != 'viewfilter') {
						style = style.selector('.cy-' + type + '-node').css({
							'content': '',
							'background-image': property.icon,
        					'background-fit': 'cover',
        					'shape': 'rectangle',
							'font-size': '8px',
							'width': '28px',
							'height': '28px',
							'border-width': 0,
							'opacity': 1.0 
						});
					}
				});
				
				return style;
		  }(),

		  elements: elements,
		  
		  layout: {
			name: 'breadthfirst', // This allows for the tree like structure
			padding: 20,
			directed: true,
			animate: false,
			animationDuration: 800
			// roots: ('[name="Data"]'),
		  },
		  
		  ready: function(){
			window.cy = this;

			// Default cytoscape properties
			cy.boxSelectionEnabled(false);
			cy.minZoom(0.5);
			cy.maxZoom(4);
			cy.zoom(1);
			cy.center();
			
			// Adds the listener when a node is selected
			cy.on('tap', 'node', function(e){

			  	ESV.cc.selectNode(e.cyTarget);

			  	var node = e.cyTarget; 
			  	var nodeData = node._private.data;
			  	var id = nodeData.id;

			  	if (e) {
						var node = e.cyTarget;
						var nodeData = node._private.data;

						ESV.cc.currentElement = nodeData;

						// x, y represent the coordinates of the toolbar while xOffset determines
						// how far away from a node the toolbar should be (some nodes are smaller so
						// require a smaller offset)
						var x, y, xOffset = 0;
						
						// Hides all menu items before deciding what options are available at this point
						$('.cy-toolbar-item').hide();

						switch (nodeData.type) {
							case "viewfilter":
								$('#cy-toolbar-title').html('<strong>Region Filter</strong><br>');
								$('#cy-add-view').show();
								$('#cy-add-existing-view').show();
								$('#cy-delete-viewfilter').data('vizID', nodeData.id);
								$('#cy-delete-viewfilter').show();
								$('#cy-add-data').show();
								$('#cy-add-track').show();
								xOffset = 18;
								node.css({ 'width': '20px', 'height': '20px'}); 
								break;
							case "datafilter":
								$('#cy-toolbar-title').html('<strong>Dataset Filter</strong><br>');
								$('#cy-add-view').show();
								$('#cy-delete-datafilter').data('vizID', nodeData.id);
								$('#cy-delete-datafilter').show();
								// Don't allow a track to be added from the data filter node (must be from the view filter)
								var vizObj = ESV.nodes[nodeData.id];
								if (!vizObj.isTrack) {
									$('#cy-add-data').show();
								}
								xOffset = 18;
								node.css({ 'width': '20px', 'height': '20px'});
								break;
							case "data":
								var vizObj = ESV.nodes[nodeData.id];
								var dataTitle = "";
								if (vizObj.info.hasOwnProperty("data-all-title")) {
									dataTitle = vizObj.info["data-all-title"];
								}
								$('#cy-toolbar-title').html('<strong>Dataset - ' + dataTitle + '</strong><br>');
								$('#cy-add-view').show();
								$('#cy-delete-data').data('vizID', nodeData.id);
								$('#cy-delete-data').show();
								xOffset = 24;
								break;
							default:
								// The remaining should be options related to the various types of views
								var vizObj = ESV.nodes[nodeData.id];
								$('#cy-toolbar-title').html('<strong>View - ' + vizObj.info.title + '</strong><br />');
								$('#cy-delete-view').data('vizID', nodeData.id);
								$('#cy-delete-view').show();
								xOffset = 28;
								break;
						}
						
						// Defines where the popup position should be
						x = $('#cy').offset().left + node.renderedPosition().x + xOffset;
						y = $('#cy').offset().top + node.renderedPosition().y - ($('#cy-toolbar').height() / 2);
						$('#cy-toolbar').css({
							'left':  x,
							'top':   y
						});

						// Shows the popup
						$('#cy-toolbar').fadeIn(100);
						$('#cy-toolbar .arrow').css('pointer-events', 'auto');
				}	
			});

			// Adds the listener when a node is hovered over
			cy.on('mouseover', 'node', function(e) {
				if (e) {

						var node = e.cyTarget;
						var nodeData = node._private.data;

						// x, y represent the coordinates of the toolbar while xOffset determines
						// how far away from a node the toolbar should be (some nodes are smaller so
						// require a smaller offset)
						var x, y, xOffset = 0;
						
						// Hides all menu items before deciding what options are available at this point
						$('.cy-toolbar-item').hide();

						switch (nodeData.type) {
							case "viewfilter":
								$('#cy-toolbar-title').html('<strong>Region Filter</strong><br>');
								node.css({ 'width': '20px', 'height': '20px'}); 
								xOffset = 18;
								break;
							case "datafilter":
								$('#cy-toolbar-title').html('<strong>Dataset Filter</strong><br>');
								node.css({ 'width': '20px', 'height': '20px'});
								xOffset = 18;
								break;
							case "data":
								var vizObj = ESV.nodes[nodeData.id];
								var dataTitle = "";
								if (vizObj && vizObj.info.hasOwnProperty("data-all-title")) {
									dataTitle = vizObj.info["data-all-title"];
								}
								$('#cy-toolbar-title').html('<strong>Dataset - ' + dataTitle + '</strong><br>');
								xOffset = 18;
								break;
							default:
								var vizObj = ESV.nodes[nodeData.id];
								$('#cy-toolbar-title').html('<strong>View - ' + vizObj.info.title + '</strong><br />');
								xOffset = 18;
								break;
						}

						// Defines where the popup position should be
						x = $('#cy').offset().left + node.renderedPosition().x + xOffset;
						y = $('#cy').offset().top + node.renderedPosition().y - ($('#cy-toolbar').height() / 2);
						$('#cy-toolbar').css({
							'left':  x,
							'top':   y
						});

						// Shows the popup
						$('#cy-toolbar').fadeIn(100);	

				}
			});
			
			// Adds the listener when the mouse leaves the node
			cy.on('mouseout', 'node', function(e){
				if (!($('#cy-toolbar').is(":visible") && $('#cy-toolbar').is(":hover"))) {
					$('#cy-toolbar').fadeOut(100);
					$('#cy-toolbar .arrow').css('pointer-events', 'none');
				}

				var node = e.cyTarget; 
 				var nodeData = node._private.data; 
 				var id = nodeData.id;

 				if(nodeData.type == 'datafilter' || nodeData.type == 'viewfilter'){
 					node.css({'width': 14, 'height': 14}); 
 				} 

			});
			
			// Adds the general listener, clears all selected nodes 
			cy.on('tap', function(e) {
				if( e.cyTarget === cy ){
					ESV.cc.unSelectAllNodes();
					_openTab("browse");
				}
			});

			cy.on('mouseover', 'edge', function(e){
				var edge = e.cyTarget;
				var edgeData = edge._private.data;

				if(edgeData.type == 'edge'){
				}
			})
			
			_initializeToolbarEvents();


			// Put highlight on the newest View added
			var allViews = cy.nodes('[name="View"]');
			var newView = allViews[allViews.length - 1];
			_highlightView(newView);

			// Set the active view if it exists
			if (activeViewID != null && activeViewID != undefined) {
				ESV.cc.setActiveView(activeViewID);
			}
		  }

		});
	
		// Ensures that the popup does not become hidden when it is being hovered over and change the position of the popup
		$(document).on('mousemove', function(e){
			if (!$('#cy').is(":hover") && !$('#cy-toolbar').is(":hover")) {
				if ($('#cy-toolbar').is(":visible")) {
					$('#cy-toolbar').fadeOut(100);
				}
			}
			if ($('#viz-popup').is(":visible")) {
				var left = e.clientX + 16;
				var top = e.clientY + 16;
				
				if ((left + $('#viz-popup').width()) >= ($(window).width() - 4)) {
					left = e.clientX - (4 + $('#viz-popup').width());
				}
				
				if ((top + $('#viz-popup').height()) >= ($(window).height() - 4)) {
					top = e.clientY - (4 + $('#viz-popup').height());
				}
				
				$('#viz-popup').css({
				   left: left,
				   top: top
				});
			}
			if ($('#viz-popup-s').is(":visible")) {
				var left = e.clientX + 16;
				var top = e.clientY + 16;
				
				if ((left + $('#viz-popup-s').width()) >= ($(window).width() - 4)) {
					left = e.clientX - (4 + $('#viz-popup-s').width());
				}
				
				if ((top + $('#viz-popup-s').height()) >= ($(window).height() - 4)) {
					top = e.clientY - (4 + $('#viz-popup-s').height());
				}
				
				$('#viz-popup-s').css({
				   left: left,
				   top: top
				});
			}
		});
	};

	/**
	 * Hightlights the path between given nodes
	 * @function highlightPath
	 * @param {Number} source - Source node ID
	 * @param {Number} target - Target node ID
	 * @param {Boolean} unhiglightPaths
	 * @memberof ESV.cc
	 * @instance
	 */
	esv.highlightPath = function(source, target, unhighlightPaths) {

		if (unhighlightPaths) {
			// Unhighlight all paths first
			$.each(cy.elements(), function(i) {
				if (this._private && this._private.group == "edges") {
					cy.elements()[i].removeClass("cy-highlight-path");
				}
			});
		}

		// Highlight the path of this tree
		var dijkstra = cy.elements().dijkstra("#" + source, 1, false);
		var bfs = dijkstra.pathTo(cy.$("#" + target));
		var x = 0;
		var highlightNextPath = function() {
			var elem = bfs[x];
			if (elem) {
				var group = elem._private.group;
				if (group == "edges") {
					elem.addClass("cy-highlight-path");
				}
				if (x < bfs.length) {
					x++;
					highlightNextPath();
				}
			}
		};
		highlightNextPath();
	}
	
	/**
	 * Highlights one of the Cytoscape nodes
	 * @function selectNode
 	 * @param {Object} node - An internal Cytoscape cyTarget object
	 * @memberof ESV.cc
	 * @instance
	 */
	esv.selectNode = function(node) {
		var nodeData = node._private.data;
		var vizObj = ESV.nodes[nodeData.id];

		// Remove highlight off previous node
		_removeHighlight();
		_shrinkFilters();

		node.addClass('cy-highlight');

		//Change the colour for all other unchoosen panels
		$(".panel-heading").find('div').find('span').addClass("dropdownMenu-w");
		$(".panel-heading").removeClass("panel-blue");
		$(".panel-heading").find('a').removeClass("close-viz-w");
		$(".panel-heading").find('a').addClass("close-viz");
		$(".panel-heading").find('div').find('span').addClass("dropdownMenu-w");

		if (nodeData.type != "data" && nodeData.type != "datafilter" && nodeData.type != "viewfilter") {
			var vizID = parseInt(nodeData.id);
			// Select the corresponding panel in the view area
			$(".panel-heading").removeClass("panel-blue");
			$("#container-" + vizID + " .panel-heading").addClass("panel-blue");
			$("#container-" + vizID + " .panel-heading").find('a').removeClass("close-viz");
			$("#container-" + vizID + " .panel-heading").find('a').addClass("close-viz-w");
			$("#container-" + vizID + " .panel-heading").find('div').find('span').removeClass("dropdownMenu-w");
			
		}

		_openTab("edit");
		ESV.editor.renderEditPanel(nodeData);
		ESV.cc.currentElement = nodeData;

		// Highlight path
		var sourceNodeId, targetNodeId, viewNode;
		if (vizObj.type == "data") {
			var reset = true;
			targetNodeId = vizObj.id;

			var dataFilters = vizObj.parents;
			$.each(dataFilters, function() {
				var node = ESV.nodes[this];
				var viewFilters = node.parents;
				$.each(viewFilters, function() {
					var node = ESV.nodes[this];
					var views = node.parents;
					$.each(views, function(i) {
						var node = ESV.nodes[this];
						sourceNodeId = node.id;
						esv.highlightPath(sourceNodeId, targetNodeId, reset);
						reset = false;
						viewNode = node;
						node.currentTreeIndex = vizObj.treeIndex;
					});
				});
			});
		}
		else if (vizObj.type == "datafilter") {
			var reset = true;
			var dataNodes = vizObj.children;
			$.each(dataNodes, function() {
				var dataFilters = ESV.nodes[this].parents;
				targetNodeId = this;
				$.each(dataFilters, function() {
					var node = ESV.nodes[this];
					var viewFilters = node.parents;
					$.each(viewFilters, function() {
						var node = ESV.nodes[this];
						var views = node.parents;
						$.each(views, function(i) {
							var node = ESV.nodes[this];
							sourceNodeId = node.id;
							esv.highlightPath(sourceNodeId, targetNodeId, reset);
							reset = false;
							viewNode = node;
							node.currentTreeIndex = vizObj.treeIndex;
						});
					});
				});				
			});
		}
		else if (vizObj.type == "viewfilter") {
			var reset = true;
			var dataFilters = vizObj.children;
			var length = dataFilters.length;
			$.each(dataFilters, function(i) {
				var dataNodes = ESV.nodes[this].children;
				$.each(dataNodes, function(j) {
					var dataFilters = ESV.nodes[this].parents;
					targetNodeId = this;
					$.each(dataFilters, function(k) {
						var node = ESV.nodes[this];
						var viewFilters = node.parents;
						if (length == 1) {
							viewFilters = [ vizObj.id ];
						}
						$.each(viewFilters, function(x) {
							var node = ESV.nodes[this];
							var views = node.parents;
							$.each(views, function(i) {
								var node = ESV.nodes[this];
								sourceNodeId = node.id;
								esv.highlightPath(sourceNodeId, targetNodeId, reset);
								reset = false;
								viewNode = node;
								node.currentTreeIndex = vizObj.treeIndex;
							});
						});
					});				
				});
			});
		}
		else {
			var reset = true; 
			sourceNodeId = vizObj.id;
			viewNode = vizObj;

			if (!viewNode.isTrack) {
				var viewFilters = vizObj.children;
				$.each(viewFilters, function() {
					var node = ESV.nodes[this];
					var dataFilters = node.children;
					$.each(dataFilters, function() {
						var node = ESV.nodes[this];
						var dataNodes = node.children;
						$.each(dataNodes, function() {
							targetNodeId = this;
							esv.highlightPath(sourceNodeId, targetNodeId, reset);
							reset = false;
						});
					});
				});
			}
		}

		if (vizObj.isTrack) {
			d3.selectAll(".trackBar").style("background-color", "#f5f5f5");

			if (viewNode.tracks) {
				var track = viewNode.tracks[viewNode.currentTreeIndex];
				if (track) {
					track.view.trackBar.style("background-color", "#2196f3");
				}
			}
		}

		if (vizObj.isTrack && vizObj.type != "data" && vizObj.type != "datafilter" && vizObj.type != "viewfilter") {
			$("#edit-genomewide-form-0").children().remove();
		
			var parentNode = ESV.nodes[vizObj.id];
			var track = parentNode.tracks[parentNode.currentTreeIndex];
			ESV.editor.populateEditPanel(track.id, 0, true, track.view.dataType);
		}
	};
	
	/**
	 * Unselects all the nodes and removes the active state on all the views
	 * @function unselectAllNodes
	 * @param {Boolean} hack - HACK: Oddly enough, Cytoscape doesn't quite reset itself to the full opacity when 
	 * when all the nodes are unselected unless it is called twice with a pause in between
	 * @memberof ESV.cc
	 * @instance
	 */
	esv.unSelectAllNodes = function(hack) {
		ESV.cc.currentElement = null;
		
		// Removes panel heading color
		$('.panel-heading').removeClass('panel-blue');

		_removeHighlight();
		_shrinkFilters();		
		
		// Resets the sidebar with the right values
		ESV.editor.emptyPanel(CONFIG.messages.emptyEditPanel);
		ESV.editor.renderBrowsePanelWithViews();
		
		// Close icons need color change
		$('.close-viz-w').addClass('close-viz');
		$('.close-viz-w').removeClass('close-viz-w');
		$(".panel-heading").find('div').find('span').addClass("dropdownMenu-w");
	};
	
	/**
	 * Sets a node as active (ie. called when a view is selected in the view area)
	 * @function setActiveView
 	 * @param {Number} vizID - The ID of the node that should be set as active
	 * @memberof ESV.cc
	 * @instance
	 */
	esv.setActiveView = function(vizID) {
		var elements = cy.elements();
		for (var i = 0; i < elements.length; i++) {
			if (elements[i].id() == vizID) {
					ESV.cc.selectNode(elements[i]);	
					break;
			}
		}
	}

	/**
	 * Matched the nodeID given to the node in the cy collection.
	 * @function findElement
	 * @param {Number} VizID - Unique node ID
	 * @memberof ESV.cc
	 * @instance
	 */
	esv.findElement = function(vizID) {
		var elements = cy.elements();
		for (var i = 0; i < elements.length; i++) {
			if (elements[i].id() == vizID) {
				break;
			}
		}
		return elements[i];
	}

	/**
	 * Adds a new node to the tree diagram, call ESV.cc.addEdge(...) to link the node to other nodes in the tree
	 * @function addNode
 	 * @param {Number} nodeID - ID of the node being added
 	 * @param {String} nodeType - One of the following: data, datafilter, viewfilter or a specific view type (i.e. linegraph, barchart)
	 * @memberof ESV.cc
	 * @instance
	 */
	esv.addNode = function(nodeID, nodeType, treeID) {
		// var newNodes =[];
		if (nodeType) {
			var name = "";
			var className = "";
			var shape = "";
			var isView = false;
			var type = "";
			
			var id = null;
			if (nodeID == null) {
				id = ESV.generateID();
			} else {
				id = nodeID.toString();
			}
			
			switch (nodeType) {
				case 'data':
					name = "Data";
					className = "cy-data-node";
					shape = "ellipse";
					treeID = treeID;
					break;
				case 'datafilter':
					name = "Data Filter";
					className = "cy-datafilter-node";
					shape = "ellipse";
					treeID = treeID;
					break;
				case 'viewfilter':
					name = "Region Filter";
					className = "cy-vizfilter-node";
					shape = "triangle";
					treeID = treeID;
					break;
				default:
					name = "View";
					className = "cy-" + nodeType + "-node";
					shape = "rectangle";
					isView = true;
					treeID = treeID;
					break;
			}
			
			// Adds a new node to cy
			var node = {
				group: "nodes",
				data: {
					id: id,
					name: name,
					type: nodeType,
					treeID: treeID,
				},
				classes: className,
			};

			if (shape != "") {
				node.data.shape = shape;
			}
			ESV.cc.elements.nodes.push(node);
			// cy.add(node);
		}
	}
	
	/**
	 * Adds a new "undirected" edge to the diagram. Edges should point downward currentNodeID -> targetNodeID
	 * @function addEdge
 	 * @param {Number} currentNodeID - ID of the edge source node
 	 * @param {Number} targetNodeID - ID of the edge target node
	 * @memberof ESV.cc
	 * @instance
	 */
	esv.addEdge = function(currentNodeID, targetNodeID) {
		var edge = {
			group: "edges",
			data: {
				source: currentNodeID.toString(),
				target: targetNodeID.toString(),
				type: 'edge',
			}
		};
		ESV.cc.elements.edges.push(edge);
		// cy.add(edge);
	}

	/**
	 * Reloads the diagram (ie. called when a node is deleted)
	 * @function reloadGraph
 	 * @param {Number} activeNodeID - The node that should be highlighted after the diagram is reloaded
	 * @memberof ESV.cc
	 * @instance
	 */
	esv.reloadGraph = function(activeNodeID) {
		var elements = ESV.cc.elements;
		// var checkEle = cy.elements();
		// var check2 = [];
		
		// for(var i = 0; i < checkEle.length; i++){
		// 	var data = checkEle[i]._private.data;
		// 	var group = checkEle[i]._private.group;

		// 	check2.push({
		// 			"data": data,
		// 			"group": group
		// 	})
		// }

		// if(check2.length >= 8){
		// 	cy.layout({
		// 		name: "breadthfirst",
		// 		padding: 30,
		// 		roots : ('[name = "Data"]'),
		// 		animate: true,
		// 		animationDuration: 600
		// 	})

		// 	// setTimeout(function(){
		// 	// 	_checkEdgeCrossings();
		// 	// }, 550);	

		// } else {
			$('#cy').empty(); 
			ESV.cc.init(elements, activeNodeID);
		// }
	}
	
	/**
	 * Deletes a node from the diagram, also travels down the tree deleting any unbranched nodes
	 * @functon deleteNode
 	 * @param {Number} vizID - Visualization configuration object ID (vizObj.id)
 	 * @param {Boolean} deleteData - True if the underlying data source should be deleted (if applicable)
	 * @param {Boolean} keepCurrentTab - specifies whether to switch panels after the action completes
	 * @memberof ESV
	 * @instance
	 */
	esv.deleteNode = function(vizID, deleteData, keepCurrentTab) {
		var childID = null;
		if (ESV.nodes[vizID] == null || ESV.nodes[vizID] == undefined) {
			return;
		}
		
		// For each view, find out all the nodes that constitute it
		// After the nodes are deleted, find out of any of the nodes that constitute each view has changed
		// For those views that have changed, refresh that view
		var viewIDChildrenMap = {};
		$.each(ESV.nodes, function(nodeID, node) {
			if (nodeID != vizID && (ESV.nodes[nodeID].type != "data" && ESV.nodes[nodeID].type != "datafilter" && ESV.nodes[nodeID].type != "viewfilter")) {
				viewIDChildrenMap[nodeID] = ESV.editor.getAllChildrenNodes(nodeID);
			}
		});
		
		_deleteNodeTreeUp(vizID, deleteData, false);
		_deleteNodeTreeDown(vizID, deleteData, false);
		_deleteSingleNode(vizID, "both");
		
		var activeID = null;
		var node = cy.$('#'+ vizID);
		
		// cy.remove(node);
		ESV.cc.reloadGraph(activeID);
		
		// Make the child node active
		ESV.cc.setActiveView(activeID);
		
		// Open the create panel
		if (!keepCurrentTab) {
			_openTab("create");
		}
		
		var viewsToUpdate = [];
		$.each(ESV.nodes, function(nodeID, node) {
			if (nodeID != vizID && (ESV.nodes[nodeID].type != "data" && ESV.nodes[nodeID].type != "datafilter" && ESV.nodes[nodeID].type != "viewfilter")) {
				if (viewIDChildrenMap.hasOwnProperty(nodeID)) {
					var originalChildren = viewIDChildrenMap[nodeID];
					var newChildren = ESV.editor.getAllChildrenNodes(nodeID);
					if (originalChildren.length != newChildren.length) {
						viewsToUpdate.push(nodeID); 
						return;
					} else {
						for (var i = 0; i < originalChildren.length; i++) {
							if ($.inArray(originalChildren[i], newChildren) == -1) {
								// If one of the original child does not exist in the new children list, the view must be refreshed
								viewsToUpdate.push(nodeID);
								return;
							}
						}
					}
				}
			}
		});
		
		// Update all the remaining views that were affected by this deleted node
		for (var i = 0; i < viewsToUpdate.length; i++) {
			var vizObj = ESV.nodes[viewsToUpdate[i]];
			if (vizObj.isTrack) {
				vizObj.deletedNodeID = vizID;
			}
			ESV[vizObj.viewType].update(vizObj, null, false);
		}
	}


	// === PRIVATE FUNCTIONS ===

	/**
	 * Opens the specified panel
	 * @function _openTab
	 * @param {String} action - the panel to open, i.e. "create", "edit", "browse", defaults to "create"
	 * @memberof ESV.cc
	 * @instance
	 * @private
	 */
	function _openTab(action) {
		action = action || "create"
		$('#sidebar [id$="-element-tab"]').each(function() {
			var elementID = $(this).children('a').first().attr('href');
			if ($(this).attr("id").match(RegExp('^' + action))) {
				$(this).addClass("active");
				$(elementID).addClass("in").addClass("active");
				return;
			}
			$(this).removeClass("active");
			$(elementID).removeClass("in").removeClass("active");
		});
	}
	
	/**
	 * Initializes all the handlers related to the popup panel of the tree diagram
	 * @function _initializeToolbarEvents
	 * @memberof ESV.cc
	 * @private
	 * @instance
	 */
	function _initializeToolbarEvents() {
		$('#cy-add-view').click(function() {
			_openTab("create");
			_removeHighlight();
			_shrinkFilters();
			
			var currentElementID = parseInt(ESV.cc.currentElement.id);
			var currentNode = ESV.nodes[currentElementID];
			if (currentNode.type == "data") {
				ESV.editor.initStructureCreation("viewFromData");
			} else if (currentNode.type == "datafilter") {
				ESV.editor.initStructureCreation("viewFromDataFilter");
			} else if (currentNode.type == "viewfilter") {
				ESV.editor.initStructureCreation("viewFromViewFilter");
			}
		});
		$('#cy-add-existing-view').click(function() {
			_openTab("create");
			_removeHighlight();
			_shrinkFilters();

			var currentElementID = parseInt(ESV.cc.currentElement.id);
			var currentNode = ESV.nodes[currentElementID];
			if (currentNode.type == "data") {
				ESV.editor.initStructureCreation("existingViewFromData");
			} else if (currentNode.type == "datafilter") {
				ESV.editor.initStructureCreation("existingViewFromDataFilter");
			} else if (currentNode.type == "viewfilter") {
				ESV.editor.initStructureCreation("existingViewFromViewFilter");
			}
		});
		$('#cy-add-data').click(function() {			
			_openTab("create");
			_removeHighlight();
			_shrinkFilters();

			var currentElementID = parseInt(ESV.cc.currentElement.id);
			var currentNode = ESV.nodes[currentElementID];
			if (currentNode.type == "view") {
				ESV.editor.initStructureCreation("dataFromView");
			} else if (currentNode.type == "viewfilter") {
				ESV.editor.initStructureCreation("dataFromViewFilter");
			} else if (currentNode.type == "datafilter") {
				ESV.editor.initStructureCreation("dataFromDataFilter");
			}
		});
		
		$('#cy-delete-view').click(function() {
			$('#cy-toolbar').fadeOut(100);
			var vizID = $(this).data('vizID');
			ESV.promptDeleteConfirmation(vizID);
		});
		$('#cy-delete-viewfilter').click(function() {
			$('#cy-toolbar').fadeOut(100);
			var vizID = $(this).data('vizID');
			ESV.promptDeleteConfirmation(vizID);
		});
		$('#cy-delete-datafilter').click(function() {
			$('#cy-toolbar').fadeOut(100);
			var vizID = $(this).data('vizID');
			ESV.promptDeleteConfirmation(vizID);
		});
		$('#cy-delete-data').click(function() {
			$('#cy-toolbar').fadeOut(100);
			var vizID = $(this).data('vizID');
			ESV.promptDeleteConfirmation(vizID);
		});
	}
	
	/**
	 * Deletes a single node from the diagram and its corresponding edge(s)
	 * @function _deleteSingleNode
 	 * @param {Number} vizID - Visualization configuration object ID (vizObj.id)
 	 * @param {String} dir - {"up", "down", "both"} Specifies the direction in which the delete is occuring in order to determine 
 	 * which edges to remove (ie. when deleting "up", only edges that are above the node should be deleted)
	 * @memberof ESV.cc
	 * @instance
	 * @private
	 */
	function _deleteSingleNode(vizID, dir) {
		// Removes view from grid
		if (ESV.nodes[vizID].type != "data" && ESV.nodes[vizID].type != "datafilter" && ESV.nodes[vizID].type != "viewfilter") { 
			ESV.gridster.remove_widget($('#container-' + vizID));
			$('#container-' + vizID).remove();
		}
		
		// Removes node from cy
		var nodeIndexToRemove = -1;
		var nodes = ESV.cc.elements.nodes;
		for (var i = 0; i < nodes.length; i++) {
			if (nodes[i].data.id == vizID) {
				nodeIndexToRemove = i;
				break;
			}
		}
		if (nodeIndexToRemove > -1) {
			nodes.splice(nodeIndexToRemove, 1);
			ESV.cc.elements.nodes = nodes;
		}

		// Finds the edges to remove from cy
		var edgeIndexesToRemove = [];
		var edges = ESV.cc.elements.edges;
		for (var i = 0; i < edges.length; i++) {
			if (dir == "up" || dir == "both") {
				if (edges[i].data.target == vizID) {
					edgeIndexesToRemove.push(i);
				}
			} 
			if (dir == "down" || dir == "both") {
				if (edges[i].data.source == vizID) {
					edgeIndexesToRemove.push(i);
				}
			}
		}
		// Remove the edges in reverse order to prevent array reordering issues
		for (var i = (edgeIndexesToRemove.length - 1); i >= 0; i--) {
			edges.splice(edgeIndexesToRemove[i], 1);
			ESV.cc.elements.edges = edges;
		}
		
		// Remove any parent/child occurances from other nodes
		$.each(ESV.nodes, function(nodeID, node) {
			for (var i = (node.parents.length - 1); i >= 0; i--) {
				if (node.parents[i] == vizID) {
					node.parents.splice(i, 1);
				}
			}
			for (var i = (node.children.length - 1); i >= 0; i--) {
				if (node.children[i] == vizID) {
					node.children.splice(i, 1);
				}
			}
		});
		
		// Delete the node from the global scope
		delete ESV.nodes[vizID];
		
		// Delete any view facades that are related to this vizID
		if (ESV.viewfacades.hasViewFacades() && ESV.viewfacades.getViewID() === vizID) {
			ESV.viewfacades.resetViewFacades();
			ESV.updateViewFacadeIndicator();
		}

	}
	
	/**
	 * Deletes nodes in the tree moving upwards
	 * @function _deleteNodeTreeUp
 	 * @param {Number} vizID - Visualization configuration object ID (vizObj.id)
 	 * @param {Boolean} deleteData - True if the underlying data source should be deleted (if applicable)
 	 * @param {Boolean} deleteCurrentNode - True if the current node that is being visited should be deleted
	 * @memberof ESV.cc
	 * @instance
	 * @private
	 */
	function _deleteNodeTreeUp(vizID, deleteData, deleteCurrentNode) {
		if (ESV.nodes[vizID] == null || ESV.nodes[vizID] == undefined) {
			return;
		}
		
		// Creates a copy of the parents array so when nodes are deleted, they won't affect the parents array
		var parents = ESV.nodes[vizID].parents.slice(0);

		for (var i = 0; i < parents.length; i++) {
			if (ESV.nodes[parents[i]].children.length <= 1) {

				// Remove parents from collection of nodes
				var node = cy.nodes('[id="'+ parents +'"]')
				// cy.remove(node);

				_deleteNodeTreeUp(parents[i], deleteData, true);

			}
		}
		
		if (!deleteData && ESV.nodes[vizID].type == "data") {
			return;
		}
		
		if (deleteCurrentNode) {
			if (ESV.nodes[vizID].children.length <= 1) {
				_deleteSingleNode(vizID, "up");
			}
		}
	}
	
	/**
	 * Deletes nodes in the tree moving downwards
	 * @function deleteNodeTreeDown
 	 * @param {Number} vizID - Visualization configuration object ID (vizObj.id)
 	 * @param {Boolean} deleteData - True if the underlying data source should be deleted (if applicable)
 	 * @param {Boolean} deleteCurrentNode - True if the current node that is being visited should be deleted
	 * @memberof ESV.cc
	 * @instance
	 * @private
	 */
	function _deleteNodeTreeDown(vizID, deleteData, deleteCurrentNode) {
		if (ESV.nodes[vizID] == null || ESV.nodes[vizID] == undefined) {
			return;
		}
		
		// Creates a copy of the children array so when nodes are deleted, they won't affect the children array
		var children = ESV.nodes[vizID].children.slice(0);

		for (var i = 0; i < children.length; i++) {
			if (ESV.nodes[children[i]].parents.length <= 1) {

				//Remove children from teh collection
				var node = cy.nodes('[id="'+ children +'"]');
				// cy.remove(node);

				_deleteNodeTreeDown(children[i], deleteData, true);
			}
		}
		
		if (!deleteData && ESV.nodes[vizID].type == "data") {
			return;
		}
		
		if (deleteCurrentNode) {
			// Don't delete nodes that have more than one parent
			if (ESV.nodes[vizID].parents.length <= 1) {
				_deleteSingleNode(vizID, "down");
			}
		}
	}

	/**
	 * Removes highlighting of a single node
	 * @function removeHighlight
	 * @memberof ESV.cc
	 * @instance
	 * @private
	 */
	function _removeHighlight(){
		for(var i = 0; i < cy.elements().length; i++){
			cy.elements()[i].removeClass('cy-highlight');
		}
	}

	/**
	 * Changes the size of the datafilters and viewfilters back to the default.
	 * The datafilters and viewfilters change size when hovered over
	 * @function shrinkFilters
	 * @memberof ESV.cc
	 * @instance
	 * @private
	 */
	function _shrinkFilters(){
		for(var i = 0; i < cy.elements().length; i++){
			if(cy.elements()[i]._private.data.type == 'datafilter' || cy.elements()[i]._private.data.type == 'viewfilter'){
				cy.elements()[i].css({'width': '14px', 'height': '14px'});
			}
		}	
	}

	/**
	 * Highlights the given node, in case it represents a view it also highlights the corresponding plot
	 * @function _highlightView
	 * @param node - Cytoscape node object 
	 * @memberof ESV.cc
	 * @instance
	 * @private
	 */

	function _highlightView(node){
		if(node != undefined || node != null){

			$(".panel-heading").find('div').find('span').addClass("dropdownMenu-w");

			node.addClass('cy-highlight');
			var nodeData = node.data();
			if(nodeData.name == "View"){
				var vizID = parseInt(nodeData.id);
				$("#container-" + vizID + " .panel-heading").addClass("panel-blue");
				$("#container-" + vizID + " .panel-heading").find('a').removeClass("close-viz");
				$("#container-" + vizID + " .panel-heading").find('a').addClass("close-viz-w");
				$("#container-" + vizID + " .panel-heading").find('div').find('span').removeClass("dropdownMenu-w");
			}
		}	
	}

// ======== > The following fxns are to find line equations of the edges, check if they intersect and then relocate the edge

	/**
	 * See if there are any edges crossing
	 * @function _checkEdgeCrossings
	 * @memberof ESV.cc
	 * @instance
	 * @private
	 */
	function _checkEdgeCrossings(){
	// Finding index for the new nodes added
		var index = null;
		for(var j = (cy.nodes().length - 2); j > 1; j--){
			if(cy.nodes()[j].data().name == "View"){
				index = j;  
				break;
			}
		}

		// Get only the new nodes
		var newNodes = [];
		for (var t = (index + 1); t < cy.nodes().length; t++){
			newNodes.push(cy.nodes()[t]);
		}

		// From the new nodes, get their edges
		var edgesToCheck = []; 
		var otherEdges = [];

		for(var n = 0; n < newNodes.length; n++){
			for(var e = 0; e < newNodes[n]._private.edges.length; e++){
				var edge = newNodes[n]._private.edges;
				if(edgesToCheck.indexOf(edge[e]._private.data.id) < 0){
					edgesToCheck.push(edge[e]._private.data.id);
				} 
			}
		}  

		// From the edges, find the line eqn
		var lines = _coordinatesAndSlopes(edgesToCheck);

		// Find all edges except the new ones added
		for(var p = 0; p < ESV.cc.elements.edges.length; p++){
			otherEdges.push(ESV.cc.elements.edges[p].data.id); 
		}
		for(var e = 0; e < otherEdges.length; e++){
			for(var i = 0; i < edgesToCheck.length; i++){
				if(otherEdges[e] == edgesToCheck[i]){
					otherEdges.splice(e, 1);
				}	
			}
		}

		// Find the eqn of all the other edges
		var allOtherEdges = _coordinatesAndSlopes(otherEdges);

		// For all the edges, compare the edges with the latest addition and see if they cross
		console.log("x,y and slopes of all other egdes", allOtherEdges);
		for(var t = 0; t < allOtherEdges.length; t++){
			for(var s = 0; s < lines.length; s++){
			}
		}
	} 


	/**
	 * Determine the x,y coordinates and slopes of the edges
	 * @function _coordinatesAndSlopes
	 * @param {Array} edgesToCheck - Array of cytoscape edge objects
	 * @memberof ESV.cc
	 * @instance
	 * @private
	 */
	function _coordinatesAndSlopes(edgesToCheck){
		var x1, x2, y1, y2, m, b = null;
		var lines =[];

		// get the x,y values of the edges 
		for(var i = 0; i < edgesToCheck.length; i++){
			var thisEdge = cy.edges('[id="'+ edgesToCheck[i]+'"]'); 
			console.log("thisEdge ", thisEdge, edgesToCheck[i]);

			console.log(edgesToCheck[i].toString())
			x1 =  thisEdge._private.ids[edgesToCheck[i]]._private.rscratch.startX; //).toFixed(4);
			y1 =  thisEdge._private.ids[edgesToCheck[i]]._private.rscratch.startY; //).toFixed(4);
			x2 =  thisEdge._private.ids[edgesToCheck[i]]._private.rscratch.endX; //).toFixed(4);
			y2 =  thisEdge._private.ids[edgesToCheck[i]]._private.rscratch.endY; //).toFixed(4);
			console.log("THE VALUES ARE", x1, x2, y1, y2);

			if(x1 == x2){
			// x = #
				lines.push({
					"edge": edgesToCheck[i],
					"x1": x1,
					"x2": x2,
					"y1": y1,
					"y2": y2
				})
			} else {

			// find the slope of the line (y2-y1/x2-x1), y-mx + b
				m = (y2 - y1)/(x2 - x1);
				b = y1 - (m*x1)
				console.log("M", m, "B", b);

				lines.push({
					"edge":edgesToCheck[i],
					"x1": x1,
					"x2": x2,
					"y1": y1,
					"y2": y2,
					"m": m,
					"b": b
				});
			}

			console.log(lines);
		}
		return lines;
	}

	/**
	 * Relocates the edge, by moving the parent node(source)
	 * @function _moveEdge
	 * @param {Object} edge - the one that needs to be relocated
	 * @memberof ESV.cc
	 * @instance
	 * @private
	 */
	function _moveEdge(edge){

		if (edge != null || edge != undefined){

			// console.log("Move this edge", edge);
			// console.log(cy.edges('[id="' + edge.edge + '"]'));

			var parentNode = cy.edges('[id="' + edge.edge + '"]').data().source;
			var childNode = cy.edges('[id="' + edge.edge + '"]').data().target;
			console.log("Moving nodes", parentNode, childNode);
			console.log("PARENTNODE******",cy.nodes('[id="' + parentNode +'"]').data().name );
			var thisNode = cy.nodes('[id="' + parentNode +'"]');

			if(thisNode.data().name == "Region Filter"){

				// Need to find its parents and move them too
				var num = edge.edge;
				if(num.length == 2){
					num = parseInt((edge.edge).slice(1,2));
				}else {
					num = parseInt((edge.edge).slice(1,3));
				}

				var parentEdges = cy.edges('[id="e'+(num - 2)+'"]');
				console.log(parentEdges);
				var grandparent = parentEdges.data().source;

				cy.nodes('[id="' + parentNode +'"]').animate({
					position: {
						x: cy.extent().x1 + 30,  
						y: 147
					},
					duration: 500
				})

				cy.nodes('[id="' + grandparent + '"]').animate({
					position: {
						x: cy.extent().x1 + 30,
						y: 196
					},
					duration: 500

				})

			} else if (thisNode.data().name == "View"){
				var num = edge.edge;
				if(num.length == 2){
					num = parseInt((edge.edge).slice(1,2));
				}else {
					num = parseInt((edge.edge).slice(1,3));
				}
				
				var childrenEdges = cy.edges('[id="e'+(num)+'"]');
				console.log(childrenEdges);
				var grandchildren = childrenEdges.data().target;

				cy.nodes('[id="' + grandchildren +'"]').animate({
					position: {
						x: cy.extent().x1 + 30,
						y: 147
					},
					duration: 500
				})

				cy.nodes('[id="' + parentNode +'"]').animate({
					position: {
						x: cy.extent().x1 + 30,
						y: 196
					},
					duration: 500
				})


			}
		}
	}	

	return esv;

}(ESV.cc || {}));
