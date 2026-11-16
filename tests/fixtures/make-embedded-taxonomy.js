/**
 * Builds testData/biowide_fungi_min_embedded from testData/biowide_fungi_min.
 *
 * The same dataset in the two-table layout: taxa.tsv's columns are moved into the OTU table,
 * after the counts, and there is no taxon file. The OTU table keeps its own id header (qseqid)
 * rather than taxa.tsv's "id", so the tests also exercise validation working out the taxon id.
 *
 * Written twice, once as flat files and once as a workbook with OTUtable and samples sheets, so
 * that both lanes can be checked against the biowide_fungi_min goldens. Counts are numeric cells;
 * everything else is a string cell, so that date and float typing - a separate concern of the
 * workbook reader - cannot make the two layouts differ.
 *
 * Run from the backend root: node tests/fixtures/make-embedded-taxonomy.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import xlsx from 'xlsx';

const here = path.dirname(fileURLToPath(import.meta.url));
const testData = path.resolve(here, '../../testData');
const source = path.join(testData, 'biowide_fungi_min');
const target = path.join(testData, 'biowide_fungi_min_embedded');

const readTsv = (name) => fs.readFileSync(path.join(source, name), 'utf8')
    .split(/\r?\n/).filter(line => line !== '').map(line => line.split('\t'));

const otuTable = readTsv('OTU_table.tsv');
const taxa = readTsv('taxa.tsv');
const samples = readTsv('sample.tsv');

// taxa.tsv without its id column, keyed by that id
const taxonHeaders = taxa[0].slice(1);
const taxonById = new Map(taxa.slice(1).map(row => [row[0], row.slice(1)]));

const embedded = [
    [...otuTable[0], ...taxonHeaders],
    ...otuTable.slice(1).map(row => {
        const taxon = taxonById.get(row[0]);
        if (!taxon) throw new Error(`No taxon record for ${row[0]}`);
        return [...row, ...taxon];
    }),
];

fs.mkdirSync(target, { recursive: true });

const toTsv = (rows) => rows.map(row => row.join('\t')).join('\n') + '\n';
fs.writeFileSync(path.join(target, 'OTU_table.tsv'), toTsv(embedded));
fs.copyFileSync(path.join(source, 'sample.tsv'), path.join(target, 'sample.tsv'));

const sampleCount = otuTable[0].length - 1;
const otuSheet = embedded.map((row, r) => row.map((cell, c) =>
    r > 0 && c >= 1 && c <= sampleCount ? Number(cell) : cell));

const workbook = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(otuSheet), 'OTUtable');
xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(samples), 'samples');
// xlsx.writeFile needs set_fs under ESM; writing the buffer ourselves avoids that
fs.writeFileSync(path.join(target, 'biowide_fungi_min_embedded.xlsx'),
    xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

console.log(`wrote ${target}: ${embedded.length - 1} taxa, ${sampleCount} samples, `
    + `${taxonHeaders.length} taxon columns after the counts`);
