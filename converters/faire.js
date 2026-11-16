import xlsx from "xlsx";
import fs from "fs";
import { Biom } from "biojs-io-biom";
import config from "../config.js";
import { getStreamAsArrayBuffer } from 'get-stream';
import { analyseCsv } from '../validation/tsvformat.js';
import { readFlatFile2D } from '../util/streamReader.js';
import { getMetaDataRow, duplicateSampleEventIds } from '../util/index.js';
import { getGroupMetaDataAsJsonString } from '../validation/termMapper.js';
import license from "../enum/license.js";

const COLUMN_LIMIT = 100;
const ROW_LIMIT = 100;

const buildSheet = (entity, extraErrors) => {
    const data = entity.data || [];
    const firstRow = data[0] || [];
    const wide = firstRow.length > COLUMN_LIMIT;
    return {
        name: entity.name,
        headers: wide ? firstRow.slice(0, COLUMN_LIMIT) : firstRow,
        rows: wide
            ? data.slice(0, ROW_LIMIT).map(r => r.slice(0, COLUMN_LIMIT))
            : data.slice(0, ROW_LIMIT),
        isInConsistent: false,
        numColumns: firstRow.length,
        columnLimit: COLUMN_LIMIT,
        errors: extraErrors || []
    };
};

// Some FAIRe datasets prefix seq_ids with '>' (FASTA style) — normalise before matching
const normalizeSeqId = (id) => {
    const s = String(id ?? '');
    return s.startsWith('>') ? s.slice(1) : s;
};

// sheets = [{ name, data }] where data is a 2D array (workbook path)
export const parseFAIReComponents = (sheets, preferredAssay = null) => {
    const find = (name) => sheets.find(s => s.name.toLowerCase() === name.toLowerCase());
    const filterPrefix = (prefix) => sheets.filter(s => s.name.toLowerCase().startsWith(prefix.toLowerCase()));

    const sampleMetadata = find('sampleMetadata');
    const experimentRunMetadata = find('experimentRunMetadata');

    // Accept both suffixed (otuFinal_<assay>_<run>) and bare (otuFinal) sheet/file names
    const bareotuFinal = find('otuFinal');
    const otuFinalSheets = filterPrefix('otuFinal_');
    if (bareotuFinal) otuFinalSheets.unshift(bareotuFinal);

    const baretaxaFinal = find('taxaFinal');
    const taxaFinalSheets = filterPrefix('taxaFinal_');
    if (baretaxaFinal) taxaFinalSheets.unshift(baretaxaFinal);

    if (otuFinalSheets.length === 0) {
        throw 'No otuFinal sheet found in FAIRe dataset';
    }

    const projectMetadata = find('projectMetadata');
    const declaredAssays = declaredAssayNames(projectMetadata?.data, experimentRunMetadata?.data);

    // otuFinal_<assay>_<run>. Bare 'otuFinal' has no assay suffix; treat as a single implicit assay (null key).
    const splitName = (name) => splitAssayAndRun(name.split('_').slice(1).join('_'), declaredAssays);
    const getAssayFromName = (name) => splitName(name).assay;

    // For bare otuFinal the assay name is null — use a sentinel so it can be selected
    const BARE_ASSAY = '__bare__';
    const assayKeys = otuFinalSheets.map(s => getAssayFromName(s.name) ?? BARE_ASSAY);
    const assayNames = [...new Set(assayKeys)].map(k => k === BARE_ASSAY ? null : k).filter(k => k !== undefined);

    const selectedAssay = (preferredAssay && assayNames.includes(preferredAssay))
        ? preferredAssay
        : assayNames[0] ?? null;

    let multipleAssaysWarning = null;
    if (assayNames.filter(Boolean).length > 1) {
        multipleAssaysWarning = `This dataset contains multiple assays: ${assayNames.filter(Boolean).join(', ')}. MDT can only process one assay at a time. Processing assay '${selectedAssay}' only.`;
    }

    const otuFinal = otuFinalSheets.find(s => (getAssayFromName(s.name) ?? null) === selectedAssay);

    const seqRunId = splitName(otuFinal.name).run;

    const taxaFinal = taxaFinalSheets.find(s => (getAssayFromName(s.name) ?? null) === selectedAssay) || taxaFinalSheets[0];

    const missingComponentErrors = [];
    if (!sampleMetadata) missingComponentErrors.push('Missing required component: sampleMetadata');
    if (!taxaFinal) missingComponentErrors.push('Missing required component: taxaFinal');
    if (!experimentRunMetadata) missingComponentErrors.push('Missing required component: experimentRunMetadata');

    // Only expose named assays in the UI picklist — bare (null) assay means single implicit assay, no picker needed
    const namedAssayNames = assayNames.filter(Boolean);
    const projectMetadataComments = projectMetadata?.termComments ?? {};

    return { projectMetadata, sampleMetadata, experimentRunMetadata, otuFinal, taxaFinal, assayName: selectedAssay, assayNames: namedAssayNames, seqRunId, multipleAssaysWarning, missingComponentErrors, projectMetadataComments };
};

