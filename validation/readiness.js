
import filenames from './filenames.js'

// Whether the term mapping step can be shown for a dataset. Mapping a column onto a Darwin
// Core term is only possible once validation has written the column names of the uploaded
// files into the processing report, and validation writes them only on a run where the files
// have been typed - so for a while after an upload the report looks complete but has no
// headers at all.

const normaliseSheetName = (name) => `${name ?? ''}`.replace(/[^0-9a-z]/gi, "").toLowerCase();

const isNonEmptyArray = (value) => Array.isArray(value) && value.length > 0;

// A taxon table is optional. Datasets that carry the sequences as OTU table column headers or
// in a fasta file have none, and the mapping step treats that as complete.
const hasTaxonTable = (report) => {
    const files = report?.files?.files || [];

    if (files.some(f => f?.type === 'taxa')) {
        return true
    }
    // workbooks keep their tables as sheets on a single file entry
    return files.some(f => (f?.sheets || []).some(s => filenames.taxa.includes(normaliseSheetName(s?.name))))
}

export const mappingReadiness = (report) => {

    const missing = [];

    if (!isNonEmptyArray(report?.sampleHeaders)) {
        missing.push('sampleHeaders')
    }
    if (hasTaxonTable(report) && !isNonEmptyArray(report?.taxonHeaders)) {
        missing.push('taxonHeaders')
    }

    return { ready: missing.length === 0, missing }
}
