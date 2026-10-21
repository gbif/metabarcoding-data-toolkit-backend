/**
 * Applies the matrix contract to the implementation MDT uses today.
 *
 * This file exists to establish that the contract in matrix-contract.js is an accurate
 * description of the current behaviour rather than an aspiration. When a replacement for
 * biojs-io-biom is written, add a second file beside this one that calls runMatrixContract with
 * a factory for it; if both pass, the pipeline cannot tell them apart.
 *
 * Nothing here is specific to biojs-io-biom except the factory itself, which is the point.
 */
import '../helpers/env.js';

import { Biom } from 'biojs-io-biom';
import { runMatrixContract } from './matrix-contract.js';

runMatrixContract('biojs-io-biom (current)', (spec) => new Biom({
    id: spec.id,
    type: spec.type,
    matrix_type: spec.matrix_type,
    matrix_element_type: spec.matrix_element_type,
    comment: spec.comment,
    // copied, so a test that mutates its matrix cannot affect the next one
    rows: spec.rows.map(r => ({ ...r, metadata: { ...r.metadata } })),
    columns: spec.columns.map(c => ({ ...c, metadata: { ...c.metadata } })),
    shape: [spec.rows.length, spec.columns.length],
    data: spec.data.map(entry => [...entry]),
}));
