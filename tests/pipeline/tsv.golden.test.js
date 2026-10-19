/**
 * Characterization test for the TSV upload path.
 *
 * Runs the real pipeline - the same functions workers/tsvworker.js calls when forked - into a
 * temp data directory, then compares every artifact that leaves the system against a recorded
 * baseline. The purpose is not to assert that the output is *correct*; it is to assert that it
 * is *unchanged*, so that replacing BIOM as the central representation can be shown to preserve
 * behaviour rather than merely hoped to.
 *
 * What is pinned, and what is not:
 *   pinned     archive/occurrence.txt, archive/dna.txt, archive/meta.xml
 *              dwc-dp/data/*.tsv, dwc-dp/datapackage.json
 *              metrics.json
 *   not pinned data.biom.json, data.biom.h5  - internal handoff formats, free to be replaced
 *              archive/eml.xml               - metadata-driven, not data-driven
 */
import '../helpers/env.js';

import test from 'node:test';
import assert from 'node:assert/strict';

import { stageFixture, readArtifact, artifactExists, fixtureAvailable } from '../helpers/dataset.js';
import { compareToGolden, compareJsonToGolden } from '../helpers/golden.js';
import { sortedLines, roundNumbers, signNormaliseOrdination } from '../helpers/normalise.js';
import { blockNetwork, restoreNetwork } from '../helpers/offline.js';

import { processDataset } from '../../workers/tsvworker.js';
import { readBiom, readMapping, readMetrics } from '../../util/filesAndDirectories.js';
import { biomToDwc } from '../../converters/dwc.js';
import { biomToDwcDp } from '../../converters/dwcdp.js';

const FIXTURE = 'biowide_fungi_min';
const DATASET_ID = 'test-biowide-fungi-min';

// The fixture's column headers are already Darwin Core terms (id, eventDate, decimalLatitude,
// scientificName, DNA_sequence, target_gene), so an empty mapping is the honest input: the
// reader renames nothing and the identity path is what gets exercised.
const MAPPING = { samples: {}, taxa: {}, measurements: {}, defaultValues: {} };

// The DWCA tables and the DwC-DP tables each carry exactly one header row, confirmed against
// generated output. Their body order is not part of the contract - Darwin Core imposes none -
// so it is sorted before comparison; content is still compared byte for byte.
const TABULAR = { headerLines: 1 };

test(`TSV path: ${FIXTURE}`, async (t) => {
    if (!fixtureAvailable(FIXTURE)) {
        t.skip(`testData/${FIXTURE} is not present`);
        return;
    }

    let dir;

    // One pipeline run for the whole file. Each artifact then gets its own subtest so a failure
    // names the file that changed rather than just "the pipeline".
    t.before(async () => {
        blockNetwork();
        const staged = await stageFixture({
            fixture: FIXTURE, id: DATASET_ID,
            files: ['OTU_table.tsv', 'sample.tsv', 'taxa.tsv'],
            mapping: MAPPING,
        });
        dir = staged.dir;

        // false: do not assign taxonomy (that would need the blast service)
        // false: do not skip similarity plots - the ordination is the numerically fragile part
        //        and is worth pinning
        await processDataset(staged.id, staged.version, false, false);

        // The DWCA and DwC-DP builders are driven directly rather than through dwcworker.js,
        // because that worker's cleanUp step deletes occurrence.txt, dna.txt, emof.txt and
        // meta.xml once the zip exists, leaving nothing to compare.
        const biom = await readBiom(staged.id, staged.version);
        const mapping = await readMapping(staged.id, staged.version);
        await biomToDwc(biom, mapping, dir);
        await biomToDwcDp(biom, mapping, dir);
    });

    t.after(() => restoreNetwork());

    await t.test('occurrence.txt is unchanged', () => {
        const actual = sortedLines(readArtifact(dir, 'archive/occurrence.txt'), TABULAR);
        compareToGolden(`${FIXTURE}/occurrence.txt`, actual);
    });

    await t.test('dna.txt is unchanged', () => {
        const actual = sortedLines(readArtifact(dir, 'archive/dna.txt'), TABULAR);
        compareToGolden(`${FIXTURE}/dna.txt`, actual);
    });

    await t.test('meta.xml is unchanged', () => {
        // XML, not line-oriented, and generated from a fixed template - compared as written.
        compareToGolden(`${FIXTURE}/meta.xml`, readArtifact(dir, 'archive/meta.xml'));
    });

    await t.test('emof.txt is not produced when nothing is mapped as a measurement', () => {
        // biomToDwc only opens the emof stream when the mapping declares measurements. If this
        // starts failing, the condition changed and the DWCA gained a file.
        assert.equal(artifactExists(dir, 'archive/emof.txt'), false);
    });

    for (const table of ['event', 'identification', 'molecular-protocol',
                         'nucleotide-analysis', 'nucleotide-sequence']) {
        await t.test(`dwc-dp/${table}.tsv is unchanged`, () => {
            const actual = sortedLines(readArtifact(dir, `dwc-dp/data/${table}.tsv`), TABULAR);
            compareToGolden(`${FIXTURE}/dwc-dp/${table}.tsv`, actual);
        });
    }

    await t.test('datapackage.json is unchanged', () => {
        // Compared raw, with no timestamp normalisation: the ISO timestamps it contains are
        // example values carried over from the DwC-DP field schemas, not generation stamps, and
        // blanking them would stop the goldens guarding the schema contract.
        compareToGolden(`${FIXTURE}/datapackage.json`, readArtifact(dir, 'dwc-dp/datapackage.json'));
    });

    await t.test('metrics.json is unchanged', async () => {
        const metrics = await readMetrics(DATASET_ID, 1);

        // jaccard and brayCurtis are MDS coordinates from numeric.svd, whose axis signs are
        // indeterminate in principle. Sign-normalised so a future linear-algebra swap that
        // mirrors an axis does not read as a content change.
        const normalised = {
            ...metrics,
            jaccard: signNormaliseOrdination(metrics.jaccard),
            brayCurtis: signNormaliseOrdination(metrics.brayCurtis),
        };

        compareJsonToGolden(`${FIXTURE}/metrics.json`, roundNumbers(normalised, 9));
    });
});
