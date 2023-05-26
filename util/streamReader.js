/* const fs = require("fs");
const parse = require("csv-parse"); */
import fs from 'fs';
import parse from 'csv-parse';

const objectSwap = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, k]))

// import streamReader from '../util/streamreader.js';

export const readOtuTable = (path,  progressFn = ()=>{}, delimiter = "\t") => {
    return new Promise((resolve, reject) => {
        const parser = parse( {
            delimiter: delimiter || "\t",
            columns: false,
            ltrim: true,
            rtrim: true,
            escape: '\\',
         //   quote: null,
            from_line: 2
          })
        const records = [];
        let count = 0;
        parser.on('readable', function(){
            let record;
            while ((record = parser.read()) !== null) {
              records.push(record);
              count ++;
              if(count % 10000 === 0){
                console.log("Count "+count)
              }
            }
          });
          // Catch any error
          parser.on('error', function(err){
            console.error(err.message);
            reject(err)
          });
          // Test that the parsed records matched the expected records
          parser.on('end', function(){
            resolve(records)
          });
        const inputStream = fs.createReadStream(path);    
        inputStream.pipe(parser)
    })

}

export const readOtuTableToSparse = (path, progressFn = (progress, total, message, summary)=>{}, columnIdTerm, delimiter = "\t") => {
  return new Promise((resolve, reject) => {
      const parser = parse( {
          delimiter: delimiter || "\t",
          columns: false,
          ltrim: true,
          rtrim: true,
          escape: '\\',

       //   quote: null
         // from_line: 2
        })
      const records = [];
      let colums;
      const rows = [];
      let count = 0; // this is also the row index
      parser.on('readable', function(){
          let record;
          while ((record = parser.read()) !== null) {
            if(!colums){
              colums = record.slice(1).map(c => (c === columnIdTerm ? 'id' : c)); // This is the header which gives the column order for the matrix
            } else {
              record.slice(1).forEach((element, index) => {
                if(!isNaN(Number(element)) && Number(element) > 0){
                  records.push([count, index, Number(element)])
                  
                }
              });
              // collect ordering of rows to sort metadata file
              rows.push(record[0]);
              count ++;
              if(count % 10000 === 0){
                console.log("Count "+count)
              }
              if(count % 1000 === 0){
                progressFn(count)
              }
            }       
          }
          // We are finished update to final count
          progressFn(count)
        });
        // Catch any error
        parser.on('error', function(err){
          console.error(err.message);
          reject(err)
        });
        // Test that the parsed records matched the expected records
        parser.on('end', function(){
          resolve([records, rows, colums])
        });
      const inputStream = fs.createReadStream(path);    
      inputStream.pipe(parser)
  })

}

export const readMetaData = (path,  progressFn = ()=>{}, delimiter = "\t") => {
      return new Promise((resolve, reject) => {
        const parser = parse({
            delimiter: delimiter || "\t",
            columns: true,
            ltrim: true,
            rtrim: true,
            escape: '\\',

          //  quote: null,
          })
        const records = [];
        let count = 0;
        parser.on('readable', function(){
            let record;
            while ((record = parser.read()) !== null) {
              records.push(record);
              count ++;
              if(count % 1000 === 0){
                progressFn(count)
              //  console.log("Count "+count)
              }
            }
          });
          // Catch any error
          parser.on('error', function(err){
            console.error(err.message);
            reject(err)
          });
          // Test that the parsed records matched the expected records
          parser.on('end', function(){
            resolve(records)
          });
        const inputStream = fs.createReadStream(path);    
        inputStream.pipe(parser)
    })
}

export const readMetaDataAsMap = (path, /* idHeader = 'id', */ progressFn = ()=>{}, mapping = {}, delimiter = "\t") => {

  /**
 * Use a mapping object to rename terms corresponding to DWC / MiXS
 */
const reverseMapping = objectSwap(mapping)

const mapRecord = record => {
  // return record;
 return Object.keys(record).reduce((acc, key) => {
      if(reverseMapping[key]){
        // console.log(reverseMapping[key])
        acc[reverseMapping[key]] = record[key]
      } else {
        acc[key] = record[key]
      }
    return acc;
  }, {})
}
// End mapping utils

    return new Promise((resolve, reject) => {
      const parser = parse({
          delimiter: delimiter || "\t",
          columns: true,
          ltrim: true,
          rtrim: true,
          escape: '\\',

        //  quote: null,
        })
      const records = new Map();
      let count = 0;
      parser.on('readable', function(){
          let record;
          while ((record = parser.read()) !== null) {
             // console.log(record)
            // If mapping is used correct, an id should be guaranteed
            const mappedRecord = mapRecord(record);
            if(!mappedRecord?.id){
              console.log("Mapped Record")
              console.log(mappedRecord)
              console.log("Record")
              console.log(record)
            }
            

            records.set(mappedRecord.id, mappedRecord)  
           count++;
            if(count % 1000 === 0){
              try {
                progressFn(count)
              } catch (error) {
                console.log(error)
              }
              
              //  console.log("Count "+count)
              } 
          }
        });
        // Catch any error
        parser.on('error', function(err){
          console.error(err.message);
          reject(err)
        });
        // Test that the parsed records matched the expected records
        parser.on('end', function(){
          resolve(records)
        });
      const inputStream = fs.createReadStream(path);    
      inputStream.pipe(parser)
  })
}

export default {
  readOtuTable,
  readOtuTableToSparse,
  readMetaData,
  readMetaDataAsMap
}

/* module.exports = {
    readOtuTable,
    readOtuTableToSparse,
    readMetaData,
    readMetaDataAsMap
} */

/* const test = () => {
   // readMetaData('../input/biowide/sample.tsv')
   readOtuTable('../input/biowide/OTU_table.tsv')
}

test() */