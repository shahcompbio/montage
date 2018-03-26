'''
Generic parser/indexer for analysis results in csv file format

Created on October 28, 2015

@author: dmachev
'''

import csv
import ast
import re
import copy
import logging
import os
import math
import __builtin__
from elasticsearchloader.analysis_loader import AnalysisLoader
from sets import Set

class CsvLoader(AnalysisLoader):

    ''' Class CsvLoader '''

    __csv_dialect__ = None
    __index_buffer__ = []
    __field_mapping__ = {}
    __field_types__ = {}
    __field_ignore__ = {}
    __field_match__ = {
        r'chr': 'chrom_number',
        r'start': 'start',
        r'end': 'end'
    }
    __mandatory_fields__ = {
        #"chrom_number": "str",
        #"start": "int",
        #"end": "int"
    }

    __reserved_fields__ = ["events", "paired_record", "source_id"]

    __parsed_input__ = False

    def __init__(
            self,
            es_doc_type=None,
            es_index=None,
            es_host=None,
            es_port=None,
            use_ssl=False,
            http_auth=None,
            timeout=None):
        super(CsvLoader, self).__init__(
            es_doc_type=es_doc_type,
            es_index=es_index,
            es_host=es_host,
            es_port=es_port,
            use_ssl=use_ssl,
            http_auth=http_auth,
            timeout=timeout)

    def parse(
            self,
            analysis_file=None,
            custom_header=None,
            analysis_data=None):
        '''
        Parses and indexes the content of the vcf file
        '''

        if "field_types" in custom_header.keys():
            self.__field_types__.update(custom_header["field_types"])
            del custom_header["field_types"]

        if "field_ignore" in custom_header.keys():
            self.__field_ignore__.update(custom_header["field_ignore"])
            del custom_header["field_ignore"]

        header_data = {}
        header_data.update(custom_header)
        header_data['source_id'] = self.__load_id__

        self.disable_index_refresh()

        if isinstance(analysis_data, list) and len(analysis_data):
            self._index_data(header_data, analysis_data)
        else:
            self._index_file(header_data, analysis_file)

        self.enable_index_refresh()

    def _rm_fields(self,header):
        '''
        removes fields from config that are not in the data file
        to ignore during reading
        '''
        for f in self.__field_ignore__:
            if (not (f in header)) and (f in self.__field_types__):
                del self.__field_types__[f]
                print "removed field: ",f

    def _index_file(self, header_data, analysis_file):
        '''
        Parses and indexes the content of a CSV/TSV file
        '''
        self._get_csv_dialect(analysis_file)

        with open(analysis_file) as csv_fh:
            header_data['file_fullname'] = os.path.abspath(csv_fh.name)

            csv_reader = csv.DictReader(csv_fh, dialect=self.__csv_dialect__)

            print "header_data: ", header_data #debug
            print "fields: ", csv_reader.fieldnames #debug
            self._rm_fields(Set(csv_reader.fieldnames))
            
            self._configure_field_mapping(csv_reader.fieldnames, header_data)
            csv_fh.seek(0)
            csv_reader.next()

            fld_xd = Set(self.__field_ignore__)
            self._verify_field_types()
            self._set_field_types(csv_reader.next(),fld_xd)
            self._check_for_reserved_fields()

            csv_fh.seek(0)
            csv_reader.next()

            #n = 0
            for csv_record in csv_reader:
                index_record = {
                    key: self._apply_type(csv_record, key)
                    for key in Set(csv_record.keys()).difference(fld_xd)
                }
                #print "record111: ", index_record #debug
                index_record.update(header_data)
                #print "record222: ", index_record #debug
                index_record = self._update_record_keys(index_record)
                index_record = self._remove_redundant_fields(index_record)
                try:
                    [row, column] = index_record["sample_plate"].replace("_", "-").split("-")
                    index_record["row"] = row[1:].lstrip("0")
                    index_record["column"] = column[1:].lstrip("0")
                except KeyError:
                    pass
                try:
                    index_record['chrom_number'] = _format_chrom_number(
                        str(index_record['chrom_number'])
                    )
                except KeyError:
                    pass

                self._buffer_record(index_record, False)
                #if (n>11): break
                #n+=1
        
        # Submit any records remaining in the buffer for indexing
        self._buffer_record(None, True)

    def _index_data(self, header_data, analysis_data):
        '''
        Indexes parsed data
        '''

        self.__parsed_input__ = True
        self._configure_field_mapping(analysis_data[0].keys(), header_data)
        self._rm_fields(Set(analysis_data.fieldnames))
        fld_xd = Set(self.__field_ignore__)
        self._set_field_types(analysis_data[0],fld_xd)
        self._verify_field_types()
        self._check_for_reserved_fields()

        for record in analysis_data:
            index_record = {
                key: self._detect_type(record, key)
                for key in Set(record.keys()).difference(fld_xd)
            }
            index_record.update(header_data)
            index_record = self._update_record_keys(index_record)
            index_record = self._remove_redundant_fields(index_record)
            try:
                index_record['chrom_number'] = _format_chrom_number(
                    str(index_record['chrom_number'])
                )
            except KeyError:
                pass

            self._buffer_record(index_record, False)

        # Submit any records remaining in the buffer for indexing
        self._buffer_record(None, True)

    def _get_csv_dialect(self, csv_file):
        '''
        Gets the CSV file format properties
        '''
        try:
            with open(csv_file) as csv_fh:
                sniffer = csv.Sniffer()
                self.__csv_dialect__ = sniffer.sniff(csv_fh.readline())
                self.__csv_dialect__.quoting = csv.QUOTE_NONE
        except IOError:
            logging.error('Unable to parse CSV file.')
            exit(1)

    def _set_field_types(self, record,fld_xd):
        '''
        Determines the data type of each field based on as single parsed record
        '''
        logging.debug(record)
        sample_record = copy.deepcopy(record)
        # Force chrom_number to be string type
        if "chrom_number" in sample_record.keys():
            sample_record["chrom_number"] = 'Y'

        logging.info("===================================================")
        logging.info("Fields have been assigned the following data types:")
        logging.info("===================================================")
        for key in Set(sample_record.keys()).difference(fld_xd):
            if key not in self.__field_types__.keys():
                logging.error('%s not in YAML file configuration', key)
                return
                try:
                    data_type = type(ast.literal_eval(str(sample_record[key])))
                    self.__field_types__[key] = data_type.__name__
                except (ValueError, SyntaxError):
                    self.__field_types__[key] = 'str'

            logging.info("'" + key + "': " + self.__field_types__[key])
        logging.info("=================================================")

    def _verify_field_types(self):
        '''
        Verifies that types are correct for mandatory fields
        '''

        for key in self.__mandatory_fields__.keys():
            field_name = key
            mandatory_field_type = self.__mandatory_fields__[key]
            try:
                if key in self.__field_mapping__.keys():
                    field_name = self.__field_mapping__[key]
                if  mandatory_field_type != self.__field_types__[field_name]:
                    logging.error(
                        "Field '%s' is not type '%s.'", key,
                        str(self.__mandatory_fields__[key]))
                    exit(1)
            except KeyError:
                logging.error(
                    "Input data doesn't contain mandatory field '%s'.", key)
                exit(1)

    def _check_for_reserved_fields(self):
        '''
        Checks whether input data uses any reserved field names
        '''
        for key in self.__field_types__.keys():
            if key in self.__reserved_fields__:
                logging.error(
                    "'%s' is a reserved field name and it should be changed.",
                    key)
                exit(1)

    def parse_line(self, line):
        pass

    def validate_input_file(self, input_file):
        pass

    def _buffer_record(self, index_record, empty_buffer=False):
        '''
        Appends records to the buffer and submits them for indexing
        '''
        if isinstance(index_record, dict):
            index_cmd = self.get_index_cmd()
            self.__index_buffer__.append(index_cmd)
            self.__index_buffer__.append(index_record)

        if len(self.__index_buffer__) >= self.LOAD_FACTOR or empty_buffer:
            self.es_tools.submit_bulk_to_es(self.__index_buffer__)
            self.__index_buffer__ = []

    def _configure_field_mapping(self, column_names, header_data):
        '''
        Specifies how certain fields should be renamed before
        indexing for consistency across data types
        '''
        if 'field_mapping' in header_data.keys():
            self.__field_mapping__ = header_data['field_mapping']
            del header_data['field_mapping']
            return

        self._autodetect_field_mapping(column_names)

    def _autodetect_field_mapping(self, column_names):
        '''
        Attempts to determine the fields representing chromosome,
        start and end positions as to apply uniform naming
        '''
        regex_match = self._get_unmatched_items(column_names)

        for field in column_names:
            for regex in regex_match:
                if re.match(regex, field, re.I):
                    self.__field_mapping__[regex_match[regex]] = field
                    # remove matched items
                    del regex_match[regex]
                    break

    def _get_unmatched_items(self, column_names):
        ''' Reterns only the unmatched items from __field_match__ '''

        return {
            a: b for a, b in self.__field_match__.iteritems()
            if b not in column_names
        }

    def _update_record_keys(self, index_record):
        '''
        Renames index record attributes as specified in the
        '__field_mapping__' reference
        '''
        for key in self.__field_mapping__.keys():
            if self.__field_mapping__[key] in index_record.keys():
                index_record[key] = index_record[self.__field_mapping__[key]]

        return index_record

    def _remove_redundant_fields(self, index_record):
        '''
        Removes fields after they have been copied/renamed
        as specified in __field_mapping__
        '''
        for key in self.__field_mapping__.keys():
            try:
                del index_record[self.__field_mapping__[key]]
            except KeyError:
                pass
        return index_record

    def validate_record_number(self, record_count, imported_count):
        '''
        Some loaders produce several records for each input line,
        such ones should override the function below
        '''
        if self.__parsed_input__:
            return record_count == imported_count

        return record_count - 1 == imported_count

    def _detect_type(self, record, key):
        '''
        Attempts to determine the correct type of values given as strings
        '''
        if self._is_empty_value(record, key):
            return None

        try:
            return ast.literal_eval(record[key])
        except (ValueError, SyntaxError):
            return record[key]

    def _apply_type(self, record, key):
        '''
        Attempts to apply the data type associated with this record attribute
        '''
        if self._is_empty_value(record, key):
            return None

        key_type = getattr(__builtin__, self.__field_types__[key])
        try:
            return key_type(re.sub(r'"', '', record[key]))
        except ValueError:
            # In some cases values in a column with expected integer values
            # seem to get stored as floats, i.e. '2.0', make sure the error
            # is not the result of such case
            return key_type(re.sub(r'\.0$', '', record[key]))

    def _is_empty_value(self, record, key):
        '''
        Checks if the record holds an empty value in the specified field
        '''
        try:
            return math.isnan(record[key])
        except TypeError:
            pass

        value = str(record[key]).lower()
        if value in ['na', 'nan', 'inf', '?'] and self.__field_types__[key] != 'str':
            return True

        return not value.strip()


def _format_chrom_number(chrom_number):
    '''
    Formats the index record chrom_number field
    '''
    convert_chrom = {"23": 'X', "24": 'Y'}

    if str(chrom_number) in convert_chrom.keys():
        return convert_chrom[str(chrom_number)]

    if re.match(r'^\d{1,2}$', chrom_number):
        return chrom_number.zfill(2)

    return chrom_number.upper()
