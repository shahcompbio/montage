package org.elasticsearch.plugin.genomic;


import static org.elasticsearch.rest.RestRequest.Method.POST;
import static org.elasticsearch.rest.RestStatus.OK;

import java.io.IOException;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

import org.elasticsearch.action.search.SearchResponse;
import org.elasticsearch.client.Client;
import org.elasticsearch.common.inject.Inject;
import org.elasticsearch.common.settings.Settings;
import org.elasticsearch.common.unit.TimeValue;
import org.elasticsearch.common.xcontent.ToXContent;
import org.elasticsearch.common.xcontent.XContentBuilder;
import org.elasticsearch.common.xcontent.XContentFactory;
import org.elasticsearch.index.query.QueryBuilder;
import org.elasticsearch.index.query.QueryBuilders;
import org.elasticsearch.index.query.BoolQueryBuilder;
import org.elasticsearch.rest.BytesRestResponse;
import org.elasticsearch.rest.RestChannel;
import org.elasticsearch.rest.RestController;
import org.elasticsearch.rest.RestHandler;
import org.elasticsearch.rest.RestRequest;
import org.elasticsearch.rest.support.RestUtils;
import org.elasticsearch.search.SearchHit;
import org.elasticsearch.search.SearchHitField;
import org.elasticsearch.search.sort.SortBuilder;
import org.elasticsearch.search.sort.SortBuilders;
import org.elasticsearch.search.sort.SortOrder;

public class GenomicRestHandler implements RestHandler {

	private static final Logger LOG = Logger.getLogger(GenomicRestHandler.class.getName());

	// TODO: make this variable? currently just an alias
	private static final String DENORMALIZED_INDEX = "denormalized_data";

	// CONSTANTS (TODO: make configurable by yaml file)
	private final String WITH_DELIMITER = "((?<=%1$s)|(?=%1$s))";
	private static final int SCROLL_TIMEOUT = 600000; // 10 min in ms
	private final String DEFAULT_OUTPUT = "start,end,chrom_number,sample_id";
	private final int DEFAULT_SCROLL_SIZSE = 20;
	private final int DEFAULT_SUB_SCROLL_SIZSE = 20;
	private final String DEFAULT_DRIVER_SORT = "chrom_number,asc";
	private final boolean CAN_TRIP_CIRCUIT_BRAKER = false;

	// Members
	private Client search_client;

	// Constructors
	@Inject
	public GenomicRestHandler(Settings settings, Client client, RestController restController) {

		this.search_client = client; // save the client for searching later
		restController.registerHandler(POST, "/_overlap", this);
	}

	/**
	 * For unit tests
	 */
	protected GenomicRestHandler() {

		super();

	}

