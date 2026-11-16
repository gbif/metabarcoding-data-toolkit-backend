/**
 * The behavioural contract of MDT's matrix abstraction.
 *
 * Today that abstraction is `Biom` from biojs-io-biom. The intention is to stop making BIOM the
 * central representation, and the obstacle is that nothing anywhere states what the rest of the
 * application needs from it. This file is that statement: a suite any candidate implementation
 * can be run against, so the migration becomes a swap that either passes or fails rather than a
 * rewrite followed by hoping.
 *
 * Every assertion here was derived from an actual call site, not from the library's API surface.
 * What MDT uses, and nothing more:
 *
 *   properties   rows, columns, data, comment, shape, nnz, type, id
 *   methods      getDataColumn(id), addMetadata({dimension, attribute, values}), transpose()
 *   private      _rows, _columns, _data        (converters/biom.js:260-269)
 *
 * The last line is the uncomfortable one and the reason this file matters. writeBiom does not
 * serialise the object with JSON.stringify - for a 1.19 GB table it cannot - so it walks
 * Object.keys(biom), strips the leading underscore from each to recover the public BIOM field
 * name, and streams the three big arrays separately in chunks. That makes biojs-io-biom's
 * *internal* field naming part of MDT's file format path.
 *
 * Two kinds of assertion are marked below:
 *
 *   REQUIRED  semantics the pipeline genuinely depends on. A replacement must satisfy these.
 *   COUPLING  accidents of the current implementation that MDT has come to rely on. A
 *             replacement may legitimately break these, but then the named call site has to
 *             change with it. They are asserted so that cost is visible up front instead of
 *             surfacing as a corrupt output file.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * A deliberately asymmetric 3 x 2 matrix: a different row and column count so a transpose is
 * detectable, a zero in each orientation so dense expansion is exercised, and distinct values
 * so a misordered result cannot coincidentally pass.
 *
 *          c1   c2
 *    r1     5    0
 *    r2     0    7
 *    r3     3    9
 */
export const FIXTURE = {
    id: 'contract-fixture',
    type: 'OTU table',
    matrix_type: 'sparse',
    matrix_element_type: 'int',
    comment: JSON.stringify({ defaultValues: { sample: { target_gene: 'COI' } } }),
    rows: [
        { id: 'r1', metadata: { scientificName: 'Taxon one' } },
        { id: 'r2', metadata: { scientificName: 'Taxon two' } },
        { id: 'r3', metadata: { scientificName: 'Taxon three' } },
    ],
    columns: [
        { id: 'c1', metadata: { eventDate: '2020-01-01' } },
        { id: 'c2', metadata: { eventDate: '2020-01-02' } },
    ],
    // row-major, which is itself part of the contract - see below
    data: [[0, 0, 5], [1, 1, 7], [2, 0, 3], [2, 1, 9]],
};

const DENSE = { c1: [5, 0, 3], c2: [0, 7, 9] };
const COLUMN_SUMS = { c1: 8, c2: 16 };
const TOTAL = 24;

/**
 * Runs the contract against an implementation.
 *
 * @param {string} name   how the implementation is described in test output
 * @param {Function} create  given a spec shaped like FIXTURE, returns an instance
 */
