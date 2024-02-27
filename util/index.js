
export const objectSwap = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, k]))
import { createHash } from 'node:crypto'
export const md5 = (content) => {  
    return createHash('md5').update(content).digest('hex')
  }/* const dwcTerms = require('./dwcTerms')
const metaXml = require('./metaXml')
const streamReader = require('./streamReader') */
import dwcTerms from './dwcTerms.js';
import metaXml from './metaXml.js';
// import streamReader from './streamReader.js';
const transformRow = row => Object.keys(row).reduce((acc, cur) => {
  acc[cur] = cur === "DNA_sequence" ? (row?.[cur] || "").toUpperCase() : row[cur]
  return acc;
}, {})    // .map(k => k === "DNA_sequence" ? (row?.[k] || "").toUpperCase() : row[k])

export const getMetaDataRow = row => {
  if(!row?.id){
     console.log(row)
  }
  try {
      let metadata = transformRow(row);
      if(typeof metadata?.["DNA_sequence"] === "string" ) {
          metadata.taxonID = `ASV:${md5( metadata?.["DNA_sequence"])}` 
      }
      return {id: row.id, metadata}
  } catch (error) {
     console.log(error)
  }    
}

export default {
    metaXml,
    dwcTerms,
    objectSwap,
    md5,
    getMetaDataRow
}
