'''
Created on August 2014
@author: dmachev

A variation of esImportTool.py, which imports a single file at a time.

'''


from __future__ import division
import logging
import argparse
import re
import sys
import os
import importlib
import time
import traceback

SCRIPT_PATH = os.path.abspath(__file__)
sys.path.insert(1, '/'.join(SCRIPT_PATH.split('/')[:-2]))

from elasticsearchloader.es_settings import YAML_INDEX, YAML_DOCTYPE
from elasticsearchloader.es_settings import REFERENCE_INDEX as reference_index


def get_loader_class(loader_type):
    '''
    Given a caller type, returns the corresponding loader module and class
    '''

    # Some of the loader classes have been temporarily disabled, GV-462
    loader_classes = {
        "gene_annotations": {
            "module": "elasticsearchloader.gene_annotations_loader",
            "class": "GeneAnnotationsLoader"
        },
        "csv": {
            "module": "elasticsearchloader.csv_loader",
            "class": "CsvLoader"
        },
    }

    try:
        return loader_classes[loader_type]
    except KeyError:
        class DataTypeNotSupportedError(Exception):
            '''  Generic error class '''
            pass

        raise DataTypeNotSupportedError(
            "Data type {} is not supported at this time.".format(loader_type)
        )


def get_header_data(input_file):
    '''
    Parses the input file header in attempt to extract caller, sample_id, etc..
    Header format is:
        key0=value0,...,keyN=valueN
    '''
    header_values = {}

    with open(input_file, 'r') as file_handle:
        for line in file_handle:
            line = line.strip()
            if line and not line.startswith("#"):
                break
            if not line or not re.match(r'^#{2}\w[^#]', line):
                continue
            line = (re.sub(r'^#+', '', line)).split("=", 1)
            header_values[line[0]] = line[1]

    return header_values


