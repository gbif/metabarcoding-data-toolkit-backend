import fs from 'fs'
import config from '../config.js'
import {execSync}  from 'child_process';
import filenames from './filenames.js'
import parse from 'csv-parse';
import streamReader from '../util/streamReader.js'
import {readTsvHeaders, getProcessingReport, writeMapping, readMapping} from '../util/filesAndDirectories.js'
import {objectSwap} from '../util/index.js'
import _ from "lodash"
const dnaSequencePattern = /[ACGTURYSWKMBDHVNacgturyswkmbdhvn]/g
const minimumLengthForASequence = 75;




export const determineFileNames = async (id, version) => {


    try {
        
        let entityToFilename = {}
        try {
            let processingReport = await getProcessingReport(id, version)
            const fileMapping = processingReport?.files?.mapping && !_.isEmpty(processingReport?.files?.mapping) ? processingReport?.files?.mapping : {};
            entityToFilename = objectSwap(fileMapping)
        } catch (error) {
            console.log(error)
        }
        const fileList = await fs.promises.readdir(`${config.dataStorage}${id}/${version}/original`)
        const otutable = entityToFilename?.otuTable || fileList.find(f => {
            let splitted = f.split('.') // ignore file extension
            let rawFileName = splitted.slice(0,-1).join('.').replace(/[^0-9a-z]/gi, '').toLowerCase();
            return filenames.otuTable.indexOf(rawFileName) > -1;
        })
     //   console.log(`OTU table ${otutable}`)
        const samples = entityToFilename?.samples || fileList.find(f => {
            let splitted = f.split('.')// ignore file extension
            let rawFileName = splitted.slice(0,-1).join('.').replace(/[^0-9a-z]/gi, '').toLowerCase();
            return filenames.samples.indexOf(rawFileName) > -1;
        })

     //   console.log(`samples ${samples}`)
        let taxa = entityToFilename?.taxa || fileList.find(f => {
            let splitted = f.split('.')// ignore file extension
            let rawFileName = splitted.slice(0,-1).join('.').replace(/[^0-9a-z]/gi, '').toLowerCase();
            return filenames.taxa.indexOf(rawFileName) > -1;
        });

        let defaultValues = entityToFilename?.defaultValues || fileList.find(f => {
            let splitted = f.split('.')// ignore file extension
            let rawFileName = splitted.slice(0,-1).join('.').replace(/[^0-9a-z]/gi, '').toLowerCase();
            return filenames.defaultValues.indexOf(rawFileName) > -1;
        });

    //    console.log(`taxa ${taxa}`)
        let result =  {};
        if(taxa){
            result.taxa = `${config.dataStorage}${id}/${version}/original/${taxa}`
        }
        if(otutable){
            result.otuTable = `${config.dataStorage}${id}/${version}/original/${otutable}`
        }
        if(samples){
            result.samples = `${config.dataStorage}${id}/${version}/original/${samples}`
        }
        if(defaultValues){
            result.defaultValues = `${config.dataStorage}${id}/${version}/original/${defaultValues}`
        }
        return result;
    } catch (error) {
        console.log(error)
        throw error;
    }

}

// Check if there is an ID column in a tsv
export const hasIdColumn = async (path, delimiter, idName = "id") => {

    const columns = await readTsvHeaders(path, delimiter);
           // Accept id case insensitive
    const term =  columns.find(c => !!c && c.toLowerCase() === idName) || columns?.[0]//columns.find(c => !!c && c.toLowerCase() === idName);
   let  errors = []
    if(!term){
        
        let splitted = path.split("/");
        errors.push({file: splitted[splitted.length-1], message: `No "${idName}" column found in file ${splitted[splitted.length-1]}`})

    } else if(term?.toString()?.trim() !== idName ){
        
        let splitted = path.split("/");
        errors.push({file: splitted[splitted.length-1], message: `No id column found in file ${splitted[splitted.length-1]}. Using column "${term}" instead. This can be changed in the mapping step.`})
    }
    return { term, errors};
} 
// This function does more than just calculating the direction of the OTU table. It will test CSV parsing of the sample file and throw an error of more than 5% of the samples are not in the OTU table

