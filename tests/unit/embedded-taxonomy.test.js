/**
 * The shared rules that split an OTU table's taxon columns from its count columns.
 *
 * Both readers call these - converters/biom.js and server/validation.js on the flat-file lane,
 * converters/excel.js on the workbook lane - so their edge cases are pinned once, here, rather
 * than through a fixture per lane. The pipeline test (tests/pipeline/embedded-taxonomy.golden.
 * test.js) covers the lanes end to end.
 */
import '../helpers/env.js';

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    sampleIdHeaderByOtuOverlap,
    embeddedTaxonColumnIndices,
    hasEmbeddedTaxonColumns,
} from '../../util/index.js';

const OTU_HEADERS = ['qseqid', 'S1', 'S2', 'S3', 'kingdom', 'scientificName'];

test('sampleIdHeaderByOtuOverlap', async (t) => {
    await t.test('picks the column whose values label the OTU table columns', () => {
        const columns = [
            { header: 'site', values: ['A', 'A', 'B'] },
            { header: 'libraryName', values: ['S1', 'S2', 'S3'] },
        ];
        assert.equal(sampleIdHeaderByOtuOverlap(columns, OTU_HEADERS), 'libraryName');
    });

    await t.test('is not fooled by a constant first column', () => {
        // the case hasIdColumn gets wrong: it takes the first column, and a project id that is
        // the same on every row matches no OTU header
        const columns = [
            { header: 'projectID', values: ['10', '10', '10'] },
            { header: 'materialSampleID', values: ['S1', 'S2', 'S3'] },
        ];
        assert.equal(sampleIdHeaderByOtuOverlap(columns, OTU_HEADERS), 'materialSampleID');
    });

    await t.test('prefers the column matching more headers', () => {
        const columns = [
            { header: 'partial', values: ['S1', 'x', 'y'] },
            { header: 'full', values: ['S1', 'S2', 'S3'] },
        ];
        assert.equal(sampleIdHeaderByOtuOverlap(columns, OTU_HEADERS), 'full');
    });

    await t.test('counts distinct matches, so a repeated value does not outweigh a real id', () => {
        const columns = [
            { header: 'repeated', values: ['S1', 'S1', 'S1', 'S1'] },
            { header: 'id', values: ['S1', 'S2', 'S3', 'S4'] },
        ];
        assert.equal(sampleIdHeaderByOtuOverlap(columns, OTU_HEADERS), 'id');
    });

    await t.test('keeps the first column on a tie', () => {
        const columns = [
            { header: 'first', values: ['S1', 'S2'] },
            { header: 'second', values: ['S1', 'S2'] },
        ];
        assert.equal(sampleIdHeaderByOtuOverlap(columns, OTU_HEADERS), 'first');
    });

    await t.test('trims values and headers before comparing', () => {
        const columns = [{ header: 'id', values: [' S1', 'S2 '] }];
        assert.equal(sampleIdHeaderByOtuOverlap(columns, ['qseqid', 'S1 ', ' S2']), 'id');
    });

    await t.test('compares numeric cells as text', () => {
        // workbook cells come through as numbers
        const columns = [{ header: 'id', values: [101, 102] }];
        assert.equal(sampleIdHeaderByOtuOverlap(columns, ['otu', '101', '102']), 'id');
    });

    await t.test('ignores blank values and headerless columns', () => {
        const columns = [
            { header: '', values: ['S1', 'S2'] },
            { header: 'notes', values: ['', null, undefined] },
        ];
        assert.equal(sampleIdHeaderByOtuOverlap(columns, ['', ...OTU_HEADERS]), undefined);
    });

    await t.test('is undefined when nothing matches, and on missing input', () => {
        assert.equal(sampleIdHeaderByOtuOverlap([{ header: 'x', values: ['a'] }], OTU_HEADERS), undefined);
        assert.equal(sampleIdHeaderByOtuOverlap(), undefined);
        assert.equal(sampleIdHeaderByOtuOverlap(null, null), undefined);
    });
});

test('embeddedTaxonColumnIndices', async (t) => {
    const samples = new Set(['S1', 'S2', 'S3']);

    await t.test('returns the row id and every column that is not a sample', () => {
        assert.deepEqual(embeddedTaxonColumnIndices(OTU_HEADERS, samples), [0, 4, 5]);
    });

    await t.test('handles taxon columns before the counts as well as after', () => {
        const headers = ['qseqid', 'kingdom', 'S1', 'S2', 'scientificName', 'S3'];
        assert.deepEqual(embeddedTaxonColumnIndices(headers, samples), [0, 1, 4]);
    });

    await t.test('is just the row id for a table of counts', () => {
        assert.deepEqual(embeddedTaxonColumnIndices(['qseqid', 'S1', 'S2', 'S3'], samples), [0]);
    });

    await t.test('is every index when no sample id is recognised', () => {
        assert.deepEqual(embeddedTaxonColumnIndices(OTU_HEADERS, new Set(['other'])), [0, 1, 2, 3, 4, 5]);
    });

    await t.test('is empty on missing input', () => {
        assert.deepEqual(embeddedTaxonColumnIndices(), []);
        assert.deepEqual(embeddedTaxonColumnIndices(null, samples), []);
    });
});

test('hasEmbeddedTaxonColumns', async (t) => {
    await t.test('true when some, but not all, columns are taxon columns', () => {
        assert.equal(hasEmbeddedTaxonColumns([0, 4, 5], OTU_HEADERS), true);
    });

    await t.test('false for the row id alone: there is nothing but counts', () => {
        assert.equal(hasEmbeddedTaxonColumns([0], OTU_HEADERS), false);
    });

    await t.test('false when every column is: no sample id was recognised', () => {
        assert.equal(hasEmbeddedTaxonColumns([0, 1, 2, 3, 4, 5], OTU_HEADERS), false);
    });

    await t.test('false on missing input', () => {
        assert.equal(hasEmbeddedTaxonColumns(undefined, OTU_HEADERS), false);
        assert.equal(hasEmbeddedTaxonColumns([], OTU_HEADERS), false);
        assert.equal(hasEmbeddedTaxonColumns([0, 1], undefined), false);
    });
});
