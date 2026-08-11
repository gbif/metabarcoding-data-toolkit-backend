import {uploadedFilesAndTypes, unzip} from '../validation/files.js'
import auth from './Auth/auth.js';
import {determineFileNames, otuTableHasSamplesAsColumns, otuTableHasSequencesAsColumnHeaders, hasIdColumn} from '../validation/tsvformat.js'
import {getArrayIntersection} from '../validation/misc.js'
import {processWorkBookFromFile, readXlsxHeaders} from "../converters/excel.js"
import {getCurrentDatasetVersion, readTsvHeaders, getProcessingReport, getMetadata, writeProcessingReport, readMapping, writeMapping} from '../util/filesAndDirectories.js'
import {validateXlSX, validateFAIRe} from "../workers/supervisor.js"
import _ from "lodash"
import mapping from './mapping.js';
import validFileExtensions from '../enum/validFileExtensions.js';
import {readHDF5data} from '../converters/hdf5.js'
// Validations of the same dataset run one at a time.
//
// validateDataset reads the processing report at the start and writes it back at the end, so
// two overlapping runs lose each other's writes: the slower one is built on an older snapshot
// and reverts the fields the faster one wrote. The upload flow triggers validation several
// times (auto detection, again after the file types are saved, on delete, from /assay), and
// when the run without typed files happens to finish last it wipes the headers a later run
// had already written - so the report ends up reflecting whichever run finished last.
//
// They are queued, not deduplicated. A re-validation after the file types change is meant to
// run again, it is not the same work as the run before it.
const runningValidations = new Map();

export const isValidationRunning = (id) => runningValidations.has(id);

// The workbook validators write the report themselves and hand it back when they report
// success. Re-reading it from disk used to be the only way to get it, but getProcessingReport
// swallows every failure and returns null, so a failed read turned into a 200 with a null body
// or a TypeError on the next line. Only fall back to the disk copy, and say so if that fails.
const reportFromWorker = async (workerReport, id, version) => {

  if (!!workerReport) {
    return workerReport
  }
  const report = await getProcessingReport(id, version);
  if (!report) {
    throw `The validation of dataset ${id} finished but its report could not be read`
  }
  return report;
}

export const validate = async (id, user) => {

  const previous = runningValidations.get(id) || Promise.resolve();
  // run after the previous one whether it succeeded or failed
  const run = previous.then(() => validateDataset(id, user), () => validateDataset(id, user));

  // what is kept in the map must never reject - it is only used for ordering
  const tail = run.catch(() => {});
  runningValidations.set(id, tail);
  tail.then(() => {
    // only the last run in the chain clears the entry
    if (runningValidations.get(id) === tail) {
      runningValidations.delete(id)
    }
  });

  return run;
}

