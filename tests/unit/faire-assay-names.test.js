/**
 * Assay and run names in FAIRe otuFinal/taxaFinal sheet and file names.
 *
 * The assay was taken as the token after the first underscore, so 12S_V5 became 12S, and two
 * assays sharing that token - 12S_V5 and 12S_MiFish - became one, leaving the second unreachable.
 * Underscores are allowed in run ids too (vert_2021), so the split is made against the assay names
 * the dataset declares, in projectMetadata's assay_name row or experimentRunMetadata's assay_name
 * column. Both lanes that read the names are covered: the sheet parser, used for workbooks and for
 * processing, and the flat-file reader used by validation.
 */
import '../helpers/env.js';

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import config from '../../config.js';
import { DATASET_VERSION } from '../helpers/dataset.js';
import { parseFAIReComponents, readFAIReFlatFiles } from '../../converters/faire.js';

const ASSAYS = ['12S_V5', '12S_MiFish'];
const RUN = 'Run_1';

const projectMetadata = (assays) => [
    ['requirement_level_code', 'section', 'term_name', 'project_level', ...assays.map((_, i) => `assay${i + 1}`)],
    ['M', 'PCR', 'assay_name', assays.join(' | '), ...assays],
];
const experimentRunMetadata = (assays) => [
    ['samp_name', 'assay_name', 'seq_run_id'],
    ...assays.map(a => ['S1', a, RUN]),
];
const otuTable = [['seq_id', 'S1'], ['A', 1]];
const taxaTable = [['seq_id', 'scientificName'], ['A', 'Gadus morhua']];

const workbookSheets = ({ pm = projectMetadata(ASSAYS), er = experimentRunMetadata(ASSAYS), names = ASSAYS } = {}) => [
    { name: 'projectMetadata', data: pm },
    { name: 'experimentRunMetadata', data: er },
    { name: 'sampleMetadata', data: [['samp_name'], ['S1']] },
    ...names.flatMap(a => [
        { name: `otuFinal_${a}_${RUN}`, data: otuTable },
        { name: `taxaFinal_${a}_${RUN}`, data: taxaTable },
    ]),
];

test('assays declared in projectMetadata keep their underscores', () => {
    const components = parseFAIReComponents(workbookSheets({ er: [['samp_name']] }));
    assert.deepEqual(components.assayNames, ASSAYS);
    assert.equal(components.assayName, '12S_V5');
    assert.equal(components.seqRunId, RUN);
    assert.equal(components.otuFinal.name, `otuFinal_12S_V5_${RUN}`);
});

test('each assay can be selected, with its own tables', () => {
    const components = parseFAIReComponents(workbookSheets(), '12S_MiFish');
    assert.equal(components.assayName, '12S_MiFish');
    assert.equal(components.otuFinal.name, `otuFinal_12S_MiFish_${RUN}`);
    assert.equal(components.taxaFinal.name, `taxaFinal_12S_MiFish_${RUN}`);
    assert.equal(components.seqRunId, RUN);
});

test('assays declared only in experimentRunMetadata are recognised', () => {
    const components = parseFAIReComponents(workbookSheets({ pm: [['term_name', 'project_level']] }));
    assert.deepEqual(components.assayNames, ASSAYS);
});

test('the longest declared assay wins', () => {
    const assays = ['12S', '12S_V5'];
    const components = parseFAIReComponents(workbookSheets({ pm: projectMetadata(assays), er: experimentRunMetadata(assays), names: ['12S_V5'] }));
    assert.deepEqual(components.assayNames, ['12S_V5']);
    assert.equal(components.seqRunId, RUN);
});

test('an undeclared assay still splits on the first underscore', () => {
    const components = parseFAIReComponents(workbookSheets({ pm: [['term_name', 'project_level']], er: [['samp_name']], names: ['vert01'] }));
    assert.deepEqual(components.assayNames, ['vert01']);
    assert.equal(components.seqRunId, RUN);
});

test('flat files: assays declared in the metadata files keep their underscores', async (t) => {
    const id = 'test-faire-assay-names-flat';
    const dir = `${config.dataStorage}${id}/${DATASET_VERSION}/original/`;
    fs.rmSync(`${config.dataStorage}${id}`, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    t.after(() => fs.rmSync(`${config.dataStorage}${id}`, { recursive: true, force: true }));

    const tsv = (rows) => rows.map(r => r.join('\t')).join('\n') + '\n';
    fs.writeFileSync(`${dir}projectMetadata_proj.tsv`, tsv(projectMetadata(ASSAYS)));
    fs.writeFileSync(`${dir}experimentRunMetadata_proj.tsv`, tsv(experimentRunMetadata(ASSAYS)));
    fs.writeFileSync(`${dir}sampleMetadata_proj.tsv`, tsv([['samp_name'], ['S1']]));
    for (const a of ASSAYS) {
        fs.writeFileSync(`${dir}otuFinal_proj_${a}_${RUN}.tsv`, tsv(otuTable));
        fs.writeFileSync(`${dir}taxaFinal_proj_${a}_${RUN}.tsv`, tsv(taxaTable));
    }

    const result = await readFAIReFlatFiles(id, DATASET_VERSION, '12S_MiFish');
    assert.deepEqual([...result.assayNames].sort(), [...ASSAYS].sort());
    assert.equal(result.assayName, '12S_MiFish');
    assert.equal(result.seqRunId, RUN);
    assert.ok(result.sheets.some(s => s.name === `otuFinal_proj_12S_MiFish_${RUN}`));
    assert.ok(result.sheets.some(s => s.name === `taxaFinal_proj_12S_MiFish_${RUN}`));
});
