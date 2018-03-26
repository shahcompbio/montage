'''
Created on September 2014
@author: klc, dmachev

'''

from __future__ import division
import argparse
import logging
import sys
import timeit
import copy
from multiprocessing import cpu_count
from multiprocessing import Pool
import time
import os
import traceback
from intervaltree import Interval, IntervalTree
from elasticsearch.exceptions import TransportError
from elasticsearchloader.analysis_loader import AnalysisLoader
from elasticsearchloader.es_settings import DENORMALIZED_ALIAS


SCRIPT_PATH = os.path.abspath(__file__)
sys.path.insert(1, '/'.join(SCRIPT_PATH.split('/')[:-2]))

sys.setrecursionlimit(10000)

MAX_PROCESSES = 4
TIMEOUT = 300

def generate_events_data(
        index=None,
        doc_type=None,
        host=None,
        port=None,
        use_ssl=False,
        http_auth=None,
        source=None,
        index_alias=None,
        is_qc=False):
    '''
    Iterates over the records from a given input file and finds all events with
    overlapping positions, chromosome numbers and sample IDs and adds them
    to the record under field 'events'
    '''

    if not index or not doc_type:
        logging.error(
            "Index and document type names need to be provided as an input.")
        return

    timer_start = timeit.default_timer()
    # Here the loader is chosen arbitrarily, any other loader type
    # could be used for the purpose
    data_loader = AnalysisLoader(
        es_index=index,
        es_doc_type=doc_type,
        es_host=host,
        es_port=port,
        use_ssl=use_ssl,
        http_auth=http_auth)

    # Get all available document types from the original index

    try:
        mappings = data_loader.es_tools.get_mappings()
        doc_types = mappings[index]["mappings"].keys()
    #except TransportError:
    except Exception as e:
        logging.error("%s;", e)
        logging.error("Index %s doesn't exist.", index)
        return

    if not doc_types:
        logging.error("No document types found in index %s.", index)
        return

    dst_index = index + '_denormalized'

    if not index_alias:
        index_alias = DENORMALIZED_ALIAS

    for document_type in doc_types:
        data_loader_dst = AnalysisLoader(
            es_index=dst_index,
            es_doc_type=document_type,
            es_host=host,
            es_port=port,
            use_ssl=use_ssl,
            http_auth=http_auth)
        mappings = get_mappings(document_type)
        data_loader_dst.create_index(mappings)
        data_loader_dst.es_tools.create_alias(index_alias)

    data_loader_dst.disable_index_refresh()

    logging.info("Denormalizing data in index %s (%s).", index, time.ctime())
    logging.info("Processing data with source %s", source)

    doc_types.sort()
    doc_type = ','.join(doc_types)

    data_loader = AnalysisLoader(
        es_index=index,
        es_doc_type=doc_type,
        es_host=host,
        es_port=port,
        use_ssl=use_ssl,
        http_auth=http_auth)

    params = {
        "index": index,
        "dst_index": dst_index,
        "doc_type": doc_type,
        "host": host,
        "port": port,
        "use_ssl": use_ssl,
        "http_auth": http_auth,
        "source": source,
        "is_qc": is_qc
    }

    if (is_single_cell_data(data_loader, source)):
        if (not has_single_cell_qc_data(data_loader)):
            logging.debug("Denormalize Single Cell: No QC Data")
            process_sc_chrom(params)
        else:
            logging.debug("Denormalize Single Cell: With QC Data")
            process_sc_qc(params)


    else:
        logging.debug("Denormalize Bulk Data")
        process_params = []

        chrom_nums = [str(i).zfill(2) for i in range(1, 23)] + ["x", "X", "y", "Y", "NONE"]
        for chrom_number in chrom_nums:
            data_boundaries = get_data_intervals(
                data_loader,
                chrom_number,
                source
            )
            for interval in data_boundaries:
                process_params.append(copy.deepcopy(params))
                process_params[-1]["chrom_number"] = chrom_number
                process_params[-1]["interval"] = interval

        num_processes = cpu_count()
        print "1 num_processes=",num_processes #debug
        if len(process_params) < num_processes:
            num_processes = len(process_params)

        print "2 num_processes=",num_processes #debug
        if num_processes > MAX_PROCESSES:
            num_processes = MAX_PROCESSES

        print "3 num_processes=",num_processes #debug
        if num_processes:
            process_pool = Pool(processes=num_processes)
            process_pool.map(pool_process, process_params)
            process_pool.close()
            process_pool.terminate()
        else:
            logging.info("Obj; No data from source %s has been found.", str(source))

    timer_end = timeit.default_timer()

    data_loader_dst.enable_index_refresh()

    # Verify that all records have been processed
    data_loader_dst = AnalysisLoader(
        es_index=dst_index,
        es_doc_type=doc_type,
        es_host=host,
        es_port=port,
        use_ssl=use_ssl,
        http_auth=http_auth)
    data_loader_dst.es_tools.refresh_index()

    record_count = data_loader.es_tools.count({"match_all": {}})
    record_count_dst = data_loader_dst.es_tools.count({"match_all": {}})

    logging.info(
        "Denormalization completed in %f minutes (%s).",
        (timer_end - timer_start)/60, time.ctime())
    if record_count["count"] == record_count_dst["count"]:
        logging.info("All records have been denormalized.")
    else:
        logging.error(
            "%d records are missing from index %s.",
            record_count["count"] - record_count_dst["count"],
            dst_index
        )


