/**
 * Characterization test for the FAIRe upload path.
 *
 * The richest of the three input paths, and the one with the most code behind it: a single FAIRe
 * workbook carries its own projectMetadata, from which MDT derives the term mapping, the default
 * values *and* the dataset's EML - so this run pins the FAIRe -> EML conversion as well as the
 * conversion to Darwin Core.
 *
 * About this fixture: testData/FAIRe/verte_quadeloupe.xlsx contains pre-existing mojibake in its
 * projectMetadata - `project_contact` reads "Rachel HaderlÃ©" while `recordedBy` in the same sheet
 * reads "Rachel Haderlé" correctly. Verified against the raw workbook: the double encoding is in
 * the source file, not introduced by MDT. The goldens therefore record it faithfully, and it
 * should not be "fixed" in a golden - if it ever changes, something changed in how MDT reads
 * cells, which is exactly what we want to be told about.
 */
import '../helpers/env.js';

import test from 'node:test';
import assert from 'node:assert/strict';

import { stageFixture, readArtifact, artifactExists, fixtureAvailable } from '../helpers/dataset.js';
import { compareToGolden, compareJsonToGolden } from '../helpers/golden.js';
import { sortedLines, roundNumbers, signNormaliseOrdination, blankFields } from '../helpers/normalise.js';
import { blockNetwork, restoreNetwork } from '../helpers/offline.js';

import { processDataset as validateFaire } from '../../workers/fairevalidationworker.js';
import { processDataset as processFaire } from '../../workers/faireworker.js';
import { readBiom, readMapping, readMetrics } from '../../util/filesAndDirectories.js';
import { biomToDwc } from '../../converters/dwc.js';
import { biomToDwcDp } from '../../converters/dwcdp.js';

const FIXTURE = 'FAIRe';
const WORKBOOK = 'verte_quadeloupe.xlsx';
const DATASET_ID = 'test-faire-verte-quadeloupe';
const TABULAR = { headerLines: 1 };

const EXPECTED = {
    taxa: 33,
    samples: 2,
    nonZeroEntries: 38,
    totalReads: 2426086,
    sampleIds: ['SPY224105_T', 'SPY224102_T'],
};

test(`FAIRe path: ${WORKBOOK}`, async (t) => {
    if (!fixtureAvailable(FIXTURE)) {
        t.skip(`testData/${FIXTURE} is not present`);
        return;
    }

    let dir;
    let biom;

    t.before(async () => {
        blockNetwork();
        const staged = await stageFixture({
            fixture: FIXTURE, id: DATASET_ID,
            files: [WORKBOOK],
            mapping: { samples: {}, taxa: {}, measurements: {}, defaultValues: {} },
            // no eml.xml stub: this path generates its own from the workbook's projectMetadata,
            // and staging one would hide it failing to
            withEmlXml: false,
        });
        dir = staged.dir;

        await validateFaire(staged.id, staged.version, 'test-user');
        // similarity plots not skipped: with only two samples this is the degenerate ordination
        // case, and pinning it is how we would notice it starting to behave differently
        await processFaire(staged.id, staged.version, false);

        biom = await readBiom(staged.id, staged.version);
        const mapping = await readMapping(staged.id, staged.version);
        await biomToDwc(biom, mapping, dir);
        await biomToDwcDp(biom, mapping, dir);
    });

    t.after(() => restoreNetwork());

    await t.test('dimensions and totals', () => {
        assert.equal(biom.rows.length, EXPECTED.taxa, 'taxon count');
        assert.equal(biom.columns.length, EXPECTED.samples, 'sample count');
        assert.equal(biom.data.length, EXPECTED.nonZeroEntries, 'non-zero entries');

        const summed = biom.data.reduce((total, [, , value]) => total + Number(value), 0);
        assert.equal(summed, EXPECTED.totalReads, 'sum over the matrix');

        const counts = biom.columns.map(c => c.metadata?.readCount);
        assert.equal(counts.reduce((a, b) => a + b, 0), EXPECTED.totalReads,
            'per-sample read counts must add up to the matrix total');
    });

    await t.test('sample ids come from samp_name', () => {
        assert.deepEqual(biom.columns.map(c => c.id), EXPECTED.sampleIds);
    });

    await t.test('the validation worker derives the FAIRe id mapping', async () => {
        const mapping = await readMapping(DATASET_ID, 1);
        // FAIRe fixes these two by convention, unlike the TSV and XLSX paths where they are
        // detected from the headers
        assert.equal(mapping.samples.id, 'samp_name');
        assert.equal(mapping.taxa.id, 'seq_id');
    });

    await t.test('mapping.json is unchanged', async () => {
        // Pinned in full because it is a derived artifact, not user input: the default values
        // here were extracted from the workbook's projectMetadata, including the target_gene
        // normalisation against the GBIF vocabulary.
        compareJsonToGolden(`${FIXTURE}/mapping.json`, await readMapping(DATASET_ID, 1));
    });

    await t.test('eml.json generated from projectMetadata is unchanged', () => {
        const eml = JSON.parse(readArtifact(dir, 'eml.json'));
        // converters/faire.js:234 stamps createdAt with Date.now(), the one non-deterministic
        // value in this file
        compareJsonToGolden(`${FIXTURE}/eml.json`, blankFields(eml, ['createdAt']));
    });

    await t.test('eml.xml is generated from the workbook', () => {
        // Presence and provenance only, not pinned: it carries generation timestamps, and it is
        // metadata-driven rather than data-driven. What matters is that the FAIRe path produces
        // one at all - no stub was staged, so this file can only have come from the workbook.
        assert.ok(artifactExists(dir, 'archive/eml.xml'),
            'the FAIRe path should generate archive/eml.xml from projectMetadata');
        const xml = readArtifact(dir, 'archive/eml.xml');
        assert.match(xml, /<dataset>/, 'should be an EML document with a dataset element');
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
        const metrics = await readMetrics(DATASET_ID, 1);
        compareJsonToGolden(`${FIXTURE}/metrics.json`, roundNumbers({
            ...metrics,
            jaccard: signNormaliseOrdination(metrics.jaccard),
            brayCurtis: signNormaliseOrdination(metrics.brayCurtis),
        }, 9));
    });
});
