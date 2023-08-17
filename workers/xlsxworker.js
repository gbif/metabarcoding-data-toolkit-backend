import { addReadCounts } from '../converters/biom.js';
import { getMapFromMatrix, readWorkBookFromFile, toBiom } from "../converters/excel.js"
import { uploadedFilesAndTypes, getMimeFromPath, getFileSize, unzip } from '../validation/files.js'

import _ from 'lodash'
import { getCurrentDatasetVersion, writeProcessingReport, wipeGeneratedFilesAndResetProccessing, readTsvHeaders, readMapping } from '../util/filesAndDirectories.js'
import {updateStatusOnCurrentStep, beginStep, stepFinished, blastErrors, finishedJobSuccesssFully, finishedJobWithError, writeBiomFormats, missingSampleRecords} from "./util.js"
import { assignTaxonomy } from '../classifier/index.js';



const processDataset = async (id, version, systemShouldAssignTaxonomy) => {
    try {
        console.log("Processing dataset "+id + " version "+version)
    const mapping = await readMapping(id, version);
    const  files = await uploadedFilesAndTypes(id, version)

   /*  if (filePaths?.samples) {
        job.sampleHeaders = await readTsvHeaders(filePaths?.samples)
    }
    if (filePaths?.taxa) {
        job.taxonHeaders = await readTsvHeaders(filePaths?.taxa)
    } */
    beginStep('readData')
   // const biom = await toBiom(filePaths.otuTable, filePaths.samples, filePaths.taxa, samplesAsColumns,  updateStatusOnCurrentStep , mapping, id)
   const {samples, taxa, otuTable} = await readWorkBookFromFile(id, files.files[0].name, version, mapping, updateStatusOnCurrentStep)

   const sampleMap = getMapFromMatrix(samples.data,  mapping.samples)
      const taxaMap = getMapFromMatrix(taxa.data, mapping.taxa, true)

    stepFinished('readData');

    if(systemShouldAssignTaxonomy){
        beginStep('assignTaxonomy')
        const { errors } = await assignTaxonomy(id, version, taxaMap, mapping?.defaultValues?.target_gene, updateStatusOnCurrentStep)
        blastErrors(errors || [])
        stepFinished('assignTaxonomy')
    }
    beginStep('convertToBiom')
   // const biom = await toBiom(filePaths.otuTable, filePaths.samples, filePaths.taxa, samplesAsColumns,  updateStatusOnCurrentStep , mapping, id)
   const {biom, sampleIdsWithNoRecordInSampleFile} = await toBiom(otuTable, sampleMap, taxaMap, mapping, updateStatusOnCurrentStep)
   if(sampleIdsWithNoRecordInSampleFile?.length > 0){
    // Some ids did not have a corresponding entry in the sample file
    missingSampleRecords(sampleIdsWithNoRecordInSampleFile)
}
    stepFinished('convertToBiom');
    beginStep('addReadCounts')
    await addReadCounts(biom, updateStatusOnCurrentStep)
    stepFinished('addReadCounts')
    await writeBiomFormats(biom, id, version)
    finishedJobSuccesssFully('success')
    } catch (error) {
        console.log(error)
        finishedJobWithError(error?.message)   
    }
    
}




const id = process.argv[2]
const version = process.argv[3]
const systemShouldAssignTaxonomy = process.argv?.[4] || false;

processDataset(id, version, systemShouldAssignTaxonomy)


