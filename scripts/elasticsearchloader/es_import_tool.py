'''
Created on April 2014
@author: klc

TODO:
Print out summary statistics of data just loaded.

'''


from __future__ import division
from elasticsearchloader.gene_annotations_loader import GeneAnnotationsAnalysisLoader
import argparse
import threading
import logging
import timeit
import sys

def load_gene_annotations(gene_annotations_loader, files_to_load=[]):
    start = timeit.default_timer()

    for data in files_to_load:
        gene_annotations_loader.load_all_files(
            data['dir'],
            data['type'],
            data['project'])

    gene_annotations_loader.es_tools.refresh_index()

    stop = timeit.default_timer()
    logging.info(
        "Loading Gene annotations data finished.  Took %s ",
        stop -
        start)


def threaded_loader(
        index_name="default_index",
        document_type='default_docType',
        host="localhost",
        port=9200,
        gene_annotations_to_load=None):

    gene_annotations_loader = GeneAnnotationsAnalysisLoader(
        es_doc_type=document_type,
        es_index=index_name,
        es_host=host,
        es_port=port)


    threads = []
    
    if gene_annotations_to_load and len(gene_annotations_to_load) > 0:
        gene_annotations_runner = threading.Thread(
            target=load_gene_annotations,
            args=(
                gene_annotations_loader,
                gene_annotations_to_load))
        threads.append(gene_annotations_runner)
        gene_annotations_runner.start()


    for loader in threads:
        loader.join()


def parse_input_file(inputfile):
    '''
    Parse input manifest file so knows what to load, with what parameters
    '''

    file_handle = open(inputfile, 'r')

    # read the records into the intermediate analysis_files
    skipped_row = 0
    line_counter = 0

    gene_annotations_input_dirs = []

    for line in file_handle:
        line_counter += 1

        # Skip lines that begin with a # (ie don't parse comments) and empty
        # lines
        if line.startswith('#') or not line.strip():
            skipped_row += 1
            continue

        parsed_values = {}
        split_line = line.strip().split('\t')

        # Validate that input file is correct
        if not len(split_line) == 4:
            logging.warn(
                "Input file has invalid line.  Line is %s Skipping. ",
                line)
            continue

        parsed_values['type'] = split_line[0]  # tumor Type
        # museq, titan, snvmix, destruct, hms, defuse, pyclone, etc..
        parsed_values['analysis_type'] = split_line[2]
        parsed_values['dir'] = split_line[1]  # dir to load
        parsed_values['project'] = split_line[3]

        if parsed_values['analysis_type']:
            if parsed_values['analysis_type'].lower() == 'gene_annotations':
                gene_annotations_input_dirs.append(parsed_values)
            else:
                logging.info(
                    "Input file row has unknown analysis type at row %s. " +
                    "Skipping. ",
                    line_counter)

        else:
            logging.info(
                "Input file row missing analysis type at row %s. Skipping. ",
                line_counter)

    file_handle.close()

    return {
        'gene_annotations': gene_annotations_input_dirs
    }


def load(index_name="default_index", document_type='default_docType',
         host="localhost", port=9200, input_filename='none'):
    '''
    Just a regular loader used initally, but now deprecated.
    Use threaded file loader instead.
    '''

    gene_annotations_loader = GeneAnnotationsAnalysisLoader(
        es_index=index_name,
        es_doc_type=document_type,
        es_host=host,
        es_port=port)
    gene_annotations_loader.es_tools.delete_index()

    #snvmix_loader.create_index() #???

    files_to_load = parse_input_file(input_filename)

    for data in files_to_load['gene_annotations']:
        gene_annotations_loader.load_all_files(
            data['dir'],
            data['type'],
            data['project'])

    #snvmix_loader.es_tools.refresh_index() #???


'''
    This will load samples DG1155, DG1157, DG1158
    snvmix, titan, museq results
'''
def _cnd_Load(index_name="default_index",
             document_type='default_docType', host="localhost", port=9200):
    # cnd
    tumor_type = 'cnd'
    #base_dir = "/home/khamer/workspace/moncodb"
    base_dir = "../"

    ########################################################
    # load gene_annotations
    gene_annotations_to_load = []
    gene_annotations_to_load.append(
        {
            "dir": base_dir +
            "../resources/geneAnnotations/test/",
            'type': tumor_type,
            'project': 'test'})

    gene_annotations_runner = threading.Thread(
        target=load_gene_annotations,
        args=(
            gene_annotations_loader,
            gene_annotations_to_load))
    threads.append(gene_annotations_runner)
    gene_annotations_runner.start()


def main():

    argparser = argparse.ArgumentParser()
    argparser.add_argument(
        '-i',
        '--input_filename',
        dest='input_filename',
        action='store',
        help=('the filename of the file that contains directories to import.' +
              'format is:  directory <tab> tumor_type <tab> [museq|titan|' +
              'snvmix|destruct|hms|defuse|pyclone|titan_support_data|' +
              'gene_expression|strelka|gene_annotations|samtools] <tab> project'
              ),
        type=str)
    # argparser.add_argument(
    #     '-m',
    #     '--mode',
    #     dest='mode',
    #     action='store',
    #     help=('append data to index or delete index and rebuild.' +
    #           ' Possible options:  append|new'),
    #     type=str)
    argparser.add_argument(
        '-x',
        '--index',
        dest='index_name',
        action='store',
        help='name of index to create and load into (will delete 1st)',
        type=str,
        default="default_index")
    argparser.add_argument(
        '-d',
        '--document_type',
        dest='document_type',
        action='store',
        help='name of document types to make',
        type=str,
        default="default_doc_type")
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
        help=('Default level of verbosity is INFO.' +
              ' Possible options: info|debug|warn|error'),
        type=str,
        default="info")

    args = argparser.parse_args()

    # Set logging to console, default verbosity to INFO.
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)

    # Set the default log level for the elastic search
    # logger to WARN as INFO is quite verbose, the
    # omitted information can be viewed at level DEBUG.
    es_logger = logging.getLogger('elasticsearch')
    es_logger.setLevel(logging.WARN)

    logging.basicConfig(
        format='%(levelname)s: %(message)s',
        stream=sys.stdout
    )

    if args.verbosity:
        if args.verbosity.lower() == "debug":
            logger.setLevel(logging.DEBUG)
            es_logger.setLevel(logging.DEBUG)

        elif args.verbosity.lower() == "warn":
            logger.setLevel(logging.WARN)

        elif args.verbosity.lower() == "error":
            logger.setLevel(logging.ERROR)
            es_logger.setLevel(logging.ERROR)

    if args.input_filename:

        files_to_load = parse_input_file(args.input_filename)
        threaded_loader(
            args.index_name,
            args.document_type,
            args.host,
            args.port,
            files_to_load['snvmix'],
            files_to_load['titan'],
            files_to_load['museq'],
            files_to_load['destruct'],
            files_to_load['hms'],
            files_to_load['defuse'],
            files_to_load['pyclone'],
            files_to_load['titan_support_data'],
            files_to_load['gene_expression'],
            files_to_load['strelka'],
            files_to_load['gene_annotations'],
            files_to_load['samtools'])


if __name__ == '__main__':
    main()