def load_analysis_data(
        index_name='SAMPLE_ID',
        doctype='RUN_ID',
        host="localhost",
        port=9200,
        input_filename=None,
        analysis_data=None,
        header_data=None,
        index_alias=None,
        skip_denormalize=False,
        is_qc=False,
        use_ssl=False,
        http_auth=None):
    '''
    Loads the results from a single file into Elastic search

    :arg index_name: index to use, defaults to the sample ID in the header data
    :arg doctype: document type to use
    :arg host: Elastic Search host - defaults to localhost
    :arg port: Elastic Search port - defaults to 9200
    :arg input_filename: input analysis results file
    :arg header_data: the data usually provided through the input YAML file
    :arg analysis_data: parsed data, can be used in place of input file
    :arg index_alias: alias to link the denormalized data index under
    :arg skip_denormalize: whether to skip denormalization, defaults to False
    :arg use_ssl: specify whether the connection is over SSL
    :arg http_auth: authentication credentials in the following format:
        {
            'username': <user_account>,
            'password': <user_password>
        }

    E.g. load_analysis_data(
        input_filename=<path_to_results_file>,
        header_data={
            'caller': <data_type>,
            'sample_id': <sample_id>,
            ...
        }
    )

    alternatively, analysis data can be supplied directly

    load_analysis_data(
        header_data={
            'caller': <data_type>,
            'sample_id': <sample_id>,
            ...
        },
        analysis_data=[
         {
            'chrom_number": 1,
            'start': 100,
            ...
         },
         {
            'chrom_number': 2,
            'start': 200,
            ...
         },
         ...
        ]
    )
    '''

    logging.info("Processing results file %s.", input_filename)
    # Don't attempt to query the Yaml/Sample index in case the
    # caller type has been provided
    if isinstance(header_data, dict) and 'caller' in header_data.keys():
        try:
            # caller specific loaders will be phased out in favour of
            # specific file format based ones, i.e. vcf, csv
            loader_type = header_data['file_format']
        except KeyError:
            loader_type = header_data['caller']
        loader_info = get_loader_class(loader_type)
        module = importlib.import_module(loader_info["module"])
        loader_class = getattr(module, loader_info["class"])
        if index_name == 'PATIENT_ID':
            index_name = header_data["patient_id"].lower()
        elif index_name == 'SAMPLE_ID':
            if "sample_id" in header_data.keys():
                index_name = header_data["sample_id"].lower()
            elif "normal_sample_id" in header_data.keys():
                index_name = header_data["normal_sample_id"].lower()
            else:
                logging.error("No valid index name has been provided")
            logging.info("Setting index name to %s.", index_name)

        if doctype == 'RUN_ID':
            try:
                doctype = header_data['run_id']
            except KeyError:
                doctype = header_data['caller']

        es_loader = loader_class(
            es_index=index_name,
            es_doc_type=doctype,
            es_host=host,
            es_port=port,
            use_ssl=use_ssl,
            http_auth=http_auth)

        if header_data and not isinstance(header_data, dict):
            header_data = None

        if header_data:
            project_data = es_loader.get_reference_data(
                reference_index, header_data
            )
            if len(project_data):
                project_data = project_data[0]["_source"]
            else:
                project_data = {}
                logging.info('No relevant data found in %s.', reference_index)
            header_data = dict(header_data.items() + project_data.items())

        es_loader.create_index()

        es_loader.es_tools.refresh_index()

        logging.info("Indexing started: %s", time.ctime())
        stats = es_loader.parse(
            analysis_file=input_filename,
            custom_header=header_data,
            analysis_data=analysis_data
        )
        logging.info("Indexing finished: %s", time.ctime())

        es_loader.es_tools.refresh_index()

        es_loader.validate_import(
            input_file=input_filename,
            input_data=analysis_data,
            stats=stats
        )

        if skip_denormalize:
            return

        from elasticsearchloader.denormalize_index import generate_events_data

        if input_filename:
            source = {'file_fullname': input_filename}
        else:
            source = {'source_id': es_loader.get_source_id()}
        generate_events_data(
            index=index_name,
            doc_type=doctype,
            host=host,
            port=port,
            use_ssl=use_ssl,
            http_auth=http_auth,
            source=source,
            index_alias=index_alias,
            is_qc=is_qc
        )

        return

    header_data = get_header_data(input_filename)

    module = importlib.import_module('elasticsearchloader.analysis_loader')
    loader_class = getattr(module, 'AnalysisLoader')

    query = []
    for field in [
            'caller',
            'sample_id',
            'library_id',
            'normal_sample_id',
            'normal_library_id',
            'run_id',
            "build"
    ]:
        if field.upper() in header_data and header_data[field.upper()]:
            query.append({'terms': {field: [header_data[field.upper()]]}})

    es_loader = loader_class(
        es_index=YAML_INDEX,
        es_doc_type=YAML_DOCTYPE,
        es_host=host,
        es_port=port,
        use_ssl=use_ssl,
        http_auth=http_auth)

    qry = {'bool': {'must': query}}
    results = es_loader.es_tools.search(qry)
    print("------- qry: ",qry,"; res: ",results) #debug
    if results['hits']['total'] == 0:
        logging.error(
            'No corresponding record could be found in %s.', YAML_INDEX
        )
        return

    for yaml_data in [record['_source'] for record in results['hits']['hits']]:
        try:
            if 'sample_id' in yaml_data.keys():
                sample_id = yaml_data['sample_id']
            elif 'normal_sample_id' in yaml_data.keys():
                sample_id = header_data['normal_sample_id']

            if 'caller' not in yaml_data or not yaml_data['caller']:
                logging.info(
                    "The input file doesn't specify analysis type. Exiting. ",
                )
                return
            loader_info = get_loader_class(yaml_data["caller"])
            module = importlib.import_module(loader_info["module"])
            loader_class = getattr(module, loader_info["class"])

            if index_name == 'SAMPLE_ID':
                if not sample_id:
                    logging.error(
                        "The header doesn't specify a sample id " +
                        "to use as index."
                    )
                    return
                index_name = sample_id.lower()

                if doctype != 'RUN_ID':
                    logging.error(
                        "The header doesn't specify a run ID " +
                        "to use as a document type."
                    )
                    return
                doctype = yaml_data['run_id'].lower()

            es_loader = loader_class(
                es_index=index_name,
                es_doc_type=doctype,
                es_host=host,
                es_port=port,
                use_ssl=use_ssl,
                http_auth=http_auth,
                timeout=1000)

            if es_loader.es_tools.exists_index():
                es_loader.es_tools.refresh_index()

            es_loader.create_index()

            logging.info("Indexing started: %s", time.ctime())
            stats = es_loader.parse(input_filename)
            logging.info("Indexing finished: %s", time.ctime())

            es_loader.es_tools.refresh_index()

            es_loader.validate_import(
                input_file=input_filename,
                input_data=analysis_data,
                stats=stats
            )

        except Exception:
            logging.error("Possibly an incorrect loader type was invoked.")
            error_message = "An error has occurred while processing " +\
                            "results file " + input_filename
            logging.error("#" * len(error_message))
            logging.error(error_message)
            logging.error(traceback.format_exc(traceback.extract_stack()))
            logging.error("#" * len(error_message))


def pool_process(params):
    '''
    Wrapper for function load_analysis_data intended to be queued onto
    a process pool
    '''
    try:
        load_analysis_data(
            index_name=params["index_name"],
            doctype=params["doctype"],
            host=params["host"],
            port=params["port"],
            input_filename=params["input_filename"]
        )
    except Exception:
        error_message = "An error has occurred while processing " +\
                        "results file " + params["input_filename"]
        logging.error("#" * len(error_message))
        logging.error(error_message)
        logging.error(traceback.format_exc(traceback.extract_stack()))
        logging.error("#" * len(error_message))


def delete_index(index_name='Unknown', host='localhost', port=9200):
    ''' Deletes an Elastic search index '''
    loader_info = get_loader_class('mutationseq')
    if loader_info:
        module = importlib.import_module(loader_info["module"])
        loader_class = getattr(module, loader_info["class"])

        es_loader = loader_class(
            es_index=index_name,
            es_host=host,
            es_port=port)

        es_loader.es_tools.delete_index()
        es_loader.es_tools.refresh_index()
    else:
        logging.info(
            "Unable to delete index %s. Exiting. ", index_name
        )