// Strip leading rows whose first cell starts with '#' (FAIRe comment rows)
/**
 * Reads a sheet to rows, converting date cells to calendar dates.
 *
 * A date in a spreadsheet is a calendar date, not an instant. The xlsx library's cellDates
 * option returns a Date set to *local* midnight - for a workbook cell of 2024-09-26 it builds
 * `Thu Sep 26 2024 00:00:00` in whatever zone the process is running in - so the local
 * components are the date the author wrote. Letting such a value reach JSON.stringify, as the
 * BIOM writer does, serialises it with toISOString() and bakes the server's timezone into the
 * published data: that same cell became 2024-09-25T22:00:00.000Z on a UTC+2 host and
 * 2024-09-26T07:00:00.000Z on a UTC-7 one, so an installation east of UTC published every
 * eventDate a day early.
 *
 * Reading the local components and formatting them as a plain date string keeps the author's
 * date and removes the timezone from the output entirely. A time of day, if the cell has one,
 * is preserved without an offset, which is what Darwin Core asks for when none is known.
 *
 * Datasets processed before this change keep the shifted values: reprocessing them was
 * considered and rejected as too invasive, since it would rewrite published archives under
 * existing endpoints. So two datasets can legitimately disagree about the same calendar date
 * depending on when and where they were processed, and an old dataset reprocessed for any other
 * reason will have its eventDates move by a day. That is expected, not a regression.
 */
const pad = (n, width = 2) => `${n}`.padStart(width, '0');

