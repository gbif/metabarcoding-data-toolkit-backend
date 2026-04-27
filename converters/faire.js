import xlsx from "xlsx";
import fs from "fs";
import { Biom } from "biojs-io-biom";
import config from "../config.js";
import { getStreamAsArrayBuffer } from 'get-stream';
import { analyseCsv } from '../validation/tsvformat.js';
import { readFlatFile2D } from '../util/streamReader.js';
import { getMetaDataRow } from '../util/index.js';
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

    // otuFinal_<assay>_<run> — assay is the second underscore-separated token.
    // Bare 'otuFinal' has no assay suffix; treat as a single implicit assay (null key).
    const getAssayFromName = (name) => {
        const parts = name.split('_');
        return parts.length >= 2 ? parts[1] : null;
    };

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

    const otuParts = otuFinal.name.split('_');
    const seqRunId = otuParts.length >= 3 ? otuParts.slice(2).join('_') : null;

    const taxaFinal = taxaFinalSheets.find(s => (getAssayFromName(s.name) ?? null) === selectedAssay) || taxaFinalSheets[0];

    const missingComponentErrors = [];
    if (!sampleMetadata) missingComponentErrors.push('Missing required component: sampleMetadata');
    if (!taxaFinal) missingComponentErrors.push('Missing required component: taxaFinal');
    if (!experimentRunMetadata) missingComponentErrors.push('Missing required component: experimentRunMetadata');

    const projectMetadata = find('projectMetadata');

    // Only expose named assays in the UI picklist — bare (null) assay means single implicit assay, no picker needed
    const namedAssayNames = assayNames.filter(Boolean);
    const projectMetadataComments = projectMetadata?.termComments ?? {};

    return { projectMetadata, sampleMetadata, experimentRunMetadata, otuFinal, taxaFinal, assayName: selectedAssay, assayNames: namedAssayNames, seqRunId, multipleAssaysWarning, missingComponentErrors, projectMetadataComments };
};

// Strip leading rows whose first cell starts with '#' (FAIRe comment rows)
const stripCommentRows = (data) => {
    if (!data || data.length === 0) return data;
    let i = 0;
    while (i < data.length && String(data[i]?.[0] ?? '').startsWith('#')) i++;
    return i > 0 ? data.slice(i) : data;
};

/**
 * Extract default values from the projectMetadata sheet.
 *
 * projectMetadata layout:
 *   row 0: requirement_level_code | section | term_name | project_level | assay1 | assay2 | …
 *   rows 1+: one row per FAIRe vocabulary term
 *
 * Result is a flat key→value map: term_name → value.
 * project_level values are written first; the first assay column then overrides them
 * for assay-scoped terms (so assay-specific values win over project-wide values).
 * Blank and literal "None" values are skipped.
 */
