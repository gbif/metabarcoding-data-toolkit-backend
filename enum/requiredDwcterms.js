export default {
    sample: [
        
             {
                name: 'id',
                description: "The sample id corresponding to the column header in the OTU table",
                synonyms: [],
                isRequired: true
            },
            {
                name: 'eventDate',
                description: "The date when the sample was collected from its environment",
                synonyms: ['date'],
                isRequired: true
            }, 
             {
                name: 'decimalLatitude',
                description: "The latitude of the sample",
                synonyms: ['latitude', 'lat'],
                isRequired: true
            } , 
             {
                name: 'decimalLongitude',
                description: "The longitude of the sample",
                synonyms: ['longitude', 'lng', 'lon', 'long'],
                isRequired: true
            } ,        
        
        ],
    taxon: [

            {
                name: 'id',
                description: "The OTU id corresponding to the row identifier in the OTU table",
                isRequired: true
            },
             {
                name: 'DNA_sequence',
                description: "The DNA sequence",
                synonyms: ['sequence'],
                isRequired: true
            },
             {
                name: 'target_gene',
                description: "The marker / target gene. Eaxmples: ITS, 16S, 12S, COI",
                synonyms: ['marker'],
                isRequired: true
            } , 
             {
                name: 'kingdom',
                description: "",
                isRequired: false
            },
             {
                name: 'phylum',
                description: "",
                isRequired: false
            },
            {
                name: 'class',
                description: "",
                isRequired: false
            },
            {
                name: 'order',
                description: "",
                isRequired: false
            },
             {
                name: 'family',
                description: "",
                isRequired: false
            },
             {
                name: 'genus',
                description: "",
                isRequired: false
            },
             {
                name: 'scientificName',
                description: "This could be the species name (binomial) if the match identity is good. If the species is unknown, use the closest know higher taxon regardless of rank.",
                isRequired: false
            },
             {
                name: 'otu_db',
                description: "Database used for classification. Strongly recommended if identifictations of OTUs are provided.",
                synonyms: ['reflib'],
                isRequired: false
            } ,
      
        ],

    
}