// This is simply the biom converter without the processFn used to report progress. For command line purposes it will be nice to have a "clean" converter
import {streamReader} from '../util/index.js'
import fs from 'fs';
import {Biom} from 'biojs-io-biom';
const getMetaDataRow = row => ({id: row.id, metadata: row})
const getReadCount = (biom, column) => biom.getDataColumn(column).reduce((partialSum, a) => partialSum + Number(a), 0);

// Calculate total reads in sample and set in metadata
export const addReadCounts = async biom => {
    return new Promise((resolve, reject) => {
        try {
            const readCounts = biom.columns.map(c => getReadCount(biom, c.id));
            biom.addMetadata({dimension: 'columns', attribute: 'readCount', values: readCounts}) 
            resolve(biom) 
        } catch (error) {
            reject(error)
        }
    })
}

// converts an otu table with sample and taxon metada files to BIOM format
export const toBiom = async (otuTableFile, sampleFile, taxaFile, samplesAsColumns = true, processFn) => {
    processFn(0, 0, 'reading sample file')
  const samples = await streamReader.readMetaDataAsMap(sampleFile)
  const taxa = await streamReader.readMetaDataAsMap(taxaFile)
  console.log(`Taxa: ${taxa.size} samples: ${samples.size}`)  
  const [otuTable, rows, columns] = await streamReader.readOtuTableToSparse(otuTableFile);
  const biom = new Biom({
    rows: rows.map(r => getMetaDataRow(samplesAsColumns ? taxa.get(r) : samples.get(r))), 
    columns: columns.map(c => getMetaDataRow(samplesAsColumns ? samples.get(c) : taxa.get(c))),
    matrix_type: 'sparse',
    shape: samplesAsColumns ? [taxa.size, samples.size] : [samples.size, taxa.size],
    data: otuTable
  })

  if(!samplesAsColumns){
    // We can read taxa as columns, but we will flip the matrix and always store samples as columns (samples will always have a smaller cardinality)
    biom.transpose()
  }
 return biom;
}

const writeBigArraysInChunksToStream = (stream, arr, chunkSize) => {
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
    }
    
}

export const writeBiom = async (biom, path) => {
    const startJson = "{\n", endJson = "\n}";
    return new Promise((resolve, reject)=>{
        try {
            const biomStream = fs.createWriteStream(path, {
                flags: "a",
              });
              biomStream.write(startJson);
             // console.log(Object.keys(biom))
              const keys = Object.keys(biom);
              keys.filter(k => !['_rows','_columns','_data'].includes(k)).forEach(k => {
                biomStream.write(`"${k.slice(1)}": ${JSON.stringify(biom[k])},\n`)
              })
              biomStream.write(`"columns":`);
              writeBigArraysInChunksToStream(biomStream, biom._columns, 100)
              biomStream.write(`,"rows":`);
              writeBigArraysInChunksToStream(biomStream, biom._rows, 100);
              biomStream.write(`,"data":`);
              writeBigArraysInChunksToStream(biomStream, biom._data, 1000)
              biomStream.write(endJson);
              resolve()
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