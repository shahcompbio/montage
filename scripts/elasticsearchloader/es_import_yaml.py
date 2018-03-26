'''
Created on October 2014
@author: dmachev

'''


from __future__ import division
import logging
import argparse
import sys
import importlib
import yaml
import os
import re
import time
import copy
import traceback
from datetime import datetime
from prettytable import PrettyTable
from functools import reduce
from yaml.scanner import ScannerError
from sets import Set

SCRIPT_PATH = os.path.abspath(__file__)
sys.path.insert(1, '/'.join(SCRIPT_PATH.split('/')[:-2]))

from elasticsearchloader.es_settings import YAML_INDEX
from elasticsearchloader.es_settings import YAML_DOCTYPE
from elasticsearchloader.es_import_file import get_header_data

# User defined fields will also be added to the index
_defined_by_user = {}


def load_yaml_file(
        index_name="default_index",
        doctype='default_type',
        host="localhost",
        port=9200,
        use_ssl=False,
        http_auth=None,
        input_data=None):
    '''
    parses the data found in the Yaml file referenced by the results
    file provided as an input or
    '''

    header_data = {}

    print("input_data=",input_data) #debug
    if "filename" in input_data and input_data["filename"]:
        logging.info(
            "Processing pipeline configuration file used to generate %s.",
            input_data["filename"]
        )

        if not os.path.isfile(input_data["filename"]):
            logging.error("%s: no such file.", input_data["filename"])
            if not input_data["config_file"]:
                return

        try:
            header_data = get_header_data(input_data["filename"])
        except IOError:
            logging.error(traceback.format_exc(traceback.extract_stack()))

    if not input_data["config_file"] and 'CONFIG_FILE' in header_data.keys():
        input_data["config_file"] = header_data['CONFIG_FILE']

    if not input_data["config_file"]:
        logging.error("No Yaml configuration file available, skipping ...")
        return

    logging.info(
        "Processing pipeline configuration file %s.",
        input_data["config_file"]
    )

    if not os.path.isfile(input_data["config_file"]):
        logging.error(
            "%s doesn't exist or is not a file.", input_data["config_file"]
        )

    yaml_data = parse_yaml_file(input_data["config_file"])

    if not yaml_data:
        logging.error(
            "%s: is not a valid yaml file. Exitting ...",
            input_data["config_file"]
        )
        return

    module = importlib.import_module("elasticsearchloader.analysis_loader")
    loader_class = getattr(module, "AnalysisLoader")
    es_loader = loader_class(
        es_index=index_name,
        es_doc_type=doctype,
        es_host=host,
        es_port=port,
        use_ssl=use_ssl,
        http_auth=http_auth)

    if not es_loader.es_tools.exists(index_name):
        es_loader.create_index(
            {
                'mappings': {
                    doctype: {
                        "dynamic_templates": [
                            {
                                "string_values": {
                                    "match": "*",
                                    "match_mapping_type": "string",
                                    "mapping": {
                                        "type": "string",
                                        "index": "not_analyzed"
                                    }
                                }
                            }
                        ]
                    }
                }
            }
        )

    es_loader.es_tools.refresh_index()

    yaml_data = parse_yaml_file(input_data["config_file"])  #????????

    #logging.info("extract_yaml_data; yaml: %s;",yaml_data) #debug
    yaml_data = extract_yaml_data(yaml_data)

    if not yaml_data:
        logging.error(
            "File %s doesn't contain sufficient data.",
            input_data["config_file"]
        )
        return
    
    #testing fields to ignore
    yml = yaml_data[0]["expand"]
    if "field_ignore" in yml:
        d = Set(yml["field_ignore"]).difference(Set(yml["field_types"].keys()))
        if len(d)>0:
                logging.error("Field(s) to ignore not in the field list: %s;",d)
                exit(1)
    else:
        yml["field_ignore"] = {}

    for idx, record in enumerate(yaml_data):
        try:
            #print "rec: ",record #debug
            record = dict(record.items() + record['expand'].items())
            del record['expand']
        except KeyError:
            pass
        except AttributeError:
            del record['expand']
        stats = PrettyTable(['Field', 'Value'])
        stats.padding_width = 1
        stats.align = 'l'
    # if ('run_id' not in record.keys() or not record["run_id"]):
        #     record['run_id'] = ''
        if 'RUN_ID' in header_data.keys() and header_data['RUN_ID']:
            record['run_id'] = header_data['RUN_ID']
        else:
            record['run_id'] = datetime.now().strftime("%Y%m%d%H%M%S")
        for key in record.keys():
            stats.add_row([key, record[key]])
        logging.info(
            "Adding the below listed record to %s:\n%s", YAML_INDEX, stats
        )
        query = generate_record_query(record)
        result = es_loader.es_tools.search(query)
        #if result['hits']['total'] > 0:
        if 0==1:
            logging.warn('The record exists, skipping ...\n')
        else:
            #remove ignored fields from the field list
            r = copy.deepcopy(record)
            if "field_ignore" in r:
                for x in r["field_ignore"]:
                    if x in r["field_types"]:
                        del r["field_types"][x] 
                del r["field_ignore"]
                #print "11111 rec: ",r #debug
            es_loader.es_tools.submit_to_es(r)
            es_loader.es_tools.refresh_index()
        yaml_data[idx] = record
        logging.info('Done.\n')

    return yaml_data


