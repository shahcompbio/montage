'''
Created on Jun 12, 2014

@author: dmachev

'''


from __future__ import division
import re
import logging
import copy
from datetime import datetime
from elasticsearchloader.analysis_loader import AnalysisLoader


class GeneAnnotationsLoader(AnalysisLoader):

    ''' Imports Gene Annotations into Elastic search '''

    def __init__(
            self,
            es_doc_type=None,
            es_index=None,
            es_host=None,
            es_port=None,
            use_ssl=False,
            http_auth=None,
            timeout=None):
        super(
            GeneAnnotationsLoader,
            self).__init__(es_doc_type=es_doc_type,
                es_index=es_index,
                es_host=es_host,
                es_port=es_port,
                use_ssl=use_ssl,
                http_auth=http_auth,
                timeout=timeout)
        self.record_attributes = [
            'sequence',
            'source',
            'feature',
            'start',
            'end',
            'score',
            'strand',
            'frame',
            'attribute']

    def parse_line(self, line):

        line = line.strip().split('\t')
        if len(line) != len(self.record_attributes):
            logging.error(
                'The provided input doesn\'t match the' +
                ' expected input file format.'
            )
            return {}

        gene_annotations_values = dict(zip(self.record_attributes, line))
        gene_annotations_values['attribute'] = re.sub(
            r'\s*\;\s*$',
            '',
            gene_annotations_values['attribute'])
        gene_annotations_values['attribute'] = re.sub(
            r'"',
            '',
            gene_annotations_values['attribute'])
        attributes = re.split(
            r'\s*\;\s*',
            gene_annotations_values['attribute'].strip())

        attributes = dict(re.split(r'\s+', attr, 1)
                          for attr in attributes if attr)
        del gene_annotations_values['attribute']
        gene_annotations_values = dict(
            gene_annotations_values.items() +
            attributes.items())

        for field in ['start', 'end']:
            gene_annotations_values[field] = self.convert_to_number(
                gene_annotations_values[field])

        gene_annotations_values[
            'chrom_number'] = gene_annotations_values['sequence']
        del gene_annotations_values['sequence']

        return gene_annotations_values

    def parse_header(self, infile_handle, custom_header=None):
        header_values = super(GeneAnnotationsLoader, self).parse_header(
            infile_handle, custom_header
        )
        gene_annotations_values = copy.deepcopy(header_values)

        infile_handle.seek(0, 0)
        line = infile_handle.readline().strip()
        while line.startswith('#'):
            if line.startswith('#!'):
                line = re.sub(r'^#!\s*', '', line)
                header_attr, header_value = re.split(r'\s+', line, 1)
                gene_annotations_values[header_attr] = header_value
            line = infile_handle.readline().strip()

        for field in ['genome-date', 'genebuild-last-updated']:
            if field not in gene_annotations_values.keys():
                continue
            date_match = re.search(
                r'^\d{4}\-\d{1,2}\-?\d{1,2}?$',
                gene_annotations_values[field])
            date_format = '%Y-%m'
            if date_match:
                if len(date_match.group().split('-')) == 3:
                    date_format += '-%d'
                gene_annotations_values[field] = datetime.strptime(
                    gene_annotations_values[field],
                    date_format)

            else:
                logging.error('Unable to parse date \'%s\' in header.', field)

        gene_annotations_values['caller'] = 'gene_annotations'

        return gene_annotations_values

    def validate_input_file(self, filename):
        if not filename.endswith('.gtf'):
            logging.info(
                "%s Not a valid input file name. It must end with '.gtf'",
                filename)
            return False

        return True
