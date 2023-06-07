import {uploadedFilesAndTypes, unzip} from '../validation/files.js'
import auth from './Auth/auth.js';
import {determineFileNames, otuTableHasSamplesAsColumns, otuTableHasSequencesAsColumnHeaders, analyseCsv} from '../validation/tsvformat.js'
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
    const mapping = await readMapping(id, version);

    if(!processionReport){
      processionReport= {id: id, createdBy: user?.userName}
    }
    if(!!metadata){
      processionReport.metadata = metadata
    }
   // console.log(files)
    if(files.format.startsWith('TSV')){
      const filePaths = await determineFileNames(id, version);
     // console.log(filePaths)
     const fileMap = _.keyBy(files.files, "type")

      let samplesAsColumns;
      try {
       samplesAsColumns  = await otuTableHasSamplesAsColumns(fileMap, mapping ?  _.get(mapping, 'samples.id', 'id') : null);
      } catch (errors) {
        console.log(errors)
        samplesAsColumns = false;
        files.format = "INVALID";
        files.invalidErrors = errors;
       // files.invalidMessage = error

      }
                 
      let sequencesAsHeaders = false;
     
      if(!samplesAsColumns){
        try {
          sequencesAsHeaders = await otuTableHasSequencesAsColumnHeaders(fileMap.otuTable)
        } catch (error) {
          console.log(error)
          sequencesAsHeaders = false;
          files.format = "INVALID";
          files.invalidMessage = error
        }
      }
      
      let validationReport = {files: {...files, filePaths, samplesAsColumns, sequencesAsHeaders}}
      if(fileMap?.samples){
        validationReport.sampleHeaders = await readTsvHeaders(fileMap?.samples?.path, fileMap?.samples?.properties?.delimiter)
      /*  const csvProperties = await analyseCsv(filePaths?.samples);
       if(csvProperties?.headers){
          validationReport.sampleHeaders = csvProperties?.headers
       }; */
       
      }
      if(fileMap?.taxa){
        validationReport.taxonHeaders = await readTsvHeaders(fileMap?.taxa?.path, fileMap?.taxa?.properties?.delimiter)
       /*  const csvProperties = await analyseCsv(filePaths?.taxa);
       if(csvProperties?.headers){
          validationReport.taxonHeaders = csvProperties?.headers
       }; */
      }
      const report = {...processionReport, unzip: false, ...validationReport}
      await writeProcessingReport(id,version, report)
      return report;

    } else if(files.format === 'XLSX') {
      console.log("XLSX coming in")
      let headers;
      try {
         headers = await readXlsxHeaders(id, files?.files[0]?.name, version)
        
      } catch (error) {
        console.log(error)
      }
    
     const report = {...processionReport, ...headers, unzip: false, files:{...files, id: id}};
     await writeProcessingReport(id,version, report)
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
               // console.log(error)
                res.sendStatus(404);
            }

          
        }
      });
}