def pool_process(params):
    '''
    A proxy function to be called by Pool.map with simple parameters, it
    creates the data loader objects and along with the remaining parameters
    invokes function process_interval (passing the instantiated objects seems
    to create issues with pickle when serializing the parameters)
    '''
    try:
        data_loader = AnalysisLoader(
            es_index=params["index"],
            es_doc_type=params["doc_type"],
            es_host=params["host"],
            es_port=params["port"],
            use_ssl=params["use_ssl"],
            http_auth=params["http_auth"],
            timeout=TIMEOUT)

        data_loader_dst = AnalysisLoader(
            es_index=params["dst_index"],
            es_doc_type=params["doc_type"],
            es_host=params["host"],
            es_port=params["port"],
            use_ssl=params["use_ssl"],
            http_auth=params["http_auth"],
            timeout=TIMEOUT)

        process_interval(
            data_loader,
            data_loader_dst,
            params["interval"],
            params["chrom_number"],
            params["source"])
    except Exception:
        error_message = "An error has occurred while de-normalizing " +\
                        "records from source " + str(params["source"])
        logging.error("#" * len(error_message))
        logging.error(error_message)
        logging.error(traceback.format_exc(traceback.extract_stack()))
        logging.error("#" * len(error_message))


def process_interval(
        data_loader,
        data_loader_dst,
        interval,
        chrom_number,
        source):
    '''
    Given source/destination loaders and a positions range, de-normalizes
    the data associated with the particular chromosome number and source
    file, as well as all other overlapping records
    '''
    logging.debug(
        "Processing chromosome %s, positions %d - %d.",
        chrom_number,
        interval["min"],
        interval["max"]
    )
    search_data = build_search_tree(
        data_loader,
        chrom_number,
        interval["min"],
        interval["max"],
        source
    )

    if len(search_data["records_tree"]) == 0:
        return
    if not search_data["records_from_file"]:
        return

    denormalize_data(
        data_loader_dst,
        search_data["records_tree"],
        search_data["records_from_file"]
    )
    logging.debug(
        "Completed processing for chromosome %s, positions interval %d - %d.",
        chrom_number,
        interval["min"],
        interval["max"]
    )


def get_data_intervals(data_loader, chrom_number, source):
    '''
    Returns the min start/max end positions of all records from the given file
    '''
    query = {
        "query": {
            "bool": {
                "must": [
                    {
                        "match": source
                    },
                    {
                        "match": {
                            "chrom_number": chrom_number
                        }
                    }
                ]
            }
        },
        "aggs": {
            "min_start": {
                "min": {
                    "field": "start"
                }
            },
            "max_end": {
                "max": {
                    "field": "end"
                }
            }
        },
        "size": 0
    }
    results = data_loader.es_tools.raw_search(query)
    # In case the specific chromosome is not represented in the examined file
    if results["aggregations"]["max_end"]["value"] is None:
        return []
    min_start = int(results["aggregations"]["min_start"]["value"])
    min_start = get_split_position(data_loader, chrom_number, min_start, True)
    max_end = int(results["aggregations"]["max_end"]["value"])

    logging.debug(
        "Determining intervals for chromosome %s within range %d - %d.",
        chrom_number,
        min_start,
        max_end
    )

    interval_count = 8
    interval_length = int((max_end - min_start) / interval_count)
    if not interval_length:
        interval_length = 1
    intervals = []

    current_start = min_start
    current_end = min_start + interval_length

    while current_end < max_end:
        current_end = get_split_position(data_loader, chrom_number, current_end)
        current_end += 1
        intervals.append({"min": current_start, "max": current_end})
        current_start = current_end
        current_end = current_start + interval_length

    if not intervals:
        return [{"min": min_start, "max": max_end + 1}]
    elif intervals[-1]["max"] < max_end:
        intervals.append(
            {"min": intervals[-1]["max"], "max":
             get_split_position(data_loader, chrom_number, max_end) + 1})

    return intervals


