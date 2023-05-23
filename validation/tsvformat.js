import fs from 'fs'
import config from '../config.js'
import {execSync}  from 'child_process';
import filenames from './filenames.js'
import parse from 'csv-parse';
import streamReader from '../util/streamReader.js'
import {readTsvHeaders} from '../util/filesAndDirectories.js'
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
            samples = await streamReader.readMetaData(files.samples); // readTsvHeaders(`${config.dataStorage}${id}/${version}/original/${files.samples}`);
        } catch (error) {
            let splitted = files.samples.split("/");
            errors.push({file: splitted[splitted.length-1], message: error?.message})
            
            console.log(error?.message)
        }
        let otuTableColumns;
        try {
            otuTableColumns = await readTsvHeaders(files.otuTable);
        } catch (error) {
            let splitted = files.otuTable.split("/");
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
            let splitted = files.otuTable.split("/");
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

export const otuTableHasSequencesAsColumnHeaders = async files => {
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
}