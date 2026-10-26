/**
 * The sequences-as-column-headers input shape.
 *
 * The last uncovered input branch (workers/tsvworker.js:50-66). A distinct shape rather than a
 * variant: samples are the rows, the column headers are the sequences themselves, and there is
 * no taxon file at all. Identity comes from the sequence, which the worker md5s into the taxon
 * id, so the same biological data gets entirely different record identifiers than it would in
 * any other form.
 *
 * testData/biowide_bacteria is a real example - 131 rows by 69,318 columns, 45 MB - which cannot
 * be committed. The fixture here is derived from testData/biowide_fungi_min instead, which is in
 * the repository and whose inline-sequence output is already pinned. That makes it possible to
 * compare the two orientations of the same data directly, and the comparison turns out to be the
 * interesting part: the matrix is identical, and the Darwin Core Data Package is not.
 */
import '../helpers/env.js';

import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { readArtifact, fixtureAvailable, DATASET_VERSION } from '../helpers/dataset.js';
import { compareToGolden } from '../helpers/golden.js';
import { sortedLines } from '../helpers/normalise.js';
import { blockNetwork, restoreNetwork } from '../helpers/offline.js';
import { toSequenceHeaderTable } from '../helpers/fasta.js';
import { TEST_DATA_ROOT, GOLDEN_ROOT } from '../helpers/env.js';

import config from '../../config.js';
import { writeMapping, readBiom } from '../../util/filesAndDirectories.js';
import { processDataset } from '../../workers/tsvworker.js';
import { md5 } from '../../util/index.js';
import { biomToDwc } from '../../converters/dwc.js';
import { biomToDwcDp } from '../../converters/dwcdp.js';

const SOURCE = 'biowide_fungi_min';
const FIXTURE = 'sequence_headers';
const DATASET_ID = 'test-sequence-headers';
const EMPTY_MAPPING = { samples: {}, taxa: {}, measurements: {}, defaultValues: {} };
const TABULAR = { headerLines: 1 };

const INLINE = {
    // what the same data produces when the sequences are a DNA_sequence column instead
    taxa: 21,
    sequenceRecords: 21,
};
const EXPECTED = {
    samples: 10,
    // every taxon survives here, including the nine with no reads at all - see below
    taxa: 30,
    nonZeroEntries: 61,
    totalReads: 43244,
    readCounts: [3736, 2130, 126, 8835, 219, 2642, 1790, 1960, 19323, 2483],
};

const inlineGolden = (name) => fs.readFileSync(path.join(GOLDEN_ROOT, SOURCE, name), 'utf8');
const bodyCount = (text) =>
    text.replace(/\r\n/g, '\n').split('\n').filter(l => l.length > 0).length - 1;

