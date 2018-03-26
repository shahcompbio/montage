package org.elasticsearch.plugin.genomic;

import org.elasticsearch.common.inject.AbstractModule;

public class GenomicRestModule extends AbstractModule {
    @Override
    protected void configure() {
        bind(GenomicRestHandler.class).asEagerSingleton();
    }
}