	@Override
	public void handleRequest(final RestRequest request, final RestChannel channel) {

		// TODO: could support both get and post (not sure point as limitions of url to 3000 bytes)
		// Get request parameters (not available by parms, need to unencode and parse)
		// FIXME: Worried UTF8 might be a bad idea....
		Map<String, String> params = new HashMap<String, String>();
		RestUtils.decodeQueryString(request.content().toUtf8(), 0, params);

		// Check if subscrollid exists: this means more results of a sublist are wanted (no combining required).
		String subScrollIdStr = params.get("subScrollId");

		if (subScrollIdStr != null && !subScrollIdStr.isEmpty()) {

			SearchResponse sub_scroll_search_response = search_client
					.prepareSearchScroll(subScrollIdStr).setScroll(new TimeValue(SCROLL_TIMEOUT))
					.execute().actionGet();

			try {
				XContentBuilder builder;
				builder = XContentFactory.jsonBuilder();
				sub_scroll_search_response.getHits().toXContent(
						builder.startObject().field("scroll_id")
								.value(sub_scroll_search_response.getScrollId()),
						ToXContent.EMPTY_PARAMS);
				builder.endObject();
				BytesRestResponse sub_return_response = new BytesRestResponse(OK, builder.string());
				sub_return_response.addHeader("Content-Type", "application/json");
				channel.sendResponse(sub_return_response);

			} catch (IOException e) {

				LOG.log(Level.FINE,
						"IO error attempting to return sub scroll results. SubScroll id: "
								+ subScrollIdStr + " Error is: " + e.toString());
				e.printStackTrace();
			}
			return;
		}

		/**
		 * Sample ID Deprecated
		 * 
		 * String sampleIdStr = params.get("sampleIds"); if (sampleIdStr == null || sampleIdStr.isEmpty()) { //FIXME put
		 * a default vaule here? pointless as specified in query.... what about search by project ... } // Split on ','
		 * remove trailing whitespace before and after List<String> sampleIDs =
		 * Arrays.asList(sampleIdStr.split("\\s*,\\s*"));
		 */

		String callerStr = params.get("callers");
		if (callerStr == null || callerStr.isEmpty()) {
			channel.sendResponse(new BytesRestResponse(OK, "Caller list: '" + callerStr
					+ "' is invalid or missing"));
			return;
			// TODO: run query to find what caller values are possible. return
			// possible values to user?
			// Or possible use all the callers available for the given samples
		}

		// Split on ',' remove trailing whitespace before and after
		List<String> callerValues = Arrays.asList(callerStr.split("\\s*,\\s*"));
		String driver = callerValues.get(0);

		String outputStr = params.get("output");
		outputStr = (outputStr != null) ? outputStr : DEFAULT_OUTPUT;
		String[] outputValues = (String[]) Arrays.asList(outputStr.split("\\s*,\\s*")).toArray();

		// TODO remove this filter crap
		String filterStr = params.get("filter");
		List<String> filterValues = (filterStr != null) ? Arrays.asList(filterStr
				.split("\\s*,\\s*")) : null;

		// Search only the listed indices, if specified, fall back to the default one if none provided
		String searchIndices = params.get("indices");
		if (searchIndices == null || searchIndices.isEmpty()) {
			searchIndices = DENORMALIZED_INDEX;
		}

		// Check to see if this request has a scrollID. Get results from where left off.
		String scrollIdStr = params.get("scrollId");
		if (scrollIdStr != null && !scrollIdStr.isEmpty()) {

			SearchResponse scroll_search_response = search_client.prepareSearchScroll(scrollIdStr)
					.setScroll(new TimeValue(SCROLL_TIMEOUT)).execute().actionGet();

			try {
				XContentBuilder combinedScrolllResults = combineSearchResults(
						scroll_search_response, outputValues, filterValues,
						callerValues.subList(1, callerValues.size()), driver, params);

				sendToClient(channel, combinedScrolllResults);

			} catch (IOException e) {

				LOG.log(Level.FINE,
						"IO error attempting to combine search results from  scroll id: "
								+ scrollIdStr + " Error is: " + e.toString());
				e.printStackTrace();
			}
			return;
		}


		// Get any filters associated with driver
		String driverFilter = params.get("filter-0");
		SearchResponse driverSearchResults = null;

		// Get any sorting parameters
		String sortFilter = params.get("sort-dataset-0");
		List<String> sortParams = (sortFilter != null && !sortFilter.isEmpty()) ? Arrays
				.asList(sortFilter.split("\\s*,\\s*")) : Arrays.asList(DEFAULT_DRIVER_SORT
				.split("\\s*,\\s*"));

		// Double check sort params are valid.
		SortBuilder sort = null;
		if (sortParams.size() != 2 || sortParams.get(0) == null || sortParams.get(0).isEmpty()
				|| sortParams.get(1) == null || sortParams.get(1).isEmpty()) {
			sort = SortBuilders.fieldSort("chrom_number").order(SortOrder.DESC);
		} else if (sortParams.get(1).equalsIgnoreCase("asc")) {
			sort = SortBuilders.fieldSort(sortParams.get(0)).order(SortOrder.ASC);
		} else if ((sortParams.get(1).equalsIgnoreCase("desc"))
				|| (sortParams.get(1).equalsIgnoreCase("dsc"))) {
			sort = SortBuilders.fieldSort(sortParams.get(0)).order(SortOrder.DESC);
		} else {// use default
			sort = SortBuilders.fieldSort("chrom_number").order(SortOrder.DESC);
		}

		BoolQueryBuilder driver_filter = QueryBuilders.boolQuery()
			.must(QueryBuilders.termQuery("caller", driver));

		// Add custom query if available if not just set filters and run query.
		if ((driverFilter != null) && !driverFilter.isEmpty()) {
			BoolQueryBuilder driver_query = QueryBuilders.boolQuery()
					.must(QueryBuilders.wrapperQuery(driverFilter))
					.filter(driver_filter);
			driverSearchResults = search_client.prepareSearch(searchIndices.split(","))
					.addFields(outputValues).setQuery(driver_query).addSort(sort)
					.setScroll(new TimeValue(SCROLL_TIMEOUT)).setSize(DEFAULT_SCROLL_SIZSE)
					.execute().actionGet();
		} else {
			driverSearchResults = search_client.prepareSearch(searchIndices.split(","))
					.addFields(outputValues).setPostFilter(driver_filter).addSort(sort)
					.setScroll(new TimeValue(SCROLL_TIMEOUT)).setSize(DEFAULT_SCROLL_SIZSE)
					.execute().actionGet();

		}

		try {
			XContentBuilder combinedResults = combineSearchResults(driverSearchResults,
					outputValues, filterValues, callerValues.subList(1, callerValues.size()),
					driver, params);

			sendToClient(channel, combinedResults);
		} catch (IOException e) {
			LOG.log(Level.FINE,
					"IO error attempting to combine search results.  ERror is: " + e.toString());
		}
	}