def get_split_position(data_loader, chrom_number, current_pos, look_left=False):
    '''
    Verifies whether a given position doesn't have any overlapping records,
    if so, checks the position at the overlapping record's end (or start,
    if look_left is set to True)
    '''
    query = get_check_position_query(chrom_number, current_pos)
    results = data_loader.es_tools.raw_search(query)
    if results["hits"]["total"] == 0:
        return current_pos
    lookup_pos = results["hits"]["hits"][0]["_source"]["end"]
    if look_left:
        if current_pos < 0:
            return 0
        lookup_pos = results["hits"]["hits"][0]["_source"]["start"]
    return get_split_position(data_loader, chrom_number, lookup_pos, look_left)


def get_check_position_query(chrom_number, current_pos):
    '''
    Given a chromosome number and a particular positions, returns a query
    used to check whether there are any records that overlap the position
    '''
    return {
        "query": {
            "match": {
                "chrom_number": chrom_number
            }
        },
        "post_filter": {
            "bool": {
                "must": [
                    {
                        "range": {
                            "start": {
                                "lt": current_pos
                            }
                        }
                    },
                    {
                        "range": {
                            "end": {
                                "gt": current_pos
                            }
                        }
                    }
                ]
            }
        },
        "sort": {
            "end": {
                "order": "desc"
            }
        }
    }


def build_search_tree(
        data_loader,
        chrom_number,
        start_pos,
        end_pos,
        source):
    '''
    returns an interval tree of all records with the specified
    chromosome and with start positions within a given interval
    '''
    start_time = timeit.default_timer()
    query = {
        "query": {
            "bool": {
                "must": [
                    {
                        "range": {
                            "start": {
                                "gte": start_pos,
                                "lt": end_pos
                            }
                        }
                    },
                    {
                        "match": {
                            "chrom_number": chrom_number
                        }
                    }
                ]
            }
        },
        "fields": ["_source", "_size"]
    }

    results = data_loader.es_tools.scan(query)

    (source_key, source_value) = source.items()[0]

    records_tree = IntervalTree()
    records_from_file = []
    for record in results:
        [start, end] = [record["_source"]["start"], record["_source"]["end"]]
        record["_source"]["record_id"] = record["_id"]
        record["_size"] = record["_size"]
        # records_tree[start:end+1] = record
        records_tree.addi(start, end+1, record)
        if record["_source"][source_key] == source_value:
            records_from_file.append(record)

    end_time = timeit.default_timer()
    logging.debug(
        "Generated record tree with %d records for chromosome %s " +
        "and positions range %d - %d, list of %d records " +
        "from source file %s in %f seconds.",
        len(records_tree),
        chrom_number,
        start_pos,
        end_pos,
        len(records_from_file),
        str(source),
        end_time - start_time
    )
    return {
        "records_tree": records_tree,
        "records_from_file": records_from_file
    }


