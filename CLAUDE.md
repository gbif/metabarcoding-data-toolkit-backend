# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Node.js/Express REST API backend for the Metabarcoding Data Toolkit (MDT). Processes, validates, and converts metabarcoding datasets into Darwin Core Archives for publication on GBIF.org.

## Commands

**Run the server:**
```bash
node server/index.js --credentials /path/to/credentials.json --organizationfile /path/to/organizations.json
```

**For large datasets (increase heap):**
```bash
export NODE_OPTIONS="--max-old-space-size=6144"
```

**Run tests:**
```bash
node tests/index.js
node tests/duckTest.js
node tests/endpointTest.js
```

No npm scripts are defined - all commands run via direct node invocation.

## Architecture

### Entry Point
- `server/index.js` - Express app setup and route registration

### Core Modules

**server/** - Express route handlers
- `upload.js` - File upload endpoints
- `validation.js` - Dataset validation
- `process.js` - Main processing workflow
- `dwc.js` - Darwin Core Archive generation
- `dwcdp.js` - Darwin Core Data Package generation
- `Auth/` - JWT-style authentication (30-minute token validity)
- `db/duckDbNeoImpl.js` - DuckDB database implementation

**workers/** - Forked child processes for CPU-intensive tasks
- `supervisor.js` - Orchestrates job queue (concurrency: 3)
- `tsvworker.js`, `xlsxworker.js`, `biomworker.js` - Format-specific processors
- `dwcworker.js`, `dwcdpworker.js` - Archive generation workers
- Uses `async/queue` for job management

**converters/** - File format converters
- `dwc.js` - BIOM to Darwin Core
- `dwcdp.js` - Darwin Core Data Package
- `biom.js` - BIOM format manipulation
- `hdf5.js` - HDF5/QIIME2 handling

**validation/** - Input validation and format detection
- `files.js` - File type detection
- `tsvformat.js`, `biomformat.js` - Format-specific validation

**enum/** - Constants and enumerations (processing steps, file formats, DWC terms)

**schemas/** - XML/JSON schema definitions for Darwin Core

### Data Processing Pipeline

1. Upload files → `POST /dataset/upload`
2. Validate format → `POST /validate/:id`
3. Map columns to DWC terms → `POST /dataset/:id/mapping`
4. Process dataset (converts to BIOM 2.1) → `POST /dataset/:id/process`
5. Generate DWC archive → `POST /dataset/:id/dwc`
6. Publish to GBIF → `POST /dataset/:id/register-in-gbif-prod`

### Supported Formats
- **Input:** TSV, XLSX, BIOM 2.1, HDF5/QZA (QIIME2), ZIP archives
- **Output:** Darwin Core Archive (ZIP with EML), DWC Data Package (Parquet with zstd compression)

### Key Configuration
- `config.js` - Environment configs (local/test/prod)
- Credentials JSON includes: `dataDirectory`, GBIF API keys, `installationAdmins`
- Routes prefixed with `/service/` in deployment

### External Integrations
- GBIF API (species validation, dataset publishing)
- GBIF Registry (UAT and production)
- EBI Ontology Service
- Optional BLAST for taxonomy assignment
