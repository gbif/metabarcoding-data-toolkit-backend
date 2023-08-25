export default [
    {
        name: 'otu_db',
        description: "Database used for classification. Strongly recommended if identifictations of OTUs are provided.",
        defaultRequired: false,
        biomGroup: 'sample'
    },
    {
        name: 'target_gene',
        description: "The marker / target gene. Examples: ITS, 16S, 12S, COI",
        defaultRequired: true,
        vocabulary: ["COI", "ITS", "ITS1", "ITS2", "12S", "16S", "18S", "23S", "5S"],
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