def search_index(
        index_name=None,
        host='localhost',
        port=9200,
        use_ssl=False,
        http_auth=None,
        query=None,
        raw_search=False):
    ''' performs the search specified in parameter 'query' '''
    loader_info = get_loader_class('mutationseq')

    if loader_info:
        module = importlib.import_module(loader_info["module"])
        loader_class = getattr(module, loader_info["class"])

        es_loader = loader_class(
            es_index=index_name,
            es_host=host,
            es_port=port,
            use_ssl=use_ssl,
            http_auth=http_auth)

        es_loader.es_tools.refresh_index()

        if raw_search:
            return es_loader.es_tools.raw_search(query)

        return es_loader.es_tools.search(query)

    else:
        logging.info(
            "Unable to delete index %s. Exiting. ", index_name
        )
    return {}


def get_sample_data(
        index_name="default_index",
        doctype="default_type",
        host="localhost",
        port=9200,
        use_ssl=False,
        http_auth=None,
        header_data=None):
    if not isinstance(header_data, dict):
        return {}

    query_values = {}
    for field in [
            'sample_id', 'normal_sample_id', 'library_id', 'normal_library_id']:
        if field in header_data.keys():
            query_values[field] = header_data[field]
        else:
            query_values[field] = ''

    module = importlib.import_module('elasticsearchloader.analysis_loader')
    loader_class = getattr(module, 'AnalysisLoader')

    es_loader = loader_class(
        es_index=index_name,
        es_doc_type=doctype,
        es_host=host,
        es_port=port,
        use_ssl=use_ssl,
        http_auth=http_auth)

    try:
        project_records = es_loader.get_reference_data(
            reference_index, query_values
        )
        return project_records[0]['_source']
    except (IndexError, KeyError):
        logging.error("Sample not found in Sample index.")
        return {}


def main():
    ''' main function '''
    argparser = argparse.ArgumentParser()
    argparser.add_argument(
        '-i',
        '--infile',
        dest='infile',
        action='store',
        help=('An analysis results file of a supported data type/format'),
        type=str)

    argparser.add_argument(
        '-x',
        '--index',
        dest='index_name',
        action='store',
        help='name of index to create and load into',
        type=str,
        default="SAMPLE_ID")

    argparser.add_argument(
        '-d',
        '--doc_type',
        dest='doctype',
        action='store',
        help='name of document types to make',
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
        '-p',
        '--port',
        dest='port',
        action='store',
        help='Elastic search port, default is 9200',
        type=int,
        default=9200)

    argparser.add_argument(
        '-y',
        '--config_file',
        dest='config_file',
        action='store',
        help='Configuration file in Yaml format',
        type=str)

    argparser.add_argument(
        '-a',
        '--alias',
        dest='index_alias',
        action='store',
        help='Alias to link the denormalized data index under',
        type=str)

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
        '--skip-denormalize',
        dest='skip_denormalize',
        action='store_true',
        help='If set, indexed data is not denormalized',
        default=False)

    argparser.add_argument(
        '--qc',
        dest='is_qc',
        action='store_true',
        help='If set, data is QC metrics',
        default=False)

    argparser.add_argument(
        '--use-ssl',
        dest='use_ssl',
        action='store_true',
        help='Connect over SSL',
        default=False)
    argparser.add_argument(
        '-u',
        '--username',
        dest='username',
        help='Username')
    argparser.add_argument(
        '-P',
        '--password',
        dest='password',
        help='Password')

    args = argparser.parse_args()

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

    http_auth = None
    if args.username and args.password:
        http_auth = (args.username, args.password)

    if args.config_file:
        from elasticsearchloader.es_import_yaml import load_yaml_file
        try:
            yaml_data = load_yaml_file(
                index_name=YAML_INDEX,
                doctype=YAML_DOCTYPE,
                host=args.host,
                port=args.port,
                use_ssl=args.use_ssl,
                http_auth=http_auth,
                input_data={
                    'config_file': args.config_file,
                    'filename': args.infile
                }
            )[0]
        except IndexError:
            yaml_data = {}

    if args.infile:
        project_data = get_sample_data(
            index_name=reference_index,
            doctype='sample_ids',
            host=args.host,
            port=args.port,
            use_ssl=args.use_ssl,
            http_auth=http_auth,
            header_data=yaml_data
        )

        header_data = dict(yaml_data.items() + project_data.items())

        load_analysis_data(
            index_name=args.index_name,
            doctype=args.doctype,
            host=args.host,
            port=args.port,
            input_filename=args.infile,
            header_data=header_data,
            index_alias=args.index_alias,
            skip_denormalize=args.skip_denormalize,
            is_qc = args.is_qc,
            use_ssl=args.use_ssl,
            http_auth=http_auth
        )


if __name__ == '__main__':
    main()
