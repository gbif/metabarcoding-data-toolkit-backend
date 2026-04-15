import { readFAIReWorkbook, readFAIReFlatFiles } from '../converters/faire.js'
import { uploadedFilesAndTypes } from '../validation/files.js'
import { getYargs } from '../util/index.js'
import { readMapping, writeMapping, getProcessingReport, writeProcessingReport } from '../util/filesAndDirectories.js'
import { finishedJobSuccesssFully, finishedJobWithError } from './util.js'

const processDataset = async (id, version, userName) => {
    try {
        let files = await uploadedFilesAndTypes(id, version)
        let processingReport = await getProcessingReport(id, version)
        if (!processingReport) {
            processingReport = { id, createdBy: userName, createdAt: new Date().toISOString() }
        }

        const xlsxFile = files.files.find(f =>
            f.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            || f.name?.toLowerCase().endsWith('.xlsx'))

        // Attach validation errors to the xlsx file (workbook mode) or first file (flat-file mode)
        const faireFileRef = xlsxFile ?? files.files[0]

        // Read user's assay selection if previously set
        const preferredAssay = processingReport?.files?.selectedAssay ?? null

        let headers_ = {}
        let sheets_ = []

        try {
            let result
            if (xlsxFile) {
                result = await readFAIReWorkbook(id, xlsxFile.name, version, preferredAssay)
            } else {
                result = await readFAIReFlatFiles(id, version, preferredAssay)
            }

            const { headers, sheets, projectMetadataDefaults = {}, assayNames } = result
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

            const report = { ...processingReport, ...headers_, unzip: false, files: { ...files, selectedAssay: preferredAssay } }
            await writeProcessingReport(id, version, report)
            finishedJobSuccesssFully('success')

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