export const runMatrixContract = (name, create) => {

    test(`matrix contract: ${name}`, async (t) => {

        await t.test('REQUIRED rows and columns keep their order and ids', () => {
            const m = create(FIXTURE);
            assert.deepEqual(m.rows.map(r => r.id), ['r1', 'r2', 'r3']);
            assert.deepEqual(m.columns.map(c => c.id), ['c1', 'c2']);
        });

        await t.test('REQUIRED row and column metadata survives construction', () => {
            // converters/dwc.js and dwcdp.js read every Darwin Core term out of these objects,
            // so losing or renaming a key silently empties a column of the archive.
            const m = create(FIXTURE);
            assert.equal(m.rows[0].metadata.scientificName, 'Taxon one');
            assert.equal(m.columns[1].metadata.eventDate, '2020-01-02');
        });

        await t.test('REQUIRED shape is [rows, columns]', () => {
            const m = create(FIXTURE);
            assert.deepEqual([...m.shape], [3, 2]);
        });

        await t.test('REQUIRED nnz counts the non-zero entries', () => {
            const m = create(FIXTURE);
            assert.equal(m.nnz, 4);
        });

        await t.test('REQUIRED id, type and comment are carried through', () => {
            // comment is not decoration: it is the channel the per-dataset defaultValues travel
            // on, because BIOM 1.0 has nowhere else to put group metadata. Drop it and every
            // dataset loses its target_gene, primers and environmental terms.
            const m = create(FIXTURE);
            assert.equal(m.id, FIXTURE.id);
            assert.equal(m.type, FIXTURE.type);
            assert.deepEqual(JSON.parse(m.comment), JSON.parse(FIXTURE.comment));
        });

        await t.test('REQUIRED getDataColumn returns a dense column in row order', () => {
            const m = create(FIXTURE);
            for (const [column, expected] of Object.entries(DENSE)) {
                const dense = m.getDataColumn(column);
                assert.equal(dense.length, 3, `${column} should have one entry per row`);
                assert.deepEqual([...dense], expected, `${column} values or order wrong`);
            }
        });

        await t.test('REQUIRED absent entries read as 0, not undefined', () => {
            // addReadCounts sums these, and getDataForTermfromSample writes them into
            // organismQuantity. An undefined would become NaN or an empty field downstream.
            const m = create(FIXTURE);
            const dense = m.getDataColumn('c1');
            assert.equal(dense[1], 0);
            assert.notEqual(dense[1], undefined);
        });

        await t.test('REQUIRED data is a list of [rowIndex, columnIndex, value] triplets', () => {
            const m = create(FIXTURE);
            assert.equal(m.data.length, 4);
            for (const entry of m.data) {
                assert.equal(entry.length, 3);
                const [row, column, value] = entry;
                assert.ok(Number.isInteger(row) && row >= 0 && row < 3, `row index ${row}`);
                assert.ok(Number.isInteger(column) && column >= 0 && column < 2, `column index ${column}`);
                assert.ok(Number.isFinite(Number(value)), `value ${value}`);
            }
        });

        await t.test('REQUIRED data is ordered row-major', () => {
            // An undocumented assumption with teeth: the planned single-pass rewrite of the
            // per-column scan relies on row-major order to recompute taxon strings only when the
            // row changes. A column-major implementation would silently make that wrong rather
            // than slow.
            const m = create(FIXTURE);
            const rowIndices = m.data.map(([row]) => row);
            assert.deepEqual(rowIndices, [...rowIndices].sort((a, b) => a - b),
                'row indices should be non-decreasing');
        });

        await t.test('REQUIRED the triplets and the dense columns agree', () => {
            const m = create(FIXTURE);
            const fromTriplets = m.data.reduce((sum, [, , value]) => sum + Number(value), 0);
            const fromColumns = m.columns.reduce(
                (sum, c) => sum + m.getDataColumn(c.id).reduce((a, b) => a + Number(b), 0), 0);
            assert.equal(fromTriplets, TOTAL, 'sum over the triplets');
            assert.equal(fromColumns, TOTAL, 'sum over the dense columns');
        });

        await t.test('REQUIRED addMetadata sets a column attribute positionally', () => {
            // How readCount reaches the columns (converters/biom.js:35). The values array is
            // positional by column index, and must not disturb metadata already present.
            const m = create(FIXTURE);
            m.addMetadata({ dimension: 'columns', attribute: 'readCount', values: [COLUMN_SUMS.c1, COLUMN_SUMS.c2] });
            assert.equal(m.columns[0].metadata.readCount, 8);
            assert.equal(m.columns[1].metadata.readCount, 16);
            assert.equal(m.columns[0].metadata.eventDate, '2020-01-01',
                'existing metadata should be untouched');
        });

        await t.test('REQUIRED transpose swaps the axes and preserves every value', () => {
            // toBiom transposes whenever the OTU table arrives with taxa as columns, so that
            // samples are always stored as columns. Every value must survive the flip.
            const m = create(FIXTURE);
            m.transpose();

            assert.deepEqual([...m.shape], [2, 3], 'shape should be swapped');
            assert.deepEqual(m.rows.map(r => r.id), ['c1', 'c2']);
            assert.deepEqual(m.columns.map(c => c.id), ['r1', 'r2', 'r3']);
            assert.equal(m.nnz, 4, 'no entry should be lost or invented');

            // reading along the other axis now: r1 was [5, 0] across the two samples
            assert.deepEqual([...m.getDataColumn('r1')], [5, 0]);
            assert.deepEqual([...m.getDataColumn('r3')], [3, 9]);

            const total = m.data.reduce((sum, [, , value]) => sum + Number(value), 0);
            assert.equal(total, TOTAL, 'the sum must be invariant under transpose');
        });

        await t.test('REQUIRED transpose carries the metadata with its axis', () => {
            const m = create(FIXTURE);
            m.transpose();
            assert.equal(m.rows[0].metadata.eventDate, '2020-01-01',
                'what were column metadata are now row metadata');
            assert.equal(m.columns[0].metadata.scientificName, 'Taxon one');
        });

        await t.test('COUPLING own keys are underscore-prefixed public field names', () => {
            // writeBiom (converters/biom.js:258-262) cannot JSON.stringify a multi-gigabyte
            // table, so it walks Object.keys(biom) and writes each as `k.slice(1)` - taking it
            // on trust that every own key is the public BIOM field name with an underscore in
            // front. A replacement that exposes `rows` instead of `_rows`, or adds any own key
            // not of that form, produces a malformed BIOM file rather than an error.
            const m = create(FIXTURE);
            const keys = Object.keys(m);

            assert.ok(keys.length > 0, 'there should be enumerable own keys to walk');
            for (const key of keys) {
                assert.ok(key.startsWith('_'),
                    `own key ${key} is not underscore-prefixed, so writeBiom would emit `
                    + `"${key.slice(1)}" as a field name`);
            }
            for (const required of ['_rows', '_columns', '_data']) {
                assert.ok(keys.includes(required), `writeBiom streams ${required} separately`);
            }
        });

        await t.test('COUPLING shape is computed, not an own key', () => {
            // writeBiom writes "shape" explicitly, which would emit it twice if it were also
            // picked up by the Object.keys walk.
            const m = create(FIXTURE);
            assert.ok(!Object.keys(m).includes('_shape'),
                'shape must not appear in the own keys, or it would be written twice');
            assert.deepEqual([...m.shape], [3, 2], 'but it must still be readable');
        });

        await t.test('COUPLING the three big arrays are reachable under their private names', () => {
            const m = create(FIXTURE);
            assert.equal(m._rows.length, 3);
            assert.equal(m._columns.length, 2);
            assert.equal(m._data.length, 4);
            assert.deepEqual(m._rows.map(r => r.id), m.rows.map(r => r.id),
                'the private array and the public accessor should agree');
        });
    });
};
