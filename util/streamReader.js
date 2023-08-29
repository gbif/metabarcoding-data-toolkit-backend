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

//This simply checks that there is an ID in the first pos in the array for a row
const recordHasRowId = record => {
  return !!record[0]
}

const getConsistencyCheckForSamples = (columns, dimensionXdataMap) => {
  const dimensionXSet = new Set([...dimensionXdataMap.keys()])
  const dimensionXidsWithNoRecordInDataFile = columns.filter(c => {
    if(dimensionXSet.has(c)){
      dimensionXSet.delete(c)
      return false
    } else {
      return true
    }
  })
  // Returns an array of sampleIDs that are not in the sample file and an arrary of sampleIDs not in the OTU table
  return {dimensionXidsWithNoRecordInDataFile, dimensionXidsWithNoRecordInOtuTable: [...dimensionXSet.keys()]}
}

export const readOtuTableToSparse = (path, progressFn = (progress, total, message, summary)=>{}, columnIdTerm, delimiter = "\t", dimensionXdataMap, dimensionYdataMap) => {
  return new Promise((resolve, reject) => {
  
    let dimensionYidsWithNoRecordInDataFile = [];

    const parser = parse( {
          delimiter: delimiter || "\t",
          columns: false,
          ltrim: true,
          rtrim: true,
          escape: '\\',

        })
      const dimensionYSet = new Set([...dimensionYdataMap.keys()])
      const records = [];
      let columns;
      let cols;
      const rows = [];
      let count = 0; // this is also the row index
      parser.on('readable', function(){
          let record;
          while ((record = parser.read()) !== null) {
            if(!columns){
              columns = record.slice(1);
           
            } else if(recordHasRowId(record) && dimensionYSet.has(record[0])) {
              record.slice(1).forEach((element, index) => {
                if(!isNaN(Number(element)) && Number(element) > 0 && dimensionXdataMap.has(columns[index])){
                  records.push([count, index, Number(element)])
                  
                }
              });
              // collect ordering of rows to sort metadata file
              rows.push(record[0]);
              dimensionYSet.delete(record[0]); // Remove the id so dimensionYSet end up with only ids missung in the OTU table
              count ++;
              if(count % 10000 === 0){
                console.log("Count "+count)
              }
              if(count % 1000 === 0){
                progressFn(count)
              }
            } else if(recordHasRowId(record) && !dimensionYSet.has(record[0])) {
              dimensionYidsWithNoRecordInDataFile.push(record[0])
            }  
           // console.log(`dimensionYSet has ${record[0]} :${dimensionYSet.has(record[0])}`)
           // console.log(`recordHasRowId ${record} :${recordHasRowId(record)}`)
          }
          // We are finished update to final count
          progressFn(count, count, 'Reading data', {sampleCount: columns.filter(c => dimensionXdataMap.has(c)).length, taxonCount: rows.length})

        });
        // Catch any error
        parser.on('error', function(err){
          console.error(err.message);
          reject(err)
        });
        // Test that the parsed records matched the expected records
        parser.on('end', function(){
          progressFn()
          resolve([records, rows, columns.filter(c => dimensionXdataMap.has(c)), {dimensionYidsWithNoRecordInDataFile, dimensionYidsWithNoRecordInOtuTable: [...dimensionYSet], ...getConsistencyCheckForSamples(columns, dimensionXdataMap)}])
        });
      const inputStream = fs.createReadStream(path);    
      inputStream.pipe(parser)
  })

}

export const readOtuTableToSparse_old = (path, progressFn = (progress, total, message, summary)=>{}, columnIdTerm, delimiter = "\t") => {
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
      let columns;
      const rows = [];
      let count = 0; // this is also the row index
      parser.on('readable', function(){
          let record;
          while ((record = parser.read()) !== null) {
            if(!columns){
              columns = record.slice(1).map(c => (c === columnIdTerm ? 'id' : c)); // This is the header which gives the column order for the matrix
           
            } else if(recordHasRowId(record)) {
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
          resolve([records, rows, columns])
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

export const readFastaAsMap = (path, progressFn = ()=>{},) => {
  return new Promise((resolve, reject) => {
    const parser = parse({
        delimiter: "\n",
        record_delimiter: ">",
        columns: false,
        ltrim: true,
        rtrim: true,
        relax_column_count: true
      })
    const records = new Map();
    let count = 0;
    parser.on('readable', function(){
        let record;
        while ((record = parser.read()) !== null) {
           
         // const splitted = record[0].split("\n")
          if(!!record[0] && !!record[1]){
            records.set(record[0], record[1])  
         count++;
          }
          
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

export const readDefaultValues = (path, delimiter = "\t") => {
  return new Promise((resolve, reject) => {
    const parser = parse({
      delimiter: delimiter,
      columns: false,
      ltrim: true,
      rtrim: true,
      relax_column_count: true,
      from_line: 2,
      escape: '\\',
      })
    const records = {};
    parser.on('readable', function(){
        let record;
        while ((record = parser.read()) !== null) {
           
         // const splitted = record[0].split("\n")
          if(!!record[0] && !!record[1]){
            records[record[0]] = record[1]  
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
  readMetaDataAsMap,
  readFastaAsMap,
  readDefaultValues
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