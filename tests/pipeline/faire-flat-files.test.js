/**
 * A FAIRe dataset supplied as flat files gives the same result as the same dataset as a workbook.
 *
 * Flat files were renamed to sheet names by dropping the second underscore-separated token as the
 * project id. That cut an id such as verte_quadeloupe in two, and it left the metadata components
 * named sampleMetadata_<project_id>, which the parser looks up as plain sampleMetadata - so a
 * dataset of flat files lost its sampleMetadata, experimentRunMetadata and projectMetadata, and
 * processing failed. Validation read flat files the same way, so it was never caught there either.
 *
 * The workbook fixture is written out both ways here, with its assay renamed tele01 -> tele_01 and
 * the project id verte_quadeloupe, so the flat file names carry an underscore in both. Cell text is
 * flattened to one line and trimmed first: a tab or newline inside a cell cannot survive a tsv, and
 * the flat-file reader trims cells where the workbook reader does not.
 */
import '../helpers/env.js';

import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import xlsx from 'xlsx';

import config from '../../config.js';
import { DATASET_VERSION, fixtureAvailable } from '../helpers/dataset.js';
import { blockNetwork, restoreNetwork } from '../helpers/offline.js';

import { processDataset as validateFaire } from '../../workers/fairevalidationworker.js';
import { processDataset as processFaire } from '../../workers/faireworker.js';
import { toCalendarDate } from '../../converters/faire.js';
import { readBiom, readMapping, writeMapping, getProcessingReport } from '../../util/filesAndDirectories.js';

const FIXTURE = 'FAIRe';
const WORKBOOK = path.join('testData', FIXTURE, 'verte_quadeloupe.xlsx');
const PROJECT_ID = 'verte_quadeloupe';
const ASSAY = 'tele_01';
const RUN = 'teleo';

const COMPONENTS = {
    projectMetadata: 'projectMetadata',
    sampleMetadata: 'sampleMetadata',
    experimentRunMetadata: 'experimentRunMetadata',
    'otuFinal_tele01_teleo': `otuFinal_${ASSAY}_${RUN}`,
    'taxaFinal_tele01_teleo': `taxaFinal_${ASSAY}_${RUN}`,
};

const cell = (value) => {
    const v = toCalendarDate(value);
    return typeof v === 'string' ? v.replace(/[\t\r\n]+/g, ' ').replace(/\btele01\b/g, ASSAY).trim() : v;
};

/** { sheet name in the rewritten dataset: rows } */
const rewrittenSheets = () => {
    const workbook = xlsx.read(fs.readFileSync(WORKBOOK), { cellDates: true });
    return Object.fromEntries(Object.entries(COMPONENTS).map(([from, to]) => [to,
        xlsx.utils.sheet_to_json(workbook.Sheets[from], { header: 1, defval: '' }).map(row => row.map(cell))]));
};

// the flat file a sheet becomes: the project id goes after the component name
const flatFileName = (sheetName) => {
    const [component, ...rest] = sheetName.split('_');
    return `${[component, PROJECT_ID, ...rest].join('_')}.tsv`;
};

const run = async (id, write) => {
    const dir = `${config.dataStorage}${id}/${DATASET_VERSION}`;
    fs.rmSync(`${config.dataStorage}${id}`, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, 'original'), { recursive: true });
    write(path.join(dir, 'original'));
    await writeMapping(id, DATASET_VERSION, { samples: {}, taxa: {}, measurements: {}, defaultValues: {} });

    await validateFaire(id, DATASET_VERSION, 'test-user');
    await processFaire(id, DATASET_VERSION, true);
    return {
        biom: await readBiom(id, DATASET_VERSION),
        mapping: await readMapping(id, DATASET_VERSION),
        report: await getProcessingReport(id, DATASET_VERSION),
    };
};

// A tsv cell is text, so a number read from the workbook is compared as the text it would be.
const asText = (value) => JSON.parse(JSON.stringify(value, (key, v) => (typeof v === 'number' ? String(v) : v)));
const matrix = (biom) => biom.data.map(([r, c, value]) => [biom.rows[r].id, biom.columns[c].id, Number(value)]).sort();

test('FAIRe flat files with underscores in the project id and assay', async (t) => {
    if (!fixtureAvailable(FIXTURE)) {
        t.skip(`testData/${FIXTURE} is not present`);
        return;
    }

    let workbook;
    let flat;

    t.before(async () => {
        blockNetwork();
        const sheets = rewrittenSheets();

        workbook = await run('test-faire-underscores-workbook', (dir) => {
            const wb = xlsx.utils.book_new();
            for (const [name, rows] of Object.entries(sheets)) {
                xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(rows), name);
            }
            fs.writeFileSync(path.join(dir, `${PROJECT_ID}.xlsx`), xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }));
        });

        flat = await run('test-faire-underscores-flat', (dir) => {
            for (const [name, rows] of Object.entries(sheets)) {
                fs.writeFileSync(path.join(dir, flatFileName(name)), rows.map(r => r.join('\t')).join('\n') + '\n');
            }
        });
    });

    t.after(() => restoreNetwork());

    await t.test('the flat files carry the underscores', () => {
        const files = fs.readdirSync(`${config.dataStorage}test-faire-underscores-flat/${DATASET_VERSION}/original`);
        assert.ok(files.includes(`sampleMetadata_${PROJECT_ID}.tsv`));
        assert.ok(files.includes(`otuFinal_${PROJECT_ID}_${ASSAY}_${RUN}.tsv`));
    });

    await t.test('both lanes find the assay', () => {
        assert.deepEqual(workbook.report.files.assayNames, [ASSAY]);
        assert.deepEqual(flat.report.files.assayNames, [ASSAY]);
    });

    await t.test('the flat-file lane processes the dataset', () => {
        assert.ok(flat.biom, 'no BIOM was written');
        assert.ok(flat.biom.rows.length > 0 && flat.biom.columns.length > 0);
    });

    await t.test('the defaults from projectMetadata are the same', () => {
        assert.ok(Object.keys(flat.mapping.defaultValues).length > 0, 'no defaults were read from projectMetadata');
        assert.deepEqual(asText(flat.mapping.defaultValues), asText(workbook.mapping.defaultValues));
    });

    await t.test('samples, taxa and counts are the same', () => {
        assert.deepEqual(asText(flat.biom.columns), asText(workbook.biom.columns));
        assert.deepEqual(asText(flat.biom.rows), asText(workbook.biom.rows));
        assert.deepEqual(matrix(flat.biom), matrix(workbook.biom));
    });
});