export const otuTableHasSamplesAsColumns = async (files, columnIds, rowIds) => {
    // console.log("hasSamplesAsColumns")
    if(!files.samples && !files.otuTable){
        throw "No Otu table and no sample file"
    }
    else if(!files.samples){
        throw "No sample file"
    } else if(!files.otuTable){
        throw "No Otu table"
    }
    try {
       
        let samples = [];
        // This is the ID in the sample file, case insensitive
        let sampleIdTerm;
        let errors = []
        try {
           // console.log(`Sample file: ${files.samples.path} - delimiter ${ files.samples.properties.delimiter}`)
            samples = await streamReader.readMetaData(files.samples.path, ()=>{}, files.samples.properties.delimiter); // readTsvHeaders(`${config.dataStorage}${id}/${version}/original/${files.samples}`);
            const {term, errors: idErrors} = await hasIdColumn(files.samples.path, files.samples.properties.delimiter)
            sampleIdTerm = term;
            errors = [...errors, ...idErrors]

        } catch (error) {
            let splitted = files.samples.path.split("/");
            errors.push({file: splitted[splitted.length-1], message: error?.message})
            
            console.log(error?.message)
        }
        console.log("The sample id term is: "+sampleIdTerm)
        let otuTableColumns =  columnIds || files.otuTable.properties.headers; 
        let otuTableRowIds =  rowIds || files.otuTable.properties.rows.slice(1).map(r => r[0]);

        const otuTableColumnsAreTruncated = ((files?.otuTable?.properties?.columnLimit || 0) < (files?.otuTable?.properties?.numColumns || 0))

       /*  try {
            console.log(`OTU table: ${files.otuTable.path} delimiter: ${files.otuTable.properties.delimiter}`)
            otuTableColumns =  files.otuTable.properties.headers; // await readTsvHeaders(files.otuTable.path, files.otuTable.properties.delimiter);
           // console.log(otuTableColumns)
        } catch (error) {
            let splitted = files.otuTable.path.split("/");
            errors.push({file: splitted[splitted.length-1], message: error?.message})
            console.log(error?.message)
        } */
        
        
       // const otuTableColumns = await readTsvHeaders(files.otuTable);
       
       // Check if samples are columns
        const columns = new Set(otuTableColumns.slice(1));
        const sampleIds = new Set(samples.map(s => s[sampleIdTerm]))
        let sampleIdsNotInOtuTableColumns = [];
        let otuTableColumnsNotInSamples = [];
        samples.forEach(s => {
            if(!columns.has(s[sampleIdTerm])){
                sampleIdsNotInOtuTableColumns.push(s[sampleIdTerm]) // ++;
            }
        })
        otuTableColumns.slice(1).forEach(s => {
            if(!sampleIds.has(s)){
                otuTableColumnsNotInSamples.push(s);
            }
        })
       // console.log(`samples with no match in OTU table ${sampleIdsNotInOtuTableColumns.length}`)
        // Check if samples are rows
        const rows = new Set(otuTableRowIds)
        let sampleIdsNotInOtuTableRowIds = [];
        let otuTableRowIdsNotInSamples = []
        samples.forEach(s => {
            if(!rows.has(s[sampleIdTerm])){
                sampleIdsNotInOtuTableRowIds.push(s[sampleIdTerm]) // ++;
            }
        })
        otuTableRowIds.forEach(rid => {
            if(!sampleIds.has(rid)){
                otuTableRowIdsNotInSamples.push(rid);
            }
        })

        let hasSamplesAsColumns = true;
        // If there are more sample matches in rows than columns, samples must be in the rows (Y dimension)
        if(otuTableRowIdsNotInSamples.length < otuTableColumnsNotInSamples.length) {
            hasSamplesAsColumns = false;
        }

       if(hasSamplesAsColumns){
        if(!otuTableColumnsAreTruncated && sampleIdTerm && sampleIdsNotInOtuTableColumns.length > 0){
            let splitted = files.samples.path.split("/");
            
            errors.push({
                file: splitted[splitted.length-1], 
                message: `Attention: ${sampleIdsNotInOtuTableColumns.length} of ${samples.length} sample IDs in the Sample table has no matching column in the OTU table. Non-matching IDs will be excluded from the final dataset.`})
        }
        if(sampleIdTerm && otuTableColumnsNotInSamples.length > 0){
            let splitted = files.otuTable.path.split("/");
            errors.push({
                file: splitted[splitted.length-1], 
                message: `Attention: ${otuTableColumnsNotInSamples.length} of ${otuTableColumns.length -1} sample IDs in the OTU table has no matching row in the Sample table. Non-matching IDs will be excluded from the final dataset.`})
            }
       } else {
       /*  if(sampleIdTerm && sampleIdsNotInOtuTableRowIds.length > 0){
            let splitted = files.samples.path.split("/");
            console.log(`sampleIdsNotInOtuTableRowIds:::::`)
            console.log(sampleIdsNotInOtuTableRowIds)
            errors.push({
                file: splitted[splitted.length-1], 
                message: `${rows.size > 98 ? 'At least ':''}${sampleIdsNotInOtuTableRowIds.length} of ${samples.length} samples are not in the OTU table`})
        } */
        if(sampleIdTerm && otuTableRowIdsNotInSamples.length > 0){
            let splitted = files.otuTable.path.split("/");
            // console.log(`otuTableRowIdsNotInSamples:::::`)
           // console.log(otuTableRowIdsNotInSamples)
            errors.push({
                file: splitted[splitted.length-1], 
                message: `${rows.size > 98 ? 'At least ':''}${otuTableRowIdsNotInSamples.length} ${rows.size < 99 ? 'of '+  Number(otuTableColumns.length -1) : '' } rows in the OTU table does not have a corresponding row in the sample file`})
            }
       }

        
       // console.log(`##### hasSamplesAsColumns `+hasSamplesAsColumns)
        return [
            hasSamplesAsColumns, // samples are in the column dimension ofg the matrix
            errors, // errors to report to the user
            !sampleIdTerm, // invalid?
            sampleIdTerm // the sample id
        ]
       /*  if(errors.length > 0){
           
            throw errors
        } else {
            return hasSamplesAsColumns;
        } */
       

    } catch (error) {
        throw error;
    }
}
export const stringIsDNASequence = str => str.length > minimumLengthForASequence && dnaSequencePattern.test(str)

