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
        vocabulary: ["COI", "ITS", "ITS1", "ITS2", "16S", "18S", "23S", "5S"],
        biomGroup: 'sample'
    } ,
    {
        name: 'env_broad_scale',
        defaultRequired: false,
        biomGroup: 'sample',
        ontology: 'envo'
    },
    
    {
        name: 'kingdom',
        description: "The full scientific name of the kingdom in which the taxon is classified.",
        defaultRequired: false,
        biomGroup: 'observation'
    },  

]