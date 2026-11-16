import os from "os"
import {isValidDecimalLatitude, isValidDecimalLongitude} from "../validation/coordinates.js"
export const objectSwap = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, k]))
import { createHash } from 'node:crypto'
export const md5 = (content) => {  
    return createHash('md5').update(content).digest('hex')
  }/* const dwcTerms = require('./dwcTerms')
const metaXml = require('./metaXml')
const streamReader = require('./streamReader') */
import dwcTerms, {getDwcDPtermsFromSchema, getDwcDPSchema} from './dwcTerms.js';
import metaXml from './metaXml.js';
import { fastaFileExtensions } from "../enum/validFileExtensions.js"
import dataPackageJson from "./dataPackageJson.js"
import {tsvToParquet} from "./tsvToParquet.js"

export const sanitizeSequence = (sequence) => sequence.replace(/[^ACGTURYSWKMBDHVNacgturyswkmbdhvn]/g, '').toUpperCase();
export const getAsvID = (sequence) => {
  if(typeof sequence === "string" ) {
    return `ASV:${md5(sanitizeSequence(sequence))}` 
  } else {
    return ""
  }
}

const transformRow = row => Object.keys(row).reduce((acc, cur) => {
  try {

    switch (cur) {
      case "DNA_sequence":
        acc[cur] = (row?.[cur] || "").toUpperCase()
        break;
      case "decimalLatitude":
          if(!isValidDecimalLatitude(row?.[cur]) 
            && ((row?.[cur] || "").toString().match(/,/g) || []).length === 1 
            && isValidDecimalLatitude((row?.[cur] || "").toString()?.replace(',','.'))){
            acc[cur] = (row?.[cur] || "").toString()?.replace(',','.');
          } else {
            acc[cur] = row[cur];
          }
          break;
      case "decimalLongitude":
          if(!isValidDecimalLongitude(row?.[cur])
            && ((row?.[cur] || "").toString().match(/,/g) || []).length === 1 
            && isValidDecimalLongitude((row?.[cur] || "").toString()?.replace(',','.'))){
              acc[cur] = (row?.[cur] || "").toString()?.replace(',','.');
          } else {
              acc[cur] = row[cur];
          }
          break;      
          
      default:
        acc[cur] = row[cur];
        break;
    }
   // acc[cur] = cur === "DNA_sequence" ? (row?.[cur] || "").toUpperCase() : row[cur]
  return acc;
  } catch (error) {
   
    return acc
  }
  
}, {})    // .map(k => k === "DNA_sequence" ? (row?.[k] || "").toUpperCase() : row[k])

export const getMetaDataRow = (row, addTaxonomy = false) => {
  if(!row?.id){
     console.log(row)
  }
  try {
      let metadata = transformRow(row);
      if(typeof metadata?.["DNA_sequence"] === "string" ) {
          metadata.taxonID = getAsvID(metadata?.["DNA_sequence"]) 
      }
      if(addTaxonomy){
        metadata.taxonomy = getTaxonomyArray({metadata})
      }
      return {id: row.id, metadata}
  } catch (error) {
     console.log(error)
  }    
}

export const getTaxonomyArray = r => {
  
  /* console.log("getTaxonomyArray")
  console.log(r) */
  // It seems that most applications uses the k__Fungi p__Basidiomycota format for the taxonopmy. Detect if it is given like that, or format it this way
  // TODO What to do about species level? ScientificName may not always be species. Look for binomials? 
  return ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'scientificName'].map(rank => {
    try {
      const safeRankString = (r.metadata?.[rank] || "").toString();
      if(safeRankString.startsWith(`${rank.charAt(0)}__`)){
        return r.metadata[rank]
      } else if(rank === 'scientificName' && safeRankString.indexOf(' ') === -1 && safeRankString.indexOf('.') === -1 && safeRankString.indexOf(':')){
        return `${rank.charAt(0)}__${(r.metadata?.[rank] || "")}_sp` 
      } else {
        return `${rank.charAt(0)}__${safeRankString.replaceAll(' ', '_')}`
      }
    } catch (error) {
      console.log("r.metadata ")
      console.log(r.metadata)
      console.log("RANK")
      console.log(rank)
      console.log(error)
    }
    
  } )
  

}

export const getAuthorString = user => `${user?.email ? user?.email + " " : ""}(${user?.firstName ? user?.firstName +" ": ""}${user?.lastName || ""})`

export const getApplicationIP = () => {

  const networkInterfaces = os.networkInterfaces();
   // console.log(networkInterfaces);

 return Object.keys(networkInterfaces).map(k => networkInterfaces[k]).flat().filter(e => !e?.internal).find(e => e.family === "IPv4")?.address
}