def generate_record_query(record):
    '''generates a query used to perofrm exacat search for a record'''
    query = []
    for field in record.keys():
        if field in ['field_mapping', "field_types", "field_ignore"]:
            continue
        # replace null values with an empty string
        if not record[field]:
            record[field] = ''
        query.append({'match': {field: record[field]}})

    return {'bool': {'must': query}}


def parse_yaml_file(yaml_file):
    '''
    returns a dictionary with parsed data from a yaml input file and
    extracts and adds the run id from the file name
    '''
    if not os.path.isfile(yaml_file):
        return {}

    input_file = open(yaml_file, 'r')
    file_data = '\n'.join(input_file.readlines())
    input_file.close()

    try:
        yaml_data = yaml.load(file_data)
    except ScannerError:
        logging.error("Error parsing yaml file %s.", yaml_file)
        return {}

    if not isinstance(yaml_data, dict):
        return {}

    return yaml_data


def extract_yaml_data(yaml_data):
    ''' extracts the relevant information from a parsed yaml file '''
    from elasticsearchloader.es_settings import YAML_FIELDS as yaml_fields

    data = {}

    # process user defined fields
    for field in _defined_by_user.keys():
        data[field] = get_nested_value(
            yaml_data,
            _defined_by_user[field]
        )

    # process fields defined under __PIPELINE_INFO__ and __SAMPLES__ sections
    #logging.info("extract_yaml_data1; yaml: %s;",yaml_fields) #debug
    for field in yaml_fields["common"].keys():
        data[field] = get_nested_value(
            yaml_data,
            yaml_fields["common"][field]
        )

    if not data['caller']:
        logging.error("Unable to determine caller/data type from yaml file.")
        return

    callers = data['caller']
    del data['caller']

    if not isinstance(callers, list):
        callers = [callers]

    es_records = []

    for caller in callers:
        caller_data = copy.deepcopy(data)
        caller_data['caller'] = caller
        for field in yaml_fields[caller].keys():
            caller_data[field] = get_nested_value(
                yaml_data,
                yaml_fields[caller][field]
            )

        data_records = expand_data(caller_data)

        for record in data_records:
            es_records.append(dict(data.items() + record.items()))

    # Return only unique records
    return es_records


def get_nested_value(dictionary, attr_tree):
    '''
    returns a nested value in a dictionary given a list of nested keys, i.e
    get_nested_value(dictionary, ['key1', 'key2', key3'] will return
    dictionary[key1][key2][key3]. In case any of the keys is a dictionary, it
    will attempt to determine the key based on whether its substructure
    contains the provided key(s)/value(s) pair(s)
    '''
    if len(attr_tree) == 0:
        return dictionary
    key = attr_tree[0]
    #logging.info("k=%s;\n\t dic=%s;\n\t tree=%s;",key,str(dictionary),str(attr_tree)) #debug
    #logging.info("traceback.format_stack; k%s;\n",traceback.format_stack()) #debug
    if isinstance(key, str):
        # in case the key is a regular expression
        if key == 'integer':
            return int(dictionary)
        elif re.match(r'^\^.*\$$', key):
            regex = re.compile(key)
            match = regex.match(dictionary)
            if match:
                return match.groups()[0]
            return dictionary
        elif key == '*':
            values = []
            fields = sorted(dictionary.keys())
            for field in fields:
                values.append(
                    get_nested_value(dictionary[field], attr_tree[1:])
                )
            return values

        if key not in dictionary.keys():
	    logging.error('%s field is not listed in the yaml file', key)
            return

        return get_nested_value(dictionary[key], attr_tree[1:])
    elif isinstance(key, dict):
        fields = dictionary.keys()
        for field in dictionary.keys():
            for attr, val in key.items():
                found_val = find_nested_value(dictionary[field], attr)
                if found_val != val:
                    fields = [el for el in fields if el != field]
                    break
        values = []
        for field in fields:
            found_value = get_nested_value(dictionary[field], attr_tree[1:])
            if found_value:
                values.append(found_value)

        return values


