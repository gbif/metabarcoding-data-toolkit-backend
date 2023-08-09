import fs from 'fs'
import config from '../config.js'
import {execSync}  from 'child_process';
import filenames from './filenames.js'
import parse from 'csv-parse';
import streamReader from '../util/streamReader.js'
import {readTsvHeaders} from '../util/filesAndDirectories.js'
import _ from "lodash"
const dnaSequencePattern = /[ACGTURYSWKMBDHVNacgturyswkmbdhvn]/g
const minimumLengthForASequence = 100;


export const determineFileNames = async (id, version) => {
    console.log('determineFileNames')
    try {
        const fileList = await fs.promises.readdir(`${config.dataStorage}${id}/${version}/original`)
        console.log(fileList)
        const otutable = fileList.find(f => {
            let splitted = f.split('.') // ignore file extension
            let rawFileName = splitted.slice(0,-1).join('.').replace(/[^0-9a-z]/gi, '').toLowerCase();
            return filenames.otutable.indexOf(rawFileName) > -1;
        })
        console.log(`OTU table ${otutable}`)
        const samples = fileList.find(f => {
            let splitted = f.split('.')// ignore file extension
            let rawFileName = splitted.slice(0,-1).join('.').replace(/[^0-9a-z]/gi, '').toLowerCase();
            return filenames.samples.indexOf(rawFileName) > -1;
        })

        console.log(`samples ${samples}`)
        let taxa =  fileList.find(f => {
            let splitted = f.split('.')// ignore file extension
            let rawFileName = splitted.slice(0,-1).join('.').replace(/[^0-9a-z]/gi, '').toLowerCase();
            return filenames.taxa.indexOf(rawFileName) > -1;
        });

        console.log(`taxa ${taxa}`)
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
        return result;
    } catch (error) {
        console.log(error)
        throw error;
    }

}

// This function does more than just calculating the direction of the OTU table. It will test CSV parsing of the sample file and throw an error of more than 5% of the samples are not in the OTU table

export const otuTableHasSamplesAsColumns = async (files, sampleIdTerm) => {
    console.log("hasSamplesAsColumns")
    if(!files.samples){
        throw "No sample file"
    } else if(!files.otuTable){
        throw "No Otu table"
    }
    try {
       
        let samples = [];
        let errors = []
        try {
            console.log(`Sample file: ${files.samples.path} - delimiter ${ files.samples.properties.delimiter}`)
            samples = await streamReader.readMetaData(files.samples.path, ()=>{}, files.samples.properties.delimiter); // readTsvHeaders(`${config.dataStorage}${id}/${version}/original/${files.samples}`);
        } catch (error) {
            let splitted = files.samples.split("/");
            errors.push({file: splitted[splitted.length-1], message: error?.message})
            
            console.log(error?.message)
        }
        let otuTableColumns;
        try {
            console.log(`OTU table: ${files.otuTable.path} delimiter: ${files.otuTable.properties.delimiter}`)
            otuTableColumns = await readTsvHeaders(files.otuTable.path, files.otuTable.properties.delimiter);
           // console.log(otuTableColumns)
        } catch (error) {
            let splitted = files.otuTable.path.split("/");
            errors.push({file: splitted[splitted.length-1], message: error?.message})
            console.log(error?.message)
        }
       
       // const otuTableColumns = await readTsvHeaders(files.otuTable);
       
       
        const columns = new Set(otuTableColumns.slice(1));
        let sampleIdsNotInOtuTableColumns = [];
        samples.forEach(s => {
            if(!columns.has(s[sampleIdTerm])){
                sampleIdsNotInOtuTableColumns.push(s[sampleIdTerm]) // ++;
            }
        })
        console.log(`samples with no match in OTU table ${sampleIdsNotInOtuTableColumns.length}`)

        // Only generate this error if there is a mapping. Files are obviously uploaded before a mapping exists
        if(sampleIdTerm && sampleIdsNotInOtuTableColumns.length > 0){
            let splitted = files.otuTable.path.split("/");
            errors.push({file: splitted[splitted.length-1], message: `Some sampleIds are not in the OTU table: ${sampleIdsNotInOtuTableColumns.toString()}`})
        }
        // more than 95% of the samples has a corresponding column in the OTUtable - we could be more strict?
        const hasSamplesAsColumns = (sampleIdsNotInOtuTableColumns.length /  samples.length * 100 ) < 5;
        
        if(errors.length > 0){
           
            throw errors
        } else {
            return hasSamplesAsColumns;
        }
       

    } catch (error) {
        throw error;
    }
}

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
            if(columns[i].length < minimumLengthForASequence || !dnaSequencePattern.test(columns[i])){
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