export const getYargs = () =>  process.argv.reduce((acc, curr, idx) => {
    if(curr?.startsWith('--')){
      acc[curr.substring(2)] = process.argv[idx+1]
    }
    return acc
   }, {})

export const partitionArray = (array, isValid) => {
  return array.reduce(([pass, fail], elem) => {
    return isValid(elem) ? [[...pass, elem], fail] : [pass, [...fail, elem]];
  }, [[], []]);
}

export const isFastaFile = (fileName) => typeof fileName === "string" ?  fastaFileExtensions.includes(fileName.split('.').pop()) : false

// Which of the sample table's columns identifies a sample: the one whose values label the OTU
// table's columns. For use where neither a mapping nor an "id" header names it. Preferable to
// taking the first column, because a wrong choice matches no OTU header at all, and the rule that
// separates taxonomy from counts then has to treat every column as taxonomy.
// columns is [{header, values}], values being that column's cells.
export const sampleIdHeaderByOtuOverlap = (columns = [], otuTableHeaders = []) => {
    const otuHeaderSet = new Set((otuTableHeaders || []).map(h => `${h ?? ''}`.trim()))
    let best = { header: undefined, matches: 0 }
    for (const { header, values } of (columns || [])) {
        if (!header) continue
        const matches = new Set(
            (values || []).map(v => `${v ?? ''}`.trim()).filter(v => v !== '' && otuHeaderSet.has(v))
        ).size
        if (matches > best.matches) best = { header, matches }
    }
    return best.header
}

// An OTU table column whose header is not a sample id carries taxonomy rather than counts: a
// two-table dataset keeps the taxon fields beside the counts instead of in a file of their own.
// Index 0 is the row id, which belongs to both halves, so it is always among these.
export const embeddedTaxonColumnIndices = (otuTableHeaders = [], sampleIdSet = new Set()) =>
    (otuTableHeaders || []).reduce((acc, header, idx) => {
        if (!sampleIdSet.has(header)) acc.push(idx)
        return acc
    }, [])

// Whether those indices describe a taxonomy worth extracting. One index is the row id alone, so
// there is nothing but counts; all of them means no sample id was recognised, and splitting on
// that would leave the OTU table with only its first column.
export const hasEmbeddedTaxonColumns = (indices, otuTableHeaders = []) =>
    indices?.length > 1 && indices.length < (otuTableHeaders || []).length

const eventIdValue = (column) => `${column?.metadata?.eventID ?? ''}`.trim()

// An eventID the sample table supplies is the better event key than one derived from the sample
// id: it groups the occurrences the way the collector grouped them. It can only be used when it
// is present on every sample and distinct per sample, because the DwC-DP event table keys one row
// per sample on it and a repeated or blank value would give that table duplicate keys. Callers
// that find it unusable fall back to the sample id, which is unique by construction.
export const sampleEventIdIsUsable = (columns = []) => {
    const values = (columns || []).map(eventIdValue)
    if (values.length === 0 || values.some(v => v === '')) return false
    return new Set(values).size === values.length
}

// The event key for one sample, honouring the check above. Every table that references eventID
// has to agree, or the DwC-DP foreign keys stop resolving.
export const eventIdForSample = (column, useProvided) => useProvided ? eventIdValue(column) : column?.id

// The repeated values behind a failed sampleEventIdIsUsable, so that the fallback can be reported
// rather than applied silently - the column is dropped, and a user who meant it to be the event
// key should hear why. Derived from the same values as the check itself so the two cannot
// disagree. Empty when no eventID was supplied at all, which is not something to warn about.
export const duplicateSampleEventIds = (columns = []) => {
    const counts = new Map()
    for (const column of columns || []) {
        const value = eventIdValue(column)
        if (value !== '') counts.set(value, (counts.get(value) || 0) + 1)
    }
    return [...counts.entries()].filter(([, n]) => n > 1).map(([value]) => value)
}

export default {
    metaXml,
    sampleIdHeaderByOtuOverlap,
    embeddedTaxonColumnIndices,
    hasEmbeddedTaxonColumns,
    sampleEventIdIsUsable,
    duplicateSampleEventIds,
    eventIdForSample,
    dwcTerms,
    getDwcDPtermsFromSchema,
    objectSwap,
    md5,
    getMetaDataRow,
    getTaxonomyArray,
    getYargs,
    partitionArray,
    isFastaFile,
    dataPackageJson,
    getDwcDPSchema,
    tsvToParquet
}
