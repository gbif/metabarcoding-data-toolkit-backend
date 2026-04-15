import xlsx from "xlsx";
import fs from "fs";
import { Biom } from "biojs-io-biom";
import config from "../config.js";
import { getStreamAsArrayBuffer } from 'get-stream';
import { analyseCsv } from '../validation/tsvformat.js';
import { getMetaDataRow } from '../util/index.js';
import { getGroupMetaDataAsJsonString } from '../validation/termMapper.js';

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

    const otuFinalSheets = filterPrefix('otuFinal_');
    const taxaFinalSheets = filterPrefix('taxaFinal_');

    if (otuFinalSheets.length === 0) {
        throw 'No otuFinal sheet found in FAIRe dataset';
    }

    // otuFinal_<assay>_<run> — assay is the second underscore-separated token
    const getAssayFromName = (name) => {
        const parts = name.split('_');
        return parts.length >= 2 ? parts[1] : null;
    };

    const assayNames = [...new Set(otuFinalSheets.map(s => getAssayFromName(s.name)).filter(Boolean))];

    const selectedAssay = (preferredAssay && assayNames.includes(preferredAssay))
        ? preferredAssay
        : assayNames[0];

    let multipleAssaysWarning = null;
    if (assayNames.length > 1) {
        multipleAssaysWarning = `This dataset contains multiple assays: ${assayNames.join(', ')}. MDT can only process one assay at a time. Processing assay '${selectedAssay}' only.`;
    }
    const otuFinal = otuFinalSheets.find(s => getAssayFromName(s.name) === selectedAssay);

    const otuParts = otuFinal.name.split('_');
    const seqRunId = otuParts.length >= 3 ? otuParts.slice(2).join('_') : null;

    const taxaFinal = taxaFinalSheets.find(s => getAssayFromName(s.name) === selectedAssay) || taxaFinalSheets[0];

    const missingComponentErrors = [];
    if (!sampleMetadata) missingComponentErrors.push('Missing required component: sampleMetadata');
    if (!taxaFinal) missingComponentErrors.push('Missing required component: taxaFinal');
    if (!experimentRunMetadata) missingComponentErrors.push('Missing required component: experimentRunMetadata');

    const projectMetadata = find('projectMetadata');

    return { projectMetadata, sampleMetadata, experimentRunMetadata, otuFinal, taxaFinal, assayName: selectedAssay, assayNames, seqRunId, multipleAssaysWarning, missingComponentErrors };
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

