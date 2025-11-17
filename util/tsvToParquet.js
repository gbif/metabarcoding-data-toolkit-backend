import { DuckDBInstance as Database } from '@duckdb/node-api';

export const tsvToParquet = async (input, output) => {
    const db = await Database.create(":memory:");
    const con = await db.connect();
    await con.run(`COPY (SELECT * FROM read_csv($input)) TO $output (FORMAT parquet, COMPRESSION zstd, COMPRESSION_LEVEL 3);`, {input, output});
}

export default tsvToParquet;