def denormalize_data(data_loader_dst, records_tree, records_from_file):
    '''
    searches the provided tree for data overlapping with the records
    from a specific sources file, updates their events fields accordingly
    and adds/re-indexes them on the denormalized index
    '''
    start_time = timeit.default_timer()
    overlapping_sets = {}
    buffered_values = []
    buffer_size = 0
    header_size = 140
    max_buffer_size = 4*1024000
    batch_size = 4000

    for record in records_from_file:
        [start, end] = [record["_source"]["start"], record["_source"]["end"]]
        # looking up overlapping records at a single position seem more
        # efficient than querying a range, as such, use it when possible
        if start == end:
            overlapping_set = records_tree[start]
        else:
            overlapping_set = records_tree[start:end+1]
        overlapping_set.remove(Interval(start, end+1, record))
        # The clause below is very inefficient
        # overlapping_sets = overlapping_sets | overlapping_set
        index_record = copy.deepcopy(record)
        index_record["_source"]["events"] = []
        buffer_size += index_record["_size"] + header_size
        for interval in list(overlapping_set):
            if (is_addable_to_events(index_record, interval)):

                index_record["_source"]["events"].append(interval.data["_source"])
                overlapping_sets[interval.data["_id"]] = interval
                buffer_size += interval.data["_size"]
        index_record["_source"]["overlaps"] = len(
            index_record["_source"]["events"]
        )
        buffered_values.append(
            get_index_command(data_loader_dst, record)
        )
        buffered_values.append(index_record["_source"])
        # When the data type driving the denormalization process consists of
        # ranged records the buferd data might grow quite rapidly when as the
        # number of nested records can be quite large, as such, check that as
        # well when submitting bulk indexing tasks
        if len(buffered_values) >= batch_size or buffer_size > max_buffer_size:
            data_loader_dst.es_tools.submit_bulk_to_es(buffered_values)
            buffered_values = []
            buffer_size = 0

    if len(buffered_values) > 0:
        data_loader_dst.es_tools.submit_bulk_to_es(buffered_values)
        buffered_values = []
        buffer_size = 0

    overlapping_sets = overlapping_sets.values()

    for interval_rec in overlapping_sets:
        overlapping_items = set()
        if interval_rec.begin == interval_rec.end - 1:
            overlapping_items = records_tree[interval_rec.begin]
        else:
            overlapping_items = records_tree[
                interval_rec.begin:interval_rec.end]
        overlapping_items.remove(interval_rec)
        record = copy.deepcopy(interval_rec.data)
        record["_source"]["events"] = []
        buffer_size += record["_size"] + header_size
        for interval in list(overlapping_items):
            if (is_addable_to_events(record, interval)):
                record["_source"]["events"].append(interval.data["_source"])
                buffer_size += interval.data["_size"]
        record["_source"]["overlaps"] = len(record["_source"]["events"])
        buffered_values.append(
            get_index_command(data_loader_dst, record)
        )
        buffered_values.append(record["_source"])

        if len(buffered_values) >= batch_size or buffer_size > max_buffer_size:
            data_loader_dst.es_tools.submit_bulk_to_es(buffered_values)
            buffered_values = []
            buffer_size = 0

    if len(buffered_values) > 0:
        data_loader_dst.es_tools.submit_bulk_to_es(buffered_values)

    end_time = timeit.default_timer()
    logging.debug(
        "Indexed %d records from file and other %d overlapping records " +
        "in %d seconds (%s).",
        len(records_from_file),
        len(overlapping_sets),
        end_time - start_time,
        time.ctime()
    )


def is_addable_to_events(index_record, interval):
    '''
    determines whether interval should be added as per one of these conditions
        - is single cell data, and IDs match
        - is bulk data
    ASSUME: index_record and interval are either BOTH single cell, or BOTH bulk
    '''
    if "cell_id" in index_record["_source"]:
        return index_record["_source"]["cell_id"] == interval.data["_source"]["cell_id"]
    return True

def get_index_command(data_loader, record):
    '''
    given a record, returns the header needed to re-index it,
    preserves the original record's ID and document type
    '''
    return {
        "index": {
            "_index": data_loader.es_tools.get_index(),
            "_type": record["_type"],
            "_id": record["_id"]
        }
    }


def get_mappings(document_type):
    ''' returns the mappings for the de-normalized index  '''
    return {
        "mappings": {
            document_type: {
                "_source": {
                    "enabled": False
                },
                "dynamic_templates": [
                    {
                        "overlapping_events": {
                            "match": "events",
                            "mapping": {
                                "type": "nested",
                                "store": False
                            }
                        }
                    },
                    {
                        "ev_string_values": {
                            "path_match": "events.*",
                            "match_mapping_type": "string",
                            "mapping": {
                                "type": "string",
                                "index": "not_analyzed",
                                "store": False
                            }
                        }
                    },
                    {
                        "ev_long_values": {
                            "path_match": "events.*",
                            "match_mapping_type": "long",
                            "mapping": {
                                "type": "long",
                                "store": False
                            }
                        }
                    },
                    {
                        "ev_double_values": {
                            "path_match": "events.*",
                            "match_mapping_type": "double",
                            "mapping": {
                                "type": "double",
                                "store": False
                            }
                        }
                    },
                    {
                        "string_values": {
                            "path_match": "*",
                            "match_mapping_type": "string",
                            "mapping": {
                                "type": "string",
                                "index": "not_analyzed",
                                "store": True
                            }
                        }
                    },
                    {
                        "long_values": {
                            "path_match": "*",
                            "match_mapping_type": "long",
                            "mapping": {
                                "type": "long",
                                "store": True
                            }
                        }
                    },
                    {
                        "double_values": {
                            "path_match": "*",
                            "match_mapping_type": "double",
                            "mapping": {
                                "type": "double",
                                "store": True
                            }
                        }
                    }
                ]
            }
        }
    }











