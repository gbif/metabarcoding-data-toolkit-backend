/**
 * Characterization test for the BIOM 2.1 (QIIME2) input path.
 *
 * This is the only path where BIOM is read *in* rather than written out, which makes it the one
 * most exposed by a change of internal representation - so it matters more to the planned
 * migration than its small size suggests.
 *
 * The fixture is a mock, generated at setup by tests/helpers/biom21.js from a committed spec. It
 * is modelled on the HDF5 layout of a real table.biom from the NOAA AOML Tourmaline pipeline
 * (QIIME2 v2023.5), which cannot be redistributed. The spec file records every property carried
 * over and why. The layout was taken from QIIME2's output, not from MDT's own writer, so this
 * tests reading foreign input rather than reading back what MDT itself produces.
 *
 * The shape of a QIIME2 upload, confirmed against the real dataset: the .biom holds only the
 * matrix and the ids - its metadata groups are empty - so taxonomy, sample metadata and
 * sequences all arrive as separate files. MDT's input is therefore a quadruple.
 */
import '../helpers/env.js';

import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { readArtifact, artifactExists, DATASET_VERSION } from '../helpers/dataset.js';
import { compareToGolden, compareJsonToGolden } from '../helpers/golden.js';
import { sortedLines, roundNumbers } from '../helpers/normalise.js';
import { blockNetwork, restoreNetwork } from '../helpers/offline.js';
import {
    readSpec, writeMockBiom, taxonomyTsv, samplesTsv, sequencesFasta, specIsSelfConsistent,
} from '../helpers/biom21.js';

import config from '../../config.js';
import { writeMapping, readBiom, readMapping, readMetrics } from '../../util/filesAndDirectories.js';
import { processDataset } from '../../workers/biomworker.js';
import { biomToDwc } from '../../converters/dwc.js';
import { biomToDwcDp } from '../../converters/dwcdp.js';

const FIXTURE = 'biom21';
const DATASET_ID = 'test-biom21-qiime2';
const TABULAR = { headerLines: 1 };

// Column headers are QIIME2's, not Darwin Core's, so unlike the biowide fixture this path needs
// a real mapping - which is the point: it exercises renaming rather than the identity case.
const MAPPING = {
    samples: { id: 'sample_name', eventDate: 'collection_date' },
    taxa: { id: 'Feature ID', verbatimIdentification: 'Taxon' },
    measurements: {},
    defaultValues: {},
};

const EXPECTED = {
    taxa: 6,
    samples: 4,
    nonZeroEntries: 11,
    totalReads: 1549,
    // the fourth sample is in the matrix but absent from the samples file, reproducing the
    // 1-of-29 mismatch in the real NOAA dataset
    sampleWithoutMetadata: 'MOCK-S04',
};

