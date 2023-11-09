import _ from 'lodash';
import fs from 'fs';
import parse from 'csv-parse';
import transform from "stream-transform";
import util from "../util/index.js"
import streamReader from '../util/streamReader.js';
//const {streamReader} = util;

const DEFAULT_UNIT = "DNA sequence reads";
const BASIS_OF_RECORD = "Material Sample";

const writeMetaXml = async (occCore, dnaExt, path ) =>  await fs.promises.writeFile(`${path}/archive/meta.xml`, util.metaXml(occCore, dnaExt))

const getDefaultTermsForMetaXml = (biomData, dnaTerms, occTerms) => {
  let occDefaultTerms = []
  let dnaDefaultTerms = [] 
  const keySet = new Set()
  if(biomData.comment) {
    try {
      let parsed = JSON.parse(biomData.comment);
      if(parsed?.defaultValues?.observation){
        Object.keys(parsed?.defaultValues?.observation).forEach(key => {
          if(dnaTerms.has(key)){
            keySet.add(key)
            dnaDefaultTerms.push({...dnaTerms.get(key), default: parsed?.defaultValues?.observation[key]})
          } else if(occTerms.has(key)){
            occDefaultTerms.push({...occTerms.get(key), default: parsed?.defaultValues?.observation[key]})
          }
        })
      }
      if(parsed?.defaultValues?.sample){
        Object.keys(parsed?.defaultValues?.sample).forEach(key => {
          keySet.add(key)
          if(dnaTerms.has(key)){
            dnaDefaultTerms.push({...dnaTerms.get(key), default: parsed?.defaultValues?.sample[key]})
          } else if(occTerms.has(key)){
            occDefaultTerms.push({...occTerms.get(key), default: parsed?.defaultValues?.sample[key]})
          }
        })
      }
    } catch (error) {
      console.log(error)
    }
  }
  return {occDefaultTerms, dnaDefaultTerms, keySet}
}


