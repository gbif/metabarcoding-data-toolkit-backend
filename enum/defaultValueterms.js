export default [
    {
        name: 'otu_db',
        description: "Database used for classification. Strongly recommended if identifictations of OTUs are provided.",
        defaultRequired: false,
        biomGroup: 'sample'
    },
    {
        name: 'target_gene',
        description: "The marker / target gene, from the GBIF target_gene vocabulary. Search the list by the form you use: 12S, COI, ITS, rbcL.",
        defaultRequired: true,
        // Constrained to the GBIF target_gene vocabulary, served from /enum/target-gene. It
        // replaces a hardcoded list of nine strings ("COI", "16S", ...) that were not the terms
        // GBIF indexes, and whose bare "16S" did not say which 16S region was targeted.
        gbifVocabulary: 'target_gene',
        biomGroup: 'sample'
    } ,
    {
        name: 'env_broad_scale',
        defaultRequired: false,
        biomGroup: 'sample',
        ontology: 'envo'
    },
    {
        name: 'env_local_scale',
        defaultRequired: false,
        biomGroup: 'sample',
        ontology: 'envo'
    },
    {
        name: 'env_medium',
        defaultRequired: false,
        biomGroup: 'sample',
        ontology: 'envo'
    },
    {
        name: 'experimental_factor',
        defaultRequired: false,
        biomGroup: 'sample',
        ontology: 'efo'
    },
    {
        name: 'ploidy',
        defaultRequired: false,
        biomGroup: 'sample',
        ontology: 'pato'
    },
    {
        name: 'samp_collec_device',
        defaultRequired: false,
        biomGroup: 'sample',
        ontology: 'envo'
    },
    {
        name: 'samp_mat_process',
        defaultRequired: false,
        biomGroup: 'sample',
        ontology: 'obi'
    },
    {
        name: 'kingdom',
        description: "The full scientific name of the kingdom in which the taxon is classified.",
        defaultRequired: false,
        biomGroup: 'observation'
    },  

]