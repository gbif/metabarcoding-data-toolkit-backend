/**
 * The two fasta input variants: TSV_WITH_FASTA and XLSX_WITH_FASTA.
 *
 * Sequences may arrive inline, as a DNA_sequence column, or in a separate fasta keyed on the
 * taxon id. Both are declared formats and both were uncovered - the fasta branch in
 * workers/tsvworker.js and its equivalent in workers/xlsxworker.js.
 *
 * Neither suite below adds a committed dataset. The TSV case derives the fasta variant from
 * testData/biowide_fungi_min, which lets it assert the thing that actually matters - that the
 * two ways of supplying sequences produce *identical* output - against the goldens already
 * recorded for the inline form. The XLSX case gives MicrobialData, which has no sequences at
 * all, a fasta of sequences derived from its taxon ids, so what arrives can be checked against
 * what should have arrived rather than merely pinned.
 */
import '../helpers/env.js';

import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { readArtifact, artifactExists, fixtureAvailable, DATASET_VERSION } from '../helpers/dataset.js';
import { sortedLines } from '../helpers/normalise.js';
import { blockNetwork, restoreNetwork } from '../helpers/offline.js';
import {
    splitSequencesIntoFasta, syntheticFasta, sequenceForId, taxonIdsFromWorkbook,
    SYNTHETIC_SEQUENCE_LENGTH,
} from '../helpers/fasta.js';
import { TEST_DATA_ROOT, GOLDEN_ROOT } from '../helpers/env.js';

import config from '../../config.js';
import { writeMapping, readBiom, readMetrics } from '../../util/filesAndDirectories.js';
import { processDataset as processTsv } from '../../workers/tsvworker.js';
import { processDataset as validateWorkbook } from '../../workers/xlsxvalidationworker.js';
import { processDataset as processWorkbook } from '../../workers/xlsxworker.js';
import { biomToDwc } from '../../converters/dwc.js';
import { getAsvID } from '../../util/index.js';
import { biomToDwcDp } from '../../converters/dwcdp.js';

const EMPTY_MAPPING = { samples: {}, taxa: {}, measurements: {}, defaultValues: {} };
const TABULAR = { headerLines: 1 };

const stage = (id) => {
    const dir = `${config.dataStorage}${id}/${DATASET_VERSION}`;
    fs.mkdirSync(path.join(dir, 'original'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'archive'), { recursive: true });
    // Same minimal stub stageFixture writes: converters/dwcdp.js:100 copies archive/eml.xml into
    // the package without checking it exists, so without this every run prints an ENOENT stack
    // and a passing suite looks like a failing one.
    fs.writeFileSync(path.join(dir, 'archive', 'eml.xml'),
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        + '<eml:eml xmlns:eml="https://eml.ecoinformatics.org/eml-2.2.0" packageId="test" system="mdt-test">\n'
        + '  <dataset><title>Test fixture</title></dataset>\n'
        + '</eml:eml>\n');
    return dir;
};

const golden = (name) => fs.readFileSync(path.join(GOLDEN_ROOT, name), 'utf8');

// ---------------------------------------------------------------------------------------------