export const biomToDwc = async (biomData, termMapping = { taxa: {}, samples: {}}, path, processFn = (progress, total, message, summary) => {}) => {

  return new Promise(async (resolve, reject) => {
    try{

      if (!fs.existsSync(`${path}/archive`)){
       await fs.promises.mkdir(`${path}/archive`, { recursive: true });
    }
      const reverseTaxonTerms = util.objectSwap(termMapping.taxa)
      const reverseSampleTerms = util.objectSwap(termMapping.samples)
      const taxonTerm = key => _.get(termMapping, `taxa.${key}`, key);
      const sampleTerm = key =>  _.get(termMapping, `samples.${key}`, key);
      const reverseSampleTerm = key => _.get(reverseSampleTerms, `${key}`, key);
      const reverseTaxonTerm = key => _.get(reverseTaxonTerms, `${key}`, key);
      const dnaTerms = await util.dwcTerms('dna_derived_data');
      const occTerms = await util.dwcTerms('dwc_occurrence');
      const taxonHeaders = Object.keys(_.get(biomData, 'rows[0].metadata'));
     // console.log(taxonHeaders)
      const sampleHeaders = Object.keys(_.get(biomData, 'columns[0].metadata'));
  
      const defaults = getDefaultTermsForMetaXml(biomData, dnaTerms, occTerms)
    // Make a set of sampleHeaders to avoid terms exist in both taxon and sample 
      const sampleHeaderSet = new Set(sampleHeaders)
      const relevantOccTerms  = [...sampleHeaders.filter(key => occTerms.has(sampleTerm(key)) && !defaults.keySet.has(key)).map(key => occTerms.get(sampleTerm(key))),
          ...taxonHeaders.filter(key => !sampleHeaderSet.has(key) && occTerms.has(taxonTerm(key))  && !defaults.keySet.has(key)).map(key => occTerms.get(taxonTerm(key))),
          ...defaults.occDefaultTerms
        ];
      const relevantDnaTerms = [...sampleHeaders.filter(key => dnaTerms.has(sampleTerm(key)) && !defaults.keySet.has(key)).map(key => dnaTerms.get(sampleTerm(key))),
          ...taxonHeaders.filter(key => !sampleHeaderSet.has(key) && dnaTerms.has(taxonTerm(key)) && !defaults.keySet.has(key)).map(key => dnaTerms.get(taxonTerm(key))),
          ...defaults.dnaDefaultTerms
        ];
        console.log("Sample headers: " +sampleHeaders)

     console.log("Taxon headers: " +taxonHeaders)
      //  console.log("Relevant DNA terms: "+ relevantDnaTerms.map(k => k.name))
        console.log("Relevant OCC terms: "+ relevantOccTerms.map(k => k.name))
      await writeMetaXml([...relevantOccTerms, occTerms.get('sampleSizeValue'), occTerms.get('sampleSizeUnit'), occTerms.get('organismQuantity'), occTerms.get('organismQuantityType'), occTerms.get('basisOfRecord'), occTerms.get('eventID')],relevantDnaTerms, path)
       
      const occStream = fs.createWriteStream(`${path}/archive/occurrence.txt`, {
          flags: "a",
        });
      const dnaStream = fs.createWriteStream(`${path}/archive/dna.txt`, {
          flags: "a",
        });
      let occStreamClosed = false;
      let dnaStreamClosed = false; 
      
      let occurrenceCount = 0;
      occStream.on('finish', () => {
        console.log("OCC stream finished")
        processFn(biomData.columns.length, biomData.columns.length, 'Finished writing DWC Ocurrences and DNA sequences', {occurrenceCount})
        occStreamClosed = true;
        if(dnaStreamClosed){
          resolve()
        }
      })
      dnaStream.on('finish', () => {
        console.log("DNA stream finished")

        dnaStreamClosed = true;
        if(occStreamClosed){
          resolve()
        }
      })
      occStream.on('error', (err) => {
        reject(err)
      })
      dnaStream.on('error', (err) => {
        reject(err)
      })

      const getDataForTermfromSample = (sample, terms) => terms.filter(term => reverseSampleTerm(term.name) in sample.metadata).map(term => sample.metadata[reverseSampleTerm(term.name)] || "").join("\t");
      const getDataForTermFromTaxon = (taxon, terms) => terms.filter(term => !sampleHeaderSet.has(reverseTaxonTerm(term.name)) && reverseTaxonTerm(term.name) in taxon.metadata).map(term => taxon.metadata[reverseTaxonTerm(term.name)] || "").join("\t"); 
        biomData.columns.forEach((c, cidx) => {
           const rowData = biomData.getDataColumn(c.id);
           rowData.forEach((r, i) => {
              if(Number(r) > 0){
                  // row = taxon, column = sample 
                  const row = biomData.rows[i];
                  const occurrenceId = `${c.id}:${row.id}`;
                  const sampleId = c.id;
  
                  let occSampleData = getDataForTermfromSample(c, relevantOccTerms);         
                  let occTaxonData = getDataForTermFromTaxon(row, relevantOccTerms);
                  
                  occStream.write(`${occurrenceId}\t${occSampleData ? `${occSampleData}\t` : ""}${occTaxonData ? `${occTaxonData}\t` : ""}${_.get(c, 'metadata.readCount','')}\t${DEFAULT_UNIT}\t${r}\t${DEFAULT_UNIT}\t${BASIS_OF_RECORD}\t${sampleId}\n`);
                  
                  let dnaSampleData = getDataForTermfromSample(c, relevantDnaTerms);         
                  let dnaTaxonData = getDataForTermFromTaxon(row, relevantDnaTerms);
                  dnaStream.write(`${occurrenceId}\t${dnaSampleData ? `${dnaSampleData}\t` : ""}${dnaTaxonData ? dnaTaxonData : ""}\n`);

                  occurrenceCount ++
              }
           })
           processFn(cidx, biomData.columns.length, 'Writing DWC Ocurrences and DNA sequences')
  
        })
        occStream.close()
        dnaStream.close()

      } catch (error){
        console.log(error)
        reject(error)
      }
  })

}