const buildSheetsWithCrossReferences = (components) => {
    const { sampleMetadata, experimentRunMetadata, otuFinal, taxaFinal, multipleAssaysWarning, missingComponentErrors, assayName, assayNames, seqRunId } = components;

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

/**
 * Load the raw FAIRe component objects needed for BIOM conversion.
 * Handles both single-workbook mode and flat-file mode.
 * Returns { sampleMetadata, otuFinal, taxaFinal, experimentRunMetadata, assayName, seqRunId }
 * where each component is a { name, data } object (2D array, comment rows not yet stripped).
 */
export const loadFAIReComponents = async (id, version, preferredAssay = null) => {
    const basePath = `${config.dataStorage}${id}/${version}/original/`;
    const fileList = fs.readdirSync(basePath);

    const xlsxFile = fileList.find(f => /\.(xlsx|xls)$/i.test(f));

    if (xlsxFile) {
        const buffer = await getStreamAsArrayBuffer(fs.createReadStream(`${basePath}${xlsxFile}`));
        const workbook = xlsx.read(buffer, { type: 'array', dense: true, cellDates: true });
        const sheets = workbook.SheetNames.map(name => ({
            name,
            data: xlsx.utils.sheet_to_json(workbook.Sheets[name], { header: 1 })
        }));
        return parseFAIReComponents(sheets, preferredAssay);
    }

    // Flat-file mode
    const findByPrefix = (prefix) => fileList.filter(f => f.toLowerCase().startsWith(prefix.toLowerCase()));

    const sampleMetadataFiles = findByPrefix('samplemetadata_');
    const otuFinalFiles       = findByPrefix('otufinal_');
    const taxaFinalFiles      = findByPrefix('taxafinal_');
    const expRunFiles         = findByPrefix('experimentrunmetadata_');

    if (otuFinalFiles.length === 0) throw 'No otuFinal file found in FAIRe dataset';

    const getAssayFromFilename = (filename) => {
        const noExt = filename.replace(/\.[^.]+$/, '');
        const match = noExt.match(/^otufinal_[^_]+_([^_]+)/i);
        return match ? match[1] : null;
    };

    const assayNames = [...new Set(otuFinalFiles.map(f => getAssayFromFilename(f)).filter(Boolean))];
    const selectedAssay = (preferredAssay && assayNames.includes(preferredAssay))
        ? preferredAssay
        : assayNames[0];
    const otuFinalFile  = otuFinalFiles.find(f => getAssayFromFilename(f) === selectedAssay);
    const taxaFinalFile = taxaFinalFiles.find(f => {
        const noExt = f.replace(/\.[^.]+$/, '');
        const m = noExt.match(/^taxafinal_[^_]+_([^_]+)/i);
        return m && m[1] === selectedAssay;
    }) || taxaFinalFiles[0];

    const getSeqRunFromFilename = (filename) => {
        const noExt = filename.replace(/\.[^.]+$/, '');
        const m = noExt.match(/^otufinal_[^_]+_[^_]+_(.+)/i);
        return m ? m[1] : null;
    };

    const readFileAsEntity = async (filename, nameOverride) => {
        if (!filename) return null;
        const result = await analyseCsv(`${basePath}${filename}`);
        if (!result) return null;
        return { name: nameOverride || filename.replace(/\.[^.]+$/, ''), data: result.rows || [] };
    };

    const [sampleMetadata, otuFinal, taxaFinal, experimentRunMetadata] = await Promise.all([
        readFileAsEntity(sampleMetadataFiles[0], 'sampleMetadata'),
        readFileAsEntity(otuFinalFile,  otuFinalFile?.replace(/\.[^.]+$/, '')),
        readFileAsEntity(taxaFinalFile, taxaFinalFile?.replace(/\.[^.]+$/, '')),
        readFileAsEntity(expRunFiles[0], 'experimentRunMetadata')
    ]);

    if (!sampleMetadata) throw 'Failed to read sampleMetadata file';
    if (!otuFinal)       throw 'Failed to read otuFinal file';
    if (!taxaFinal)      throw 'Failed to read taxaFinal file';

    return {
        sampleMetadata,
        experimentRunMetadata,
        otuFinal,
        taxaFinal,
        assayName: selectedAssay,
        seqRunId: otuFinalFile ? getSeqRunFromFilename(otuFinalFile) : null,
        multipleAssaysWarning: null,
        missingComponentErrors: []
    };
};

export const readFAIReWorkbook = async (id, xlsxFileName, version, preferredAssay = null) => {
    const filePath = `${config.dataStorage}${id}/${version}/original/${xlsxFileName}`;
    const stream = fs.createReadStream(filePath);
    const buffer = await getStreamAsArrayBuffer(stream);
    const workbook = xlsx.read(buffer, { type: 'array', dense: true, cellDates: true });

    const allSheetData = workbook.SheetNames.map(name => ({
        name,
        data: xlsx.utils.sheet_to_json(workbook.Sheets[name], { header: 1 })
    }));

    const components = parseFAIReComponents(allSheetData, preferredAssay);
    const projectMetadataDefaults = extractProjectMetadataDefaults(components.projectMetadata?.data);
    const result = buildSheetsWithCrossReferences(components);

    // Add every workbook tab that is not already a recognised FAIRe component sheet,
    // so the UI can display all tabs (README, projectMetadata, drop-down lists, etc.).
    const componentNames = new Set(result.sheets.map(s => s.name));
    const extraSheets = allSheetData
        .filter(s => !componentNames.has(s.name))
        .map(s => buildSheet(s, []));

    return { ...result, projectMetadataDefaults, sheets: [...result.sheets, ...extraSheets] };
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
    return { ...result, projectMetadataDefaults };
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
