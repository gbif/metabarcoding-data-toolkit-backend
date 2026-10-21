/**
 * Helpers for the fasta input variants.
 *
 * MDT accepts sequences either inline, as a DNA_sequence column in the taxon file or sheet, or
 * in a separate fasta keyed on the taxon id. Both variants are declared formats
 * (TSV_WITH_FASTA, XLSX_WITH_FASTA in enum/format.js) and both are merged by
 * mergeFastaMapIntoTaxonMap in util/filesAndDirectories.js.
 *
 * Rather than commit a second copy of a dataset with the sequences moved, these derive the fasta
 * variant from a fixture already in the repository. For the TSV case that makes a stronger test
 * than a new golden would: the derived input must produce byte-identical output to the inline
 * input, which is the actual contract.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

/**
 * Splits a taxon TSV into the same file without its sequence column, plus the fasta holding
 * those sequences. The result is the same dataset expressed the other way round.
 */
export const splitSequencesIntoFasta = (taxaPath, {
    idColumn = 'id', sequenceColumn = 'DNA_sequence', delimiter = '\t',
} = {}) => {
    const lines = fs.readFileSync(taxaPath, 'utf8').replace(/\r\n/g, '\n').split('\n')
        .filter(line => line.length > 0);
    const header = lines[0].split(delimiter);

    const sequenceIndex = header.indexOf(sequenceColumn);
    const idIndex = header.indexOf(idColumn);
    if (sequenceIndex === -1) {
        throw new Error(`${taxaPath} has no ${sequenceColumn} column to split out`);
    }
    if (idIndex === -1) {
        throw new Error(`${taxaPath} has no ${idColumn} column to key the fasta on`);
    }

    const kept = header.map((_, i) => i).filter(i => i !== sequenceIndex);
    const rows = lines.slice(1).map(line => line.split(delimiter));

    return {
        taxa: [
            kept.map(i => header[i]).join(delimiter),
            ...rows.map(cells => kept.map(i => cells[i]).join(delimiter)),
        ].join('\n') + '\n',
        fasta: rows.map(cells => `>${cells[idIndex]}\n${cells[sequenceIndex]}\n`).join(''),
        count: rows.length,
    };
};

/**
 * A sequence derived from a taxon id, for a fixture that has no sequences of its own.
 *
 * Deterministic, so goldens and assertions stay stable, and reversible, so a test can check that
 * the sequence which arrived against a given occurrence is the one that belonged to that taxon -
 * rather than merely that some sequence arrived. Fixed length, which also makes the
 * sequenceLength metric exactly predictable.
 */
export const sequenceForId = (id, length = 80) => {
    let out = '';
    let round = 0;
    while (out.length < length) {
        const digest = crypto.createHash('md5').update(`${id}:${round++}`).digest('hex');
        out += [...digest].map(c => 'ACGT'[parseInt(c, 16) % 4]).join('');
    }
    return out.slice(0, length);
};

export const SYNTHETIC_SEQUENCE_LENGTH = 80;

/** A fasta of synthetic sequences for the given taxon ids. */
export const syntheticFasta = (ids, length = SYNTHETIC_SEQUENCE_LENGTH) =>
    ids.map(id => `>${id}\n${sequenceForId(id, length)}\n`).join('');

/** Taxon ids from a sheet in an xlsx workbook, read the way converters/excel.js reads them. */
export const taxonIdsFromWorkbook = async (workbookPath, sheetName = 'taxa') => {
    const xlsx = (await import('xlsx')).default;
    // read from a buffer: XLSX.readFile needs set_fs wiring under ESM, which the project avoids
    const workbook = xlsx.read(fs.readFileSync(workbookPath), { type: 'buffer', dense: true });
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    return rows.slice(1).map(row => row?.[0]).filter(Boolean);
};