export const toCalendarDate = (value) => {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        return value;
    }
    const date = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    const hasTime = value.getHours() || value.getMinutes() || value.getSeconds() || value.getMilliseconds();
    if (!hasTime) {
        return date;
    }
    return `${date}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
};

const sheetRows = (sheet) => xlsx.utils.sheet_to_json(sheet, { header: 1 })
    .map(row => (Array.isArray(row) ? row.map(toCalendarDate) : row));

const stripCommentRows = (data) => {
    if (!data || data.length === 0) return data;
    let i = 0;
    while (i < data.length && String(data[i]?.[0] ?? '').startsWith('#')) i++;
    return i > 0 ? data.slice(i) : data;
};

/**
 * The assay columns of a projectMetadata sheet, in sheet order.
 *
 * projectMetadata is laid out term-per-row, with one column per assay to the right of
 * project_level. The FAIRe template names those columns generically - assay1, assay2 - and records
 * which assay each one describes in the assay_name row:
 *
 *   term_name    project_level                   assay1           assay2
 *   assay_name   ssu16sv4v5-emp | ssu18sv9-emp   ssu16sv4v5-emp   ssu18sv9-emp
 *   target_gene                                  16S rRNA (SSU    18S rRNA (SSU
 *                                                prokaryote)      eukaryote)
 *
 * So an assay cannot be recognised from a column header, and the header is not the name to show a
 * user either - 'assay1' tells them nothing. Both the defaults extractor and the assay
 * cross-reference need the same reading of this, hence one function.
 *
 * Returns [{ index, header, assayName }] with assayName null when the assay_name row is absent, or
 * null when the sheet has no project_level column at all and the layout cannot be read.
 */
const projectMetadataAssayColumns = (data) => {
    const cleanData = stripCommentRows(data || []);
    const headers = (cleanData[0] || []).map(h => String(h ?? '').trim());

    const termNameIdx     = headers.findIndex(h => h.toLowerCase() === 'term_name');
    const projectLevelIdx = headers.findIndex(h => h.toLowerCase() === 'project_level');
    if (projectLevelIdx < 0) return null;

    const assayNameRow = termNameIdx >= 0
        ? cleanData.slice(1).find(r => String(r[termNameIdx] ?? '').trim().toLowerCase() === 'assay_name')
        : null;

    const columns = [];
    for (let i = projectLevelIdx + 1; i < headers.length; i++) {
        if (!headers[i]) continue;
        const declared = assayNameRow ? String(assayNameRow[i] ?? '').trim() : '';
        columns.push({ index: i, header: headers[i], assayName: declared || null });
    }
    return columns;
};

/** The name to show a user for an assay column: what it declares, else its header. */
const assayColumnLabel = (column) => column.assayName || column.header;

/**
 * Every assay name the dataset declares: the assay_name row of projectMetadata and the assay_name
 * column of experimentRunMetadata. Both are read because they do not always agree - one workbook
 * declared 12S-V5 in the first and 12S_V5 in the second.
 */
const declaredAssayNames = (projectMetadataData, experimentRunData) => {
    const names = new Set();
    for (const column of projectMetadataAssayColumns(projectMetadataData) || []) {
        if (column.assayName) names.add(column.assayName);
    }
    const runRows = stripCommentRows(experimentRunData || []);
    const assayIdx = (runRows[0] || []).findIndex(h => String(h ?? '').trim().toLowerCase() === 'assay_name');
    if (assayIdx >= 0) {
        for (const row of runRows.slice(1)) {
            const name = String(row?.[assayIdx] ?? '').trim();
            if (name) names.add(name);
        }
    }
    return [...names];
};

/**
 * Split the '<assay>_<seq_run_id>' part of an otuFinal or taxaFinal name.
 *
 * Splitting on the first underscore cut an assay such as 12S_V5 down to 12S, and two assays sharing
 * that first token became one. Underscores are allowed in both parts (verte_quadeloupe has run
 * vert_2021), so the name alone is ambiguous: the assay is the longest declared assay name the
 * suffix starts with. Only an assay nobody declared falls back to the first underscore.
 */
const splitAssayAndRun = (suffix, declaredAssays = []) => {
    if (!suffix) return { assay: null, run: null };
    const lower = suffix.toLowerCase();
    const declared = declaredAssays
        .filter(a => lower === a.toLowerCase() || lower.startsWith(`${a.toLowerCase()}_`))
        .sort((a, b) => b.length - a.length)[0];
    const assayLength = declared ? declared.length : suffix.split('_')[0].length;
    return { assay: suffix.slice(0, assayLength), run: suffix.slice(assayLength + 1) || null };
};

/**
 * Locate the projectMetadata column carrying values for one assay.
 *
 * This used to take the first column unconditionally, which meant selecting any assay but the
 * first silently inherited the first assay's target_gene, primers and amplicon size - published as
 * if they described the sequences.
 *
 * Returns -1 when the assay cannot be placed and more than one column is a candidate. The caller
 * then falls back to project_level values alone: losing the assay-scoped defaults shows up in the
 * mapping form as terms left to fill in, whereas taking the wrong column does not show up at all.
 */
const findAssayColumn = (columns, selectedAssay) => {
    if (!columns?.length) return -1;

    // A bare otuFinal carries no assay name - one implicit assay, so a lone column is unambiguous.
    if (!selectedAssay) return columns.length === 1 ? columns[0].index : -1;

    const needle = String(selectedAssay).trim().toLowerCase();

    const byName = columns.find(c => c.assayName?.toLowerCase() === needle);
    if (byName) return byName.index;

    // Some templates do name the column after the assay itself.
    const byHeader = columns.find(c => c.header.toLowerCase() === needle);
    if (byHeader) return byHeader.index;

    // One candidate whose name does not match is still the only thing it can be.
    return columns.length === 1 ? columns[0].index : -1;
};

/**
 * Extract default values from the projectMetadata sheet.
 *
 * projectMetadata layout:
 *   row 0: requirement_level_code | section | term_name | project_level | assay1 | assay2 | …
 *   rows 1+: one row per FAIRe vocabulary term
 *
 * Result is a flat key→value map: term_name → value.
 * project_level values are written first; the column for the selected assay then overrides them
 * for assay-scoped terms (so assay-specific values win over project-wide values).
 * Blank and literal "None" values are skipped.
 */
const extractProjectMetadataDefaults = (data, selectedAssay = null) => {
    if (!data || data.length < 2) return {};

    const cleanData = stripCommentRows(data);
    const headers = (cleanData[0] || []).map(h => String(h ?? '').toLowerCase().trim());

    const termNameIdx     = headers.findIndex(h => h === 'term_name');
    const projectLevelIdx = headers.findIndex(h => h === 'project_level');
    if (termNameIdx < 0 || projectLevelIdx < 0) return {};

    const rows = cleanData.slice(1);
    const assayIdx = findAssayColumn(projectMetadataAssayColumns(data), selectedAssay);

    const isValidValue = (v) =>
        v != null && v !== '' && String(v).trim().toLowerCase() !== 'none';

    const defaults = {};
    for (const row of rows) {
        const termName = row[termNameIdx];
        if (!termName) continue;
        const key = String(termName).trim();

        const projectVal = row[projectLevelIdx];
        if (isValidValue(projectVal)) {
            defaults[key] = projectVal;
        }

        if (assayIdx >= 0) {
            const assayVal = row[assayIdx];
            if (isValidValue(assayVal)) {
                defaults[key] = assayVal; // assay-scoped value overrides project-level
            }
        }
    }
    return defaults;
};

/**
 * Build an eml.json object from the flat key→value map produced by extractProjectMetadataDefaults.
 * Uses: recordedBy, recordedByID, project_contact, institution, project_name, project_id.
 * Returns null if neither project_name nor project_id is present.
 */
const EML_DESCRIPTION_TERMS = [
    'tax_class_id_cutoff',
    'tax_class_query_cutoff',
    'tax_class_collapse',
    'tax_class_other',
    'screen_contam_method',
    'screen_geograph_method',
    'screen_nontarget_method',
    'screen_other',
    'bioinfo_method_additional',
];

export const extractEmlFromProjectMetadata = (defaults, userName, comments = {}) => {
    const { project_name, project_id, recordedBy, recordedByID, project_contact, institution } = defaults || {};

    if (!project_name && !project_id) return null;

    // Split "First Last" into givenName + surName
    let givenName = null, surName = null;
    if (recordedBy) {
        const parts = String(recordedBy).trim().split(/\s+/);
        givenName = parts[0] || null;
        surName = parts.slice(1).join(' ') || null;
    }

    // Strip ORCID URL prefix (https://orcid.org/XXXX-... → XXXX-...)
    let userId = null;
    if (recordedByID) {
        userId = String(recordedByID).replace(/^https?:\/\/orcid\.org\//i, '').trim() || null;
    }

    const person = {
        ...(givenName ? { givenName } : {}),
        ...(surName ? { surName } : {}),
        ...(institution ? { organizationName: String(institution) } : {}),
        ...(project_contact ? { electronicMailAddress: String(project_contact) } : {}),
        ...(userId ? { userId } : {}),
    };

    const personnel = { ...person, role: 'AUTHOR' };
    const title = project_name ? String(project_name) : null;
    const identifier = project_id ? String(project_id) : null;

    // Build DocBook XML description from selected bioinformatics/screening terms that have values.
    const escapeXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const descriptionItems = EML_DESCRIPTION_TERMS
        .filter(term => defaults?.[term] != null && String(defaults[term]).trim() !== '')
        .map(term => {
            const value = escapeXml(String(defaults[term]).trim());
            const desc = comments[term] ? `<para>${escapeXml(comments[term])}</para>` : '';
            return `<listitem><para><emphasis>${term}</emphasis>: ${value}</para>${desc}</listitem>`;
        });
    const faire_description = descriptionItems.length > 0
        ? `<para><itemizedlist>${descriptionItems.join('')}</itemizedlist></para>`
        : null;

    return {
        ...(title ? { title } : {}),
        ...(faire_description ? { faire_description } : {}),
        contact: person,
        creator: [person],
        ...(title ? { projectTitle: title } : {}),
        ...(identifier ? { projectIdentifier: identifier } : {}),
        license: "CC0",
        projectPersonnel: [personnel],
        project: {
            ...(title ? { title } : {}),
            ...(identifier ? { identifier } : {}),
            personnel: [personnel],
        },
        createdBy: userName || null,
        createdAt: Date.now(),
    };
};

const buildSheetsWithCrossReferences = (components) => {
    const { projectMetadata, sampleMetadata, experimentRunMetadata, otuFinal, taxaFinal, multipleAssaysWarning, missingComponentErrors, assayName, assayNames, seqRunId } = components;

    // Strip # comment rows from all sheets that may carry them before any checks or display
    const cleanedSampleMetadata = sampleMetadata
        ? { ...sampleMetadata, data: stripCommentRows(sampleMetadata.data) }
        : null;
    const cleanedTaxaFinal = taxaFinal
        ? { ...taxaFinal, data: stripCommentRows(taxaFinal.data) }
        : null;
    const cleanedExpRun = experimentRunMetadata
        ? { ...experimentRunMetadata, data: stripCommentRows(experimentRunMetadata.data) }
        : null;

    const sheetErrors = {
        sampleMetadata: [...(multipleAssaysWarning ? [multipleAssaysWarning] : []), ...(missingComponentErrors || [])],
        otuFinal: [],
        taxaFinal: [],
        experimentRunMetadata: []
    };

    // Cross-reference: sampleMetadata samp_name <-> otuFinal column headers (row 0, from col 1 onwards)
    if (cleanedSampleMetadata && otuFinal) {
        const sampleHeaders = cleanedSampleMetadata.data[0] || [];
        const sampNameIdx = sampleHeaders.findIndex(h => String(h ?? '').toLowerCase() === 'samp_name');
        const sampNameCol = sampNameIdx >= 0 ? sampNameIdx : 0;
        const sampNames = new Set(
            (cleanedSampleMetadata.data.slice(1) || []).map(r => String(r[sampNameCol] ?? '')).filter(Boolean)
        );

        // otuFinal row 0: [blank, samp_id_1, samp_id_2, ...]
        const otuSampleIds = (otuFinal.data[0] || []).slice(1).map(v => String(v ?? ''));
        const otuSampleSet = new Set(otuSampleIds.filter(Boolean));

        const inSampleNotOtu = [...sampNames].filter(s => !otuSampleSet.has(s));
        const inOtuNotSample = otuSampleIds.filter(s => s && !sampNames.has(s));

        if (inSampleNotOtu.length > 0) {
            sheetErrors.sampleMetadata.push(`${inSampleNotOtu.length} sample(s) in sampleMetadata not found in otuFinal: ${inSampleNotOtu.slice(0, 5).join(', ')}${inSampleNotOtu.length > 5 ? '...' : ''}`);
        }
        if (inOtuNotSample.length > 0) {
            sheetErrors.otuFinal.push(`${inOtuNotSample.length} otuFinal column(s) not found in sampleMetadata: ${inOtuNotSample.slice(0, 5).join(', ')}${inOtuNotSample.length > 5 ? '...' : ''}`);
        }
    }

    // Cross-reference: taxaFinal seq_id <-> otuFinal row ids (col 0, from row 1 onwards)
    if (cleanedTaxaFinal && otuFinal) {
        const taxaHeaders = cleanedTaxaFinal.data[0] || [];
        const seqIdIdx = taxaHeaders.findIndex(h => String(h ?? '').toLowerCase() === 'seq_id');
        const seqIdCol = seqIdIdx >= 0 ? seqIdIdx : 0;
        const taxaSeqIds = new Set(
            (cleanedTaxaFinal.data.slice(1) || []).map(r => String(r[seqIdCol] ?? '')).filter(Boolean)
        );

        const otuSeqIds = (otuFinal.data || []).slice(1).map(r => String(r[0] ?? ''));
        const otuSeqSet = new Set(otuSeqIds.filter(Boolean));

        const inTaxaNotOtu = [...taxaSeqIds].filter(s => !otuSeqSet.has(s));
        const inOtuNotTaxa = otuSeqIds.filter(s => s && !taxaSeqIds.has(s));

        if (inTaxaNotOtu.length > 0) {
            sheetErrors.taxaFinal.push(`${inTaxaNotOtu.length} seq_id(s) in taxaFinal not found in otuFinal: ${inTaxaNotOtu.slice(0, 5).join(', ')}${inTaxaNotOtu.length > 5 ? '...' : ''}`);
        }
        if (inOtuNotTaxa.length > 0) {
            sheetErrors.otuFinal.push(`${inOtuNotTaxa.length} seq_id(s) in otuFinal not found in taxaFinal: ${inOtuNotTaxa.slice(0, 5).join(', ')}${inOtuNotTaxa.length > 5 ? '...' : ''}`);
        }
    }

    // Cross-reference: assay names from otuFinal sheet names <-> assays declared in projectMetadata.
    // The assays a projectMetadata declares are the values in its assay_name row, not its column
    // headers: the template headers them assay1, assay2, so comparing against those reported every
    // assay as missing and offered 'assay1, assay2' as the names it had found.
    if (projectMetadata && assayNames?.length > 0) {
        const assayColumns = projectMetadataAssayColumns(projectMetadata.data);
        if (assayColumns) {
            const declared = assayColumns.map(assayColumnLabel);
            const declaredSet = new Set(declared.map(d => d.toLowerCase()));
            const missingInPm = assayNames.filter(a => !declaredSet.has(String(a).trim().toLowerCase()));
            if (missingInPm.length > 0) {
                sheetErrors.sampleMetadata.push(
                    `Assay name(s) "${missingInPm.join('", "')}" from otuFinal sheet(s) not declared in projectMetadata. ` +
                    `Found assay(s): ${declared.length > 0 ? declared.join(', ') : '(none)'}.`
                );
            }
        }
    }

    const sheets = [
        otuFinal ? buildSheet(otuFinal, sheetErrors.otuFinal) : null,
        cleanedSampleMetadata ? buildSheet(cleanedSampleMetadata, sheetErrors.sampleMetadata) : null,
        cleanedTaxaFinal ? buildSheet(cleanedTaxaFinal, sheetErrors.taxaFinal) : null,
        cleanedExpRun ? buildSheet(cleanedExpRun, sheetErrors.experimentRunMetadata) : null,
    ].filter(Boolean);

    const sampleHeaders = cleanedSampleMetadata?.data?.[0] ?? [];
    const taxonHeaders = cleanedTaxaFinal?.data?.[0] ?? [];

    return { sheets, headers: { sampleHeaders, taxonHeaders }, assayName, assayNames, seqRunId };
};

const FAIRE_PREFIXES = ['otufinal_', 'taxafinal_', 'samplemetadata_', 'experimentrunmetadata_', 'projectmetadata_', 'oturaw_', 'taxaraw_'];
const hasFAIRePrefix = (name) => FAIRE_PREFIXES.some(p => name.toLowerCase().startsWith(p));

const METADATA_COMPONENTS = ['projectMetadata', 'sampleMetadata', 'experimentRunMetadata'];

/** The <project_id> of a FAIRe-prefixed file name, when the name carries nothing else. */
const projectIdFromFilename = (filename) => {
    const [component, ...rest] = filename.replace(/\.[^.]+$/, '').split('_');
    const isMetadata = METADATA_COMPONENTS.some(c => c.toLowerCase() === component.toLowerCase());
    return isMetadata && rest.length > 0 ? rest.join('_') : null;
};

/**
 * Rename a FAIRe-prefixed file to the sheet name it would have in a workbook, which is what
 * parseFAIReComponents reads:
 *
 *   flat file                                        workbook sheet
 *   sampleMetadata_<project_id>                      sampleMetadata
 *   otuFinal_<project_id>_<assay>_<seq_run_id>       otuFinal_<assay>_<seq_run_id>
 *
 * The metadata components used to keep their project id, so the parser, which looks them up by
 * their bare name, never found them and a dataset of flat files failed for want of sampleMetadata.
 * And project_id was taken to be the second underscore-separated token, which cut an id such as
 * verte_quadeloupe in two. The dataset states its project ids - in the metadata file names, the
 * main workbook's name and projectMetadata's project_id - so the longest of those the name
 * continues with is removed. Only a name matching none of them falls back to the second token.
 */
const normalizeFileToSheetName = (filename, projectIds = []) => {
    const noExt = filename.replace(/\.[^.]+$/, '');
    const [component, ...rest] = noExt.split('_');

    const metadata = METADATA_COMPONENTS.find(c => c.toLowerCase() === component.toLowerCase());
    if (metadata) return metadata;

    const suffix = rest.join('_');
    const lower = suffix.toLowerCase();
    const projectId = projectIds
        .filter(p => lower === p.toLowerCase() || lower.startsWith(`${p.toLowerCase()}_`))
        .sort((a, b) => b.length - a.length)[0];
    if (projectId) {
        const remainder = suffix.slice(projectId.length + 1);
        return remainder ? `${component}_${remainder}` : component;
    }
    return rest.length >= 2 ? [component, ...rest.slice(1)].join('_') : noExt;
};

/** The project_id value in a projectMetadata sheet's project_level column. */
const projectIdFromProjectMetadata = (data) => {
    const cleanData = stripCommentRows(data || []);
    const headers = (cleanData[0] || []).map(h => String(h ?? '').trim().toLowerCase());
    const termNameIdx = headers.indexOf('term_name');
    const projectLevelIdx = headers.indexOf('project_level');
    if (termNameIdx < 0 || projectLevelIdx < 0) return null;
    const row = cleanData.slice(1).find(r => String(r[termNameIdx] ?? '').trim().toLowerCase() === 'project_id');
    const value = String(row?.[projectLevelIdx] ?? '').trim();
    return value || null;
};

/**
 * Extract term descriptions from cell comments on the term_name column of a raw xlsx sheet
 * (dense mode: ws['!data'][row][col]).  Returns { term_name → description_string }.
 * The description is the text following "Description : " in the FAIRe comment format.
 */
const extractTermComments = (rawSheet) => {
    const data = rawSheet?.['!data'];
    if (!data || data.length === 0) return {};
    const headerRow = data[0] || [];
    const termNameCol = headerRow.findIndex(cell => String(cell?.v ?? '').toLowerCase().trim() === 'term_name');
    if (termNameCol < 0) return {};
    const comments = {};
    for (let r = 1; r < data.length; r++) {
        const cell = (data[r] || [])[termNameCol];
        if (!cell?.v) continue;
        const commentText = cell.c?.[0]?.t;
        if (!commentText) continue;
        const match = commentText.match(/^Description\s*:\s*(.+)$/m);
        if (match) {
            comments[String(cell.v).trim()] = match[1].trim();
        }
    }
    return comments;
};

/**
 * Read a FAIRe flat component file (tsv/csv/txt) in full, as a 2D array.
 *
 * analyseCsv is a format sniffer for the upload preview. It tries each candidate delimiter and
 * caps what it returns at 100 rows and 100 columns (validation/tsvformat.js testDelimiter:
 * `to_line: 100` plus a slice to COLUMN_LIMIT). Those caps are correct for a preview and wrong
 * for anything that reasons about the data: a 61730 x 469 otuFinal came back as its top-left
 * 100 x 100 corner, and because the caller kept only `rows` - dropping `numColumns` and
 * `columnLimit`, the two fields that record the crop - the cross-reference checks could not tell
 * they were looking at one. Every sample and seq_id past the corner was reported missing.
 *
 * So: sniff the delimiter with analyseCsv, then read the whole file. Display truncation still
 * happens, but in buildSheet, where it belongs.
 */
const readFlatComponent = async (filePath) => {
    const preview = await analyseCsv(filePath);
    // analyseCsv yields nothing when no candidate delimiter could parse the file at all. There is
    // nothing to read as a flat file, and the caller already treats null as 'component absent' -
    // so return quietly, as before.
    if (!preview) return null;
    try {
        return await readFlatFile2D(filePath, preview?.delimiter ?? '\t');
    } catch (error) {
        console.log(`Could not read FAIRe component file ${filePath}`);
        console.log(error);
        return null;
    }
};

/**
 * Collect all FAIRe sheets from a directory, handling three file types:
 *   - Non-prefixed xlsx (main workbooks): all sheets added by sheet name
 *   - FAIRe-prefixed xlsx (e.g. taxaFinal_*.xlsx): first sheet, named after the file
 *   - FAIRe-prefixed flat files (tsv/csv/txt): read in full, named after the file
 * Returns a unified array of { name, data } objects suitable for parseFAIReComponents.
 *
 * Prefixed files are named only once everything is read, since the project ids that are cut from
 * their names come partly from the contents of projectMetadata.
 */
const collectAllSheets = async (basePath) => {
    const fileList = fs.readdirSync(basePath).filter(f => !f.startsWith('.nfs') && !f.startsWith('.'));
    const sheets = [];
    const prefixed = [];
    const projectIds = new Set();

    for (const filename of fileList) {
        const lowerName = filename.toLowerCase();
        const filePath = `${basePath}${filename}`;

        if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
            const buffer = await getStreamAsArrayBuffer(fs.createReadStream(filePath));
            const wb = xlsx.read(buffer, { type: 'array', dense: true, cellDates: true });

            if (hasFAIRePrefix(filename)) {
                // FAIRe-prefixed workbook: treat as a single sheet, named after the file
                const firstSheet = wb.SheetNames[0];
                if (firstSheet) {
                    prefixed.push({ filename, data: sheetRows(wb.Sheets[firstSheet]), termComments: extractTermComments(wb.Sheets[firstSheet]) });
                }
            } else {
                // Non-prefixed workbook (main workbook): contribute all sheets by sheet name.
                // FAIRe names it <project_id>.xlsx.
                projectIds.add(filename.replace(/\.[^.]+$/, ''));
                for (const sheetName of wb.SheetNames) {
                    sheets.push({
                        name: sheetName,
                        data: sheetRows(wb.Sheets[sheetName]),
                        ...(sheetName === 'projectMetadata' ? { termComments: extractTermComments(wb.Sheets[sheetName]) } : {})
                    });
                }
            }
        } else if (hasFAIRePrefix(filename)) {
            const data = await readFlatComponent(filePath);
            if (data?.length > 0) prefixed.push({ filename, data });
        }
    }

    for (const { filename } of prefixed) {
        const projectId = projectIdFromFilename(filename);
        if (projectId) projectIds.add(projectId);
    }
    for (const entity of [...sheets, ...prefixed]) {
        const isProjectMetadata = entity.name === 'projectMetadata'
            || (entity.filename && normalizeFileToSheetName(entity.filename) === 'projectMetadata');
        const projectId = isProjectMetadata ? projectIdFromProjectMetadata(entity.data) : null;
        if (projectId) projectIds.add(projectId);
    }

    for (const { filename, data, termComments } of prefixed) {
        const name = normalizeFileToSheetName(filename, [...projectIds]);
        sheets.push({ name, data, ...(name === 'projectMetadata' ? { termComments } : {}) });
    }
    return sheets;
};

/**
 * Read a FAIRe dataset that is not a single workbook: flat files, prefixed workbooks, or a main
 * workbook with any of those beside it. Collects all sheets from all sources and parses them together.
 */
export const readFAIReHybrid = async (id, version, preferredAssay = null) => {
    const basePath = `${config.dataStorage}${id}/${version}/original/`;
    const allSheets = await collectAllSheets(basePath);

    const components = parseFAIReComponents(allSheets, preferredAssay);
    const projectMetadataDefaults = extractProjectMetadataDefaults(components.projectMetadata?.data, components.assayName);
    const projectMetadataComments = components.projectMetadataComments ?? {};
    const result = buildSheetsWithCrossReferences(components);

    // Include non-component sheets for UI display (README tabs, dropdown lists, etc.)
    const componentNames = new Set(result.sheets.map(s => s.name));
    const extraSheets = allSheets
        .filter(s => !componentNames.has(s.name))
        .map(s => buildSheet(s, []));

    return { ...result, projectMetadataDefaults, projectMetadataComments, sheets: [...result.sheets, ...extraSheets] };
};

/**
 * Load the raw FAIRe component objects needed for BIOM conversion.
 * Handles single-workbook, flat-file, and hybrid modes - the same way validation reads them.
 * Returns the result of parseFAIReComponents: { sampleMetadata, otuFinal, taxaFinal,
 * experimentRunMetadata, assayName, seqRunId, assayNames, ... }
 */
export const loadFAIReComponents = async (id, version, preferredAssay = null) => {
    const basePath = `${config.dataStorage}${id}/${version}/original/`;
    const fileList = fs.readdirSync(basePath).filter(f => !f.startsWith('.nfs') && !f.startsWith('.'));

    if (fileList.some(f => hasFAIRePrefix(f))) {
        return parseFAIReComponents(await collectAllSheets(basePath), preferredAssay);
    }

    // Pure single-workbook mode
    const xlsxFile = fileList.find(f => /\.(xlsx|xls)$/i.test(f));
    if (!xlsxFile) throw 'No FAIRe files found in dataset';

    const buffer = await getStreamAsArrayBuffer(fs.createReadStream(`${basePath}${xlsxFile}`));
    const workbook = xlsx.read(buffer, { type: 'array', dense: true, cellDates: true });
    const sheets = workbook.SheetNames.map(name => ({
        name,
        data: sheetRows(workbook.Sheets[name])
    }));
    return parseFAIReComponents(sheets, preferredAssay);
};

export const readFAIReWorkbook = async (id, xlsxFileName, version, preferredAssay = null) => {
    const filePath = `${config.dataStorage}${id}/${version}/original/${xlsxFileName}`;
    const stream = fs.createReadStream(filePath);
    const buffer = await getStreamAsArrayBuffer(stream);
    const workbook = xlsx.read(buffer, { type: 'array', dense: true, cellDates: true });

    const allSheetData = workbook.SheetNames.map(name => ({
        name,
        data: sheetRows(workbook.Sheets[name]),
        ...(name === 'projectMetadata' ? { termComments: extractTermComments(workbook.Sheets[name]) } : {})
    }));

    const components = parseFAIReComponents(allSheetData, preferredAssay);
    const projectMetadataDefaults = extractProjectMetadataDefaults(components.projectMetadata?.data, components.assayName);
    const projectMetadataComments = components.projectMetadataComments ?? {};
    const result = buildSheetsWithCrossReferences(components);

    // Add every workbook tab that is not already a recognised FAIRe component sheet,
    // so the UI can display all tabs (README, projectMetadata, drop-down lists, etc.).
    const componentNames = new Set(result.sheets.map(s => s.name));
    const extraSheets = allSheetData
        .filter(s => !componentNames.has(s.name))
        .map(s => buildSheet(s, []));

    return { ...result, projectMetadataDefaults, projectMetadataComments, sheets: [...result.sheets, ...extraSheets] };
};

/**
 * Convert parsed FAIRe components to a BIOM object.
 *
 * otuFinal layout (2D array, no comment rows):
 *   row 0 : [null/blank, samp_name_1, samp_name_2, ...]
 *   rows 1+: [seq_id,    count,       count,       ...]
 *
 * sampleMetadata / taxaFinal: standard row-per-record with a header row (comment rows already stripped by caller or done here).
 *
 * Returns { biom, consistencyCheck } matching the shape from biom.js toBiom.
 */
export const toBiom = async ({
    id,
    otuFinal,
    sampleMetadata,
    taxaFinal,
    termMapping = { taxa: {}, samples: {}, defaultValues: {} },
    processFn = () => {}
}) => {
    // Strip any leading # comment rows that may still be present
    const cleanSampleData = stripCommentRows(sampleMetadata.data);
    const cleanTaxaData   = stripCommentRows(taxaFinal.data);

    const sampleIdTerm = termMapping?.samples?.id || 'samp_name';
    const taxonIdTerm  = termMapping?.taxa?.id    || 'seq_id';

    // ── Build sample map  samp_name → { id, ...fields } ──────────────────────
    const sampleHeaders = (cleanSampleData[0] || []).map(h => String(h ?? ''));
    const sampIdIdx = sampleHeaders.findIndex(h => h === sampleIdTerm);
    if (sampIdIdx < 0) throw `Column '${sampleIdTerm}' not found in sampleMetadata`;

    const sampleMap = new Map();
    for (const row of cleanSampleData.slice(1)) {
        const sampId = row[sampIdIdx];
        if (sampId == null || sampId === '') continue;
        const key = String(sampId);
        const record = { id: key };
        sampleHeaders.forEach((h, i) => { record[h] = row[i] ?? ''; });
        record.id = key; // ensure id is set after any header-named 'id' column
        sampleMap.set(key, record);
    }

    // ── Build taxa map  seq_id → { id, ...fields } ───────────────────────────
    const taxaHeaders = (cleanTaxaData[0] || []).map(h => String(h ?? ''));
    const taxonIdIdx = taxaHeaders.findIndex(h => h === taxonIdTerm);
    if (taxonIdIdx < 0) throw `Column '${taxonIdTerm}' not found in taxaFinal`;

    const taxaMap = new Map();
    for (const row of cleanTaxaData.slice(1)) {
        const rawId = row[taxonIdIdx];
        if (rawId == null || rawId === '') continue;
        const key = normalizeSeqId(rawId);
        const record = { id: key };
        taxaHeaders.forEach((h, i) => {
            // Normalise the sequence field to the exact casing getMetaDataRow expects
            const key = String(h ?? '').toLowerCase() === 'dna_sequence' ? 'DNA_sequence' : h;
            record[key] = row[i] ?? '';
        });
        record.id = key;
        taxaMap.set(key, record);
    }

    // ── Parse otuFinal matrix ─────────────────────────────────────────────────
    const otuData = otuFinal.data;
    // row 0, cols 1+: sample IDs
    const otuColIds = (otuData[0] || []).slice(1).map(v => String(v ?? ''));

    // Which columns have a matching sample record
    const sampleIdsWithNoRecordInSampleFile = [];
    const validColMask = otuColIds.map(s => {
        if (sampleMap.has(s)) return true;
        sampleIdsWithNoRecordInSampleFile.push(s);
        return false;
    });
    const cols = otuColIds.filter((_, i) => validColMask[i]);

    const sparseData = [];
    const rows = [];                            // seq_ids included in BIOM
    const taxonIdsWithNoRecordInTaxonFile = [];
    const seenOtuRowIds = new Set();

    processFn(0, otuData.length - 1, 'Reading otuFinal', { sampleCount: cols.length });

    for (let i = 1; i < otuData.length; i++) {
        const row = otuData[i];
        const rawSeqId = row[0];
        if (rawSeqId == null || rawSeqId === '') continue;
        const seqId = normalizeSeqId(rawSeqId);
        seenOtuRowIds.add(seqId);

        if (!taxaMap.has(seqId)) {
            taxonIdsWithNoRecordInTaxonFile.push(seqId);
            continue;
        }

        // rows.length is the index this row *will* have if we push it
        const rowIdx = rows.length;
        let hasValue = false;
        let colIdx = 0;

        for (let j = 0; j < otuColIds.length; j++) {
            if (!validColMask[j]) continue;
            const val = Number(row[j + 1]); // j+1 because col 0 is seq_id
            if (!isNaN(val) && val > 0) {
                sparseData.push([rowIdx, colIdx, val]);
                hasValue = true;
            }
            colIdx++;
        }

        if (hasValue) {
            rows.push(seqId);
        }

        if (i % 100 === 0) {
            processFn(i, otuData.length - 1, 'Reading otuFinal', { taxonCount: rows.length });
        }
    }

    const otuSampleIdSet = new Set(otuColIds);
    const sampleIdsWithNoRecordInOtuTable = [...sampleMap.keys()].filter(s => !otuSampleIdSet.has(s));
    const taxonIdsWithNoRecordInOtuTable  = [...taxaMap.keys()].filter(s => !seenOtuRowIds.has(s));

    processFn(rows.length, rows.length, 'Building BIOM', { taxonCount: rows.length, sampleCount: cols.length });

    console.log(`FAIRe toBiom — taxa: ${taxaMap.size}, samples: ${sampleMap.size}, rows: ${rows.length}, cols: ${cols.length}, sparse entries: ${sparseData.length}`);

    const biom = new Biom({
        id: id || null,
        type: 'OTU table',
        comment: getGroupMetaDataAsJsonString(termMapping),
        rows: rows.map(r => getMetaDataRow(taxaMap.get(r), true)),
        columns: cols.map(c => getMetaDataRow(sampleMap.get(c), false)),
        matrix_type: 'sparse',
        matrix_element_type: 'int',
        date: new Date().toISOString().split('Z')[0],
        shape: [rows.length, cols.length],
        data: sparseData
    });

    return {
        biom,
        consistencyCheck: {
            sampleIdsWithNoRecordInSampleFile,
            taxonIdsWithNoRecordInTaxonFile,
            sampleIdsWithNoRecordInOtuTable,
            taxonIdsWithNoRecordInOtuTable,
            duplicateEventIdsInSampleFile: duplicateSampleEventIds(biom?.columns)
        }
    };
};
