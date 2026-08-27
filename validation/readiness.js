
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

// Whether the metadata (EML) is complete enough to build a Darwin Core Archive. Creating a
// dataset writes an eml.json holding nothing but the title, so the presence of metadata says
// nothing about whether it is usable - and meta.xml declares metadata="eml.xml"
// unconditionally, so an archive built without a complete EML is structurally invalid rather
// than merely metadata-poor.
//
// These are the same fields the metadata form marks required (EmlForm/Form.js). The form
// keeps its own rules for inline messages; this is the authority for gating.
const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

const isAgent = (value) => !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;

export const metadataReadiness = (metadata) => {

    const missing = [];

    if (!isNonEmptyString(metadata?.title)) {
        missing.push('title')
    }
    if (!isNonEmptyString(metadata?.license)) {
        missing.push('license')
    }
    // the contact carries the address GBIF needs to reach the publisher, so an agent without
    // one is treated as absent - as the form does
    if (!isAgent(metadata?.contact) || !isNonEmptyString(metadata?.contact?.electronicMailAddress)) {
        missing.push('contact')
    }
    if (!Array.isArray(metadata?.creator) || !metadata.creator.some(isAgent)) {
        missing.push('creator')
    }

    return { ready: missing.length === 0, missing }
}

export const metadataMissingMessage = (missing = []) =>
    `The metadata is incomplete and an archive built from it would not be valid. Missing: ${missing.join(', ')}.`
