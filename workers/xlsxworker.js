import { getYargs, isFastaFile } from '../util/index.js';
import { addReadCounts } from '../converters/biom.js';
import { getMapFromMatrix, readWorkBookFromFile, toBiom } from "../converters/excel.js"
import { uploadedFilesAndTypes, getMimeFromPath, getFileSize, unzip } from '../validation/files.js'
import { readFastaAsMap } from '../util/streamReader.js';
import _ from 'lodash'
import { mergeFastaMapIntoTaxonMap, readMapping } from '../util/filesAndDirectories.js'
import {updateStatusOnCurrentStep, beginStep, stepFinished, blastErrors, finishedJobSuccesssFully, finishedJobWithError, writeBiomFormats, consistencyCheckReport, writeMetrics, dataHeaders} from "./util.js"
import { assignTaxonomy } from '../classifier/index.js';

import config from '../config.js';


const processDataset = async (id, version, systemShouldAssignTaxonomy, skipSimiliarityPlots) => {
    try {
        console.log("Processing dataset "+id + " version "+version)
    const  files = await uploadedFilesAndTypes(id, version)
    const mapping = await readMapping(id, version);

    const xlsx = files.files.find(f => f.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || f?.name?.endsWith('.xlsx'))
    const fasta = files.files.find(f => isFastaFile(f.name))
    beginStep('readData')
   // const biom = await toBiom(filePaths.otuTable, filePaths.samples, filePaths.taxa, samplesAsColumns,  updateStatusOnCurrentStep , mapping, id)
   const {samples, taxa, otuTable} = await readWorkBookFromFile(id, xlsx.name, version, mapping, updateStatusOnCurrentStep)

   // The workbook is parsed here anyway, so report the headers to the supervisor
   // instead of relying on the processing report - a validation that is still
   // running may not have written them yet when the job was created
   dataHeaders({sampleHeaders: samples?.data?.[0], taxonHeaders: taxa?.data?.[0]})

   const sampleMap = getMapFromMatrix(samples.data,  mapping.samples)
   const taxaMap = getMapFromMatrix(taxa.data, mapping.taxa, true)
   if(fasta){
    const fastaMap = await readFastaAsMap(`${config.dataStorage}${id}/${version}/original/${fasta.name}`);
    // adds sequences from fasta to taxonomy file
    mergeFastaMapIntoTaxonMap(fastaMap, taxaMap)
   }

    stepFinished('readData');

    if(systemShouldAssignTaxonomy){
        beginStep('assignTaxonomy')
        const { errors } = await assignTaxonomy(id, version, taxaMap, mapping?.defaultValues?.target_gene, updateStatusOnCurrentStep)
        blastErrors(errors || [])
        stepFinished('assignTaxonomy')
    }
    beginStep('convertToBiom')
   // const biom = await toBiom(filePaths.otuTable, filePaths.samples, filePaths.taxa, samplesAsColumns,  updateStatusOnCurrentStep , mapping, id)
   const {biom, consistencyCheck} = await toBiom(otuTable, sampleMap, taxaMap, mapping, updateStatusOnCurrentStep)
   
   consistencyCheckReport(consistencyCheck)
   /* if(consistencyCheck.sampleIdsWithNoRecordInSampleFile?.length > 0){
    // Some ids did not have a corresponding entry in the sample file
    missingSampleRecords(consistencyCheck.sampleIdsWithNoRecordInSampleFile)
} */
    stepFinished('convertToBiom');
    beginStep('addReadCounts')
    await addReadCounts(biom, updateStatusOnCurrentStep)
    stepFinished('addReadCounts')
    await writeBiomFormats(biom, id, version)
    await writeMetrics(id, version, skipSimiliarityPlots)
    finishedJobSuccesssFully('success')
    } catch (error) {
        console.log(error)
        finishedJobWithError(error?.message)   
    }
    
}


try {
const yargs = getYargs()
const {id, version, assigntaxonomy, skipsimiliarityplots} = yargs;

processDataset(id, version, assigntaxonomy, skipsimiliarityplots)
} catch (error) {
    console.log(error)
}




