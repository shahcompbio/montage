
/**
 * Contains common functions used by various plot modules.
 * <br/>
 * TODO: Duplicate code/functions found in view modules should be moved out to this namespace.
 *
 * @namespace ESV.viewlibs
 */

ESV.viewlibs = (function (esv) {

	/**
	 * Clears a number of view facades/filters applied by the specified view
     * @function clearViewFacadeByFacadeIDs
	 * @param {Object} vizObj - Configuration visualization object
	 * @param {String} facadeIDs - A comma separated list of facade IDs
     * @memberof ESV.viewlibs
	 */
	esv.clearViewFacadeByFacadeIDs = function(vizObj, facadeIDs) {
		if (facadeIDs) {
			var facadeIDArr = facadeIDs.split(",");
			for (var i = 0; i < facadeIDArr.length; i++) {
				var viewFacade = ESV.viewfacades.getViewFacadeByID(facadeIDArr[i]);
	
				if (viewFacade != null) {
					esv.clearViewFacade(vizObj, viewFacade);
				}
			}
		} else {
			esv.clearViewFacade(vizObj);
		}
	};

	/**
	 * Removes a single view facade/filter applied by the specified view 
     * @clearViewFacade
	 * @param {Object} vizObj - Visualization configuration object
	 * @param {Object} viewFacadeToRemove - Facade object to be removed 
     * @memberof ESV.viewlibs
	 */
	esv.clearViewFacade = function(vizObj, viewFacadeToRemove, update) {
		if (ESV.queries.isQueryAllowed(vizObj)) {
			ESV.removeViewFacades(vizObj, viewFacadeToRemove, update);
		}
	}

	/**
	 * Excecutes actions that are to take place before generating/updating a view. It gathers information with regards
     * to the specific sample IDs and indices based on the so far applied filters in order to direct further view related
     * queries only to the indices containing the data as opposed to the entire data set
	 * @function viewPreProcess
	 * @param {Object} vizObj - Visualization configuration object
	 * @param {Boolean} isTriggeredByViewFacade - Flag denoting whether the view update is triggered by applying a filter/facade though another plot
     * @memberof ESV.viewlibs
	 */
	esv.viewPreProcess = function(vizObj, isTriggeredByViewFacade) {
		vizObj.sampleIDs = vizObj.sampleIDs;
		vizObj.indexList = [];
		var formattedIndexList = "";
		for(var i = 0; i < vizObj.sampleIDs.length;i++){
			var index = vizObj.sampleIDs[i].toLowerCase()
			vizObj.indexList.push(index);
			formattedIndexList += index+"_denormalized";
			//There are more indexes
			if (i != vizObj.sampleIDs.length-1 ){
				formattedIndexList +=","
			}

		}
		if (vizObj.indexList) {
			vizObj.searchIndex  = ES_SERVER + '/' + formattedIndexList + '/_search?request_cache=true';
		}
	}

	/**
	 * Provided a facade ID, returns the corresponding facade object
	 * @function getViewFacadeByID
	 * @param {Number} facadeID - Facade object ID
	 * @return {Object} viewFacade - Facade object
	 * @memberof ESV.viewlibs
	 */
	esv.getViewFacadeByID = function(facadeID) {
		return ESV.viewfacades.getViewFacadeByID(facadeID);
	}

	/**
	* Adds a listener for the items in the dropdown menu of the facade inicator that is used for removing of a single item from the list 
	* @function dropdownListener
	* @param {Object} - vizObj - Visualization configuration object
	* @param {Object} - container - Plot/View contianer DOM object
	* @memberof ESV.viewlibs
	**/

	esv.dropdownListeners = function(vizObj, container){
		container.on("click", ".filter-pill", function(event) {
			event.stopPropagation();

			$('.panel-heading').removeClass('open');

			var viewFacadeToRemove = ESV.viewfacades.getViewFacadeByID($(this).data('id'))
			ESV[vizObj.type].clearViewFacade(vizObj, viewFacadeToRemove);
		});
	}

	/**
	 * Updates the value of a view object's field/attribute with the
	 * collective values stored in its tracks in fields with the same name
	 * @function collectTrackFieldData
	 * @param {Object} - vizObj - Visualization coniguration object
	 * @param {String} - fielda - Visualization configuration attribute
	 * @memberof ESV.viewlibs
	 */
	esv.collectTrackFieldData = function(vizObj, field) {
		if (!vizObj.tracks || !vizObj.tracks.length) {
			return
		}
		var field_data = {};
		for (var idx in vizObj.tracks) {
			$.each(vizObj.tracks[idx][field], function(i, value) {
				field_data[value] = 1;
			});
		}
		vizObj[field] = Object.keys(field_data);
	}

	/**
	 * Adjusts incorrectly calculated floating point numbers
	 * @function adjustFloat
	 * @param {Number} floatValue - Floating point value to adjust
	 * @param {Number} precision
	 * @returns {Number} - Corrected floating point value
	 * @memberof ESV.viewlibs
	 */
	esv.adjustFloat = function(floatValue, precision) {
		if (parseInt(floatValue) == floatValue) {
			return floatValue;
		}
		var adjustedValue = floatValue + 0.01/precision;
		return Math.round(adjustedValue * precision)/precision;
	}


	/**
	* Rounds floating number to x sig figs or x decimal places
	* @param {Number} floatValue
	* @param {Number} x - number of sig figs/decimal places
	*/
	esv.roundFloat = function(floatValue, x) {
		if (Number.isInteger(floatValue)) {
			return floatValue;
		}
		else if (0 < floatValue && floatValue < 1) {
			return floatValue.toPrecision(x);
		}
		else {
			var precision = Math.pow(10, x);
			return Math.round(floatValue * precision) / precision
		}
	}
	
	/**
	* Set the plot title to the sample ID if the title is empty
	* @param {Object} vizObj
	*/
	esv.setPlotTitle = function(vizObj){
		if (vizObj.info.title == '' ) 
			ESV.editor.editFieldChanged(vizObj.id,"title",vizObj.sampleIDs);
	}

    return esv;
}(ESV.viewlibs || {}));
