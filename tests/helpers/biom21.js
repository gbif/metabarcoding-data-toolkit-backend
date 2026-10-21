/**
 * Builds a mock QIIME2 BIOM 2.1 dataset from tests/fixtures/biom21/qiime2-mock.spec.json.
 *
 * Written by hand against the HDF5 layout of a real QIIME2 table.biom, deliberately *not* by
 * calling MDT's own converters/hdf5.js writer. Using MDT's writer would make the test
 * self-referential - it would only prove MDT can read what MDT writes - and it differs from
 * QIIME2 in several ways the spec file documents.
 *
 * Generating at test setup rather than committing a binary keeps the layout reviewable: a change
 * to the fixture shows up as a diff in the spec or here, not as an opaque blob.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const SPEC_PATH = path.join(here, '..', 'fixtures', 'biom21', 'qiime2-mock.spec.json');

export const readSpec = () => JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));

/**
 * Compressed sparse representation of a dense matrix.
 *
 * Derived here rather than written into the spec so the indptr arrays cannot drift out of step
 * with the values. BIOM 2.1 requires both orientations: observation/matrix is CSR (one row per
 * observation) and sample/matrix is CSC (one row per sample).
 */
const compress = (rows, byRow) => {
    const height = byRow ? rows.length : rows[0].length;
    const width = byRow ? rows[0].length : rows.length;
    const data = [];
    const indices = [];
    const indptr = [0];
    for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
            const value = byRow ? rows[i][j] : rows[j][i];
            if (value !== 0) {
                data.push(value);
                indices.push(j);
            }
        }
        indptr.push(data.length);
    }
    return { data, indices, indptr };
};

/** Longest string in a list, for the fixed-length string dtype HDF5 needs. */
const widest = (values) => Math.max(1, ...values.map(v => `${v}`.length));

/**
 * Writes the .biom file.
 *
 * h5wasm/node is used because that is the entry point that can see the host filesystem - the
 * plain `h5wasm` import runs against a WASM virtual filesystem and cannot open a real path.
 */
export const writeMockBiom = async (targetPath, spec = readSpec()) => {
    const h5wasm = await import('h5wasm/node');
    await h5wasm.ready;

    const observations = spec.observationIds;
    const samples = spec.sampleIds;
    const csr = compress(spec.matrix, true);
    const csc = compress(spec.matrix, false);

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const f = new h5wasm.File(targetPath, 'w');

    // Root attributes, in QIIME2's set. Note what is absent: MDT's writer adds a 'format'
    // attribute here, and QIIME2 does not - so neither does this.
    f.get('/').create_attribute('creation-date', spec.root['creation-date'], null, 'S');
    f.get('/').create_attribute('format-url', 'http://biom-format.org', null, 'S');
    // int64 ('<q'), as QIIME2 writes these three - MDT's own writer uses int32
    f.get('/').create_attribute('format-version', [2n, 1n], [2], '<q');
    f.get('/').create_attribute('generated-by', spec.root['generated-by'], null, 'S');
    f.get('/').create_attribute('id', spec.root.id, null, 'S');
    // scalar, not a one-element array - the real file writes nnz as a bare int64
    f.get('/').create_attribute('nnz', BigInt(csr.data.length), null, '<q');
    f.get('/').create_attribute('shape',
        [BigInt(observations.length), BigInt(samples.length)], [2], '<q');
    // empty string, exactly as QIIME2 leaves it
    f.get('/').create_attribute('type', spec.root.type, null, 'S');

    for (const group of ['observation', 'observation/matrix', 'observation/metadata',
                         'observation/group-metadata', 'sample', 'sample/matrix',
                         'sample/metadata', 'sample/group-metadata']) {
        f.create_group(group);
    }

    f.get('observation').create_dataset({
        name: 'ids', data: observations,
        shape: [observations.length], dtype: `S${widest(observations)}`,
    });
    f.get('sample').create_dataset({
        name: 'ids', data: samples,
        shape: [samples.length], dtype: `S${widest(samples)}`,
    });

    for (const [group, m] of [['observation/matrix', csr], ['sample/matrix', csc]]) {
        // float64 data with int32 indices, as in the real file
        f.get(group).create_dataset({
            name: 'data', data: m.data.map(Number), shape: [m.data.length], dtype: '<d' });
        f.get(group).create_dataset({
            name: 'indices', data: m.indices, shape: [m.indices.length], dtype: '<i' });
        f.get(group).create_dataset({
            name: 'indptr', data: m.indptr, shape: [m.indptr.length], dtype: '<i' });
    }

    // metadata and group-metadata are left empty on purpose - that is the QIIME2 reality, and
    // it is why the samples, taxa and sequences arrive as separate files.
    f.close();

    return { observations, samples, nonZeroEntries: csr.data.length };
};

/** taxonomy.tsv as taxonomy.qza contains it: Feature ID / Taxon / Confidence. */
export const taxonomyTsv = (spec = readSpec()) => [
    ['Feature ID', 'Taxon', 'Confidence'].join('\t'),
    ...spec.observationIds.map((id, i) => [id, ...spec.taxonomy[i]].join('\t')),
].join('\n') + '\n';

/** metadata.tsv as the pipeline receives it, keyed on sample_name. */
export const samplesTsv = (spec = readSpec()) => {
    const columns = Object.keys(spec.samples[0]);
    return [
        columns.join('\t'),
        ...spec.samples.map(row => columns.map(c => row[c] ?? '').join('\t')),
    ].join('\n') + '\n';
};

/** dna-sequences.fasta as repseqs.qza contains it, headed by the md5 feature id. */
export const sequencesFasta = (spec = readSpec()) =>
    spec.observationIds.map((id, i) => `>${id}\n${spec.sequences[i]}\n`).join('');

/**
 * Checks the spec's own internal claim: that every feature id is the md5 of its sequence, the
 * way QIIME2 derives them. A fixture that quietly stopped being self-consistent would still
 * pass the pipeline while no longer representing real input.
 */
export const specIsSelfConsistent = (spec = readSpec()) =>
    spec.observationIds.every((id, i) =>
        crypto.createHash('md5').update(spec.sequences[i]).digest('hex') === id);
