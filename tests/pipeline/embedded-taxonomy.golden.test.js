/**
 * Taxonomy embedded in the OTU table, on both the flat-file and the workbook lane.
 *
 * biowide_fungi_min_embedded is biowide_fungi_min with taxa.tsv's columns moved into the OTU
 * table after the counts, and no taxon file (tests/fixtures/make-embedded-taxonomy.js builds it).
 * Where the taxonomy arrives is a layout choice, not a content one, so the published output has
 * to be the same: each lane is compared against the biowide_fungi_min goldens rather than goldens
 * of its own. Those goldens belong to tsv.golden.test.js and are never written from here.
 *
 * Validation runs first on both lanes, from an empty mapping, because that is where the taxon
 * columns are told apart from the counts and the taxon id is chosen - the OTU table's id header
 * is qseqid, not "id". Driving only the processing worker would hand it a mapping no user had.
 */
import '../helpers/env.js';

import test from 'node:test';
import assert from 'node:assert/strict';

import { stageFixture, readArtifact, artifactExists, fixtureAvailable } from '../helpers/dataset.js';
import { compareToSharedGolden, compareJsonToSharedGolden } from '../helpers/golden.js';
import { sortedLines, roundNumbers, signNormaliseOrdination } from '../helpers/normalise.js';
import { blockNetwork, restoreNetwork } from '../helpers/offline.js';

import { validate as validateFlatFiles } from '../../server/validation.js';
import { processDataset as processFlatFiles } from '../../workers/tsvworker.js';
import { processDataset as validateWorkbook } from '../../workers/xlsxvalidationworker.js';
import { processDataset as processWorkbook } from '../../workers/xlsxworker.js';
import { readBiom, readMapping, readMetrics, getProcessingReport } from '../../util/filesAndDirectories.js';
import { biomToDwc } from '../../converters/dwc.js';
import { biomToDwcDp } from '../../converters/dwcdp.js';

const FIXTURE = 'biowide_fungi_min_embedded';
const BASELINE = 'biowide_fungi_min';
const TABULAR = { headerLines: 1 };

const EMPTY_MAPPING = { samples: {}, taxa: {}, measurements: {}, defaultValues: {} };

// The taxon fields as validation should report them: the OTU table's id column first, then
// taxa.tsv's columns in their original order, and none of the ten sample columns.
const TAXON_HEADERS = ['qseqid', 'pident', 'taxpath', 'kingdom', 'phylum', 'class', 'order',
    'family', 'genus', 'scientificName', 'accession', 'SH', 'dataset', 'DNA_sequence'];

const LANES = [
    {
        name: 'flat files',
        id: 'test-embedded-taxonomy-tsv',
        files: ['OTU_table.tsv', 'sample.tsv'],
        validate: (id, version) => validateFlatFiles(id, { userName: 'test-user' }),
        process: processFlatFiles,
    },
    {
        name: 'workbook',
        id: 'test-embedded-taxonomy-xlsx',
        files: [`${FIXTURE}.xlsx`],
        validate: (id, version) => validateWorkbook(id, version, 'test-user'),
        process: processWorkbook,
    },
];

for (const lane of LANES) {
    test(`embedded taxonomy, ${lane.name}: same output as ${BASELINE}`, async (t) => {
        if (!fixtureAvailable(FIXTURE) || !fixtureAvailable(BASELINE)) {
            t.skip(`testData/${FIXTURE} or testData/${BASELINE} is not present`);
            return;
        }

        let dir;
        let report;

        t.before(async () => {
            blockNetwork();
            const staged = await stageFixture({
                fixture: FIXTURE, id: lane.id, files: lane.files, mapping: EMPTY_MAPPING,
            });
            dir = staged.dir;

            await lane.validate(staged.id, staged.version);
            report = await getProcessingReport(staged.id, staged.version);

            // as in tsv.golden.test.js: no taxonomy assignment, similarity plots kept so the
            // ordination is compared too
            await lane.process(staged.id, staged.version, false, false);

            const biom = await readBiom(staged.id, staged.version);
            const mapping = await readMapping(staged.id, staged.version);
            await biomToDwc(biom, mapping, dir);
            await biomToDwcDp(biom, mapping, dir);
        });

        t.after(() => restoreNetwork());

        await t.test('validation takes the OTU table id column as the taxon id', async () => {
            const mapping = await readMapping(lane.id, 1);
            assert.equal(mapping.taxa.id, 'qseqid');
            assert.equal(mapping.samples.id, 'id');
        });

        await t.test('validation offers the embedded columns, and only those, as taxon fields', () => {
            assert.deepEqual(report.taxonHeaders, TAXON_HEADERS);
        });

        await t.test('occurrence.txt matches', () => {
            compareToSharedGolden(`${BASELINE}/occurrence.txt`,
                sortedLines(readArtifact(dir, 'archive/occurrence.txt'), TABULAR));
        });

        await t.test('dna.txt matches', () => {
            compareToSharedGolden(`${BASELINE}/dna.txt`,
                sortedLines(readArtifact(dir, 'archive/dna.txt'), TABULAR));
        });

        await t.test('meta.xml matches', () => {
            compareToSharedGolden(`${BASELINE}/meta.xml`, readArtifact(dir, 'archive/meta.xml'));
        });

        await t.test('emof.txt is not produced', () => {
            assert.equal(artifactExists(dir, 'archive/emof.txt'), false);
        });

        for (const table of ['event', 'identification', 'molecular-protocol',
                             'nucleotide-analysis', 'nucleotide-sequence']) {
            await t.test(`dwc-dp/${table}.tsv matches`, () => {
                compareToSharedGolden(`${BASELINE}/dwc-dp/${table}.tsv`,
                    sortedLines(readArtifact(dir, `dwc-dp/data/${table}.tsv`), TABULAR));
            });
        }

        await t.test('datapackage.json matches', () => {
            compareToSharedGolden(`${BASELINE}/datapackage.json`,
                readArtifact(dir, 'dwc-dp/datapackage.json'));
        });

        await t.test('metrics.json matches', async () => {
            const metrics = await readMetrics(lane.id, 1);
            const normalised = {
                ...metrics,
                jaccard: signNormaliseOrdination(metrics.jaccard),
                brayCurtis: signNormaliseOrdination(metrics.brayCurtis),
            };
            compareJsonToSharedGolden(`${BASELINE}/metrics.json`, roundNumbers(normalised, 9));
        });
    });
}
