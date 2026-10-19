/**
 * Stages a fixture as a dataset on disk, the way an upload would leave it.
 *
 * The pipeline discovers its inputs from the filesystem - uploadedFilesAndTypes
 * (validation/files.js:161) reads {dataStorage}/{id}/{version}/original/ and infers each file's
 * type from its *name*, via the synonym lists in validation/filenames.js. So staging copies the
 * fixture files under their original names rather than renaming them, and the tests exercise
 * the real detection rather than bypassing it.
 *
 * Dataset ids are fixed per fixture, not generated, so that anything which embeds the id stays
 * byte-stable across runs and the goldens keep comparing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { TEST_DATA_ROOT } from './env.js';
import config from '../../config.js';
import { writeMapping } from '../../util/filesAndDirectories.js';

export const DATASET_VERSION = 1;

/** True when a fixture directory is present. The large fixtures are not committed. */
export const fixtureAvailable = (fixture) => fs.existsSync(path.join(TEST_DATA_ROOT, fixture));

/**
 * Copies a fixture into the dataset storage layout and writes its term mapping.
 *
 * @param {string} fixture  directory under testData/
 * @param {string} id       fixed dataset id for this fixture
 * @param {string[]} files  file names to copy from the fixture directory
 * @param {object} mapping  term mapping, written as mapping.json
 * @param {boolean} withEmlXml  stage a minimal archive/eml.xml (see below)
 * @returns {{id: string, version: number, dir: string}}
 */
export const stageFixture = async ({ fixture, id, files, mapping, withEmlXml = true }) => {
    const source = path.join(TEST_DATA_ROOT, fixture);
    if (!fs.existsSync(source)) {
        throw new Error(`Fixture not found: testData/${fixture}`);
    }

    const dir = `${config.dataStorage}${id}/${DATASET_VERSION}`;
    fs.mkdirSync(path.join(dir, 'original'), { recursive: true });
    // the DWCA builder writes into archive/ and does not create it itself
    fs.mkdirSync(path.join(dir, 'archive'), { recursive: true });

    for (const name of files) {
        const from = path.join(source, name);
        if (!fs.existsSync(from)) {
            throw new Error(`Fixture testData/${fixture} has no file ${name}`);
        }
        fs.copyFileSync(from, path.join(dir, 'original', name));
    }

    // The DwC-DP builder copies archive/eml.xml into the package (converters/dwcdp.js:100) and
    // that copy is not guarded, so without a file there every run logs an ENOENT. The package is
    // still written, but a test suite should exercise the normal path rather than bake in
    // tolerance of a known gap. This is deliberately minimal: eml.xml is metadata-driven, not
    // data-driven, so it is never compared against a golden - only its presence matters here.
    if (withEmlXml) {
        fs.writeFileSync(path.join(dir, 'archive', 'eml.xml'),
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            + '<eml:eml xmlns:eml="https://eml.ecoinformatics.org/eml-2.2.0" packageId="test" system="mdt-test">\n'
            + '  <dataset><title>Test fixture</title></dataset>\n'
            + '</eml:eml>\n');
    }

    await writeMapping(id, DATASET_VERSION, mapping);

    return { id, version: DATASET_VERSION, dir };
};

/** Reads a produced artifact as text. Fails with the path rather than a bare ENOENT. */
export const readArtifact = (dir, relative) => {
    const file = path.join(dir, relative);
    if (!fs.existsSync(file)) {
        throw new Error(`Expected the pipeline to produce ${relative}, but ${file} does not exist`);
    }
    return fs.readFileSync(file, 'utf8');
};

export const artifactExists = (dir, relative) => fs.existsSync(path.join(dir, relative));
