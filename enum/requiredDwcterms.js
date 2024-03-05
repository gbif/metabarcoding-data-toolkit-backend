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
                synonyms: ['date', 'collectiondate'],
                isRequired: true
            }, 
             {
                name: 'decimalLatitude',
                description: "The latitude of the sample in decmal degrees, Example: 51,65774",
                synonyms: ['latitude', 'lat'],
                isRequired: true
            } , 
             {
                name: 'decimalLongitude',
                description: "The longitude of the sample in decmal degrees, Example: 6,48859",
                synonyms: ['longitude', 'lng', 'lon', 'long'],
                isRequired: true
            } , 
            {
                name: 'target_gene',
                description: "The marker / target gene. Examples: ITS, 16S, 12S, COI",
                synonyms: ['marker'],
                isRequired: true
            } ,   
            {
                name: 'otu_db',
                description: "Database used for classification. Strongly recommended if identifictations of OTUs are provided.",
                synonyms: ['reflib'],
                isRequired: false
            },
            {
                name: 'materialSampleID',
                description: "Typically the ENA or NCBI sample accession",
                synonyms: ['sample_accession'],
                isRequired: false
            }   
        
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
            }
      
        ],

    
}