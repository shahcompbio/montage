'''
Creates an index in Elasticsearch called published_dashboards_index, and loads
it with the data contained in the infile.
Example:
	python published_dashboards_loader.py -i published_dashboards.txt -H 10.0.0.7
'''
from __future__ import division
import logging
import traceback
import argparse
import os
import sys
from es_utils import ElasticSearchTools

SCRIPT_PATH = os.path.abspath(__file__)
sys.path.insert(1, '/'.join(SCRIPT_PATH.split('/')[:-2]))


def get_args():
    '''
    Argument parser
    '''
    parser = argparse.ArgumentParser(
        description=('Creates an index in Elasticsearch called published_dashboards_index, ' +
                     'and loads it with the data contained in the infile.')
    )
    required_arguments = parser.add_argument_group("required arguments")
    required_arguments.add_argument(
        '-i',
        '--infile',
        metavar='InFile',
        required=True,
        help='The path to a file containing the sample data.')
    parser.add_argument(
        '-H',
        '--host',
        default='localhost',
        metavar='Host',
        help='The Elastic search server hostname.')
    parser.add_argument(
        '-p',
        '--port',
        default=9200,
        metavar='Port',
        help='The Elastic search server port.')
    parser.add_argument(
        '--use-ssl',
        dest='use_ssl',
        action='store_true',
        help='Connect over SSL',
        default=False)
    parser.add_argument(
        '-u',
        '--username',
        dest='username',
        help='Username')
    parser.add_argument(
        '-P',
        '--password',
        dest='password',
        help='Password')
    return parser.parse_args()


class PublishedDdashboardsIndexLoader(object):
    '''
    Populates published_dashboards_index
    '''
    fieldIsList = {"sample_ids":0,"tags":0} # list of fields that are lists

    def __init__(self, input_file, host, port, use_ssl=False, http_auth=None):
        self.input_file = input_file
        self.es_tools = ElasticSearchTools(
            es_doc_type="published_dashboards",
            es_index="published_dashboards"
        )
        self.host = host
        self.port = port
        self.use_ssl = use_ssl
        self.http_auth = http_auth

    def parse_line(self, line, indices):
        '''
        Parses the input line and returns a dictionary of the values,
        with the file header components as keys.
        '''
        line_dict = {}
        line = line.strip().split('\t')
        for key, value in indices.iteritems():
            try:
                if (key in self.fieldIsList):
			line_dict[key] = line[value].lstrip('[').rstrip(']').split(',')
		else:
			line_dict[key] = line[value].strip()
            except IndexError:
                pass
        return line_dict

    def parse_header(self, header):
        '''
        Parses the input file header and returns a dictionary of the indices,
        with the file header components as keys.
        '''
        values = {}
        header = header.strip().split('\t')
        for i, value in enumerate(header):
            values[value.strip()] = i
        return values

    def parse_file(self):
        '''
        Parses a file and returns a list containing a dictionary for each row.
        Each dictionary contains header=>value pairs for the row.
        '''
        data = []
        with open(self.input_file, 'r') as file_handle:
            header_dict = self.parse_header(file_handle.readline())
            for line in file_handle:
                data.append(self.parse_line(line, header_dict))
        logging.info("parse_file() OK")
	return data

    def import_file(self):
        '''
        Imports the imput file contents to the published_dashboards_index in Elasticsearch.
        '''
	try: 
		logging.basicConfig(
	            format='%(levelname)s:%(message)s',
	            level=logging.WARN)
	        self.es_tools.init_host(
	            host=self.host,
	            port=self.port,
	            http_auth=self.http_auth,
	            use_ssl=self.use_ssl)
	        self.es_tools.delete_index()
		self.es_tools.create_index(self.get_mappings())
		logging.error(traceback.format_exc(traceback.extract_stack()))
	
	        data = self.parse_file()
	        for record in data:
	            self.es_tools.submit_to_es(record)
	        logging.info("import_file() OK")
	except Exception:
	        logging.error(traceback.format_exc(traceback.extract_stack()))
        	pass

    def get_mappings(self):
        '''
        Returns the mappings used to perform the file import.
        '''
        document_type = self.es_tools.get_doc_type()
        mappings = {
	    "mappings": {
	      "published_dashboards": {
	        "properties": {
	          "description": {
	            "type": "string",
	            "index": "not_analyzed"
	          },
	          "dashboard": {
	            "type": "string",
	            "index": "not_analyzed"
	          },
	          "sample_ids": {
	            "type": "string",
	            "fields": {
	              "raw": {
	                "type": "string",
	                "index": "not_analyzed"
	              } } },
	          "tags": {
	            "type": "string",
	            "fields": {
	              "raw": {
	                "type": "string",
	                "index": "not_analyzed"
	              } } },
	          "title": {
	            "type": "string",
	            "index": "not_analyzed"
	          } } } } } 
        return mappings

def main():
    ''' main function '''
    args = get_args()
    http_auth = None
    if args.username and args.password:
        http_auth = (args.username, args.password)
    try: 
        loader = PublishedDdashboardsIndexLoader(
            args.infile,
            args.host,
            args.port,
            use_ssl=args.use_ssl,
            http_auth=http_auth)

        #res = loader.parse_file() #debug
	#print(res)
        loader.import_file()
    except Exception:
	logging.error(traceback.format_exc(traceback.extract_stack()))
	pass

if __name__ == '__main__':
    main()