const validateDataset = async (id, user) => {
  try {

    let version = await getCurrentDatasetVersion(id)
    let processingReport = await getProcessingReport(id, version)
    let metadata = await getMetadata(id, version)

    if(!processingReport){
      processingReport= {id: id, createdBy: user?.userName,  createdAt: new Date().toISOString()}
    }
    if(!!metadata){
      processingReport.metadata = metadata
    }
   
    let files = await uploadedFilesAndTypes(id, version)
    
    console.log(files)
    /* console.log('processingReport?.files?.mapping')
    console.log(processingReport?.files?.mapping)
    if(processingReport?.files?.mapping && !_.isEmpty(processingReport?.files?.mapping)){
      files.mapping = processingReport?.files?.mapping
    } */
   // console.log(files)
    if(files?.format?.startsWith('TSV') || files?.format?.startsWith('BIOM_2_1')){
      const filePaths = await determineFileNames(id, version);
     // console.log(filePaths)
     const fileMap = _.keyBy(files.files, "type")

     // console.log(Object.keys(fileMap))

     let validationErrors = []
     let samplesAsColumns, errors, invalid, sampleId, taxonId;

     if(files?.format?.startsWith('TSV')){
      try {
        [samplesAsColumns, errors, invalid, sampleId] = await otuTableHasSamplesAsColumns(fileMap);
        validationErrors = [...validationErrors, ...errors]
        if(invalid){
          files.format = "INVALID";
        }
      } catch (error) {
       validationErrors.push(error)
       files.invalidMessage = error
       files.format = "INVALID";
      }
     } else if(files?.format?.startsWith('BIOM_2_1')){

      const ids = await readHDF5data(fileMap?.otuTable?.path, ["sample/ids", "observation/ids"]);
       [samplesAsColumns, errors, invalid, sampleId] = await otuTableHasSamplesAsColumns(fileMap, ids["sample/ids"], ids["observation/ids"]);
       validationErrors = [...validationErrors, ...errors]
        if(invalid){
          files.format = "INVALID";
        }
      // samplesAsColumns = true;
      // errors = []
     }
      
      
      

      if(fileMap?.taxa?.path){
        // Check there is an "id" column in the taxon file
        const {term, errors: idInvalidErrors} = await hasIdColumn(fileMap?.taxa?.path, fileMap?.taxa?.properties?.delimiter, files?.format?.startsWith('BIOM_2_1') ? "feature id" : "id" );
        validationErrors = [...validationErrors, ...idInvalidErrors]
        if(!term) {
          files.format = "INVALID";
        } else {
          taxonId = term
        }
      }

      const unknownTypeErrors = (files?.files || []).filter(f => !f?.type && validFileExtensions.includes(f?.name.split('.').pop())).map(f => ({file: f?.name, message: "Could not identify the data type. Is it OTU table, Taxonomy table, Sample table or Study defaults?"}))
      validationErrors = [...validationErrors, ...unknownTypeErrors]
      // Give the collected array of errors to the frontend
      files.invalidErrors = validationErrors;
      
           
      let sequencesAsHeaders = false;
     
      
      if(!samplesAsColumns){
        try {
          sequencesAsHeaders = await otuTableHasSequencesAsColumnHeaders(fileMap.otuTable)
        } catch (error) {
          console.log(error)
          sequencesAsHeaders = false;
          files.format = "INVALID";
         // files.invalidMessage = error
        }
      }
      
      let validationReport = {files: {...files, filePaths, samplesAsColumns, sequencesAsHeaders, mapping: processingReport?.files?.mapping || {}}}
      if(fileMap?.samples){
        validationReport.sampleHeaders = await readTsvHeaders(fileMap?.samples?.path, fileMap?.samples?.properties?.delimiter)
     
       
      }
      if(fileMap?.taxa){
        validationReport.taxonHeaders = await readTsvHeaders(fileMap?.taxa?.path, fileMap?.taxa?.properties?.delimiter)
      
      }

      if(fileMap?.defaultValues?.properties?.rows?.length > 1){
        validationReport.defaultValueTerms =  fileMap?.defaultValues?.properties?.rows.slice(1).map(i => i[0]).filter(i => !!i)
       // console.log(validationReport.defaultValueTerms)
      }

      if(validationReport.sampleHeaders && validationReport.taxonHeaders ){
        const sampeTaxonHeaderIntersection = getArrayIntersection(validationReport?.sampleHeaders.filter(s => s !== sampleId), validationReport?.taxonHeaders).filter(t => t !== taxonId);
         if(sampeTaxonHeaderIntersection.length > 0) {
          const plural = sampeTaxonHeaderIntersection.length > 1;
          
          const taxFile = files.files.find(f => f?.type === 'taxa')
          if(taxFile){
            taxFile.errors = taxFile.errors || [];
            taxFile.errors.push({file: fileMap.taxa.name, message: `The column${plural ? 's':''} ${sampeTaxonHeaderIntersection.join(', ')} ${plural ? 'are' : 'is'} present in both the sample and taxon file. Only the value from the sample file will be added to the DWC archive.`})
          }
          
        
         }
      }

      if(validationReport.sampleHeaders && validationReport.defaultValueTerms ){
        const studySampleIntersection = getArrayIntersection(validationReport?.sampleHeaders, validationReport.defaultValueTerms);
         if(studySampleIntersection.length > 0) {
          const plural = studySampleIntersection.length > 1;
          
          const studyFile = files.files.find(f => f?.type === 'defaultValues')
          if(studyFile){
            studyFile.errors = studyFile.errors || [];
            studyFile.errors.push({file: fileMap.defaultValues.name, message: `The term${plural ? 's':''} ${studySampleIntersection.join(', ')} ${plural ? 'are' : 'is'} present in both the sample and study file. Only the value from the study file will be added to the DWC archive.`})
          }
        
         }
      }

      if(validationReport.defaultValueTerms && validationReport.taxonHeaders ){
        const studyTaxonIntersection = getArrayIntersection(validationReport?.defaultValueTerms, validationReport?.taxonHeaders);
         if(studyTaxonIntersection.length > 0) {
          const plural = studyTaxonIntersection.length > 1;
          
          const studyFile = files.files.find(f => f?.type === 'defaultValues')
          if(studyFile){
            studyFile.errors = studyFile.errors || [];
            studyFile.errors.push({file: fileMap.defaultValues.name, message: `The term${plural ? 's':''} ${studyTaxonIntersection.join(', ')} ${plural ? 'are' : 'is'} present in both the taxon and study file. Only the value from the study file will be added to the DWC archive.`})
          }        
        
         }
      }
      const oldMapping = await readMapping(id, version);

      const newMapping = oldMapping ? {...oldMapping, samples: {...oldMapping.samples, id: sampleId}, taxa: {...oldMapping.taxa, id: taxonId}} : {samples: {id: sampleId}, taxa: {id: taxonId}}
      await writeMapping(id, version, newMapping)
      const report = {...processingReport, unzip: false, ...validationReport}
      await writeProcessingReport(id,version, report)
      return report;

    } /* else if(files?.format?.startsWith('BIOM_2_1')) {

      const filePaths = await determineFileNames(id, version);
     // console.log(filePaths)
     const fileMap = _.keyBy(files.files, "type")

     // console.log(Object.keys(fileMap))

     let validationErrors = []
     
      
      

      if(fileMap?.taxa?.path){
        // Check there is an "id" column in the taxon file
        const {term, errors: idInvalidErrors} = await hasIdColumn(fileMap?.taxa?.path, fileMap?.taxa?.properties?.delimiter);
        validationErrors = [...validationErrors, ...idInvalidErrors]
        if(!term) {
          files.format = "INVALID";
        }
      }

      const unknownTypeErrors = (files?.files || []).filter(f => !f?.type).map(f => ({file: f?.name, message: "Could not identify the data type. Is it OTU table, Taxonomy table, Sample table or Study defaults?"}))
      validationErrors = [...validationErrors, ...unknownTypeErrors]
      // Give the collected array of errors to the frontend
      files.invalidErrors = validationErrors;



    } */ else if(files?.format?.startsWith('XLSX')) {
    /*   console.log("XLSX coming in")
      let xlsx = files.files.find(f => f.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || f?.name?.endsWith('.xlsx'))
      let headers_ = {};
      let sheets_ = {};
      try {

         const {headers, sheets} = await readXlsxHeaders(id, xlsx?.name, version)

         headers_ = headers
         sheets_ = sheets

         const xlsxErrors = sheets.reduce((acc, curr) => [...acc, ...(curr?.errors || []).map(e => ({message: e}))],[])
         xlsx.errors = xlsxErrors;
         

         const sampeTaxonHeaderIntersection = getArrayIntersection(headers?.sampleHeaders, headers?.taxonHeaders);

         if(sampeTaxonHeaderIntersection.length > 0) {
          const plural = sampeTaxonHeaderIntersection.length > 1;
          xlsx.errors.push({file: xlsx.name, message: `The column${plural ? 's':''} ${sampeTaxonHeaderIntersection.join(', ')} ${plural ? 'are' : 'is'} present in both the sample and taxon sheet. Only the value from the sample sheet will be added to the DWC archive.`})
         }
      } catch (error) {
        if(typeof error === 'string'){
          xlsx.errors = [{file: xlsx.name, message: error}]
        }
        const report = {...processingReport, ...headers_, unzip: false, files:{...files, format: 'INVALID', id: id}};
        await writeProcessingReport(id, version, report)

        throw error
        
      }
    
      if(sheets_ && xlsx){
        xlsx.sheets = sheets_;
      }
     const report = {...processingReport, ...headers_, unzip: false, files:{...files, id: id}};
     await writeProcessingReport(id, version, report) */
     console.log("Validating XLSX "+ files )
     const validation = await validateXlSX(id, version, user?.userName)
     processingReport = await reportFromWorker(validation, id, version)
     if(!!metadata){
      processingReport.metadata = metadata
    }
     return processingReport
    } else if (files?.format === 'FAIRe') {
      console.log("Validating FAIRe " + files)
      const validation = await validateFAIRe(id, version, user?.userName)
      processingReport = await reportFromWorker(validation, id, version)
      if (!!metadata) {
        processingReport.metadata = metadata
      }
      return processingReport
    } else if(files.format === 'ZIP') {
      await unzip(req.params.id, files.files[0].name)
      const report = {...processingReport, unzip: true, files:{...files, id: id}}
      await writeProcessingReport(id,version, report)
      return report
    } else {
      const report = {...processingReport, unzip: false, files:{...files, id: id}}
      await writeProcessingReport(id,version, report)
      return report
    } 
} catch (error) {
    throw error
}
}

export default (app) => {
    app.get("/validate/:id", auth.appendUser(), async function (req, res) {
        if (!req.params.id) {
          res.sendStatus(404);
        } else {
            console.log(`Validating ${req.params.id}`)
            try {            
                let report = await validate(req?.params?.id, req?.user)
                // Strip server-side-only fields from metadata before sending to client
                if (report?.metadata?.faire_description !== undefined) {
                    const { faire_description, ...clientMetadata } = report.metadata;
                    report = { ...report, metadata: clientMetadata };
                }
                res.json(report)
            } catch (error) {
                if(error === 'not found'){
                  res.sendStatus(404);
                } else if(typeof error === 'string') {
                  res.status(422).send(error)
                } else {
                  res.sendStatus(500);
                }
                console.log(error)
                
            }
          
        }
      });
}