test('sequences as column headers', async (t) => {
    if (!fixtureAvailable(SOURCE)) {
        t.skip(`testData/${SOURCE} is not present`);
        return;
    }

    let dir;
    let biom;
    let sequences;

    t.before(async () => {
        blockNetwork();
        const source = path.join(TEST_DATA_ROOT, SOURCE);
        const table = toSequenceHeaderTable(
            path.join(source, 'OTU_table.tsv'), path.join(source, 'taxa.tsv'));
        sequences = table.split('\n')[0].split('\t').slice(1);

        dir = `${config.dataStorage}${DATASET_ID}/${DATASET_VERSION}`;
        fs.mkdirSync(path.join(dir, 'original'), { recursive: true });
        fs.mkdirSync(path.join(dir, 'archive'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'archive', 'eml.xml'),
            '<?xml version="1.0" encoding="UTF-8"?>\n<eml:eml xmlns:eml="https://eml.ecoinformatics.org/eml-2.2.0" packageId="test" system="mdt-test">\n  <dataset><title>Test fixture</title></dataset>\n</eml:eml>\n');

        fs.writeFileSync(path.join(dir, 'original', 'OTU_table.tsv'), table);
        // the sample file is unchanged; no taxon file is supplied at all, which is the point
        fs.copyFileSync(path.join(source, 'sample.tsv'), path.join(dir, 'original', 'sample.tsv'));

        await writeMapping(DATASET_ID, DATASET_VERSION, EMPTY_MAPPING);
        await processDataset(DATASET_ID, DATASET_VERSION, false, true);

        biom = await readBiom(DATASET_ID, DATASET_VERSION);
        await biomToDwc(biom, EMPTY_MAPPING, dir);
        await biomToDwcDp(biom, EMPTY_MAPPING, dir);
    });

    t.after(() => restoreNetwork());

    await t.test('the input really is in the sequences-as-headers shape', () => {
        // Otherwise this would quietly be testing the ordinary TSV path again. Detection needs
        // the first ten headers to be DNA longer than 75 characters
        // (validation/tsvformat.js:236), and no taxon file is present.
        const header = readArtifact(dir, 'original/OTU_table.tsv').split('\n')[0].split('\t');
        assert.equal(header[0], '', 'the leading header cell should be empty');
        assert.equal(header.length - 1, 30, '30 sequence columns');
        for (const sequence of sequences.slice(0, 10)) {
            assert.ok(sequence.length > 75, 'headers must clear the sequence-length threshold');
            assert.match(sequence, /^[ACGTURYSWKMBDHVNacgturyswkmbdhvn]+$/);
        }
        assert.ok(!fs.existsSync(path.join(dir, 'original', 'taxa.tsv')),
            'there should be no taxon file');
    });

    await t.test('taxon ids are the md5 of the sequence', () => {
        // With no taxon file there is nothing else identity could come from. It also means the
        // same sequence gets the same id in any dataset processed this way.
        const ids = new Set(biom.rows.map(r => r.id));
        for (const sequence of sequences) {
            assert.ok(ids.has(md5(sequence)),
                `no row keyed by the md5 of ${sequence.slice(0, 24)}...`);
        }
    });

    await t.test('every taxon carries its sequence', () => {
        assert.equal(biom.rows.filter(r => r.metadata?.DNA_sequence).length, biom.rows.length);
        for (const row of biom.rows) {
            assert.equal(md5(row.metadata.DNA_sequence), row.id,
                'the id and the sequence it was derived from must agree');
        }
    });

    await t.test('the matrix is identical to the inline orientation', () => {
        // Same counts, same samples, same totals: transposing the input and keying on sequences
        // changes identifiers, not data.
        assert.equal(biom.columns.length, EXPECTED.samples);
        assert.equal(biom.data.length, EXPECTED.nonZeroEntries);
        assert.equal(biom.data.reduce((sum, [, , v]) => sum + Number(v), 0), EXPECTED.totalReads);
        assert.deepEqual(biom.columns.map(c => c.metadata?.readCount), EXPECTED.readCounts);
    });

    await t.test('the occurrence records match the inline orientation in number', () => {
        assert.equal(bodyCount(readArtifact(dir, 'archive/occurrence.txt')),
            bodyCount(inlineGolden('occurrence.txt')),
            'the same data should yield the same number of occurrences');
        assert.equal(bodyCount(readArtifact(dir, 'archive/dna.txt')),
            EXPECTED.nonZeroEntries);
    });

    await t.test('KNOWN DIVERGENCE nine taxa with no reads survive this orientation', async () => {
        // The all-zero-taxon drop happens on input *rows*. Here the taxa are columns, so the
        // nine taxa that are zero in every sample - 30 rows in the source OTU table, 21 of which
        // have any reads - are not dropped. The occurrence records are unaffected, but the data
        // package gains nine nucleotide-sequence and nine identification records for taxa that
        // occur nowhere.
        //
        // Recorded rather than asserted as correct: whether an orphan sequence record is
        // desirable is a product decision. What this test guarantees is that the number stops
        // being an accident nobody noticed.
        assert.equal(biom.rows.length, EXPECTED.taxa);
        assert.equal(INLINE.taxa, 21, 'for contrast: the inline orientation keeps 21');

        const perRow = new Map(biom.rows.map(r => [r.id, 0]));
        for (const [rowIndex, , value] of biom.data) {
            const id = biom.rows[rowIndex].id;
            perRow.set(id, perRow.get(id) + Number(value));
        }
        const empty = [...perRow.values()].filter(total => total === 0).length;
        assert.equal(empty, 9, 'nine taxa have no reads in any sample');

        assert.equal(bodyCount(readArtifact(dir, 'dwc-dp/data/nucleotide-sequence.tsv')),
            EXPECTED.taxa);
        assert.equal(bodyCount(inlineGolden('dwc-dp/nucleotide-sequence.tsv')),
            INLINE.sequenceRecords);
    });

    await t.test('occurrence.txt is unchanged', () => {
        compareToGolden(`${FIXTURE}/occurrence.txt`,
            sortedLines(readArtifact(dir, 'archive/occurrence.txt'), TABULAR));
    });

    await t.test('dna.txt is unchanged', () => {
        compareToGolden(`${FIXTURE}/dna.txt`,
            sortedLines(readArtifact(dir, 'archive/dna.txt'), TABULAR));
    });

    await t.test('meta.xml is unchanged', () => {
        compareToGolden(`${FIXTURE}/meta.xml`, readArtifact(dir, 'archive/meta.xml'));
    });

    for (const table of ['event', 'identification', 'nucleotide-analysis', 'nucleotide-sequence']) {
        await t.test(`dwc-dp/${table}.tsv is unchanged`, () => {
            compareToGolden(`${FIXTURE}/dwc-dp/${table}.tsv`,
                sortedLines(readArtifact(dir, `dwc-dp/data/${table}.tsv`), TABULAR));
        });
    }
});

