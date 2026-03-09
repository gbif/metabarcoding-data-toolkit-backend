import fs from 'fs'
import path from 'path'
import { DuckDBInstance } from '@duckdb/node-api'
import config from '../config.js'

const DEFAULT_MAX_ROWS = 10000;
const ABSOLUTE_MAX_ROWS = 500000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION_RE = /^\d+$/;

// Only allow SELECT / WITH...SELECT queries; block file-access functions
const isSafeQuery = (sql) => {
    const normalized = sql.trim().toUpperCase();

    if (!normalized.startsWith('SELECT') && !normalized.startsWith('WITH')) {
        return { safe: false, reason: 'Only SELECT (or WITH … SELECT) queries are allowed' };
    }

    const blocked = [
        'READ_PARQUET', 'READ_CSV', 'READ_JSON', 'PARQUET_SCAN', 'CSV_SCAN',
        'GLOB(', 'COPY ', 'INSTALL ', 'LOAD ', 'HTTPFS', 'PRAGMA'
    ];
    for (const pattern of blocked) {
        if (normalized.includes(pattern)) {
            return { safe: false, reason: `Disallowed SQL pattern: ${pattern.trim()}` };
        }
    }

    return { safe: true };
};

const getParquetBasePath = (datasetId, version) =>
    path.join(config.dataStorage, datasetId, version, 'parquet');

export default (app) => {

    /**
     * GET /dataset/:id/explore/schema
     *
     * Returns the tables, fields, primary keys and foreign keys described in
     * the dataset's datapackage.json.  Optional ?version=N query param (defaults to 1).
     */
    app.get('/dataset/:id/explore/schema', async (req, res) => {
        const datasetId = req.params.id;
        if (!datasetId || !UUID_RE.test(datasetId)) {
            return res.sendStatus(400);
        }

        const version = req.query.version || '1';
        if (!VERSION_RE.test(version)) {
            return res.sendStatus(400);
        }

        try {
            const dpPath = path.join(getParquetBasePath(datasetId, version), 'datapackage.json');
            const datapackage = JSON.parse(fs.readFileSync(dpPath, 'utf8'));

            const schema = datapackage.resources.map(r => ({
                name: r.name,
                title: r.schema.title,
                description: r.schema.description,
                fields: r.schema.fields.map(f => ({
                    name: f.name,
                    title: f.title,
                    type: f.type,
                    description: f.description,
                    constraints: f.constraints
                })),
                primaryKey: r.schema.primaryKey,
                foreignKeys: r.schema.foreignKeys || []
            }));

            res.json(schema);
        } catch (error) {
            if (error.code === 'ENOENT') {
                res.sendStatus(404);
            } else {
                console.log(error);
                res.sendStatus(500);
            }
        }
    });

    /**
     * GET /dataset/:id/explore/resources
     *
     * Returns the names of resources whose parquet files are present on disk.
     * Consumers should use this to avoid querying optional tables that may not
     * exist for a given dataset (e.g. event-assertion).
     */
    app.get('/dataset/:id/explore/resources', async (req, res) => {
        const datasetId = req.params.id;
        if (!datasetId || !UUID_RE.test(datasetId)) {
            return res.sendStatus(400);
        }

        const version = req.query.version || '1';
        if (!VERSION_RE.test(version)) {
            return res.sendStatus(400);
        }

        try {
            const basePath = getParquetBasePath(datasetId, String(version));
            const dpPath = path.join(basePath, 'datapackage.json');

            if (!fs.existsSync(dpPath)) {
                return res.sendStatus(404);
            }

            const datapackage = JSON.parse(fs.readFileSync(dpPath, 'utf8'));
            const resolvedBase = path.resolve(basePath);

            const available = datapackage.resources
                .filter(r => {
                    const resolved = path.resolve(path.join(basePath, r.path));
                    return resolved.startsWith(resolvedBase) && fs.existsSync(resolved);
                })
                .map(r => r.name);

            res.json({ resources: available });
        } catch (error) {
            console.log(error);
            res.sendStatus(500);
        }
    });

    /**
     * POST /dataset/:id/explore/query
     *
     * Body: { sql: "SELECT …", version: "1", maxRows: 50000 }
     *       version and maxRows are optional (defaults: "1", 10000).
     *       maxRows is capped at 500000.
     *
     * Opens an in-memory DuckDB instance, registers each parquet file from the
     * datapackage as a named view (using the resource name), executes the SQL,
     * and returns { columns, rows, rowCount }.
     *
     * Only SELECT / WITH…SELECT statements are accepted.  File-access functions
     * such as read_parquet() are blocked in user SQL.
     */
    app.post('/dataset/:id/explore/query', async (req, res) => {
        const datasetId = req.params.id;
        if (!datasetId || !UUID_RE.test(datasetId)) {
            return res.sendStatus(400);
        }

        const { sql } = req.body;
        if (!sql || typeof sql !== 'string') {
            return res.status(400).json({ error: 'Missing or invalid "sql" field in request body' });
        }

        const version = req.body.version || req.query.version || '1';
        if (!VERSION_RE.test(String(version))) {
            return res.sendStatus(400);
        }

        const requestedMax = parseInt(req.body.maxRows, 10);
        const maxRows = Number.isFinite(requestedMax) && requestedMax > 0
            ? Math.min(requestedMax, ABSOLUTE_MAX_ROWS)
            : DEFAULT_MAX_ROWS;

        const safety = isSafeQuery(sql);
        if (!safety.safe) {
            return res.status(422).json({ error: safety.reason });
        }

        try {
            const basePath = getParquetBasePath(datasetId, String(version));
            const dpPath = path.join(basePath, 'datapackage.json');

            if (!fs.existsSync(dpPath)) {
                return res.sendStatus(404);
            }

            const datapackage = JSON.parse(fs.readFileSync(dpPath, 'utf8'));

            const db = await DuckDBInstance.create(':memory:');
            const con = await db.connect();

            try {
                // Register each parquet file as a named view, skipping files that
                // are listed in datapackage.json but not yet present on disk
                // (some resources like event-assertion are optional).
                const resolvedBase = path.resolve(basePath);
                for (const resource of datapackage.resources) {
                    const resolvedPath = path.resolve(path.join(basePath, resource.path));

                    // Guard against path-traversal in datapackage.json resource paths
                    if (!resolvedPath.startsWith(resolvedBase)) {
                        return res.status(422).json({ error: `Invalid resource path in datapackage: ${resource.path}` });
                    }

                    if (!fs.existsSync(resolvedPath)) {
                        continue; // optional resource not present for this dataset
                    }

                    // Escape single quotes in the path (safe for DuckDB string literals)
                    const escapedPath = resolvedPath.replace(/'/g, "''");
                    await con.run(`CREATE VIEW "${resource.name}" AS SELECT * FROM read_parquet('${escapedPath}')`);
                }

                // Wrap the user query to enforce the row cap
                const wrappedSql = `SELECT * FROM (\n${sql}\n) AS __explore_query LIMIT ${maxRows}`;
                const reader = await con.runAndReadAll(wrappedSql);
                const rows = reader.getRowObjectsJson();
                const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

                res.json({ columns, rows, rowCount: rows.length });
            } finally {
                con.closeSync();
            }
        } catch (error) {
            console.log(error);
            // Surface DuckDB / SQL errors to the caller so they can correct their query
            if (error?.message) {
                res.status(422).json({ error: error.message });
            } else {
                res.sendStatus(500);
            }
        }
    });
}
