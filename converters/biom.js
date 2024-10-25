import streamReader from '../util/streamReader.js'
import fs from 'fs';
import {Biom} from 'biojs-io-biom';
import _ from 'lodash'
import {getGroupMetaDataAsJsonString} from '../validation/termMapper.js'
import {getMetaDataRow, getTaxonomyArray} from '../util/index.js'
import {readHDF5} from './hdf5.js'
/* const getMetaDataRow = row => {
    if(!row?.id){
       console.log(row)
    }
    try {
        return {id: row.id, metadata: row}
    } catch (error) {
       console.log(error)
    }
    
    } */
const getReadCount = (biom, column) => biom.getDataColumn(column).reduce((partialSum, a) => partialSum + Number(a), 0);

// Calculate total reads in sample and set in metadata
export const addReadCounts = async (biom, processFn = (progress, total, message, summary) => {}) => {
    return new Promise((resolve, reject) => {
        try {
            
            const length =  biom.columns.length
            processFn(0, length)
            const readCounts = biom.columns.map((c, idx) => {
                const readCount = getReadCount(biom, c.id)
                if((idx +1 )% 10 === 0){
                    processFn(idx +1, length)
                }
                return readCount;
            });
            biom.addMetadata({dimension: 'columns', attribute: 'readCount', values: readCounts}) 
            resolve(biom) 
        } catch (error) {
            reject(error)
        }
    })
}

const getColumnIdTerm = (samplesAsColumns, termMapping) => {
    console.log("samplesAsColumns "+samplesAsColumns)
    console.log(`Term ${_.get(termMapping, 'samples.id')}`)
    return samplesAsColumns ? _.get(termMapping, 'samples.id', 'id') :_.get(termMapping, 'taxa.id', 'id')
}

export const metaDataFileToMap = async (file, mapping, processFn = (progress, total, message, summary) => {}, formatKey = (key) => key) => {
    const data = await streamReader.readMetaDataAsMap(file?.path, processFn, mapping, file?.properties?.delimiter, formatKey = (key) => key)
    return data;
}

// converts an otu table with sample and taxon metada files to BIOM format
export const toBiom = async ({otuTableFile, samples, taxa, samplesAsColumns = false, processFn = (progress, total, message, summary) => {}, termMapping = { taxa: {}, samples: {}, defaultValues: {}}, id}) => {
    console.log("SAMPLES AS COLUMNS: "+samplesAsColumns)
   /*  processFn(0, 0, 'Reading sample file')
    const samples = await streamReader.readMetaDataAsMap(sampleFile, processFn, termMapping.samples)
     processFn(0, 0, 'Reading taxon file', {sampleCount: samples.size});
    const taxa = await streamReader.readMetaDataAsMap(taxaFile,  processFn, termMapping.taxa)
    processFn(0, taxa.size, 'Reading OTU table', {taxonCount: taxa.size}); */

    console.log(`Taxa: ${taxa.size} samples: ${samples.size}`) 
    const columnIdTerm = getColumnIdTerm(samplesAsColumns, termMapping)
    console.log("Column ID term: "+columnIdTerm)


    const dimensionXdataMap = samplesAsColumns ? samples : taxa;
    const dimensionYdataMap = samplesAsColumns ? taxa : samples;
    const [otuTable, rows, columns, consistencyCheck] = await streamReader.readOtuTableToSparse(otuTableFile?.path, processFn, columnIdTerm, otuTableFile?.properties?.delimiter, dimensionXdataMap, dimensionYdataMap);
    
    const sampleCount = samplesAsColumns ? columns.filter(c => dimensionXdataMap.has(c)).length : rows.filter(c => dimensionYdataMap.has(c)).length;
    const taxonCount = samplesAsColumns ? rows.filter(c => dimensionYdataMap.has(c)).length : columns.filter(c => dimensionXdataMap.has(c)).length ;
    processFn(rows.length, rows.length, 'Reading data', {sampleCount, taxonCount})
    console.log("Finished readOtuTableToSparse")
     console.log("Columns "+columns.length)
    // console.log(columns)
     console.log("Rows " + rows.length)
  //   console.log(rows)
   //console.log(rows.map(r => getMetaDataRow(samplesAsColumns ? taxa.get(r) : samples.get(r) )))

   
  /*  let sampleIdsWithNoRecordInSampleFile = [];
    columns.forEach(c => {
        if(!samples.has(c)){
            sampleIdsWithNoRecordInSampleFile.push(c)
            samples.set(c, {id: c})
        }
    }) */
    const sampleIdsWithNoRecordInSampleFile = samplesAsColumns ? consistencyCheck.dimensionXidsWithNoRecordInDataFile : consistencyCheck.dimensionYidsWithNoRecordInDataFile;
    const taxonIdsWithNoRecordInTaxonFile = samplesAsColumns ? consistencyCheck.dimensionYidsWithNoRecordInDataFile : consistencyCheck.dimensionXidsWithNoRecordInDataFile;
    const sampleIdsWithNoRecordInOtuTable = samplesAsColumns ? consistencyCheck.dimensionXidsWithNoRecordInOtuTable : consistencyCheck.dimensionYidsWithNoRecordInOtuTable;
    const taxonIdsWithNoRecordInOtuTable = samplesAsColumns ? consistencyCheck.dimensionYidsWithNoRecordInOtuTable : consistencyCheck.dimensionXidsWithNoRecordInOtuTable
    
    const cols = columns.map(c => getMetaDataRow(dimensionXdataMap.get(c), !samplesAsColumns)) ;
     const rws = rows.map(r => getMetaDataRow(dimensionYdataMap.get(r), samplesAsColumns)) ;
    try {
      const b = await new Promise((resolve, reject) => {
          try {
              console.log("Create Biom")
              const biom = new Biom({
                  id: id || null,
                  type: 'OTU table',
                  comment: getGroupMetaDataAsJsonString(termMapping),   // Biom v1 does not support group metadata where we store field default values. Therefore this is given as a JSON string in the comment field 
                  rows: rws,// rows.map(r => getMetaDataRow(samplesAsColumns ? taxa.get(r) : samples.get(r) )), 
                  columns: cols, // columns.map(c => getMetaDataRow(samplesAsColumns ? samples.get(c)  : taxa.get(c))),
                  matrix_type: 'sparse',
                  matrix_element_type: "int",
                  date: new Date().toISOString().split("Z")[0],
                  shape: [rws.length, cols.length], // samplesAsColumns ? [taxa.size, samples.size] : [samples.size, taxa.size],
                  data: otuTable
                })
                console.log("Biom created")
                if(!samplesAsColumns){
                  // We can read taxa as columns, but we will flip the matrix and always store samples as columns (samples will alwas have a smaller cardinality)
                  biom.transpose()
                }
                console.log("Resolve toBiom")
               resolve({biom, consistencyCheck: {sampleIdsWithNoRecordInSampleFile, taxonIdsWithNoRecordInTaxonFile, sampleIdsWithNoRecordInOtuTable, taxonIdsWithNoRecordInOtuTable } /* sampleIdsWithNoRecordInSampleFile */});
          } catch (error) {
              reject(error)
          }
         
        })
        return b;
    } catch (err) {
       console.log(err)
      throw err?.message
    }
    
  }

