import { writeBiom, toBiom, addReadCounts, metaDataFileToMap } from '../converters/biom.js';
import { writeHDF5 } from '../converters/hdf5.js'
// import config from '../config.js'
import _ from 'lodash'
import { getCurrentDatasetVersion, writeProcessingReport, wipeGeneratedFilesAndResetProccessing, readTsvHeaders, readMapping } from '../util/filesAndDirectories.js'
import { determineFileNames, otuTableHasSamplesAsColumns, otuTableHasSequencesAsColumnHeaders } from '../validation/tsvformat.js'
import {uploadedFilesAndTypes} from '../validation/files.js'

import {updateStatusOnCurrentStep, beginStep, stepFinished, blastErrors, finishedJobSuccesssFully, finishedJobWithError, writeBiomFormats, missingSampleRecords} from "./util.js"
import { assignTaxonomy } from '../classifier/index.js';



const processDataset = async (id, version, systemShouldAssignTaxonomy) => {
    try {
        console.log("Processing dataset "+id + " version "+version)
    const mapping = await readMapping(id, version);
    const files = await uploadedFilesAndTypes(id, version)
    const fileMap = _.keyBy(files.files, "type")

   // const filePaths = await determineFileNames(id, version);
    
    let samplesAsColumns;

   
    let {sequencesAsHeaders, errors} =   await otuTableHasSamplesAsColumns(fileMap/* , mapping ?  _.get(mapping, 'samples.id', 'id') : null */);
    if (!samplesAsColumns) {
        sequencesAsHeaders = await otuTableHasSequencesAsColumnHeaders(fileMap.otuTable)

    } 
    
     
   /*  if (filePaths?.samples) {
        job.sampleHeaders = await readTsvHeaders(filePaths?.samples)
    }
    if (filePaths?.taxa) {
        job.taxonHeaders = await readTsvHeaders(filePaths?.taxa)
    } */
    
    beginStep('readData')
    updateStatusOnCurrentStep(0, 0, 'Reading sample file')
    const samples = await metaDataFileToMap(fileMap?.samples, mapping.samples, updateStatusOnCurrentStep)  // await streamReader.readMetaDataAsMap(sampleFile, processFn, termMapping.samples)
    updateStatusOnCurrentStep(0, 0, 'Reading taxon file', {sampleCount: samples.size});
    const taxa = await metaDataFileToMap(fileMap?.taxa, mapping.taxa, updateStatusOnCurrentStep)// await streamReader.readMetaDataAsMap(taxaFile,  processFn, termMapping.taxa)
    updateStatusOnCurrentStep(taxa.size, taxa.size, 'Reading taxon file', {taxonCount: taxa.size});

    stepFinished('readData');

    if(systemShouldAssignTaxonomy){
        beginStep('assignTaxonomy')
        const { errors } = await assignTaxonomy(id, version, taxa, mapping?.defaultValues?.target_gene, updateStatusOnCurrentStep)
        blastErrors(errors || [])
        stepFinished('assignTaxonomy')
    }

    beginStep('convertToBiom')
    updateStatusOnCurrentStep(0, taxa.size, 'Reading OTU table', {taxonCount: taxa.size});
    console.log(`TSV worker running id ${id}`)
    const {biom, sampleIdsWithNoRecordInSampleFile} = await toBiom(fileMap?.otuTable, samples, taxa, samplesAsColumns,  updateStatusOnCurrentStep , mapping, id)
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
        finishedJobWithError(error)   
    }
    
}





const id = process.argv[2]
const version = process.argv[3]
const systemShouldAssignTaxonomy = process.argv?.[4] || false;
processDataset(id, version, systemShouldAssignTaxonomy)

