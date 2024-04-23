import { addReadCounts } from '../converters/biom.js';
import {readXlsxHeaders, getMapFromMatrix, readWorkBookFromFile, toBiom } from "../converters/excel.js"
import { uploadedFilesAndTypes, getMimeFromPath, getFileSize, unzip } from '../validation/files.js'
import filenames from '../validation/filenames.js'

import {getArrayIntersection} from '../validation/misc.js'
import { readFastaAsMap } from '../util/streamReader.js';
import _ from 'lodash'
import {getCurrentDatasetVersion, readTsvHeaders, getProcessingReport, getMetadata, writeProcessingReport,} from '../util/filesAndDirectories.js'
import {updateStatusOnCurrentStep, beginStep, stepFinished, blastErrors, finishedJobSuccesssFully, finishedJobWithError, writeBiomFormats, consistencyCheckReport} from "./util.js"
import { assignTaxonomy } from '../classifier/index.js';
import config from '../config.js';


const processDataset = async (id, version, userName) => {
    try {
        console.log("XLSX coming in, start worker process")
        let files = await uploadedFilesAndTypes(id, version)
        let processionReport = await getProcessingReport(id, version)
        if(!processionReport){
            processionReport= {id: id, createdBy: userName, createdAt: new Date().toISOString()}
          }
    
        let  xlsx = files.files.find(f => f.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || f?.name?.endsWith('.xlsx'))
        try {

          
        let headers_ = {};
        let sheets_ = {};
    
           const {headers, sheets} = await readXlsxHeaders(id, xlsx?.name, version)
    
           headers_ = headers
           sheets_ = sheets
    
           const xlsxErrors = sheets.reduce((acc, curr) => [...acc, ...(curr?.errors || []).map(e => ({message: e}))],[])
           xlsx.errors = xlsxErrors;
           
           let defaultValueTerms;
           console.log(sheets)
           const defaultValueSheet = sheets.find(s => filenames.defaultvalues.includes(s?.name?.toLowerCase()));

           if(defaultValueSheet?.rows?.length > 1){
            defaultValueTerms =  defaultValueSheet?.rows.slice(1).map(i => i[0]).filter(i => !!i)
            console.log(defaultValueTerms)
          }
    
           const sampleTaxonHeaderIntersection = getArrayIntersection(headers?.sampleHeaders, headers?.taxonHeaders);       
    
           if(sampleTaxonHeaderIntersection.filter(e => !!e).length > 0) {
            const plural = sampleTaxonHeaderIntersection.length > 1;
            xlsx.errors.push({file: xlsx.name, message: `The column${plural ? 's':''} ${sampleTaxonHeaderIntersection.join(', ')} ${plural ? 'are' : 'is'} present in both the sample and taxon sheet. Only the value from the sample sheet will be added to the DWC archive.`})
           }

           const studySampleIntersection = getArrayIntersection(headers?.sampleHeaders, defaultValueTerms);       
    
           if(studySampleIntersection.filter(e => !!e).length > 0) {
            const plural = studySampleIntersection.length > 1;
            xlsx.errors.push({file: xlsx.name, message: `The term${plural ? 's':''} ${studySampleIntersection.join(', ')} ${plural ? 'are' : 'is'} present in both the sample and study sheet. Only the value from the study sheet will be added to the DWC archive.`})
           }

           const studyTaxonIntersection = getArrayIntersection(headers?.taxonHeaders, defaultValueTerms);       
    
           if(studyTaxonIntersection.filter(e => !!e).length > 0) {
            const plural = studyTaxonIntersection.length > 1;
            xlsx.errors.push({file: xlsx.name, message: `The term${plural ? 's':''} ${studyTaxonIntersection.join(', ')} ${plural ? 'are' : 'is'} present in both the taxon and study sheet. Only the value from the study sheet will be added to the DWC archive.`})
           }
           
           if(sheets_ && xlsx){
            xlsx.sheets = sheets_;
          }
         const report = {...processionReport, ...headers_, unzip: false, files:{...files}};
         await writeProcessingReport(id, version, report)
         finishedJobSuccesssFully('success')
    
        } catch (error) {
          if(typeof error === 'string'){
            xlsx.errors = [{file: xlsx.name, message: error}]
          }
          const report = {...processionReport, ...headers_, unzip: false, files:{...files, format: 'INVALID'}};
          await writeProcessingReport(id, version, report)
    
          console.log(error)
        finishedJobWithError(error?.message)
          
        }
        
    } catch (error) {
        console.log(error)
        finishedJobWithError(error?.message)
    }

  
  
    
}




const id = process.argv[2]
const version = process.argv[3]
const userName = process.argv[4]
processDataset(id, version, userName)