	/**
	 * sends a json response to user
	 * 
	 * @param channel
	 * @param jsonToSend
	 * @throws IOException
	 */
	protected void sendToClient(final RestChannel channel, XContentBuilder jsonToSend)
			throws IOException {

		// Send results to user.
		BytesRestResponse return_response = new BytesRestResponse(OK, jsonToSend.string());
		return_response.addHeader("Content-Type", "application/json");
		channel.sendResponse(return_response);

	}

	/**
	 * Combine results across different analysis types
	 * 
	 * @param searchResults
	 * @param outputFields
	 * @param filterArguments
	 * @param callerValues
	 * @param driver
	 * @param params
	 * @return
	 * @throws IOException
	 */

	protected XContentBuilder combineSearchResults(SearchResponse searchResults,
			String[] outputFields, List<String> filterArguments, List<String> callerValues,
			String driver, Map<String, String> params) throws IOException {

		// No results then just return. if
		// (searchResults.getHits().getHits().length == 0) return;

		// Add result info and scroll id to return result.
		XContentBuilder builder;
		builder = XContentFactory.jsonBuilder();
		builder.startObject();
		builder.field("result_total").value(searchResults.getHits().getTotalHits());
		builder.field("scroll_id").value(searchResults.getScrollId());
		builder.startArray("combined_results"); // Create an array to hold all the results for each row

		// Search only the listed indices, if specified, fall back to the default one if none provided
		String searchIndices = params.get("indices");
		if (searchIndices == null || searchIndices.isEmpty()) {
			searchIndices = DENORMALIZED_INDEX;
		}

		for (SearchHit hit : searchResults.getHits().getHits()) {

			Map<String, SearchHitField> hit_fields = hit.getFields();

			builder.startObject();
			// Join results together into a valid json for returning to client

			int idx = 0;
			hit.toXContent(builder.field("dataset-" + idx++), ToXContent.EMPTY_PARAMS);
			for (String caller : callerValues) {

				QueryBuilder join_filter = buildJoinFilter(hit_fields.get("start"),
						hit_fields.get("end"), hit_fields.get("chrom_number"),
						hit_fields.get("sample_id"), filterArguments,
						caller, driver);

				SearchResponse join_search_results = null;

				String joinFilterStr = params.get("filter-" + idx);
				// Add custom query if available
				if ((joinFilterStr != null) && !joinFilterStr.isEmpty()) {
					BoolQueryBuilder driver_query = QueryBuilders.boolQuery()
							.must(QueryBuilders.wrapperQuery(joinFilterStr))
							.filter(join_filter);
					join_search_results = search_client.prepareSearch(searchIndices.split(","))
							.addFields(outputFields).setQuery(driver_query)
							.setScroll(new TimeValue(SCROLL_TIMEOUT))
							.setSize(DEFAULT_SUB_SCROLL_SIZSE).execute().actionGet();
				} else {
					join_search_results = search_client.prepareSearch(searchIndices.split(","))
							.addFields(outputFields).setPostFilter(join_filter)
							.setScroll(new TimeValue(SCROLL_TIMEOUT))
							.setSize(DEFAULT_SUB_SCROLL_SIZSE).execute().actionGet();

				}

				// Add scroll_id and add results to json object
				join_search_results.getHits().toXContent(
						builder.startObject("dataset-" + idx).field("scroll_id")
								.value(join_search_results.getScrollId()), ToXContent.EMPTY_PARAMS);
				builder.endObject();
				idx++;
			}

			builder.endObject();
		}// For loop

		// Close json builder and send response to client. Need to close else memory leak.
		builder.endArray();
		builder.endObject();

		return builder;

	}

