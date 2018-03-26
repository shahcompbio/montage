
package org.elasticsearch.plugin.genomic;

import java.util.Collection;
import java.util.ArrayList;

import org.elasticsearch.common.inject.Module;
import org.elasticsearch.plugins.Plugin;
import org.elasticsearch.rest.RestModule;


public class GenomicPlugin extends Plugin {
    @Override public String name() {
        return "genomic-plugin";
    }

    @Override public String description() {
        return "Genomic Plugin Description";
    }

    @Override
    public Collection<Module> nodeModules() {
        final Collection<Module> modules = new ArrayList<>();
        modules.add(new GenomicRestModule());
        return modules;
    }
}
