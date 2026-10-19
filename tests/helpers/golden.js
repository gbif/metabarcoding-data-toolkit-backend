/**
 * Golden-file comparison.
 *
 * A golden is the output this pipeline produced when the baseline was recorded. The point of
 * the suite is that a change of internal representation - replacing BIOM as the central format -
 * must not change these files. So the comparison is strict, and a missing golden is a failure
 * rather than a skip: a suite that silently passes because a baseline was never recorded is
 * worse than no suite.
 *
 * Regenerating is deliberate and separate: `npm run test:golden:update`. Never wire that into
 * `npm test` - the baseline has to change as a reviewed diff, not as a side effect.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { GOLDEN_ROOT } from './env.js';

const updating = () => process.env.UPDATE_GOLDEN === '1';

const goldenPath = (name) => path.join(GOLDEN_ROOT, name);

/**
 * Compares text against tests/golden/<name>.
 *
 * `name` is a path relative to the golden root, e.g. 'biowide_fungi_min/occurrence.txt'.
 */
export const compareToGolden = (name, actual) => {
    const file = goldenPath(name);

    if (updating()) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, actual);
        console.log(`  updated golden ${name} (${actual.length} bytes)`);
        return;
    }

    if (!fs.existsSync(file)) {
        assert.fail(
            `No golden recorded at tests/golden/${name}. `
            + `Record the baseline with: npm run test:golden:update`
        );
    }

    const expected = fs.readFileSync(file, 'utf8');
    if (expected !== actual) {
        assert.fail(
            `Output differs from tests/golden/${name}.\n`
            + firstDifference(expected, actual)
            + `\nIf this change is intended, review it with: UPDATE_GOLDEN=1 npm run test:golden:update`
        );
    }
};

/** Same, for a structure that is compared as canonical JSON. */
export const compareJsonToGolden = (name, actual) => {
    compareToGolden(name, JSON.stringify(actual, null, 2) + '\n');
};

/**
 * Reports the first differing line rather than dumping two multi-thousand-line files, which is
 * what makes a golden failure actionable.
 */
const firstDifference = (expected, actual) => {
    const e = expected.split('\n');
    const a = actual.split('\n');
    for (let i = 0; i < Math.max(e.length, a.length); i++) {
        if (e[i] !== a[i]) {
            return [
                `  first difference at line ${i + 1}:`,
                `    golden: ${truncate(e[i])}`,
                `    actual: ${truncate(a[i])}`,
                `  (${e.length} lines in golden, ${a.length} in actual)`,
            ].join('\n');
        }
    }
    return '  files differ only in trailing content';
};

const truncate = (line, max = 300) => {
    if (line === undefined) {
        return '<missing line>';
    }
    return line.length > max ? `${line.slice(0, max)}… (${line.length} chars)` : line;
};

export const goldenExists = (name) => fs.existsSync(goldenPath(name));
