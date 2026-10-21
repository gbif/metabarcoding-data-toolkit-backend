/**
 * Characterization test for the XLSX upload path.
 *
 * Covers a different shape from the TSV fixture, which is the reason it exists: MicrobialData is
 * a single workbook with OTUtable / taxa / samples sheets, carries **no DNA_sequence column**,
 * and its sample ids are SRA run accessions. Datasets without sequences are a real category -
 * species-level tables of this kind arrive regularly - so the path needs to be pinned too.
 *
 * Both workers run, in the order the application uses them: xlsxvalidationworker derives the
 * mapping from the workbook (detecting the id columns and normalising target_gene), and
 * xlsxworker then processes it. Driving only the second would skip the detection that produces
 * the mapping the first one writes.
 */
import '../helpers/env.js';

import test from 'node:test';
import assert from 'node:assert/strict';

import { stageFixture, readArtifact, artifactExists, fixtureAvailable } from '../helpers/dataset.js';
import { compareToGolden, compareJsonToGolden } from '../helpers/golden.js';
import { sortedLines, roundNumbers } from '../helpers/normalise.js';
import { blockNetwork, restoreNetwork } from '../helpers/offline.js';

import { processDataset as validateWorkbook } from '../../workers/xlsxvalidationworker.js';
import { processDataset as processWorkbook } from '../../workers/xlsxworker.js';
import { readBiom, readMapping, readMetrics } from '../../util/filesAndDirectories.js';
import { biomToDwc } from '../../converters/dwc.js';
import { biomToDwcDp } from '../../converters/dwcdp.js';

const FIXTURE = 'MicrobialData';
const DATASET_ID = 'test-microbial-data';
const TABULAR = { headerLines: 1 };

const EXPECTED = {
    taxa: 2464,
    samples: 63,
    nonZeroEntries: 5507,
    totalReads: 297311,
    firstSampleIds: ['SRR3108848', 'SRR3108849', 'SRR3108850'],
};

test(`XLSX path: ${FIXTURE}`, async (t) => {
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
            files: ['MicrobialData.xlsx'],
            // left empty on purpose: the validation worker is what should fill in the id
            // mapping, and starting from a populated mapping would hide it failing to
            mapping: { samples: {}, taxa: {}, measurements: {}, defaultValues: {} },
        });
        dir = staged.dir;

        await validateWorkbook(staged.id, staged.version, 'test-user');
        await processWorkbook(staged.id, staged.version, false, true);

        biom = await readBiom(staged.id, staged.version);
        const mapping = await readMapping(staged.id, staged.version);
        await biomToDwc(biom, mapping, dir);
        await biomToDwcDp(biom, mapping, dir);
    });

    t.after(() => restoreNetwork());

    await t.test('the validation worker derives the id mapping from the workbook', async () => {
        const mapping = await readMapping(DATASET_ID, 1);
        assert.equal(mapping.samples.id, 'id');
        assert.equal(mapping.taxa.id, 'id');
    });

    await t.test('dimensions and totals', () => {
        assert.equal(biom.rows.length, EXPECTED.taxa, 'taxon count');
        assert.equal(biom.columns.length, EXPECTED.samples, 'sample count');
        assert.equal(biom.data.length, EXPECTED.nonZeroEntries, 'non-zero entries');

        const summed = biom.data.reduce((total, [, , value]) => total + Number(value), 0);
        assert.equal(summed, EXPECTED.totalReads, 'sum over the matrix');

        const counts = biom.columns.map(c => c.metadata?.readCount);
        assert.equal(counts.length, EXPECTED.samples);
        assert.equal(counts.reduce((a, b) => a + b, 0), EXPECTED.totalReads,
            'per-sample read counts must add up to the matrix total');
    });

    await t.test('sample ids come through as SRA accessions', () => {
        assert.deepEqual(biom.columns.slice(0, 3).map(c => c.id), EXPECTED.firstSampleIds);
    });

    await t.test('occurrence.txt is unchanged', () => {
        compareToGolden(`${FIXTURE}/occurrence.txt`,
            sortedLines(readArtifact(dir, 'archive/occurrence.txt'), TABULAR));
    });

    await t.test('meta.xml is unchanged', () => {
        compareToGolden(`${FIXTURE}/meta.xml`, readArtifact(dir, 'archive/meta.xml'));
    });

    await t.test('dna.txt reflects a dataset with no sequences', () => {
        // Recorded rather than asserted either way: what the DWCA should contain for a dataset
        // with no DNA_sequence column is a product decision, and the golden's job is to make a
        // change to it visible rather than to bless the current answer.
        const present = artifactExists(dir, 'archive/dna.txt');
        compareToGolden(`${FIXTURE}/dna.txt.present`, `${present}\n`);
        if (present) {
            compareToGolden(`${FIXTURE}/dna.txt`,
                sortedLines(readArtifact(dir, 'archive/dna.txt'), TABULAR));
        }
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

    await t.test('metrics are produced even though the dataset has no sequences', async () => {
        // This was a todo: getDNAsequenceLength rethrows when observation/metadata/DNA_sequence
        // is absent, and getMetrics called it unguarded, so a dataset of named taxa without
        // sequences got no metrics.json at all while the job still reported success. Fixed by
        // guarding that call the way the three scope metrics beside it already were. The
        // assertion is what stops it regressing.
        assert.ok(artifactExists(dir, 'metrics.json'),
            'a dataset without DNA sequences should still get metrics');

        const metrics = await readMetrics(DATASET_ID, 1);

        // The one metric that cannot be computed is omitted; everything else is still there.
        assert.ok(!('sequenceLength' in metrics),
            'sequenceLength should be absent rather than guessed at');
        assert.ok(metrics.totalReads > 0, 'the metrics that do not need sequences are computed');

        // geographicScope and temporalScope are absent too, for an unrelated and pre-existing
        // reason: this workbook has latitude/longitude/year columns that are not mapped to the
        // Darwin Core terms those metrics read. Pinned so the two causes stay distinguishable.
        compareJsonToGolden(`${FIXTURE}/metrics.json`, roundNumbers(metrics, 9));
    });
});
