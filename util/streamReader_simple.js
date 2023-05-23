// This is simply the stream reader without the processFn used to report progress. For command line purposes it will be nice to have a "clean" converter

import fs from 'fs';
import parse from 'csv-parse';

export const readOtuTable = (path) => {
    return new Promise((resolve, reject) => {
        const parser = parse( {
            delimiter: "\t",
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

export const readOtuTableToSparse = (path) => {
  return new Promise((resolve, reject) => {
      const parser = parse( {
          delimiter: "\t",
          columns: false,
          ltrim: true,
          rtrim: true,
         // quote: null
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
              colums = record.slice(1); // This is the header which gives the column order for the matrix
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
          resolve([records, rows, colums])
        });
      const inputStream = fs.createReadStream(path);    
      inputStream.pipe(parser)
  })

}

export const readMetaData = (path) => {
      return new Promise((resolve, reject) => {
        const parser = parse({
            delimiter: "\t",
            columns: true,
            ltrim: true,
            rtrim: true,
            escape: '\\',

           // quote: null,
          })
        const records = [];
        let count = 0;
        parser.on('readable', function(){
            let record;
            while ((record = parser.read()) !== null) {
              records.push(record);
              count ++;
              if(count % 10000 === 0){
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

export const readMetaDataAsMap = (path, idHeader = 'id') => {
    return new Promise((resolve, reject) => {
      const parser = parse({
          delimiter: "\t",
          columns: true,
          ltrim: true,
          rtrim: true,
          escape: '\\',

        //  quote: null,
        })
      const records = new Map();
      parser.on('readable', function(){
          let record;
          while ((record = parser.read()) !== null) {
             // console.log(record)
            
            records.set(record[idHeader], record)  //.push(record);
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