test('TSV with a separate fasta produces identical output to inline sequences', async (t) => {
    const FIXTURE = 'biowide_fungi_min';
    const DATASET_ID = 'test-tsv-with-fasta';

    if (!fixtureAvailable(FIXTURE)) {
        t.skip(`testData/${FIXTURE} is not present`);
        return;
    }

    let dir;
    let biom;
    let sequenceCount;

    t.before(async () => {
        blockNetwork();
        const source = path.join(TEST_DATA_ROOT, FIXTURE);
        const split = splitSequencesIntoFasta(path.join(source, 'taxa.tsv'));
        sequenceCount = split.count;

        dir = stage(DATASET_ID);
        fs.copyFileSync(path.join(source, 'OTU_table.tsv'), path.join(dir, 'original', 'OTU_table.tsv'));
        fs.copyFileSync(path.join(source, 'sample.tsv'), path.join(dir, 'original', 'sample.tsv'));
        // the same taxon file minus its DNA_sequence column, with those sequences alongside
        fs.writeFileSync(path.join(dir, 'original', 'taxa.tsv'), split.taxa);
        fs.writeFileSync(path.join(dir, 'original', 'seq.fasta'), split.fasta);

        await writeMapping(DATASET_ID, DATASET_VERSION, EMPTY_MAPPING);
        await processTsv(DATASET_ID, DATASET_VERSION, false, true);

        biom = await readBiom(DATASET_ID, DATASET_VERSION);
        await biomToDwc(biom, EMPTY_MAPPING, dir);
        await biomToDwcDp(biom, EMPTY_MAPPING, dir);
    });

    t.after(() => restoreNetwork());

    await t.test('the split actually removed the sequences from the taxon file', () => {
        // Otherwise this suite would silently be testing the inline path twice.
        const taxa = readArtifact(dir, 'original/taxa.tsv');
        assert.ok(!taxa.includes('DNA_sequence'), 'taxa.tsv should no longer declare the column');
        assert.equal(sequenceCount, 30, 'all 30 taxon rows should have gone into the fasta');
    });

    await t.test('every taxon in the table carries a sequence from the fasta', () => {
        assert.equal(biom.rows.filter(r => r.metadata?.DNA_sequence).length, biom.rows.length);
        assert.equal(biom.rows.length, 21, 'the 9 all-zero taxa are still dropped');
    });

    // The contract: where the sequences came from must make no difference to any output.
    for (const [label, artifact, goldenName] of [
        ['occurrence.txt', 'archive/occurrence.txt', `${FIXTURE}/occurrence.txt`],
        ['dna.txt', 'archive/dna.txt', `${FIXTURE}/dna.txt`],
        ['meta.xml', 'archive/meta.xml', `${FIXTURE}/meta.xml`],
    ]) {
        await t.test(`${label} is identical to the inline-sequence golden`, () => {
            const actual = label === 'meta.xml'
                ? readArtifact(dir, artifact)
                : sortedLines(readArtifact(dir, artifact), TABULAR);
            assert.equal(actual, golden(goldenName),
                `supplying sequences by fasta changed ${label}`);
        });
    }

    for (const table of ['event', 'identification', 'nucleotide-analysis', 'nucleotide-sequence']) {
        await t.test(`dwc-dp/${table}.tsv is identical to the inline-sequence golden`, () => {
            assert.equal(
                sortedLines(readArtifact(dir, `dwc-dp/data/${table}.tsv`), TABULAR),
                golden(`${FIXTURE}/dwc-dp/${table}.tsv`),
                `supplying sequences by fasta changed ${table}.tsv`);
        });
    }
});

// ---------------------------------------------------------------------------------------------