export const otuTableHasSequencesAsColumnHeaders = async (otuTable) => {
    // console.log("otuTableHasSequencesAsColumnHeaders")
    if(!otuTable){
        throw "No Otu table"
    }
    try {
        const otuTableColumns = await readTsvHeaders(otuTable.path, otuTable.properties.delimiter);
        const columns = otuTableColumns.slice(1);
        console.log("Number of columns "+columns.length)
        let isSequenceHeaders = true;

        for(let i = 0; i < Math.min(columns.length, 10); i++){
            if(!stringIsDNASequence(columns[i])){
                isSequenceHeaders = false;
            }
        }
        return isSequenceHeaders;      

    } catch (error) {
        throw error;
    }
}



/* export const otuTableHasSequencesAsColumnHeaders = async (files) => {
    console.log("otuTableHasSequencesAsColumnHeaders")
    if(!files.otuTable){
        throw "No Otu table"
    }
    try {
        const otuTableColumns = await readTsvHeaders(files.otuTable);
        const columns = otuTableColumns.slice(1);
        console.log("Number of columns "+columns.length)
        let isSequenceHeaders = true;

        for(let i = 0; i < Math.min(columns.length, 10); i++){
            if(columns[i].length < minimumLengthForASequence || !dnaSequencePattern.test(columns[i])){
                isSequenceHeaders = false;
            }
        }
        return isSequenceHeaders;      

    } catch (error) {
        throw error;
    }
} */


export const testDelimiter = async (file, delimiter) => {

    const COLUMN_LIMIT = 100;

    return new Promise((resolve, reject) => {
        let rows = [];
        let numColumns = 0;
        let isInConsistent = false;
        const parser = parse({
            delimiter: delimiter ,
           // columns: true,
            ltrim: true,
            rtrim: true,
            escape: '\\',
            to_line: 100
          })    
          parser.on('readable', function(){
            let record;
            while ((record = parser.read()) !== null) {
               rows.push(record)
               if(numColumns > 0 && record.length !== numColumns){
                isInConsistent = true
               }
               numColumns = record.length
            }
          });
          // Catch any error
          parser.on('error', function(err){
           // console.log(`Doesn´t look like the delimiter is ${delimiter === "\t" ? '<tab>' : '"'+delimiter+'"'}`)
            // console.error(err.message);
            reject(err)
          });
          // Test that the parsed records matched the expected records
          parser.on('end', function(){

            resolve({
                headers: numColumns > COLUMN_LIMIT  ? rows[0].slice(0, COLUMN_LIMIT) : rows[0],
                delimiter,
                rows: numColumns > COLUMN_LIMIT ? rows.map(r => r.slice(0, COLUMN_LIMIT)) : rows,
                isInConsistent,
                numColumns,
                columnLimit:  COLUMN_LIMIT
            })
          });
        const inputStream = fs.createReadStream(file);    
        inputStream.pipe(parser)
    })
    
}

const delimiters = [';', '\t', '|', ','];

export const analyseCsv = async file => {

    try {
        const candidates = await Promise.allSettled(delimiters.map(d => testDelimiter(file, d)))
      // console.log(candidates.filter(c => c.status = "fulfilled").map(c => `${c.delimiter}  :  num columns: ${c.numColumns} is inconsistent: ${c.isInConsistent}`).join('\n'))

        const bestGuess = _.maxBy(candidates.filter(c => c.status = "fulfilled").map(c => c.value), 'numColumns') 

        return bestGuess;
    } catch (error) {
        //console.log(error)
    }
       

        
}