test('BIOM 2.1 path: mock QIIME2 dataset', async (t) => {
    let dir;
    let biom;

    t.before(async () => {
        blockNetwork();
        const spec = readSpec();

        dir = `${config.dataStorage}${DATASET_ID}/${DATASET_VERSION}`;
        fs.mkdirSync(path.join(dir, 'original'), { recursive: true });
        fs.mkdirSync(path.join(dir, 'archive'), { recursive: true });

        // Names matter: validation/files.js infers each file's type from them via the synonym
        // lists in validation/filenames.js - 'table' -> otuTable, 'metadata' -> samples,
        // 'taxonomy' -> taxa, and .fasta by extension. These are the names QIIME2 itself
        // produces, so the detection is exercised rather than bypassed.
        await writeMockBiom(path.join(dir, 'original', 'table.biom'), spec);
        fs.writeFileSync(path.join(dir, 'original', 'metadata.tsv'), samplesTsv(spec));
        fs.writeFileSync(path.join(dir, 'original', 'taxonomy.tsv'), taxonomyTsv(spec));
        fs.writeFileSync(path.join(dir, 'original', 'dna-sequences.fasta'), sequencesFasta(spec));

        await writeMapping(DATASET_ID, DATASET_VERSION, MAPPING);

        // false: no taxonomy assignment (needs the blast service)
        // true:  skip similarity plots - four samples, two of which share no features, makes the
        //        ordination degenerate and uninformative to pin here
        await processDataset(DATASET_ID, DATASET_VERSION, false, true);

        biom = await readBiom(DATASET_ID, DATASET_VERSION);
        const mapping = await readMapping(DATASET_ID, DATASET_VERSION);
        await biomToDwc(biom, mapping, dir);
        await biomToDwcDp(biom, mapping, dir);
    });

    t.after(() => restoreNetwork());

    await t.test('the fixture spec is internally consistent', () => {
        // QIIME2 derives feature ids as the md5 of the sequence. If that stops holding, the
        // fixture has drifted from representing real input even though the pipeline would still
        // process it happily.
        assert.ok(specIsSelfConsistent(),
            'every observation id should be the md5 hex digest of its sequence');
    });

    await t.test('the matrix is read from the HDF5 file', () => {
        assert.equal(biom.rows.length, EXPECTED.taxa, 'taxon count');
        assert.equal(biom.columns.length, EXPECTED.samples, 'sample count');
        assert.equal(biom.data.length, EXPECTED.nonZeroEntries, 'non-zero entries');

        const summed = biom.data.reduce((total, [, , value]) => total + Number(value), 0);
        assert.equal(summed, EXPECTED.totalReads, 'sum over the matrix');
    });

    await t.test('matrix totals survive the float64 to int conversion', () => {
        // QIIME2 writes the counts as float64; MDT rebuilds the table as matrix_element_type
        // 'int'. These are read counts, so every value must come through exactly.
        for (const [, , value] of biom.data) {
            assert.ok(Number.isInteger(Number(value)), `${value} should be a whole read count`);
        }
        const counts = biom.columns.map(c => c.metadata?.readCount);
        assert.equal(counts.reduce((a, b) => a + b, 0), EXPECTED.totalReads,
            'per-sample read counts must add up to the matrix total');
    });

    await t.test('taxonomy from the separate file is joined onto the observations', () => {
        // The .biom carries no taxonomy at all - its observation/metadata group is empty - so
        // this can only have come from taxonomy.tsv.
        const first = biom.rows[0];
        assert.match(first.metadata.verbatimIdentification, /^Eukaryota;/);
        assert.equal(biom.rows.filter(r => r.metadata?.verbatimIdentification).length,
            EXPECTED.taxa, 'every observation should carry its taxon string');
    });

    await t.test('sequences from the fasta are joined onto the observations', () => {
        assert.equal(biom.rows.filter(r => r.metadata?.DNA_sequence).length, EXPECTED.taxa,
            'every observation should carry its sequence');
    });

    await t.test('a sample missing from the samples file still reaches the table', () => {
        // Real QIIME2 exports are not always complete: in the NOAA dataset one of 29 samples had
        // no metadata row. It must not be dropped, and it must not acquire another sample's
        // metadata - it carries only its id.
        const orphan = biom.columns.find(c => c.id === EXPECTED.sampleWithoutMetadata);
        assert.ok(orphan, 'the sample should still be present as a column');

        // Its id lives on the column, not in metadata, and the only metadata it gains is the
        // readCount the pipeline computes. An empty list here would mean nothing was borrowed
        // from a neighbouring sample, which is the failure mode worth guarding against.
        assert.deepEqual(Object.keys(orphan.metadata ?? {}), ['readCount'],
            'it should carry only its computed readCount, nothing borrowed from another sample');

        const described = biom.columns.filter(c => Object.keys(c.metadata ?? {}).length > 1);
        assert.equal(described.length, EXPECTED.samples - 1,
            'every other sample should have its metadata joined on');
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

    for (const table of ['event', 'identification', 'molecular-protocol',
                         'nucleotide-analysis', 'nucleotide-sequence']) {
        await t.test(`dwc-dp/${table}.tsv is unchanged`, () => {
            compareToGolden(`${FIXTURE}/dwc-dp/${table}.tsv`,
                sortedLines(readArtifact(dir, `dwc-dp/data/${table}.tsv`), TABULAR));
        });
    }

    await t.test('datapackage.json is unchanged', () => {
        compareToGolden(`${FIXTURE}/datapackage.json`,
            readArtifact(dir, 'dwc-dp/datapackage.json'));
    });

    await t.test('metrics.json is unchanged', async () => {
        assert.ok(artifactExists(dir, 'metrics.json'),
            'metrics should be generated - this fixture does carry DNA sequences');
        compareJsonToGolden(`${FIXTURE}/metrics.json`,
            roundNumbers(await readMetrics(DATASET_ID, DATASET_VERSION), 9));
    });
});
