/**
 * ESV View Facades
 * <br/><br/>
 * View Facades for Montage system
 *
 *
 *
 * @author: Samantha Leung
 */

ESV.viewfacades = (function (esv) {

	/**
	* viewFacade structure
	*   Array of view facade (Object)
	*/
	var viewFacades;

	/**
	* Sets view facades as given set of facades
	* @param {viewFacades} setFacades
	*/
	esv.setViewFacades = function(setFacades) {
		viewFacades = setFacades;

	}

	/**
	* Returns current view facade structure
	* @returns {viewFacades} viewFacades
	*/
	esv.getViewFacades = function() {
		if (!viewFacades) {
			viewFacades = _initializeViewFacades()
		}

		return viewFacades;
	}

	/**
	* Returns the view ID associated with all view facades
	* NOTE: Since facades can only originate from one view, you can assume that the first facade viewID is same as rest
	* @returns {Number} viewID
	*/
	esv.getViewID = function() {
		return viewFacades[0].viewID;
	}

	/**
	* Returns track ID associated with all view facades
	* NOTE: Since facades can only originate from one view, you can assume that the first facade trackID is same as rest
	* @returns {Number} trackID
	*/
	esv.getTrackID = function() {
		return viewFacades[0].trackID;
	}

	/**
	* Returns true if there is at least one view facade
	* @returns {Bool}
	*/
	esv.hasViewFacades = function() {
		return viewFacades.length > 0;
	}

	/**
	* Returns true if view facade object has at least one view facade
	* @param {viewFacades} viewFacadesObj
	* @returns {Bool}
	*/
	esv.hasViewFacadesObj = function(viewFacadesObj) {
		return viewFacadesObj.length > 0;
	}

	/**
	* Resets view facades to empty structure
	*/
	esv.resetViewFacades = function() {
		viewFacades = [];
	}

	/**
	* Adds given view facade to structure
	* @param {Object} facade
	*/
	esv.addViewFacade = function(facade) {
		viewFacades.push(facade);
	}


	/**
	 * Removes a given view facade from the global scope
	 * @funciton removeViewFacadeByID
	 * @param {Number} facadeID - Facade object ID
	 */
	esv.removeViewFacadeByID = function(facadeID) {
		var indexToRemove = -1;
		for (var i = 0; i < viewFacades.length; i++) {
			if (viewFacades[i].id == facadeID) {
				indexToRemove = i;
			}
		}
		if (indexToRemove > -1) {
			viewFacades.splice(indexToRemove, 1);
		}
	}

	/**
	 * Removes a given view facade, updates the bottom right indicator, and any views as needed
	 * @function removeViewFacades
	 * @param {Object} vizObj - Visualization object
	 * @param {Object} viewFacadeToRemove - Facade object to be removed
	 * @param {Boolean} update - Flag specifying whether stale plots should be updated
	 */
	esv.removeViewFacades = function(vizObj, viewFacadeToRemove, update) {
        // Unless 'update' is explicityly set to false, consider that
        // stale visualizations are to be updated
        update = update !== false;
		if (viewFacadeToRemove != null && viewFacadeToRemove != undefined) {
			if ($.isArray(viewFacadeToRemove)) {
				$.each(viewFacadeToRemove, function() {
					esv.removeViewFacadeByID(this.id);
				});
			} else {
				esv.removeViewFacadeByID(viewFacadeToRemove.id);
			}
		} else {
			esv.resetViewFacades();
		}

		ESV.updateViewFacadeIndicator();

		if (update) {
			ESV.updateStaleVisualizations(vizObj.id, true);
		}
	}



	/**
	* Returns view facade given facade id, null if not found
	* @param {Number} id - of facade
	* @returns {Object||null}
	*/
	esv.getViewFacadeByID = function(id) {
		for (var i = 0; i < viewFacades.length; i++) {
			if (viewFacades[i].id == id) { // note: type difference... will probably need to resolve SIGH
				return viewFacades[i];
			}
		}
		return null;
	}


	/**
	* Initializes view facade structure
	* @returns {viewFacades}
	*/
	function _initializeViewFacades() {
		viewFacades = [];

		return viewFacades;
	}




	return esv;
}(ESV.viewFacades || {}));