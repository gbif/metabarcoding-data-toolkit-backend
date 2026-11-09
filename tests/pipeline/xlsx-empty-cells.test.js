/**
 * Empty cells in a workbook's OTU table.
 *
 * sheet_to_json(..., {header: 1}) returns a row with a hole where a cell is empty, and forEach
 * and filter skip holes. The workbook reader used both, so every count after an empty cell went
 * to an earlier sample - the row and grand totals stayed right, which is why it went unnoticed.
 * On the NECR534 12S workbook that prompted this, 583 of 891 counts were on the wrong sample.
 *
 * An empty cell means zero, as it already does on the flat-file lane, so each workbook is checked
 * against the same workbook with every cell written out. Both layouts are covered: a Taxonomy
 * sheet, and taxonomy in the OTU table sheet, where an empty taxon cell used to shift the taxon
 * fields too. The workbooks are built here rather than committed, so the empty cells are exactly
 * where the test says they are.
 */
import '../helpers/env.js';

import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import xlsx from 'xlsx';

import config from '../../config.js';
import { DATASET_VERSION } from '../helpers/dataset.js';
import { blockNetwork, restoreNetwork } from '../helpers/offline.js';

import { processDataset as validateWorkbook } from '../../workers/xlsxvalidationworker.js';
import { processDataset as processWorkbook } from '../../workers/xlsxworker.js';
import { readBiom, writeMapping } from '../../util/filesAndDirectories.js';

const SAMPLES = ['S1', 'S2', 'S3', 'S4'];

// null is an empty cell. T1 and T2 have gaps before later counts, which is what shifted; T3's
// gaps are trailing, which never did.
const COUNTS = {
    T1: [10, null, 30, 40],
    T2: [null, null, 5, 6],
    T3: [7, 8, null, null],
    T4: [1, 2, 3, 4],
};
const GENUS = { T1: 'GenusT1', T2: null, T3: 'GenusT3', T4: 'GenusT4' };

const EXPECTED_COUNTS = Object.fromEntries(Object.entries(COUNTS)
    .map(([taxon, counts]) => [taxon, counts.map(c => c ?? 0)]));

const sampleSheet = () => [
    ['id', 'eventDate', 'decimalLatitude', 'decimalLongitude'],
    ...SAMPLES.map(s => [s, '2020-01-01', '55', '12']),
];
const sequence = (taxon) => 'ACGT'.repeat(30) + taxon;

const LAYOUTS = {
    'Taxonomy sheet': (empty) => ({
        Samples: sampleSheet(),
        Taxonomy: [
            ['id', 'kingdom', 'genus', 'scientificName', 'DNA_sequence'],
            ...Object.keys(COUNTS).map(t => [t, 'Animalia', GENUS[t] ?? empty.text, `taxon ${t}`, sequence(t)]),
        ],
        OTU_table: [
            ['id', ...SAMPLES],
            ...Object.entries(COUNTS).map(([t, c]) => [t, ...c.map(v => v ?? empty.count)]),
        ],
    }),
    'taxonomy in the OTU table': (empty) => ({
        Samples: sampleSheet(),
        OTU_table: [
            ['id', ...SAMPLES, 'kingdom', 'genus', 'scientificName', 'DNA_sequence'],
            ...Object.entries(COUNTS).map(([t, c]) => [
                t, ...c.map(v => v ?? empty.count), 'Animalia', GENUS[t] ?? empty.text, `taxon ${t}`, sequence(t),
            ]),
        ],
    }),
};

// aoa_to_sheet writes no cell for undefined, so the sheet really has gaps; 0 and '' are cells
const EMPTY = { count: undefined, text: undefined };
const WRITTEN = { count: 0, text: '' };

const writeWorkbook = (sheets) => {
    const workbook = xlsx.utils.book_new();
    for (const [name, rows] of Object.entries(sheets)) {
        xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(rows), name);
    }
    return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

const run = async (id, buffer) => {
    const dir = `${config.dataStorage}${id}/${DATASET_VERSION}`;
    fs.mkdirSync(path.join(dir, 'original'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'original', `${id}.xlsx`), buffer);
    await writeMapping(id, DATASET_VERSION, { samples: {}, taxa: {}, measurements: {}, defaultValues: {} });

    await validateWorkbook(id, DATASET_VERSION, 'test-user');
    await processWorkbook(id, DATASET_VERSION, false, true);
    return readBiom(id, DATASET_VERSION);
};

// The matrix as {taxon: [count per sample]}, and the taxon fields, keyed by id rather than by
// position so the comparison does not depend on row or column order.
const countsByTaxon = (biom) => {
    const byTaxon = Object.fromEntries(biom.rows.map(r => [r.id, SAMPLES.map(() => 0)]));
    for (const [r, c, value] of biom.data) {
        byTaxon[biom.rows[r].id][SAMPLES.indexOf(biom.columns[c].id)] = Number(value);
    }
    return byTaxon;
};
const taxonFields = (biom) => Object.fromEntries(biom.rows.map(r => [r.id, {
    genus: r.metadata?.genus || '',
    scientificName: r.metadata?.scientificName,
}]));

for (const [layout, sheets] of Object.entries(LAYOUTS)) {
    test(`xlsx with empty OTU table cells, ${layout}`, async (t) => {
        let withGaps;
        let written;
        const slug = layout.replace(/\W+/g, '-');

        t.before(async () => {
            blockNetwork();
            withGaps = await run(`test-empty-cells-${slug}`, writeWorkbook(sheets(EMPTY)));
            written = await run(`test-written-cells-${slug}`, writeWorkbook(sheets(WRITTEN)));
        });

        t.after(() => restoreNetwork());

        await t.test('the workbook really has empty cells', () => {
            // guards the test itself: if the reader ever stopped producing holes, the
            // assertions below would pass without exercising anything
            const workbook = xlsx.read(writeWorkbook(sheets(EMPTY)), { type: 'buffer', dense: true });
            const rows = xlsx.utils.sheet_to_json(workbook.Sheets.OTU_table, { header: 1 });
            assert.equal(1 in rows[2], false, 'T2 should have no cell for S1');
        });

        await t.test('each count stays on its own sample', () => {
            assert.deepEqual(countsByTaxon(withGaps), EXPECTED_COUNTS);
        });

        await t.test('the counts match the same workbook with every cell written', () => {
            assert.deepEqual(countsByTaxon(withGaps), countsByTaxon(written));
        });

        await t.test('an empty taxon field stays empty and moves nothing', () => {
            const fields = taxonFields(withGaps);
            assert.deepEqual(fields.T2, { genus: '', scientificName: 'taxon T2' });
            assert.deepEqual(fields, taxonFields(written));
        });
    });
}
