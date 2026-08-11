import { readFAIReWorkbook, readFAIReFlatFiles, readFAIReHybrid, extractEmlFromProjectMetadata } from '../converters/faire.js'
import { uploadedFilesAndTypes } from '../validation/files.js'
import { getYargs } from '../util/index.js'
import { readMapping, writeMapping, getProcessingReport, writeProcessingReport, getMetadata, writeEmlJson, writeEmlXml } from '../util/filesAndDirectories.js'
import { finishedJobSuccesssFully, finishedJobWithError } from './util.js'
import { getEml } from '../util/Eml/index.js';


const processDataset = async (id, version, userName) => {
    try {
        let files = await uploadedFilesAndTypes(id, version)
        let processingReport = await getProcessingReport(id, version)
        if (!processingReport) {
            processingReport = { id, createdBy: userName, createdAt: new Date().toISOString() }
        }

        const FAIRE_PREFIXES = ['otufinal_', 'taxafinal_', 'samplemetadata_', 'experimentrunmetadata_', 'projectmetadata_', 'oturaw_', 'taxaraw_'];
        // Hybrid mode: any file (xlsx or flat) carries a FAIRe prefix alongside a non-prefixed main workbook
        const hasFAIRePrefixedFiles = files.files.some(f =>
            FAIRE_PREFIXES.some(p => f.name.toLowerCase().startsWith(p))
        );
        const xlsxFile = files.files.find(f =>
            f.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            || f.name?.toLowerCase().endsWith('.xlsx'))

        // Attach errors to the non-prefixed main workbook in hybrid mode; otherwise use the single xlsx or first file
        const mainWorkbook = hasFAIRePrefixedFiles
            ? files.files.find(f => (f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls')) && !FAIRE_PREFIXES.some(p => f.name.toLowerCase().startsWith(p)))
            : null;
        const faireFileRef = mainWorkbook ?? xlsxFile ?? files.files[0]

        // Read user's assay selection if previously set
        const preferredAssay = processingReport?.files?.selectedAssay ?? null

        let headers_ = {}
        let sheets_ = []

        try {
            let result
            if (hasFAIRePrefixedFiles) {
                result = await readFAIReHybrid(id, version, preferredAssay)
            } else if (xlsxFile) {
                result = await readFAIReWorkbook(id, xlsxFile.name, version, preferredAssay)
            } else {
                result = await readFAIReFlatFiles(id, version, preferredAssay)
            }

            const { headers, sheets, projectMetadataDefaults = {}, projectMetadataComments = {}, assayNames } = result
            headers_ = headers
            sheets_ = sheets

            const allErrors = sheets.flatMap(s => (s.errors || []).map(e => ({ message: e })))
            faireFileRef.errors = allErrors

            if (sheets_.length > 0) {
                faireFileRef.sheets = sheets_
            }

            if (assayNames) {
                files.assayNames = assayNames
            }

            const oldMapping = await readMapping(id, version)
            // projectMetadata defaults form the base; any previously user-set defaultValues win
            const mergedDefaults = { ...projectMetadataDefaults, ...(oldMapping?.defaultValues || {}) }
            const newMapping = oldMapping
                ? { ...oldMapping, samples: { ...oldMapping.samples, id: 'samp_name' }, taxa: { ...oldMapping.taxa, id: 'seq_id' }, defaultValues: mergedDefaults }
                : { samples: { id: 'samp_name' }, taxa: { id: 'seq_id' }, defaultValues: mergedDefaults }
            await writeMapping(id, version, newMapping)

            // Generate eml.json from projectMetadata fields if one does not already exist
            const existingEml = await getMetadata(id, version);
            let eml;
            if (!existingEml) {
                eml = extractEmlFromProjectMetadata(projectMetadataDefaults, userName, projectMetadataComments)
                if (eml) {
                    await writeEmlJson(id, version, eml)
                    const xml = getEml({...eml, id})
                    await writeEmlXml(id, version, xml)
                }
            }

            const report = { ...processingReport, metadata: eml || existingEml , ...headers_, unzip: false, files: { ...files, selectedAssay: preferredAssay } }
            await writeProcessingReport(id, version, report)
            // hand the report back so the caller does not have to read it from disk again
            finishedJobSuccesssFully(report)

        } catch (error) {
            faireFileRef.errors = [{ message: typeof error === 'string' ? error : error?.message }]
            const report = { ...processingReport, ...headers_, unzip: false, files: { ...files, format: 'INVALID', selectedAssay: preferredAssay } }
            await writeProcessingReport(id, version, report)
            console.log(`FAIRe validation failed for ${id}: ${error?.message || error}`)
            finishedJobWithError(error?.message || error)
        }

    } catch (error) {
        console.log(`FAIRe worker error for ${id}: ${error?.message || error}`)
        finishedJobWithError(error?.message || error)
    }
}

try {
    const yargs = getYargs()
    const { id, version, username } = yargs
    processDataset(id, version, username)
} catch (error) {
    console.log(error)
}
