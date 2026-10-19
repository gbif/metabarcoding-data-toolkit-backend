/**
 * Normalisers applied before comparing output against a golden file.
 *
 * Each one exists because of a specific, identified source of variation. Nothing here is
 * defensive guesswork - if a normaliser is not needed, it should not be applied, because every
 * one of them is a hole in what the goldens actually guard.
 */

// Matches an ISO timestamp with a time component only, so the date-only values in real data
// (eventDate is 2014-11-17 in the biowide fixture) are left alone and keep being compared.
// Written by converters/biom.js:109 and :163, excel.js:281, faire.js:773, hdf5.js:225 and :392.
const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g;

export const stripTimestamps = (text) => `${text}`.replace(ISO_TIMESTAMP, '<TIMESTAMP>');

/**
 * Sorts the body of a delimited file, keeping the header rows in place.
 *
 * occurrence.txt is emitted sample-major today. The planned single-pass rewrite of
 * Biom.getDataColumn changes it to taxon-major, which is legitimate - Darwin Core imposes no
 * row order - so comparing sorted lines is what lets that refactor and these goldens coexist.
 * Content is still compared exactly; only the order is forgiven.
 */
export const sortedLines = (text, { headerLines = 0 } = {}) => {
    const lines = `${text}`.replace(/\r\n/g, '\n').split('\n');
    while (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
    }
    const header = lines.slice(0, headerLines);
    const body = lines.slice(headerLines).sort();
    return [...header, ...body].join('\n') + '\n';
};

/**
 * Rounds every number in a structure, for comparing metrics.json.
 *
 * Bray-Curtis distances and MDS coordinates are floating point, and holding them to full
 * precision would make the goldens hostage to the last bit of an accumulation order.
 */
export const roundNumbers = (value, places = 9) => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? Number(value.toFixed(places)) : value;
    }
    if (Array.isArray(value)) {
        return value.map(v => roundNumbers(v, places));
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([k, v]) => [k, roundNumbers(v, places)])
        );
    }
    return value;
};

/**
 * Replaces named fields wherever they appear in a structure.
 *
 * For epoch-millisecond stamps that no regex can distinguish from real data -
 * converters/faire.js:234 writes `createdAt: Date.now()`.
 */
export const blankFields = (value, fields) => {
    const names = new Set(fields);
    const walk = (v) => {
        if (Array.isArray(v)) {
            return v.map(walk);
        }
        if (v && typeof v === 'object') {
            return Object.fromEntries(
                Object.entries(v).map(([k, inner]) => [k, names.has(k) ? '<BLANKED>' : walk(inner)])
            );
        }
        return v;
    };
    return walk(value);
};

/**
 * Normalises the sign of ordination coordinates.
 *
 * classicMDS (metrics/ordination.js:142) takes numeric.svd, whose eigenvector signs are
 * indeterminate in principle - an axis may be mirrored without the ordination being any
 * different. numeric.js is pure JS and stable for identical input today, so this does not fire
 * now, but it stops a future library swap from failing as a confusing content diff. The
 * convention is to make the first non-zero coordinate on each axis positive.
 */
export const signNormaliseOrdination = (points, axes = ['x', 'y']) => {
    if (!Array.isArray(points)) {
        return points;
    }
    const flip = {};
    for (const axis of axes) {
        const first = points.find(p => Number(p?.[axis]) !== 0);
        flip[axis] = Number(first?.[axis]) < 0;
    }
    return points.map(p => {
        const out = { ...p };
        for (const axis of axes) {
            if (flip[axis] && typeof out[axis] === 'number') {
                out[axis] = -out[axis];
            }
        }
        return out;
    });
};
