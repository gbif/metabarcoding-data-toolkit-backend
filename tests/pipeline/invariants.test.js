/**
 * Format-agnostic data invariants.
 *
 * These are the assertions that matter most for replacing BIOM. The golden tests pin the shape
 * of the *output files*; these pin the *data* those files are built from, stated in terms no
 * particular container can own: how many samples, how many taxa, how many non-zero entries, how
 * many reads in total and per sample, and what a handful of individual cells hold.
 *
 * Any replacement for BIOM must satisfy these unchanged. If a refactor keeps the golden files
 * identical but breaks one of these, something is wrong with how the data was carried; if it
 * breaks a golden but keeps these, the change is in formatting rather than content. The two
 * groups together tell you which.
 *
 * The expected values were recorded from the current implementation and are hardcoded on
 * purpose - deriving them from the same code they are meant to check would assert nothing.
 */
import '../helpers/env.js';

import test from 'node:test';
import assert from 'node:assert/strict';

import { stageFixture, fixtureAvailable } from '../helpers/dataset.js';
import { blockNetwork, restoreNetwork } from '../helpers/offline.js';

import { processDataset } from '../../workers/tsvworker.js';
import { readBiom, readMetrics } from '../../util/filesAndDirectories.js';

const FIXTURE = 'biowide_fungi_min';
const DATASET_ID = 'test-invariants-biowide';

const EXPECTED = {
    // testData/biowide_fungi_min/OTU_table.tsv has 30 data rows, 9 of which are zero in every
    // sample. A taxon with no reads anywhere is not an observation, so the pipeline keeps 21.
    // That arithmetic is the invariant: 30 - 9 = 21.
    taxa: 21,
    samples: 10,
    nonZeroEntries: 61,
    totalReads: 43244,
    sampleIds: ['NV001', 'NV002', 'NV003', 'NV004', 'NV005',
                'NV006', 'NV007', 'NV008', 'NV009', 'NT010'],
    readCounts: [3736, 2130, 126, 8835, 219, 2642, 1790, 1960, 19323, 2483],
    // Individual cells, addressed by taxon and sample id rather than by index, so the assertion
    // survives any change in row ordering.
    cells: [
        ['1b247938f45848d8761666c36ca6d73b3fccd049', 'NV009', 181],
        ['6b23e6bc0fbe2cde18b5d2d17335f54157a629fb', 'NV001', 0],
        ['38655baaa1f7d61f7931bc70186f9abdad122c8d', 'NT010', 0],
    ],
};

test(`data invariants: ${FIXTURE}`, async (t) => {
    if (!fixtureAvailable(FIXTURE)) {
        t.skip(`testData/${FIXTURE} is not present`);
        return;
    }

    let biom;
    let metrics;

    t.before(async () => {
        blockNetwork();
        const staged = await stageFixture({
            fixture: FIXTURE, id: DATASET_ID,
            files: ['OTU_table.tsv', 'sample.tsv', 'taxa.tsv'],
            mapping: { samples: {}, taxa: {}, measurements: {}, defaultValues: {} },
        });
        // similarity plots skipped: the ordination is pinned by the golden test, and these
        // invariants are about the matrix rather than anything derived from it
        await processDataset(staged.id, staged.version, false, true);
        biom = await readBiom(staged.id, staged.version);
        metrics = await readMetrics(staged.id, staged.version);
    });

    t.after(() => restoreNetwork());

    await t.test('dimensions', () => {
        assert.equal(biom.rows.length, EXPECTED.taxa, 'taxon count');
        assert.equal(biom.columns.length, EXPECTED.samples, 'sample count');
    });

    await t.test('sample identity and order', () => {
        assert.deepEqual(biom.columns.map(c => c.id), EXPECTED.sampleIds);
    });

    await t.test('sparsity', () => {
        assert.equal(biom.data.length, EXPECTED.nonZeroEntries);
    });

    await t.test('total reads agree between the matrix and the metrics', () => {
        const summed = biom.data.reduce((total, [, , value]) => total + Number(value), 0);
        assert.equal(summed, EXPECTED.totalReads, 'sum over the matrix');
        assert.equal(metrics.totalReads, EXPECTED.totalReads, 'metrics.totalReads');
    });

    await t.test('per-sample read counts', () => {
        const counts = biom.columns.map(c => c.metadata?.readCount);
        assert.deepEqual(counts, EXPECTED.readCounts);

        // and they must add up to the same total, which catches a per-column accumulation bug
        // that a correct grand total could otherwise hide
        const summed = counts.reduce((a, b) => a + b, 0);
        assert.equal(summed, EXPECTED.totalReads);
    });

    await t.test('individual cells', () => {
        for (const [taxon, sample, expected] of EXPECTED.cells) {
            assert.equal(biom.getDataAt(taxon, sample), expected,
                `value at ${taxon} x ${sample}`);
        }
    });

    await t.test('every taxon carries at least one read', () => {
        // The complement of the 30 - 9 = 21 reduction above: no all-zero taxon should survive
        // into the matrix. States the rule rather than just the resulting count.
        const perRow = new Map(biom.rows.map(r => [r.id, 0]));
        for (const [rowIdx, , value] of biom.data) {
            const id = biom.rows[rowIdx].id;
            perRow.set(id, perRow.get(id) + Number(value));
        }
        const empty = [...perRow.entries()].filter(([, total]) => total === 0).map(([id]) => id);
        assert.deepEqual(empty, [], 'taxa with no reads in any sample');
    });
});
