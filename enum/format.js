
// Shown to users after upload. docs/input-formats.md describes each format in full; keep the two in step.
export default {
    "TSV": {
         "name": "TSV format",
         "description": "Separate text files (tab, comma, semicolon or pipe delimited): an OTU/ASV table and a sample table, with taxonomy either in its own file or as columns in the OTU table next to the counts. An optional 'study' file can give default values for marker, primers etc."
    },
    "TSV_WITH_FASTA": {
        "name": "TSV format with a fasta file",
        "description": "Separate text files (tab, comma, semicolon or pipe delimited): an OTU/ASV table and a sample table, with the sequences in a fasta file. Taxonomy, if any, is in its own file or as columns in the OTU table. An optional 'study' file can give default values for marker, primers etc."
   },
    "XLSX": {
        "name": "xlsx format",
        "description": "One xlsx workbook with an OTU/ASV table sheet (samples as columns) and a sample sheet. Taxonomy is either its own sheet or columns in the OTU table sheet next to the counts. An optional 'study' sheet can give default values for marker, primers etc."
    },
    "XLSX_WITH_FASTA": {
        "name": "xlsx format with a fasta file",
        "description": "One xlsx workbook with an OTU/ASV table sheet (samples as columns), a sample sheet and taxonomy as its own sheet or as columns in the OTU table sheet, plus a fasta file with the sequences. An optional 'study' sheet can give default values for marker, primers etc."
    },
    "BIOM_2_1": {
        "name": "BIOM 2.1 format",
        "description": "A BIOM 2.1 file in HDF5 format holding the abundance matrix. Only the matrix and its ids are read: the sample table, and the taxonomy or a fasta file with the sequences, must be supplied as separate files. An optional 'study' file can give default values for marker, primers etc."
    },
    "FAIRe": {
        "name": "FAIRe format",
        "description": "A FAIRe eDNA dataset, as one xlsx workbook, as flat files named after the FAIRe templates, or both: projectMetadata, sampleMetadata, experimentRunMetadata, otuFinal and taxaFinal. One assay is processed per upload."
    },
    "INVALID": {
        "name": "Invalid format",
        "description": "The supplied files can not be processed."
    }

 }