export const fromHdf5ToBiom = async ({otuTableFile, samples, taxa, samplesAsColumns = false, processFn = (progress, total, message, summary) => {}, termMapping = { taxa: {}, samples: {}, defaultValues: {}}, id}) => {
    if(otuTableFile?.mimeType !== 'application/x-hdf5'){
        throw 'MimeType be application/x-hdf5'
    } 

    try {
        const biomFromHdf5 = await readHDF5(otuTableFile?.path);

        const cols = biomFromHdf5.columns.map(c => getMetaDataRow(samples.get(c?.id), false)) ;
        const rws = biomFromHdf5.rows.map(r => getMetaDataRow(taxa.get(r?.id), true)) ;
        let sampleIdsWithNoRecordInSampleFile, taxonIdsWithNoRecordInTaxonFile, sampleIdsWithNoRecordInOtuTable, taxonIdsWithNoRecordInOtuTable
        const b = await new Promise((resolve, reject) => {
            try {
                console.log("Create Biom")
                const biom = new Biom({
                    id: id || null,
                    type: 'OTU table',
                    comment: getGroupMetaDataAsJsonString(termMapping),   // Biom v1 does not support group metadata where we store field default values. Therefore this is given as a JSON string in the comment field 
                    rows: rws,// rows.map(r => getMetaDataRow(samplesAsColumns ? taxa.get(r) : samples.get(r) )), 
                    columns: cols, // columns.map(c => getMetaDataRow(samplesAsColumns ? samples.get(c)  : taxa.get(c))),
                    matrix_type: 'sparse',
                    matrix_element_type: "int",
                    date: new Date().toISOString().split("Z")[0],
                    shape: [rws.length, cols.length], // samplesAsColumns ? [taxa.size, samples.size] : [samples.size, taxa.size],
                    data: biomFromHdf5.data
                  })
                  console.log("Biom created")
                
                  console.log("Resolve toBiom")
                 resolve({biom, consistencyCheck: {sampleIdsWithNoRecordInSampleFile, taxonIdsWithNoRecordInTaxonFile, sampleIdsWithNoRecordInOtuTable, taxonIdsWithNoRecordInOtuTable } /* sampleIdsWithNoRecordInSampleFile */});
            } catch (error) {
                reject(error)
            }
           
          })
          return b;
        
    } catch (error) {
        
    }
}  