'''
SINGLE CELL DENORMALIZATION
'''

def is_single_cell_data(data_loader, source):
    '''
    Determines whether the source is single cell data
    '''
    query = {
        "query": {
            "filtered": {
                "filter": {
                    "bool": {
                        "must": [{
                            "match": source
                        },
                        {
                            "exists": {
                                "field": "cell_id"
                            }
                        }]
                    }
                }
            }
        }
    }

    results = data_loader.es_tools.raw_search(query)

    return results["hits"]["total"] != 0



def has_single_cell_qc_data(data_loader):
    '''
    Determines whether the index contains QC data
    '''
    query = {
        "query": {
            "filtered": {
                "filter": {
                    "bool": {
                        "must": [{
                            "match": {
                                "caller": "single_cell_qc"
                            }
                        }]
                    }
                }
            }
        }
    }

    results = data_loader.es_tools.raw_search(query)

    return results["hits"]["total"] != 0




def process_sc_chrom(params): 
    '''
    Generates events field for denormalized records by chromosome
    (on seg/bin data)

    '''

    chrom_nums = [str(i).zfill(2) for i in range(1, 23)] + ["x", "X", "y", "Y", "NONE"]

    process_params = []
    for chrom_number in chrom_nums:
        process_params.append(copy.deepcopy(params))
        process_params[-1]["chrom_number"] = chrom_number

    num_processes = cpu_count()
    if len(process_params) < num_processes:
        num_processes = len(process_params)

    if num_processes > MAX_PROCESSES:
        num_processes = MAX_PROCESSES

    if num_processes:
        process_pool = Pool(processes=num_processes)
        process_pool.map(pool_sc_chrom, process_params)
        process_pool.close()
        process_pool.terminate()
    else:
        logging.info("SC; No data from source %s has been found.", str(source))


def pool_sc_chrom(params):
    '''
    A proxy function to be called by Pool.map with simple parameters, it
    creates the data loader objects and along with the remaining parameters
    invokes function process_sc_chrom
    '''
    try:
        data_loader = AnalysisLoader(
            es_index=params["index"],
            es_doc_type=params["doc_type"],
            es_host=params["host"],
            es_port=params["port"],
            use_ssl=params["use_ssl"],
            http_auth=params["http_auth"],
            timeout=TIMEOUT)

        data_loader_dst = AnalysisLoader(
            es_index=params["dst_index"],
            es_doc_type=params["doc_type"],
            es_host=params["host"],
            es_port=params["port"],
            use_ssl=params["use_ssl"],
            http_auth=params["http_auth"],
            timeout=TIMEOUT)

        denormalize_sc_chrom(
            data_loader,
            data_loader_dst,
            params["source"],
            params["chrom_number"])

    except Exception:
        error_message = "An error has occurred while de-normalizing " +\
                        "records from source " + str(params["source"])
        logging.error("#" * len(error_message))
        logging.error(error_message)
        logging.error(traceback.format_exc(traceback.extract_stack()))
        logging.error("#" * len(error_message))


def denormalize_sc_chrom(data_loader, data_loader_dst, source, chrom_number):
    '''
    Processes the records in a given chromosome and loads them into denormalized index.

    '''
    start_time = timeit.default_timer()
    overlapping_sets = {}
    buffered_values = []
    buffer_size = 0
    header_size = 140
    max_buffer_size = 4*1024000
    batch_size = 4000


    query = get_sc_records_query(chrom_number, source)

    results = data_loader.es_tools.scan(query)

    results_count = 0

    for record in results:
        index_record = copy.deepcopy(record)
        index_record["_source"]["events"] = []
        index_record["_source"]["overlaps"] = 0

        results_count += 1

        # push to buffer
        buffer_size += index_record["_size"] + header_size
        buffered_values.append(
            get_index_command(data_loader_dst, record)
        )
        buffered_values.append(index_record["_source"])

        if len(buffered_values) >= batch_size or buffer_size > max_buffer_size:
            data_loader_dst.es_tools.submit_bulk_to_es(buffered_values)
            buffered_values = []
            buffer_size = 0

    if len(buffered_values) > 0:
        data_loader_dst.es_tools.submit_bulk_to_es(buffered_values)

    end_time = timeit.default_timer()

    logging.debug("Processed chr %s: %d records in %d seconds (%s)",
        chrom_number,
        results_count,
        end_time - start_time,
        time.ctime())