export const otuTableToDWC = async (otuTableFile, sampleFile, taxaFile, termMapping, path, delimiter) => {
  try{

    if (!fs.existsSync(`${path}/archive`)){
     await fs.promises.mkdir(`${path}/archive`, { recursive: true });
  }
    const reverseTaxonTerms = util.objectSwap(termMapping.taxa)
    const reverseSampleTerms = util.objectSwap(termMapping.samples)
    const taxonTerm = key => _.get(termMapping, `taxa.${key}`, key);
    const sampleTerm = key =>  _.get(termMapping, `samples.${key}`, key);
    const reverseSampleTerm = key => _.get(reverseSampleTerms, `${key}`, key);
    const reverseTaxonTerm = key => _.get(reverseTaxonTerms, `${key}`, key);
    const dnaTerms = await util.dwcTerms('dna_derived_data');
    const occTerms = await util.dwcTerms('dwc_occurrence');

    const samples = await streamReader.readMetaDataAsMap(sampleFile/* , _.get(termMapping, 'samples.id', 'id') */, ()=>{}, _.get(termMapping, 'samples', {}));
    const taxa = await streamReader.readMetaDataAsMap(taxaFile/* , _.get(termMapping, 'taxa.id', 'id') */, ()=>{}, _.get(termMapping, 'taxa', {}));
    console.log(`Taxa: ${taxa.size}`)
    console.log(`Samples: ${samples.size}`)
    
    const taxonHeaders = Object.keys(taxa.entries().next().value[1]);
    // console.log(taxonHeaders)
    const sampleHeaders = Object.keys(samples.entries().next().value[1]);
    // console.log(sampleHeaders)
    const sampleHeaderSet = new Set(sampleHeaders)

    const relevantOccTerms  = [...sampleHeaders.filter(key => occTerms.has(sampleTerm(key))).map(key => occTerms.get(sampleTerm(key))),
        ...taxonHeaders.filter(key => !sampleHeaderSet.has(key) && occTerms.has(taxonTerm(key))).map(key => occTerms.get(taxonTerm(key)))];
    const relevantDnaTerms = [...sampleHeaders.filter(key => dnaTerms.has(sampleTerm(key))).map(key => dnaTerms.get(sampleTerm(key))),
        ...taxonHeaders.filter(key => !sampleHeaderSet.has(key) && dnaTerms.has(taxonTerm(key))).map(key => dnaTerms.get(taxonTerm(key))),
      ];
    await writeMetaXml([...relevantOccTerms, occTerms.get('sampleSizeValue'), occTerms.get('sampleSizeUnit'), occTerms.get('organismQuantity'), occTerms.get('organismQuantityType'),],relevantDnaTerms)

   
    const occStream = fs.createWriteStream(`${path}/archive/occurrence.txt`, {
        flags: "a",
      });
    const dnaStream = fs.createWriteStream(`${path}/archive/dna.txt`, {
        flags: "a",
      });
      const getDataForTermfromSample = (sample, terms) => terms.filter(term => reverseSampleTerm(term.name) in sample.metadata).map(term => sample.metadata[reverseSampleTerm(term.name)] || "").join("\t");
      const getDataForTermFromTaxon = (taxon, terms) => terms.filter(term => !sampleHeaderSet.has(reverseTaxonTerm(term.name)) && reverseTaxonTerm(term.name) in taxon.metadata).map(term => taxon.metadata[reverseTaxonTerm(term.name)] || "").join("\t"); 
    let sampleIdToArrayIndex;
    let count = 0;
    const transformer = transform((record, callback) => {
        if(!sampleIdToArrayIndex){
            sampleIdToArrayIndex = record;
            callback(null, '');
        } else {
            let taxon = taxa.get(record[0])
            let occurrences = "";
            for (let index = 1; index < record.length; index++) {
                // count is not 0 or undefined
                if(!isNaN(Number(record[index])) && Number(record[index]) > 0){
                    const sample = samples.get(sampleIdToArrayIndex[index]);
                    const occurrenceId = `${sample[_.get(termMapping, 'samples.id', 'id')]}:${taxon[_.get(termMapping, 'taxa.id', 'id')]}`;
                    const sampleId = sample[_.get(termMapping, 'samples.id', 'id')];
                    occurrences += `${occurrenceId}\t${getDataForTermfromSample(sample, relevantOccTerms)}\t${getDataForTermFromTaxon(taxon, relevantOccTerms)}\t${_.get(sample, 'readCount','')}\t${DEFAULT_UNIT}\t${record[index]}\t${DEFAULT_UNIT}\t${BASIS_OF_RECORD}\t${sampleId}\n`;
                    dnaStream.write(`${occurrenceId}\t${getDataForTermfromSample(sample, relevantDnaTerms)}\t${getDataForTermFromTaxon(taxon, relevantDnaTerms)}\n`);

                }
                
            }

            callback(null, occurrences);

        }
        count ++;
        if(count % 1000 === 0){
          console.log(count + " rows read")
          
        } 
                   
      }, {
        parallel: 5
      });
    const parser = parse( {
        delimiter: delimiter || "\t",
        columns: false,
        ltrim: true,
        rtrim: true,
        escape: '\\',

      //  quote: null
      })

    const inputStream = fs.createReadStream(otuTableFile);    
    inputStream.pipe(parser).pipe(transformer).pipe(occStream)
    inputStream.on('end', function(){
        console.log("Stream finished")
        inputStream.close()
        
    })
  } catch (error){
    console.log(error)
      throw error
  }

} 

export default {
    biomToDwc,
    otuTableToDWC
} 