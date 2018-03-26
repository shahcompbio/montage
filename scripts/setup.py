from setuptools import setup, find_packages

setup(
    name='elasticsearchloader',
    version='0.99.0',
    description='Elastic Search indexing scripts',
    long_description='A collection of scripts for indexing analysis results',
    url='https://svn.bcgsc.ca/bitbucket/projects/ES/repos/es_loading',
    classifiers=[
        'Development Status :: 3 - Alpha',
        'Programming Language :: Python :: 2.7'
    ],
    packages=find_packages(include=['elasticsearchloader']),
    install_requires=[
        'elasticsearch',
        'prettytable',
        'PyIntervalTree',
        'PyVCF',
        'PyYAML'
    ]
)
