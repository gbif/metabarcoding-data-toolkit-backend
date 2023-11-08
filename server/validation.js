import {uploadedFilesAndTypes, unzip} from '../validation/files.js'
import auth from './Auth/auth.js';
import {determineFileNames, otuTableHasSamplesAsColumns, otuTableHasSequencesAsColumnHeaders, hasIdColumn} from '../validation/tsvformat.js'
import {processWorkBookFromFile, readXlsxHeaders} from "../converters/excel.js"
import {getCurrentDatasetVersion, readTsvHeaders, getProcessingReport, getMetadata, writeProcessingReport, readMapping} from '../util/filesAndDirectories.js'
import _ from "lodash"
//import { getCurrentDatasetVersion, writeProcessingReport, getProcessingReport, getMetadata, readTsvHeaders, readMapping } from '../util/filesAndDirectories.js'

export const validate = async (id, user) => {
  try {
                
    let version = await getCurrentDatasetVersion(id)
    let files = await uploadedFilesAndTypes(id, version)
    let processionReport = await getProcessingReport(id, version)
    let metadata = await getMetadata(id, version)
   // const mapping = await readMapping(id, version);

    if(!processionReport){
      processionReport= {id: id, createdBy: user?.userName, createdAt: new Date().toISOString()}
    }
    if(!!metadata){
      processionReport.metadata = metadata
    }
   // console.log(files)
    if(files.format.startsWith('TSV')){
      const filePaths = await determineFileNames(id, version);
     // console.log(filePaths)
     const fileMap = _.keyBy(files.files, "type")

     let validationErrors = []
     let samplesAsColumns, errors, invalid;
      try {
         [samplesAsColumns, errors, invalid] = await otuTableHasSamplesAsColumns(fileMap, validationErrors);
      validationErrors = [...validationErrors, ...errors]
      if(invalid){
        files.format = "INVALID";
      }
      } catch (error) {
        validationErrors.push(error)
        files.invalidMessage = error
        files.format = "INVALID";
      }
      
      

      if(fileMap?.taxa?.path){
        // Check there is an "id" column in the taxon file
        const {term, errors: idInvalidErrors} = await hasIdColumn(fileMap?.taxa?.path, fileMap?.taxa?.properties?.delimiter);
        validationErrors = [...validationErrors, ...idInvalidErrors]
        if(!term) {
          files.format = "INVALID";
        }
      }

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
      
      let validationReport = {files: {...files, filePaths, samplesAsColumns, sequencesAsHeaders}}
      if(fileMap?.samples){
        validationReport.sampleHeaders = await readTsvHeaders(fileMap?.samples?.path, fileMap?.samples?.properties?.delimiter)
     
       
      }
      if(fileMap?.taxa){
        validationReport.taxonHeaders = await readTsvHeaders(fileMap?.taxa?.path, fileMap?.taxa?.properties?.delimiter)
      
      }
      const report = {...processionReport, unzip: false, ...validationReport}
      await writeProcessingReport(id,version, report)
      return report;

    } else if(files.format.startsWith('XLSX')) {
      console.log("XLSX coming in")
      let xlsx = files.files.find(f => f.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      let headers_ = {};
      let sheets_ = {};
      try {
         const {headers, sheets} = await readXlsxHeaders(id, xlsx?.name, version)
        
         headers_ = headers
         sheets_ = sheets
         const xlsxErrors = sheets.reduce((acc, curr) => [...acc, ...(curr?.errors || []).map(e => ({message: e}))],[])
         xlsx.errors = xlsxErrors;
      } catch (error) {
        if(typeof error === 'string'){
          xlsx.errors = [{file: xlsx.name, message: error}]
        }
        const report = {...processionReport, ...headers_, unzip: false, files:{...files, format: 'INVALID', id: id}};
        await writeProcessingReport(id, version, report)

        throw error
        
      }
    
      if(sheets_ && xlsx){
        xlsx.sheets = sheets_;
      }
     const report = {...processionReport, ...headers_, unzip: false, files:{...files, id: id}};
     await writeProcessingReport(id, version, report)
     return report
    } else if(files.format === 'ZIP') {
      await unzip(req.params.id, files.files[0].name)
      const report = {...processionReport, unzip: true, files:{...files, id: id}}
      await writeProcessingReport(id,version, report)
      return report
    } else {
      const report = {...processionReport, unzip: false, files:{...files, id: id}}
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