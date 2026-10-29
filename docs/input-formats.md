# Input formats

The Metabarcoding Data Toolkit (MDT) accepts a metabarcoding dataset in one of the formats below.
The format is not chosen by the user: it is worked out from the uploaded files, and the validation
step reports which one was recognised. Each heading gives the format code that validation returns
(see `enum/format.js`, served at `/enum/format`).

Every format describes the same three things:

- **OTU table**: the read counts, with one axis for samples and one for OTUs/ASVs.
- **Samples**: one row per sample, with an id that matches the OTU table's sample ids.
- **Taxonomy**: one row per OTU/ASV, with an id that matches the OTU table's OTU/ASV ids. It
  includes the DNA sequence, unless the sequences are supplied in a fasta file.

An optional **study** file (also called defaults) holds values that apply to the whole dataset,
such as `target_gene`, the primers or `pcr_primer_reference`.

## Tab- or comma-separated text files (`TSV`, `TSV_WITH_FASTA`)

The OTU table, samples and taxonomy as separate text files (`.tsv`, `.csv` or `.txt`). The
delimiter (tab, comma, semicolon or pipe) is detected per file. At least two text files are
needed. The OTU table and the samples file are always required. The taxonomy can come from any
of these:

- a separate taxonomy file;
- columns in the OTU table itself, next to the counts (see
  [Taxonomy in the OTU table](#taxonomy-in-the-otu-table));
- a fasta file, which gives sequences but no names (`TSV_WITH_FASTA`);
- the OTU table's column headers, when those are the DNA sequences themselves (see
  [Sequences as column headers](#sequences-as-column-headers)).

The OTU table can have samples as columns or as rows, and MDT works out which from the sample
ids.

## Excel workbook (`XLSX`, `XLSX_WITH_FASTA`)

One `.xlsx` workbook with the OTU table, samples and, optionally, taxonomy as separate sheets,
plus an optional fasta file (`XLSX_WITH_FASTA`). The workbook is the only table file: if more
files are uploaded alongside it, the upload is not read as a workbook. Sheets are recognised by
name in the same way as files (see [File and sheet names](#file-and-sheet-names)). The OTU table
and samples sheets are required. If there is no taxonomy sheet, the taxonomy has to be in the OTU
table sheet next to the counts. A study sheet is optional. In the OTU table sheet, samples must
be the columns.

## BIOM 2.1 (`BIOM_2_1`)

A BIOM 2.1 file in HDF5 format (`.biom`, `.h5`, `.hdf5`) holding the count matrix, with sample
and OTU/ASV ids. MDT reads only the matrix and its ids from this file. Metadata stored inside
the BIOM file is not used, so the samples have to be uploaded as a separate text file. The
taxonomy comes either as a text file or as a fasta file. A study file is optional.

BIOM 1.0 (JSON) is not supported. Convert it with `biom convert --to-hdf5`.

## FAIRe (`FAIRe`)

A dataset following the [FAIRe](https://fair-edna.github.io/) eDNA standard. It can be supplied
in either of these forms, or both mixed together:

- **A workbook** whose sheets are named for the FAIRe components: `projectMetadata`,
  `sampleMetadata`, `experimentRunMetadata`, `otuFinal_<assay>_<run>`,
  `taxaFinal_<assay>_<run>`. The OTU and taxonomy sheets can also be named plain `otuFinal`
  and `taxaFinal`.
- **Flat files** named as in the FAIRe templates, starting with the component and the project
  id, for example `sampleMetadata_<project>.tsv` and `otuFinal_<project>_<assay>_<run>.tsv`.
  Other recognised prefixes are `otuRaw_`, `taxaRaw_`, `ampData_`, `stdData_` and
  `eLowQuantData_`.

`otuFinal` is required. MDT also reports `sampleMetadata`, `taxaFinal` and
`experimentRunMetadata` as missing components when they are absent. `projectMetadata` has one
row per term, not one column per term. Its values are used as the dataset defaults and to start
the dataset metadata (EML). One assay is processed per upload. The assay is read from the
`otuFinal` name, and if there are several the user picks one. Assay names must match the values
in the `assay_name` row of `projectMetadata`.

## Options shared by the text-file and workbook formats

### File and sheet names

Files and workbook sheets are recognised by name. The name is lower-cased, its extension
dropped, and everything except letters and digits removed. The result must then match one of
these names exactly:

| Role | Recognised names |
|---|---|
| OTU table | `otutable`, `asvtable`, `matrix`, `table` |
| Samples | `samples`, `sample`, `sampletable`, `sites`, `site`, `metadata` |
| Taxonomy | `taxonomy`, `taxa`, `taxon`, `taxontable`, `taxonomytable`, `observations`, `observation` |
| Study | `study`, `defaults`, `default`, `defaultvalues` |

So `OTU_table.tsv` and `ASV-table.csv` are recognised, but `MyProject_ASVtable.tsv` is not. On
the upload page the user can set the role of any file by hand. Through the API, post the same
assignment to `/dataset/{key}/file-types`. Workbook sheets have no such override, so they must
be named this way. The lists live in `validation/filenames.js`.

### Ids

The samples table should have a column named `id` (any case). If it has none, the first column
is used and a warning is shown. The taxonomy table's id column works the same way. Either id can
be changed in the mapping step. The column headers in the samples and taxonomy tables can be
Darwin Core or MIxS terms already, or be mapped to them in that step.

### Taxonomy in the OTU table

A dataset with no separate taxonomy can keep its taxonomy columns in the OTU table, next to the
counts. Any OTU table column whose header is not a sample id is treated as taxonomy. This works
for both text files and workbooks, but only when samples are the columns. The OTU table's first
column is the OTU/ASV id for both the counts and the taxonomy.

### Fasta file

A `.fasta`, `.fa` or `.fas` file can supply the DNA sequences instead of a `DNA_sequence`
column. Each record's id is the text after `>`, up to the first space, and it must match an
OTU/ASV id in the OTU table.

### Sequences as column headers

Text files only. When the OTU table has samples as rows, its column headers can be the DNA
sequences themselves. MDT recognises this when the headers are long (over 75 characters) and
made of nucleotide letters, and it then uses an MD5 hash of each sequence as the OTU/ASV id.

### Study file

A text file, or a workbook sheet, with a header row followed by one term and its value per row,
for example `target_gene` / `16S rRNA`. Its values apply to every record. A value in the study
file takes precedence over the same term in the samples table.

### Zip archives

Any upload can be a `.zip`. It is unpacked before detection, and files in folders are treated as
if they were at the top level.
