
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
    "BIOM_1": {
        "name": "BIOM 1.0 format",
        "description": "A BIOM 1.0 file in JSON format. Must include metadata for both rows and columns, including the sequences for taxa/ASVs"
    },
    "BIOM_2_1": {
        "name": "BIOM 2.1 format",
        "description": "A BIOM 2.1 file in HDF5 format. Must include metadata for both rows and columns, including the sequences for taxa/ASVs"
    },
    "INVALID": {
        "name": "Invalid format",
        "description": "The supplied files can not be processed."
    }
    
 }

/* {
    "TSV_3_FILE": {
         "name": "3 file TSV format",
         "description": "3 tab-delimited files: ASV Table, metadata for samples, metadata for taxa/ASVs (including the sequence)"
    },
    "TSV_3_FILE_WITH_FASTA": {
        "name": "3 file TSV format with a fasta file",
        "description": "3 tab-delimited files: ASV Table, metadata for samples, metadata for taxa/ASVs, sequences in a separate fasta file"
   },
    "TSV_2_FILE": {
        "name": "2 file TSV format",
        "description": "2 tab-delimited files: ASV Table with taxa as rows + a sample metadata file. Metadata about the taxa (including the sequence) are given in columns before or after sample IDs."
    },
    "XLSX": {
        "name": "xlsx format",
        "description": "xlsx workbook with 3 sheets: ASV Table, metadata for samples, metadata for taxa/ASVs (including the sequence)"
    },
    "XLSX_WITH_FASTA": {
        "name": "xlsx format with a fasta file",
        "description": "xlsx workbook with 3 sheets: ASV Table, metadata for samples, metadata for taxa/ASVs (including the sequence), and a fasta file with sequences"
    },
    "BIOM_1": {
        "name": "BIOM 1.0 format",
        "description": "A BIOM 1.0 file in JSON format. Must include metadata for both rows and columns, including the sequences for taxa/ASVs"
    },
    "BIOM_2_1": {
        "name": "BIOM 2.1 format",
        "description": "A BIOM 2.1 file in HDF5 format. Must include metadata for both rows and columns, including the sequences for taxa/ASVs"
    },
    "INVALID": {
        "name": "Invalid format",
        "description": "The supplied files can not be processed."
    }
    
 } */