def get_sc_records_query(chrom_number, source):
    '''
    query to get all records for chromosome from source
    '''
    must_terms = [{"match": {"chrom_number": chrom_number}}]

    must_terms.append({"match": source})

    query =  {
        "query": {
            "bool": {
                "must": must_terms
            } 
        },
        "fields": ["_source", "_size"]
    }

    return query


def process_sc_qc(params): 
    '''
    Generates events field for denormalized records with QC data (by column)

    '''

    columns = [str(i) for i in range(1, 73)]

    process_params = []
    for col_num in columns:
        process_params.append(copy.deepcopy(params))
        process_params[-1]["column"] = col_num

    num_processes = cpu_count()
    if len(process_params) < num_processes:
        num_processes = len(process_params)

    if num_processes > MAX_PROCESSES:
        num_processes = MAX_PROCESSES

    if num_processes:
        process_pool = Pool(processes=num_processes)
        process_pool.map(pool_sc_qc, process_params)
        process_pool.close()
        process_pool.terminate()
    else:
        logging.info("QC; No data from source %s has been found.", str(source))



def pool_sc_qc(params):
    '''
    A proxy function to be called by Pool.map with simple parameters, it
    creates the data loader objects and along with the remaining parameters
    invokes function denormalize_sc_qc
    '''
    try:
        data_loader = AnalysisLoader(
            es_index=params["index"],
            es_doc_type=params["doc_type"],
            es_host=params["host"],
            es_port=params["port"],
            use_ssl=params["use_ssl"],
            http_auth=params["http_auth"],
            timeout=TIMEOUT)

        data_loader_dst = AnalysisLoader(
            es_index=params["dst_index"],
            es_doc_type=params["doc_type"],
            es_host=params["host"],
            es_port=params["port"],
            use_ssl=params["use_ssl"],
            http_auth=params["http_auth"],
            timeout=TIMEOUT)

        denormalize_sc_qc(
            data_loader, 
            data_loader_dst,
            params["source"],
            params["column"],
            params["is_qc"])

    except Exception:
        error_message = "An error has occurred while de-normalizing " +\
                        "records from source " + str(params["source"])
        logging.error("#" * len(error_message))
        logging.error(error_message)
        logging.error(traceback.format_exc(traceback.extract_stack()))
        logging.error("#" * len(error_message))


def denormalize_sc_qc(data_loader, data_loader_dst, source, column, is_qc):
    '''
    Processes the records in a given column and loads them into denormalized index.

    '''
    start_time = timeit.default_timer()
    overlapping_sets = {}
    buffered_values = []
    buffer_size = 0
    header_size = 140
    max_buffer_size = 4*1024000
    batch_size = 4000


    query = get_qc_col_records_query(column)

    results = data_loader.es_tools.scan(query)

    cell_count = 0
    overlapping_count = 0


    for qc_record in results:
        cell_count += 1

        if (is_qc): 
            qc_index_record = copy.deepcopy(qc_record)
            qc_index_record["_source"]["events"] = []
            qc_index_record["_source"]["overlaps"] = 0

            buffer_size += qc_index_record["_size"] + header_size
            buffered_values.append(
                get_index_command(data_loader_dst, qc_record)
            )
            buffered_values.append(qc_index_record["_source"])


        cell_query = get_overlapping_sc_query(qc_record, source, is_qc)
        overlap_results = data_loader.es_tools.scan(cell_query)

        for overlap_record in overlap_results:
            index_record = copy.deepcopy(overlap_record)
            index_record["_source"]["events"] = [qc_record["_source"]]
            index_record["_source"]["overlaps"] = 1
            overlapping_count += 1

            buffer_size += qc_record["_size"] + index_record["_size"] + header_size

            buffered_values.append(
                get_index_command(data_loader_dst, overlap_record)
            )
            buffered_values.append(index_record["_source"])

            if len(buffered_values) >= batch_size or buffer_size > max_buffer_size:
                data_loader_dst.es_tools.submit_bulk_to_es(buffered_values)
                buffered_values = []
                buffer_size = 0


        if len(buffered_values) >= batch_size or buffer_size > max_buffer_size:
            data_loader_dst.es_tools.submit_bulk_to_es(buffered_values)
            buffered_values = []
            buffer_size = 0

    if len(buffered_values) > 0:
        data_loader_dst.es_tools.submit_bulk_to_es(buffered_values)

    end_time = timeit.default_timer()

    logging.debug("Processed column %s: %d records with %d overlapping in %d seconds (%s)",
        column,
        cell_count,
        overlapping_count,
        end_time - start_time,
        time.ctime())