	/**
	 * 
	 * @param start
	 * @param end
	 * @param chrom_number
	 * @param filterArguments
	 * @param callerValue
	 * @return
	 * @throws IOException
	 */
	protected QueryBuilder buildJoinFilter(SearchHitField start, SearchHitField end,
			SearchHitField chrom_number, SearchHitField sample_id, List<String> filterArguments, String callerValue,
			String driver) throws IOException {

		BoolQueryBuilder built_query = QueryBuilders.boolQuery()
			.must(QueryBuilders.termQuery("caller", callerValue))
			.must(QueryBuilders.nestedQuery("events", QueryBuilders.boolQuery()
					.must(QueryBuilders.termQuery("events.caller", driver))
					.must(QueryBuilders.termQuery("events.chrom_number", chrom_number.value()))
					.must(QueryBuilders.termQuery("events.end", end.value()))
					.must(QueryBuilders.termQuery("events.sample_id", sample_id.value()))
					.must(QueryBuilders.termQuery("events.start", start.value()))));

		addFilters(filterArguments, built_query, false);
		return built_query;

	}

	/**
	 * 
	 * @param filterArguments
	 * @param addFiltersTo
	 */
	protected void addFilters(List<String> filterArguments, BoolQueryBuilder addFiltersTo,
			boolean driver) {

		// If empty then return
		if (filterArguments == null || filterArguments.isEmpty())
			return;

		// Not empty so add some filters!
		for (String filter : filterArguments) {

			// The regular expression splits on < > : and makes an array keeping the delimter in the array (in the
			// middle position, if 3 values)
			String[] split_filter = filter.split(String.format(WITH_DELIMITER, "[>:<]"));
			String field = driver ? split_filter[0] : "events." + split_filter[0];
			String operator = split_filter[1];
			String fieldValue = split_filter[2];

			switch (operator) {

			case ":":
				addFiltersTo.must(QueryBuilders.termQuery(field, fieldValue));
				break;
			case ">":
				addFiltersTo.must(QueryBuilders.rangeQuery(field).gte(fieldValue));
				break;
			case "<":
				addFiltersTo.must(QueryBuilders.rangeQuery(field).lte(fieldValue));
				break;

			}

		}

	}

	/**
	 * @return
	 */
	public boolean canTripCircuitBreaker() {
		return CAN_TRIP_CIRCUIT_BRAKER;
	}

}
