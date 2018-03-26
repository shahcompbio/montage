'''
Entry point for loading data from pipelint
Example:
	python pipeline_loader.py --config_file pipeline_loader.yaml --config_dir ~/w/bccrc/dat_prod -p 9211
'''
from __future__ import division
import logging
import traceback
import argparse
import os
import sys
import yaml

from sets import Set
from es_utils import ElasticSearchTools
from es_import_file import load_analysis_data
from es_import_yaml import parse_yaml_file

SCRIPT_PATH = os.path.abspath(__file__)
sys.path.insert(1, '/'.join(SCRIPT_PATH.split('/')[:-2]))


from elasticsearchloader.es_import_yaml import parse_yaml_file

def get_args():
    '''
    Argument parser
    '''
    parser = argparse.ArgumentParser(
        description=('Creates an index in Elasticsearch called published_dashboards_index, ' +
                     'and loads it with the data contained in the infile.')
    )
    required_arguments = parser.add_argument_group("required arguments")
    parser.add_argument(
        '-y',
        '--config_file',
        dest='config_file',
	default='pipeline_loader.yaml',
        action='store',
        help='Configuration file in Yaml format',
        type=str)
    parser.add_argument(
        '-t',
        '--config_dir',
        dest='config_dir',
        default='.',
        action='store',
        help='Directory containing Yaml file templates',
        type=str)
    parser.add_argument(
        '-H',
        '--host',
        default='localhost',
        metavar='Host',
        help='The Elastic search server hostname.',
	type=str)
    parser.add_argument(
        '-p',
        '--port',
        default=9200,
        metavar='Port',
        help='The Elastic search server port.',
	type=int)
    parser.add_argument(
        '-u',
        '--username',
        dest='username',
        help='Username',
	type=str)
    parser.add_argument(
        '-P',
        '--password',
        dest='password',
        help='Password',
	type=str)
    return parser.parse_args()

class PipelineLoader(object):
    '''
    Loads data from pipeline
    '''
    fieldIsList = {"sample_ids":0,"tags":0} # list of fields that are lists

    def __init__(self, args):
        self.CSVLoad(args)

    def yaml_template_preproc(self,yaml,lib):
        #print("------ yaml_template_preproc=",yaml) #debug
        if "__HEADER__" in yaml and "sample_id" in yaml["__HEADER__"]:
            yaml["__HEADER__"]["sample_id"] = lib
        return yaml

    def CSVLoad(self,args):
        try:
            y = parse_yaml_file(args.config_file)
            dom  = Set(["analysis_id","jira_id","library_id","description","type","files"])
            dom1 = {"bins":{0:"",1:"hmm-bin.yaml"},"segs":{0:"",1:"hmm-seg.yaml"},"qc":{0:"--qc",1:"hmm-qc.yaml"}}

            #checks if yaml == dom
            for x in [Set(y.keys()) ^ dom, Set(y["files"].keys()) ^ Set(dom1.keys())]:
                if len(x)>0:
                    raise NameError("Wrong yaml fields",x)

            #import files, load()
            for f,v in dom1.iteritems():
                #print("----------- CSVLoad(); ",f,v,y["files"][f],self.host,self.port) #debug
                yf = args.config_dir + "/" + v[1]
                #print("------- CSVLoad(); yaml_conf=",yf) #debug
                y0 = parse_yaml_file(yf)
            	print("------- CSVLoad(); ",[yf,y0]) #debug
                if {} != y0:
                    yml = self.yaml_template_preproc(y0,y["library_id"])
                    fnm = "{0}/{1}".format(os.path.dirname(y["files"][f]),v[1])
                    #print("------- CSVLoad(); file: ",yf,"yaml=",yml) ##debug
                    
		    #create temporary yaml files in data file directory 
		    with open(fnm, 'w') as yo:
                        yaml.dump(yml, yo, default_flow_style=False)
		    
		    auth = ""
		    #user and password comes together
        	    if args.username and args.password:
			auth = "-u {0} -P {1}".format(args.username,args.password)

		    cmd = "python es_import_file.py -y {0} -i {1} -H {2} -p {3} {4} {5}".format(fnm,y["files"][f],args.host,args.port,auth,v[0])
                    err = os.system(cmd)
		    if 0 != err:
			raise NameError("os.sysytem() error:",err)			
        except:
            logging.error(traceback.format_exc(traceback.extract_stack()))

def main():
    ''' main function '''
    args = get_args()
    try: 
        loader = PipelineLoader(args)
    except Exception:
    	logging.error(traceback.format_exc(traceback.extract_stack()))
	pass

if __name__ == '__main__':
    main()
