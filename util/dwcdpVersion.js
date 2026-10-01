import fs from 'fs';
import path from 'path';
import config from '../config.js';

// Schema generations MDT has produced.
export const DWCDP_LEGACY = 'legacy';      // natural keys: eventID, totalReadCount, ...
export const DWCDP_CURRENT = '1.0-DEV';    // surrogate keys: event_pk, event_fk, ...

// Columns that only exist in one generation, so either one is conclusive on its own.
const CURRENT_MARKERS = ['event_pk', 'event_fk', 'nucleotideAnalysis_pk', 'nucleotideSequence_fk', 'processedTotalReadCount'];
const LEGACY_MARKERS = ['totalReadCount', 'nucleotideAnalysisID', 'molecularProtocolID'];

const fieldNames = (datapackage) =>
    (datapackage?.resources || []).flatMap(r => (r?.schema?.fields || []).map(f => f?.name));

/**
 * Which schema generation a data package was written against.
 *
 * Packages generated before the surrogate-key migration carry no version marker of any kind -
 * their resources declare a bare relative `schema.url` ("table-schemas/event.json") and there
 * is no mdtSchemaVersion - so the generation has to be read off the column names. That is
 * reliable here because the two generations have no column names in common for the identifying
 * and referencing columns: a table either has event_pk/event_fk or it has eventID.
 *
 * Returns DWCDP_CURRENT, DWCDP_LEGACY, or null when the package could not be read at all.
 */
export const dwcdpVersionFromDatapackage = (datapackage) => {
    if (!datapackage) {
        return null;
    }
    // A package that states its version is taken at its word.
    if (datapackage.mdtSchemaVersion) {
        return datapackage.mdtSchemaVersion;
    }
    const names = new Set(fieldNames(datapackage));
    if (CURRENT_MARKERS.some(m => names.has(m))) {
        return DWCDP_CURRENT;
    }
    if (LEGACY_MARKERS.some(m => names.has(m))) {
        return DWCDP_LEGACY;
    }
    // Readable but unrecognised - treat as legacy rather than assume the newer shape, so an
    // unexpected package is read with the queries that used to work instead of failing to bind.
    return DWCDP_LEGACY;
};

/**
 * Reads the datapackage.json of a dataset's generated package and reports its generation.
 * `subdir` is 'parquet' (what the dashboard queries) or 'dwc-dp' (the tsv copy).
 */
export const getDwcdpVersion = async (id, version, subdir = 'parquet') => {
    try {
        const file = path.join(`${config.dataStorage}${id}/${version}/${subdir}`, 'datapackage.json');
        if (!fs.existsSync(file)) {
            return null;
        }
        return dwcdpVersionFromDatapackage(JSON.parse(await fs.promises.readFile(file, 'utf8')));
    } catch (error) {
        console.log(`Could not determine DwC-DP version for ${id}: ${error?.message || error}`);
        return null;
    }
};

export const isLegacyDwcdp = (v) => v !== null && v !== undefined && v !== DWCDP_CURRENT;

export default { DWCDP_LEGACY, DWCDP_CURRENT, dwcdpVersionFromDatapackage, getDwcdpVersion, isLegacyDwcdp };