const extractProjectMetadataDefaults = (data) => {
    if (!data || data.length < 2) return {};

    const cleanData = stripCommentRows(data);
    const headers = (cleanData[0] || []).map(h => String(h ?? '').toLowerCase().trim());

    const termNameIdx     = headers.findIndex(h => h === 'term_name');
    const projectLevelIdx = headers.findIndex(h => h === 'project_level');
    if (termNameIdx < 0 || projectLevelIdx < 0) return {};

    // First assay column is immediately to the right of project_level
    const firstAssayIdx = projectLevelIdx + 1 < headers.length ? projectLevelIdx + 1 : -1;

    const isValidValue = (v) =>
        v != null && v !== '' && String(v).trim().toLowerCase() !== 'none';

    const defaults = {};
    for (const row of cleanData.slice(1)) {
        const termName = row[termNameIdx];
        if (!termName) continue;
        const key = String(termName).trim();

        const projectVal = row[projectLevelIdx];
        if (isValidValue(projectVal)) {
            defaults[key] = projectVal;
        }

        if (firstAssayIdx >= 0) {
            const assayVal = row[firstAssayIdx];
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

    // Cross-reference: assay names from otuFinal sheet names <-> projectMetadata column headers
    if (projectMetadata && assayNames?.length > 0) {
        const cleanedPmData = stripCommentRows(projectMetadata.data);
        const pmHeaders = (cleanedPmData[0] || []).map(h => String(h ?? '').trim());
        const projectLevelIdx = pmHeaders.findIndex(h => h.toLowerCase() === 'project_level');
        if (projectLevelIdx >= 0) {
            const pmAssayCols = new Set(pmHeaders.slice(projectLevelIdx + 1).filter(Boolean));
            const missingInPm = assayNames.filter(a => !pmAssayCols.has(a));
            if (missingInPm.length > 0) {
                sheetErrors.sampleMetadata.push(
                    `Assay name(s) "${missingInPm.join('", "')}" from otuFinal sheet(s) not found as column(s) in projectMetadata. ` +
                    `Found assay column(s): ${pmAssayCols.size > 0 ? [...pmAssayCols].join(', ') : '(none)'}.`
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

// Flat-file naming:    otuFinal_<project_id>_<assay>_<seq_run_id>  (≥4 underscore-separated tokens)
// Workbook convention: otuFinal_<assay>_<seq_run_id>               (3 tokens — project_id is the workbook filename)
// Strip parts[1] (project_id) to normalise a flat-file name to workbook convention so
// parseFAIReComponents can use the same parts[1]=assay logic for all sources.
// Only strips when parts.length >= 3; bare names (e.g. 'otuFinal') are left unchanged.
const normalizeFileToSheetName = (filename) => {
    const noExt = filename.replace(/\.[^.]+$/, '');
    const parts = noExt.split('_');
    return parts.length >= 3 ? [parts[0], ...parts.slice(2)].join('_') : noExt;
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
 * Collect all FAIRe sheets from a directory, handling three file types:
 *   - Non-prefixed xlsx (main workbooks): all sheets added by sheet name
 *   - FAIRe-prefixed xlsx (e.g. taxaFinal_*.xlsx): first sheet, named after the file
 *   - FAIRe-prefixed flat files (tsv/csv/txt): read via analyseCsv, named after the file
 * Returns a unified array of { name, data } objects suitable for parseFAIReComponents.
 */
const collectAllSheets = async (basePath) => {
    const fileList = fs.readdirSync(basePath).filter(f => !f.startsWith('.nfs') && !f.startsWith('.'));
    const sheets = [];

    for (const filename of fileList) {
        const lowerName = filename.toLowerCase();
        const filePath = `${basePath}${filename}`;

        if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
            const buffer = await getStreamAsArrayBuffer(fs.createReadStream(filePath));
            const wb = xlsx.read(buffer, { type: 'array', dense: true, cellDates: true });

            if (hasFAIRePrefix(filename)) {
                // FAIRe-prefixed workbook: treat as a single sheet, normalised to workbook naming
                const firstSheet = wb.SheetNames[0];
                if (firstSheet) {
                    const sheetName = normalizeFileToSheetName(filename);
                    sheets.push({
                        name: sheetName,
                        data: xlsx.utils.sheet_to_json(wb.Sheets[firstSheet], { header: 1 }),
                        ...(sheetName === 'projectMetadata' ? { termComments: extractTermComments(wb.Sheets[firstSheet]) } : {})
                    });
                }
            } else {
                // Non-prefixed workbook (main workbook): contribute all sheets by sheet name
                for (const sheetName of wb.SheetNames) {
                    sheets.push({
                        name: sheetName,
                        data: xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 }),
                        ...(sheetName === 'projectMetadata' ? { termComments: extractTermComments(wb.Sheets[sheetName]) } : {})
                    });
                }
            }
        } else if (hasFAIRePrefix(filename)) {
            // FAIRe-prefixed flat file — normalise name to workbook convention
            const result = await analyseCsv(filePath);
            if (result?.rows?.length > 0) {
                sheets.push({
                    name: normalizeFileToSheetName(filename),
                    data: result.rows
                });
            }
        }
    }
    return sheets;
};

/**
 * Read a hybrid FAIRe dataset where components may be spread across multiple workbooks
 * and/or flat files. Collects all sheets from all sources and parses them together.
 */
export const readFAIReHybrid = async (id, version, preferredAssay = null) => {
    const basePath = `${config.dataStorage}${id}/${version}/original/`;
    const allSheets = await collectAllSheets(basePath);

    const components = parseFAIReComponents(allSheets, preferredAssay);
    const projectMetadataDefaults = extractProjectMetadataDefaults(components.projectMetadata?.data);
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
 * Handles single-workbook, flat-file, and hybrid modes.
 * Returns the result of parseFAIReComponents: { sampleMetadata, otuFinal, taxaFinal,
 * experimentRunMetadata, assayName, seqRunId, assayNames, ... }
 */
export const loadFAIReComponents = async (id, version, preferredAssay = null) => {
    const basePath = `${config.dataStorage}${id}/${version}/original/`;
    const fileList = fs.readdirSync(basePath).filter(f => !f.startsWith('.nfs') && !f.startsWith('.'));

    const hasFAIRePrefixedFiles = fileList.some(f => hasFAIRePrefix(f));

    if (hasFAIRePrefixedFiles) {
        // Hybrid or pure flat-file: build sheets directly, reading full file content.
        // analyseCsv is only used to detect the delimiter (it limits to 100 rows for UI preview).
        // readFlatFile2D reads the entire file without a row cap.
        const sheets = [];
        for (const filename of fileList) {
            const lowerName = filename.toLowerCase();
            const filePath = `${basePath}${filename}`;

            if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
                const buffer = await getStreamAsArrayBuffer(fs.createReadStream(filePath));
                const wb = xlsx.read(buffer, { type: 'array', dense: true, cellDates: true });

                if (hasFAIRePrefix(filename)) {
                    // FAIRe-prefixed workbook: single sheet, normalised name
                    const firstSheet = wb.SheetNames[0];
                    if (firstSheet) {
                        sheets.push({
                            name: normalizeFileToSheetName(filename),
                            data: xlsx.utils.sheet_to_json(wb.Sheets[firstSheet], { header: 1 })
                        });
                    }
                } else {
                    // Non-prefixed main workbook: all sheets by their sheet name
                    for (const sheetName of wb.SheetNames) {
                        sheets.push({
                            name: sheetName,
                            data: xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 })
                        });
                    }
                }
            } else if (hasFAIRePrefix(filename)) {
                // FAIRe-prefixed flat file — detect delimiter then read full file
                const preview = await analyseCsv(filePath);
                const delimiter = preview?.delimiter ?? '\t';
                const data = await readFlatFile2D(filePath, delimiter);
                if (data.length > 0) {
                    sheets.push({
                        name: normalizeFileToSheetName(filename),
                        data
                    });
                }
            }
        }
        return parseFAIReComponents(sheets, preferredAssay);
    }

    // Pure single-workbook mode
    const xlsxFile = fileList.find(f => /\.(xlsx|xls)$/i.test(f));
    if (!xlsxFile) throw 'No FAIRe files found in dataset';

    const buffer = await getStreamAsArrayBuffer(fs.createReadStream(`${basePath}${xlsxFile}`));
    const workbook = xlsx.read(buffer, { type: 'array', dense: true, cellDates: true });
    const sheets = workbook.SheetNames.map(name => ({
        name,
        data: xlsx.utils.sheet_to_json(workbook.Sheets[name], { header: 1 })
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
        data: xlsx.utils.sheet_to_json(workbook.Sheets[name], { header: 1 }),
        ...(name === 'projectMetadata' ? { termComments: extractTermComments(workbook.Sheets[name]) } : {})
    }));

    const components = parseFAIReComponents(allSheetData, preferredAssay);
    const projectMetadataDefaults = extractProjectMetadataDefaults(components.projectMetadata?.data);
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

export const readFAIReFlatFiles = async (id, version, preferredAssay = null) => {
    const basePath = `${config.dataStorage}${id}/${version}/original/`;
    const fileList = fs.readdirSync(basePath);

    const findByPrefix = (prefix) =>
        fileList.filter(f => f.toLowerCase().startsWith(prefix.toLowerCase()));

    const projectMetadataFiles = findByPrefix('projectmetadata_');
    const sampleMetadataFiles  = findByPrefix('samplemetadata_');
    const otuFinalFiles        = findByPrefix('otufinal_');
    const taxaFinalFiles       = findByPrefix('taxafinal_');
    const expRunFiles          = findByPrefix('experimentrunmetadata_');

    if (otuFinalFiles.length === 0) {
        throw 'No otuFinal file found in FAIRe dataset';
    }

    const getAssayFromFilename = (filename) => {
        const noExt = filename.replace(/\.[^.]+$/, '');
        const match = noExt.match(/^otufinal_[^_]+_([^_]+)/i);
        return match ? match[1] : null;
    };

    const getTaxaAssayFromFilename = (filename) => {
        const noExt = filename.replace(/\.[^.]+$/, '');
        const match = noExt.match(/^taxafinal_[^_]+_([^_]+)/i);
        return match ? match[1] : null;
    };

    const assayNames = [...new Set(otuFinalFiles.map(f => getAssayFromFilename(f)).filter(Boolean))];

    const selectedAssay = (preferredAssay && assayNames.includes(preferredAssay))
        ? preferredAssay
        : assayNames[0];

    let multipleAssaysWarning = null;
    if (assayNames.length > 1) {
        multipleAssaysWarning = `This dataset contains multiple assays: ${assayNames.join(', ')}. MDT can only process one assay at a time. Processing assay '${selectedAssay}' only.`;
    }

    const otuFinalFile = otuFinalFiles.find(f => getAssayFromFilename(f) === selectedAssay);
    const taxaFinalFile = taxaFinalFiles.find(f => getTaxaAssayFromFilename(f) === selectedAssay) || taxaFinalFiles[0];

    const getSeqRunFromFilename = (filename) => {
        const noExt = filename.replace(/\.[^.]+$/, '');
        const match = noExt.match(/^otufinal_[^_]+_[^_]+_(.+)/i);
        return match ? match[1] : null;
    };
    const seqRunId = otuFinalFile ? getSeqRunFromFilename(otuFinalFile) : null;

    const readFileAsEntity = async (filename, nameOverride) => {
        if (!filename) return null;
        const result = await analyseCsv(`${basePath}${filename}`);
        if (!result) return null;
        return { name: nameOverride || filename.replace(/\.[^.]+$/, ''), data: result.rows || [] };
    };

    const [projectMetadata, sampleMetadata, otuFinal, taxaFinal, experimentRunMetadata] = await Promise.all([
        readFileAsEntity(projectMetadataFiles[0], 'projectMetadata'),
        readFileAsEntity(sampleMetadataFiles[0], 'sampleMetadata'),
        readFileAsEntity(otuFinalFile, otuFinalFile?.replace(/\.[^.]+$/, '')),
        readFileAsEntity(taxaFinalFile, taxaFinalFile?.replace(/\.[^.]+$/, '')),
        readFileAsEntity(expRunFiles[0], 'experimentRunMetadata')
    ]);

    const missingComponentErrors = [];
    if (!sampleMetadata) missingComponentErrors.push('Missing required component: sampleMetadata');
    if (!otuFinal) missingComponentErrors.push('Missing required component: otuFinal');
    if (!taxaFinal) missingComponentErrors.push('Missing required component: taxaFinal');
    if (!experimentRunMetadata) missingComponentErrors.push('Missing required component: experimentRunMetadata');

    const projectMetadataDefaults = extractProjectMetadataDefaults(projectMetadata?.data);

    const result = buildSheetsWithCrossReferences({
        projectMetadata,
        sampleMetadata,
        experimentRunMetadata,
        otuFinal,
        taxaFinal,
        assayName: selectedAssay,
        assayNames,
        seqRunId,
        multipleAssaysWarning,
        missingComponentErrors
    });
    return { ...result, projectMetadataDefaults, projectMetadataComments: {} };
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
            taxonIdsWithNoRecordInOtuTable
        }
    };
};