// ---------------------------------------------------------------------------------------------

/**
 * The real thing, at full size. Not committed (45 MB) and not part of the default run: gated on
 * both the fixture being present and MDT_SLOW, so `npm test` skips it and `npm run test:slow`
 * exercises it. Its value is scale - 69,317 sequence columns rather than 30 - which is the one
 * thing the derived miniature cannot tell us.
 *
 * Measured numbers, from an actual run: 10.6 seconds.
 */
test('sequences as column headers, at full scale', async (t) => {
    const FULL = 'biowide_bacteria';

    if (!process.env.MDT_SLOW) {
        t.skip('set MDT_SLOW=1 to run this (npm run test:slow)');
        return;
    }
    if (!fixtureAvailable(FULL)) {
        t.skip(`testData/${FULL} is not present - it is 45 MB and not committed`);
        return;
    }

    blockNetwork();
    const source = path.join(TEST_DATA_ROOT, FULL);
    const id = 'test-sequence-headers-full';
    const dir = `${config.dataStorage}${id}/${DATASET_VERSION}`;
    fs.mkdirSync(path.join(dir, 'original'), { recursive: true });
    fs.copyFileSync(path.join(source, 'otutable.tsv'), path.join(dir, 'original', 'otutable.tsv'));
    fs.copyFileSync(path.join(source, 'sample.tsv'), path.join(dir, 'original', 'sample.tsv'));
    await writeMapping(id, DATASET_VERSION, EMPTY_MAPPING);

    try {
        await processDataset(id, DATASET_VERSION, false, true);
        const full = await readBiom(id, DATASET_VERSION);

        assert.equal(full.rows.length, 69317, 'one taxon per sequence column');
        assert.equal(full.data.length, 121200, 'non-zero entries');
        assert.equal(full.data.reduce((sum, [, , v]) => sum + Number(v), 0), 3560362);
        assert.equal(full.rows.filter(r => r.metadata?.DNA_sequence).length, 69317,
            'every taxon keyed by md5 must still carry the sequence it came from');

        // 108, not 130. Both files list 130 sample ids but 22 differ in each direction, so only
        // 108 appear in both. That is the id-mismatch path, which toBiom reports through its
        // consistency check rather than a silent drop - pinned so a change to that behaviour on
        // a real dataset is visible.
        assert.equal(full.columns.length, 108,
            'only the samples present in both the OTU table and the sample file');
    } finally {
        restoreNetwork();
    }
});