test('XLSX with a separate fasta adds sequences to a dataset that has none', async (t) => {
    const FIXTURE = 'MicrobialData';
    const DATASET_ID = 'test-xlsx-with-fasta';

    if (!fixtureAvailable(FIXTURE)) {
        t.skip(`testData/${FIXTURE} is not present`);
        return;
    }

    let dir;
    let biom;
    let workbookIds;

    t.before(async () => {
        blockNetwork();
        const workbook = path.join(TEST_DATA_ROOT, FIXTURE, 'MicrobialData.xlsx');
        workbookIds = await taxonIdsFromWorkbook(workbook, 'taxa');

        dir = stage(DATASET_ID);
        fs.copyFileSync(workbook, path.join(dir, 'original', 'MicrobialData.xlsx'));
        fs.writeFileSync(path.join(dir, 'original', 'seq.fasta'), syntheticFasta(workbookIds));

        await writeMapping(DATASET_ID, DATASET_VERSION, EMPTY_MAPPING);
        await validateWorkbook(DATASET_ID, DATASET_VERSION, 'test-user');
        await processWorkbook(DATASET_ID, DATASET_VERSION, false, true);

        biom = await readBiom(DATASET_ID, DATASET_VERSION);
        await biomToDwc(biom, EMPTY_MAPPING, dir);
    });

    t.after(() => restoreNetwork());

    await t.test('the workbook itself has no sequences', () => {
        // The premise of this suite. MicrobialData's taxa sheet carries sequence_number, not a
        // sequence, which is why the plain XLSX run produces empty DNA_sequence fields.
        const plainDna = golden(`${FIXTURE}/dna.txt`);
        const columns = plainDna.split('\n')[0].split('\t');
        assert.ok(columns.length >= 2, 'dna.txt should still declare a sequence column');
        const firstRow = plainDna.split('\n')[1].split('\t');
        assert.equal(firstRow[1], '', 'without a fasta the sequence field is empty');
    });

    await t.test('every taxon receives its own sequence', () => {
        assert.equal(biom.rows.length, 2464);
        assert.equal(biom.rows.filter(r => r.metadata?.DNA_sequence).length, 2464);

        // Not just "a sequence arrived" - the one belonging to that taxon arrived. A merge that
        // shifted sequences by one row would satisfy a count but fail this.
        for (const row of biom.rows.slice(0, 50)) {
            assert.equal(row.metadata.DNA_sequence, sequenceForId(row.id),
                `wrong sequence merged onto ${row.id}`);
        }
    });

    await t.test('dna.txt pairs each occurrence with the right sequence', () => {
        const lines = readArtifact(dir, 'archive/dna.txt').replace(/\r\n/g, '\n')
            .split('\n').filter(l => l.length > 0);
        const body = lines.slice(1);
        assert.equal(body.length, 5507, 'one line per non-zero entry');

        // Derived rather than goldened: the expected content is computable from the ids, which
        // is a stronger check than byte equality and keeps a 550 KB file out of the repository.
        for (const line of body) {
            const cells = line.split('\t');
            const taxonId = cells[0].split(':')[1];
            assert.equal(cells[cells.length - 1], sequenceForId(taxonId),
                `wrong sequence against occurrence ${cells[0]}`);
        }
    });

    await t.test('supplying sequences gives every record a content-based taxonID', () => {
        // The one way the occurrence record does change. util/index.js:71 sets taxonID to
        // getAsvID(DNA_sequence), which is `ASV:<md5 of the sanitised sequence>`, so a dataset
        // with no sequences has no taxonID column at all and gains one as soon as a fasta is
        // supplied. Worth pinning: it is how an ASV acquires a stable identifier that is the
        // same in any dataset containing the same sequence.
        const lines = readArtifact(dir, 'archive/occurrence.txt').replace(/\r\n/g, '\n')
            .split('\n').filter(l => l.length > 0);
        const header = lines[0].split('\t');
        const plainHeader = golden(`${FIXTURE}/occurrence.txt`).split('\n')[0].split('\t');

        assert.ok(header.includes('taxonID'), 'occurrence.txt should gain a taxonID column');
        assert.ok(!plainHeader.includes('taxonID'),
            'and the run without a fasta should not have had one');
        assert.deepEqual(header.filter(c => c !== 'taxonID'), plainHeader,
            'taxonID should be the only column that differs');

        const taxonIdIndex = header.indexOf('taxonID');
        for (const line of lines.slice(1)) {
            const cells = line.split('\t');
            const taxon = cells[0].split(':')[1];
            assert.equal(cells[taxonIdIndex], getAsvID(sequenceForId(taxon)),
                `taxonID for ${cells[0]} should be derived from its sequence`);
        }
    });

    await t.test('metrics are generated once sequences are present', async () => {
        // The counterpart to the todo in xlsx.golden.test.js: without sequences,
        // getDNAsequenceLength (metrics/index.js:492) rethrows and getMetrics abandons the whole
        // metrics object. Supplying them removes the trigger, so the file appears. This is the
        // evidence for that diagnosis, and it will keep holding after the guard is added.
        assert.ok(artifactExists(dir, 'metrics.json'),
            'metrics.json should be written when the taxa have sequences');

        const metrics = await readMetrics(DATASET_ID, DATASET_VERSION);
        assert.equal(metrics.sequenceLength.mean, SYNTHETIC_SEQUENCE_LENGTH,
            'every synthetic sequence is the same length, so the mean is exact');
        assert.equal(metrics.sequenceLength.stdev, 0);
    });
});
