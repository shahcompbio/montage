# Montage

## Overview

Montage is a web-based visualization platform for building interactive dashboards of single cell genomics data. It grew out of our need to flexibly create collections of both standard and custom visualizations. Key features include:

* The ability to interactively filter data and dynamically change plot dimensions
* Linked views such that selections in one view are reflected in all other views
* An Elasticsearch backend for fast querying and aggregation over millions of data points

The Montage web application is written in JavaScript and uses [D3.js](https://d3js.org/) for visualization. It comes with a collection of Python data loading scripts to insert data into [Elasticsearch](https://www.elastic.co/products/elasticsearch). 

## Documentation

A detailed description of the system setup, data loading procedure, and interface can be found on our [wiki](https://github.com/shahcompbio/montage/wiki).

## License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/shahcompbio/montage/blob/master/LICENSE) file for details.

## Acknowledgments
This project was designed and built in [Dr. Sohrab Shah's laboratory at BC Cancer](http://shahlab.ca/) in close collaboration with [Dr. Samuel Aparicio's research team](http://molonc.bccrc.ca/aparicio-lab/).

We are grateful for the following funding:
* [The Canadian Cancer Society Research Institute](http://www.cancer.ca/research) - Innovation Grant 
* [Genome Canada](https://www.genomecanada.ca/) / [Genome BC](https://www.genomebc.ca/) - Disruptive Innovation in Genomics Grant 
* [CANARIE](https://www.canarie.ca) - Research Software Program