// converts an otu table with sample and taxon metada files to BIOM format
export const toBiom_old = async (otuTableFile, sampleFile, taxaFile, samplesAsColumns = true, processFn = (progress, total, message, summary) => {}, termMapping = { taxa: {}, samples: {}, defaultValues: {}}, id) => {

  processFn(0, 0, 'Reading sample file')
  const samples = await streamReader.readMetaDataAsMap(sampleFile, /* undefined, */ processFn, termMapping.samples)
   processFn(0, 0, 'Reading taxon file', {sampleCount: samples.size});
  const taxa = await streamReader.readMetaDataAsMap(taxaFile, /* undefined, */ processFn, termMapping.taxa)
  console.log(`Taxa: ${taxa.size} samples: ${samples.size}`)  
  processFn(0, taxa.size, 'Reading OTU table', {taxonCount: taxa.size});
  const columnIdTerm = getColumnIdTerm(samplesAsColumns, termMapping)
  console.log("Column ID term: "+columnIdTerm)
  const [otuTable, rows, columns] = await streamReader.readOtuTableToSparse(otuTableFile, processFn, columnIdTerm);
  console.log("Finished readOtuTableToSparse")
  try {
    const b = await new Promise((resolve, reject) => {
        try {
            console.log("Create Biom")
            const biom = new Biom({
                id: id || null,
                comment: getGroupMetaDataAsJsonString(termMapping),   // Biom v1 does not support group metadata where we store field default values. Therefore this is given as a JSON string in the comment field 
                rows: rows.map(r => getMetaDataRow(samplesAsColumns ? taxa.get(r) : samples.get(r))), 
                columns: columns.map(c => getMetaDataRow(samplesAsColumns ? samples.get(c) : taxa.get(c))),
                matrix_type: 'sparse',
                shape: samplesAsColumns ? [taxa.size, samples.size] : [samples.size, taxa.size],
                data: otuTable
              })
              console.log("Biom created")
              if(!samplesAsColumns){
                // We can read taxa as columns, but we will flip the matrix and always store samples as columns (samples will alwas have a smaller cardinality)
                biom.transpose()
              }
              console.log("Resolve toBiom")
             resolve(biom);
        } catch (error) {
            reject(error)
        }
       
      })
      return b;
  } catch (err) {
    throw err
  }
  
}

const writeBigArraysInChunksToStream = (stream, arr, chunkSize, processFn = (progress) => {}) => {
    const startArray = "[\n", endArray = "\n]";
    stream.write(startArray)
    for (let i = 0; i < arr.length; i += chunkSize) {
        const chunk = arr.slice(i, i + chunkSize);
        stream.write(chunk.map(s => JSON.stringify(s)).join(','));
        if(i+chunkSize < arr.length){
            stream.write(',')
        } else {
            stream.write(endArray)
        }
        if(i % 1000 === 0){
            processFn(i);
        }
    }
    processFn(arr.length)
    
}

export const writeBiom = async (biom, path, processFn = (progress, total, message, summary) => {}) => {
    const startJson = "{\n", endJson = "\n}";
    return new Promise((resolve, reject)=>{
        try {
            const biomStream = fs.createWriteStream(path, {
                flags: "a",
              });
              biomStream.on('close', () => {
                resolve()
              })
              biomStream.write(startJson);
             // console.log(Object.keys(biom))
              const keys = Object.keys(biom);
              keys.filter(k => !['_rows','_columns','_data'].includes(k)).forEach(k => {
                biomStream.write(`"${k.slice(1)}": ${JSON.stringify(biom[k])},\n`)
              })
              biomStream.write(`"shape": ${JSON.stringify(biom.shape)},\n`)
              biomStream.write(`"columns":`);
              writeBigArraysInChunksToStream(biomStream, biom._columns, 100, (progress) => processFn(progress, biom._columns.length, 'Writing columns'))
              biomStream.write(`,"rows":`);
              writeBigArraysInChunksToStream(biomStream, biom._rows, 100, (progress) => processFn(progress, biom._rows.length, 'Writing rows'));
              biomStream.write(`,"data":`);
              writeBigArraysInChunksToStream(biomStream, biom._data, 1000, (progress) => processFn(progress, biom._data.length, 'Writing data'))
              biomStream.write(endJson);
              biomStream.close()
              
              //biomStream.write(JSON.stringify(biom, null, 2)) 
             
        } catch (error) {
            reject(error)
        }
        
    })
     
}

export default {
    toBiom,
    addReadCounts,
    writeBiom
} 