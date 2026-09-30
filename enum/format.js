
export default {
    "TSV": {
         "name": "TSV format",
         "description": "3 tab-delimited files: ASV Table, metadata for samples, metadata for taxa/ASVs (including the sequence). An optional 'study' file can be provided with default values for marker, primer etc."
    },
    "TSV_WITH_FASTA": {
        "name": "TSV format with a fasta file",
        "description": "3 tab-delimited files: ASV Table, metadata for samples, metadata for taxa/ASVs, sequences in a separate fasta file. An optional 'study' file can be provided with default values for marker, primer etc."
   },
    "XLSX": {
        "name": "xlsx format",
        "description": "xlsx workbook with 3 sheets: ASV Table, metadata for samples, metadata for taxa/ASVs (including the sequence)"
    },
    "XLSX_WITH_FASTA": {
        "name": "xlsx format with a fasta file",
        "description": "xlsx workbook with 3 sheets: ASV Table, metadata for samples, metadata for taxa/ASVs (including the sequence), and a fasta file with sequences"
    },
    "BIOM_2_1": {
        "name": "BIOM 2.1 format",
        "description": "A BIOM 2.1 file in HDF5 format holding the abundance matrix with sample and taxon/ASV IDs. Metadata for samples and for taxa/ASVs, including the sequences, must be supplied as separate files. An optional 'study' file can be provided with default values for marker, primer etc."
    },
    "FAIRe": {
        "name": "FAIRe format",
        "description": "FAIRe-compliant eDNA dataset: projectMetadata, sampleMetadata, experimentRunMetadata, otuFinal, taxaFinal, and optional components, supplied as individual flat files and/or a single xlsx workbook."
    },
    "INVALID": {
        "name": "Invalid format",
        "description": "The supplied files can not be processed."
    }

 }
