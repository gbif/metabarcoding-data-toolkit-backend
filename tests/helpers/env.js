/**
 * Test environment setup.
 *
 * Preloaded with `node --test --import=./tests/helpers/env.js`, which runs it before any test
 * file's module graph is evaluated. That ordering is the whole point: config.js reads the
 * credentials path and the data directory once, at module evaluation, into a frozen object.
 * Setting these from inside a test file would already be too late for anything that file
 * imports, and relying on import order within a test file is a trap waiting for someone to
 * reorder two lines.
 *
 * Verified that `--import` propagates to the child process the test runner forks per file.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(here, '../..');
export const TEST_DATA_ROOT = path.join(REPO_ROOT, 'testData');
export const GOLDEN_ROOT = path.join(here, '..', 'golden');

// Dummy credentials, so no test needs a real creds.json and config.js stops throwing.
if (!process.env.MDT_CREDENTIALS) {
    process.env.MDT_CREDENTIALS = path.join(here, '..', 'fixtures', 'creds.test.json');
}

// One data directory per process. The runner forks a process per test file, so this keeps the
// files one test file writes from colliding with another's without any coordination between
// them. Set MDT_KEEP_TEST_DATA=1 to leave the directory behind and inspect what was produced.
if (!process.env.MDT_DATA_DIR) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mdt-test-${process.pid}-`));
    process.env.MDT_DATA_DIR = dir;

    if (process.env.MDT_KEEP_TEST_DATA === '1') {
        console.log(`MDT_KEEP_TEST_DATA=1, leaving test data in ${dir}`);
    } else {
        process.on('exit', () => {
            try {
                fs.rmSync(dir, { recursive: true, force: true });
            } catch (error) {
                // a failed cleanup of a temp directory must never fail the test run
            }
        });
    }
}

// Nothing in the suite may call out to GBIF, EBI or the blast service. There is no global
// network kill switch in node, so this is a marker the helpers assert against rather than an
// enforced block - see tests/helpers/offline.js.
process.env.MDT_TEST = '1';