def find_nested_value(dictionary, key):
    ''' performs a deep look up of a key/value in a dictionary'''
    if not isinstance(dictionary, dict):
        return
    if key in dictionary.keys():
        return dictionary[key]
    for field in dictionary.keys():
        if isinstance(dictionary[field], dict):
            found_value = find_nested_value(dictionary[field], key)
            if found_value:
                return found_value
    return


def expand_data(dictionary):
    '''
    transforms a dictionary in which some of the fields are lists into a
    list of dictionaries with the coresponding fields storing a single value
    '''
    from fractions import gcd

    # Find the lowest common multiple of the various elements' lengths
    item_lengths = list(set([
        len(item) for item in dictionary.values() if isinstance(item, list)
        and len(item) > 0
    ]))
    lcm = 1
    if item_lengths:
        lcm = int(reduce(lambda a, b: (a * b)/gcd(a, b), item_lengths))

    for field in dictionary.keys():
        if not isinstance(dictionary[field], list):
            dictionary[field] = [dictionary[field]] * lcm
        elif len(dictionary[field]) == 1:
            dictionary[field] = dictionary[field] * lcm
        elif not dictionary[field]:
            # The field has null/blank value
            dictionary[field] = [""] * lcm
        else:
            dictionary[field] *= int(lcm/len(dictionary[field]))

    records = []
    for idx in range(0, lcm):
        record = {}
        for field in dictionary.keys():
            record[field] = dictionary[field][idx]
        records.append(record)

    return records


def main():
    ''' main function '''
    argparser = argparse.ArgumentParser()
    argparser.add_argument(
        '-i',
        '--infile',
        dest='infile',
        action='store',
        help=('A watermarked analysis results file containing the run ID and ' +
              'a reference to the pipeline Yaml configuration file or ' +
              'a directory containing such files.'),
        type=str)
    argparser.add_argument(
        '-x',
        '--index',
        dest='index_name',
        action='store',
        help='name of index to create/load into',
        type=str,
        default=YAML_INDEX)

    argparser.add_argument(
        '-d',
        '--doc_type',
        dest='doctype',
        action='store',
        help='name of document types to make',
        type=str,
        default=YAML_DOCTYPE)

    argparser.add_argument(
        '-H',
        '--host',
        dest='host',
        action='store',
        help='elastic search host. Default is localhost',
        type=str,
        default="localhost")

    argparser.add_argument(
        '-p',
        '--port',
        dest='port',
        action='store',
        help='Elastic search port, default is 9200',
        type=int,
        default=9200)

    argparser.add_argument(
        '-v',
        '--verbosity',
        dest='verbosity',
        action='store',
        help='Default level of verbosity is INFO.',
        choices=['info', 'debug', 'warn', 'error'],
        type=str,
        default="info")

    argparser.add_argument(
        '-f',
        '--fields',
        nargs='*',
        dest='fields',
        help='''Additional fields to be extracted from
                the Yaml file and added to the index.''',
        default=[])

    args = argparser.parse_args()

    for field in args.fields:
        field_path = field.split(',')
        _defined_by_user[field_path[0]] = field_path[1:]

    # Set logging to console, default verbosity to INFO.
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)

    # Set the default log level for the elastic search
    # logger to WARN as INFO is quite verbose, the
    # omitted information can be viewed at level DEBUG.
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

    if args.infile:
        if os.path.isdir(args.infile):
            for results_file in os.listdir(args.infile):
                if results_file.startswith('.'):
                    continue
                load_yaml_file(
                    args.index_name,
                    args.doctype,
                    args.host,
                    args.port,
                    {
                        'filename': results_file,
                        'config_file': None
                    })
        else:
            input_data = {
                "filename": "",
                "config_file": ""
            }
            if args.infile.endswith('.yaml'):
                input_data["config_file"] = args.infile
            else:
                input_data["filename"] = args.infile
            load_yaml_file(
                args.index_name,
                args.doctype,
                args.host,
                args.port,
                input_data)
    else:
        # Attempt reading the database for new files
        from elasticsearchloader.es_import_file import get_files_from_db
        filter_clause = 'WHERE config_loaded_to_elasticsearch IS NULL'
        for record in get_files_from_db(filter_clause):
            load_yaml_file(
                args.index_name,
                args.doctype,
                args.host,
                args.port,
                record)


if __name__ == '__main__':
    main()
