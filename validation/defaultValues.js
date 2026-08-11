
// The study/defaults table is a list of key value pairs - one term column and one
// value column. It is read positionally, so any other column count (an extra "id"
// column is the common case) would silently map the wrong column as the term and
// drop every real value. When the shape is not what we expect, the table is
// disregarded and the user is warned instead.

const DEFAULT_VALUES_COLUMN_COUNT = 2;

// Spreadsheet and csv rows keep trailing empty cells, an empty but formatted
// column would otherwise look like a third column
const trimTrailingEmptyCells = (row) => {
    const cells = Array.isArray(row) ? [...row] : [];
    while (cells.length > 0 && (cells[cells.length - 1] === null || cells[cells.length - 1] === undefined || `${cells[cells.length - 1]}`.trim() === '')) {
        cells.pop()
    }
    return cells;
}

// Returns null when the table has the two columns we expect, otherwise the warning to show the user
export const defaultValuesShapeWarning = (rows, sourceName = 'Study') => {
    if (!Array.isArray(rows) || rows.length === 0) {
        // no table at all - it is optional, so there is nothing to warn about
        return null
    }
    const headerRow = trimTrailingEmptyCells(rows[0]);
    if (headerRow.length === DEFAULT_VALUES_COLUMN_COUNT) {
        return null
    }
    // collapse whitespace so a column name never renders as a stray tab in the warning
    const columnNames = headerRow.map(cell => `${cell}`.replace(/\s+/g, ' ').trim()).join(', ');
    const found = headerRow.length > 0 ? `${headerRow.length} (${columnNames})` : `${headerRow.length}`;
    return `The ${sourceName} table must have exactly two columns, a term column and a value column, but has ${found}. The values in ${sourceName} were disregarded. Please remove the extra column(s) and upload the file again.`
}

export const parseDefaultValues = (rows, sourceName = 'Study') => {
    const warning = defaultValuesShapeWarning(rows, sourceName);
    if (!!warning || !Array.isArray(rows) || rows.length === 0) {
        return { defaultValues: {}, terms: undefined, warnings: !!warning ? [warning] : [] }
    }
    const dataRows = rows.slice(1);
    const defaultValues = dataRows.reduce((acc, row) => {
        if (!!row?.[0] && !!row?.[1]) {
            acc[row[0]] = row[1]
        }
        return acc
    }, {})
    // terms include rows without a value - they are still terms the user named,
    // and the consistency checks warn when they collide with sample/taxon columns
    return { defaultValues, terms: dataRows.map(row => row?.[0]).filter(t => !!t), warnings: [] }
}