def get_qc_col_records_query(column):
    '''
    query to get qc records with matching column
    '''

    query =  {
        "query": {
            "bool": {
                "must": [{
                    "match": {
                        "column": column
                    }
                },
                {
                    "match": {
                        "caller": "single_cell_qc"
                    }
                } ]
            } 
        },
        "fields": ["_source", "_size"]
    }

    return query


def get_overlapping_sc_query(qc_record, source, is_qc):
    '''
    query to get records with matching single cell ID

    If is_qc, then all records BUT source
    Else, should just be source data
    '''
    single_cell_id = qc_record["_source"]["cell_id"]

    source_query = {
                    "match": source
                }
    query =  {
        "query": {
            "bool": {
                "must": [{
                    "match": {
                        "cell_id": single_cell_id
                    }
                }]
            } 
        },
        "fields": ["_source", "_size"]
    }

    if (is_qc):
        query["query"]["bool"]["must_not"] = []
        query["query"]["bool"]["must_not"].append(source_query)
    else:
        query["query"]["bool"]["must"].append(source_query)

    return query





def main():
    ''' main function '''
    argparser = argparse.ArgumentParser()
    argparser.add_argument(
        '-i',
        '--infile',
        dest='filename',
        action='store',
        help='The source file name of the data that is to be updated.',
        type=str)
    argparser.add_argument(
        '-x',
        '--index',
        dest='index_name',
        action='store',
        help='Name of the source index',
        type=str,
        default="SAMPLE_ID")
    argparser.add_argument(
        '-d',
        '--document_type',
        dest='document_type',
        action='store',
        help='Name of the source document type',
        type=str,
        default="RUN_ID")
    argparser.add_argument(
        '-H',
        '--host',
        dest='host',
        action='store',
        help='elastic search host. Default is localhost',
        type=str,
        default="localhost")
    argparser.add_argument(
        '-v',
        '--verbosity',
        dest='verbosity',
        action='store',
        help=('Default level of verbosity is INFO. ' +
              'Possible options: info|debug|warn|error'),
        type=str,
        default="info")
    argparser.add_argument(
        '-p',
        '--port',
        dest='port',
        action='store',
        help='Elastic search port number to connect to, default is 9200',
        type=int,
        default=9200)
    args = argparser.parse_args()

    # Set logging to console, default verbosity to INFO.
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)

    # Set the default log level for the elastic search
    # logger to WARN as INFO is quite verbose, also
    # enable DEBUG only for the code produced by the script
    es_logger = logging.getLogger('elasticsearch')
    es_logger.setLevel(logging.WARN)
    request_logger = logging.getLogger("urllib3")
    request_logger.setLevel(logging.WARN)

    logging.basicConfig(
        format='%(levelname)s: %(message)s',
        stream=sys.stdout
    )

    if args.verbosity:
        if args.verbosity.lower() == "debug":
            logger.setLevel(logging.DEBUG)
            es_logger.setLevel(logging.WARN)
            request_logger.setLevel(logging.WARN)

        elif args.verbosity.lower() == "warn":
            logger.setLevel(logging.WARN)

        elif args.verbosity.lower() == "error":
            logger.setLevel(logging.ERROR)
            es_logger.setLevel(logging.ERROR)
            request_logger.setLevel(logging.ERROR)

    if args.filename:
        generate_events_data(
            index=args.index_name,
            doc_type=args.document_type,
            host=args.host,
            port=args.port,
            source={"file_fullname": args.filename}
        )


if __name__ == '__main__':
    main()
