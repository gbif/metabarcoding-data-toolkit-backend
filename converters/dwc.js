import _ from 'lodash';
import fs from 'fs';
import parse from 'csv-parse';
import transform from "stream-transform";
import util from "../util/index.js"
import streamReader from '../util/streamReader.js';
//const {streamReader} = util;

const DEFAULT_UNIT = "DNA sequence reads";
const BASIS_OF_RECORD = "MATERIAL_SAMPLE";
export const otherEMOFfields = ["measurementUnit", "measurementAccuracy", "measurementMethod", "measurementTypeID","measurementUnitID", "measurementValueID", "measurementDeterminedDate", "measurementDeterminedBy", "measurementRemarks"]

const writeMetaXml = async (hasEmof, occCore, dnaExt, path, ignoreHeaderLines ) =>  await fs.promises.writeFile(`${path}/archive/meta.xml`, util.metaXml(occCore, dnaExt, hasEmof, ignoreHeaderLines))

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

function writeOneMillionTimes(writer, data, encoding, callback) {
  var i = 1000000;
  write();
  function write() {
    var ok = true;
    do {
      i -= 1;
      if (i === 0) {
        // last time!
        writer.write(data, encoding, callback);
      } else {
        // see if we should continue, or wait
        // don't pass the callback, because we're not done yet.
        ok = writer.write(data, encoding);
      }
    } while (i > 0 && ok);
    if (i > 0) {
      // had to stop early!
      // write some more once it drains
      writer.once('drain', write);
    }
  }
}

const writeEmofForRow = async (emofStream, termMapping, sample, occurrenceId) => {

  return new Promise((resolve, reject) => {
    try {
      let dataString = "";
    const measurements = termMapping?.measurements || {};
    Object.keys(measurements).forEach(m => { 
      dataString += `${occurrenceId}\t${measurements[m]?.measurementType || ""}\t${sample?.metadata?.[m]}\t${otherEMOFfields.map(f => measurements[m]?.[f] || "").join("\t")}\n`
    })

    if (!emofStream.write(dataString)) {
      emofStream.once('drain', resolve)
    }
    else {
      resolve()
    }
    } catch (error) {
      reject(error)
    }
    
  })
}

export const biomToDwc = async (biomData, termMapping = { taxa: {}, samples: {}, defaultValues: {}, measurements: {}}, path, processFn = (progress, total, message, summary) => {}, ignoreHeaderLines = 1) => {
  const hasEmof = Object.keys((termMapping?.measurements || {})).length > 0;
  return new Promise(async (resolve, reject) => {
    try{

      if (!fs.existsSync(`${path}/archive`)){
       await fs.promises.mkdir(`${path}/archive`, { recursive: true });
    }
      // const reverseTaxonTerms = util.objectSwap(termMapping.taxa)
     // const reverseSampleTerms = util.objectSwap(termMapping.samples)
     // const taxonTerm = key =>   key // _.get(termMapping, `taxa.${key}`, key);
     // const sampleTerm = key =>  key // _.get(termMapping, `samples.${key}`, key);
     // const reverseSampleTerm = key =>  key// _.get(reverseSampleTerms, `${key}`, key);
     // const reverseTaxonTerm = key =>  key //_.get(reverseTaxonTerms, `${key}`, key);
      const dnaTerms = await util.dwcTerms('dna_derived_data');
      const occTerms = await util.dwcTerms('dwc_occurrence');
      const taxonHeaders = Object.keys(_.get(biomData, 'rows[0].metadata'));
     // console.log(taxonHeaders)
      const sampleHeaders = Object.keys(_.get(biomData, 'columns[0].metadata'));
  
      const defaults = getDefaultTermsForMetaXml(biomData, dnaTerms, occTerms)
    // Make a set of sampleHeaders to avoid terms exist in both taxon and sample 
      const sampleHeaderSet = new Set(sampleHeaders)
      const relevantOccTerms  = [...sampleHeaders.filter(key => occTerms.has(key) && !defaults.keySet.has(key)).map(key => occTerms.get(key)),
          ...taxonHeaders.filter(key => !sampleHeaderSet.has(key) && occTerms.has(key)  && !defaults.keySet.has(key)).map(key => occTerms.get(key)),
         /*  ...defaults.occDefaultTerms */
        ];
      const relevantDnaTerms = [...sampleHeaders.filter(key => dnaTerms.has(key) && !defaults.keySet.has(key)).map(key => dnaTerms.get(key)),
          ...taxonHeaders.filter(key => !sampleHeaderSet.has(key) && dnaTerms.has(key) && !defaults.keySet.has(key)).map(key => dnaTerms.get(key)),
          /* ...defaults.dnaDefaultTerms */
        ];


     console.log("Taxon headers: " +taxonHeaders)
      //  console.log("Relevant DNA terms: "+ relevantDnaTerms.map(k => k.name))
      const occCoreTerms = [...relevantOccTerms, occTerms.get('sampleSizeValue'), occTerms.get('sampleSizeUnit'), occTerms.get('organismQuantity'), occTerms.get('organismQuantityType'), occTerms.get('basisOfRecord'), occTerms.get('eventID') ]
      console.log("OCC terms: "+ occCoreTerms.map(k => k.name))

      await writeMetaXml(hasEmof, [...occCoreTerms, ...defaults.occDefaultTerms], [...relevantDnaTerms, ...defaults.dnaDefaultTerms], path, ignoreHeaderLines)
       
      const occStream = fs.createWriteStream(`${path}/archive/occurrence.txt`, {
          flags: "a",
        });
        if(ignoreHeaderLines === 1){
          occStream.write(`occurrenceID\t${occCoreTerms.map(k => k.name).join("\t")}\n`)
        }
      const dnaStream = fs.createWriteStream(`${path}/archive/dna.txt`, {
          flags: "a",
        });
      if(ignoreHeaderLines === 1){
          dnaStream.write(`occurrenceID\t${relevantDnaTerms.map(k => k.name).join("\t")}\n`)
        }
      const emofStream = hasEmof ? fs.createWriteStream(`${path}/archive/emof.txt`, {
          flags: "a",
        }) : null;
        if(hasEmof && ignoreHeaderLines === 1){
          emofStream.write(`occurrenceID\t${["measurementType", "measurementValue", ...otherEMOFfields ].join("\t")}\n`)
        }
      let occStreamClosed = false;
      let dnaStreamClosed = false; 
      let emofStreamClosed = hasEmof ? false : true;

      let occurrenceCount = 0;
      occStream.on('finish', () => {
        console.log("OCC stream finished")
        processFn(biomData.columns.length, biomData.columns.length, 'Finished writing DWC Ocurrences and DNA sequences', {occurrenceCount})
        occStreamClosed = true;
        if(dnaStreamClosed && emofStreamClosed){
          resolve()
        }
      })
      dnaStream.on('finish', () => {
        console.log("DNA stream finished")

        dnaStreamClosed = true;
        if(occStreamClosed && emofStreamClosed){
          resolve()
        }
      })
      emofStream?.on('finish', () => {
        console.log("EMOF stream finished")

        emofStreamClosed = true;
        if(occStreamClosed && dnaStreamClosed){
          resolve()
        }
      })
      occStream.on('error', (err) => {
        console.log('occ stream')
        console.log(err)
        reject(err)
      })
      dnaStream.on('error', (err) => {
        console.log('dnaStream')
        console.log(err)
        reject(err)
      })
      emofStream?.on('error', (err) => {
        console.log("EMOF err ")
        console.log(err)
        reject(err)
      })

      const getDataForTermfromSample = (sample, terms) => terms.filter(term => term.name in sample.metadata).map(term => sample.metadata[term.name] || "").join("\t");
      const getDataForTermFromTaxon = (taxon, terms) => terms.filter(term => !sampleHeaderSet.has(term.name) && term.name in taxon.metadata).map(term => taxon.metadata[term.name] || "").join("\t"); 
       
/*       biomData.columns.forEach((c, cidx) => {
           const rowData = biomData.getDataColumn(c.id);
           rowData.forEach(async (r, i) => {
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
                 if(hasEmof){
                  await writeEmofForRow(emofStream, termMapping, c, occurrenceId)
                 }
                  
                  occurrenceCount ++
              }
           })
           processFn(cidx, biomData.columns.length, 'Writing DWC Ocurrences and DNA sequences')
  
        }) */
           for (const [cidx, c] of biomData.columns.entries()) {
            const rowData = biomData.getDataColumn(c.id);
        
            for (const [i, r] of rowData.entries()) {
                if (Number(r) > 0) {
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
        
                    if (hasEmof) {
                        await writeEmofForRow(emofStream, termMapping, c, occurrenceId);
                    }
        
                    occurrenceCount++;
                }
            }
        
            processFn(cidx, biomData.columns.length, 'Writing DWC Ocurrences and DNA sequences');
        }
        occStream.close()
        dnaStream.close()
        emofStream?.close()
      } catch (error){
        console.log(error)
        reject(error)
      }
  })

}


export const otuTableToDWC = async (otuTableFile, sampleFile, taxaFile, termMapping, path, delimiter) => {
  const hasEmof = Object.keys(termMapping?.measurements).length > 0;

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
    await writeMetaXml(hasEmof, [...relevantOccTerms, occTerms.get('sampleSizeValue'), occTerms.get('sampleSizeUnit'), occTerms.get('organismQuantity'), occTerms.get('organismQuantityType'),],relevantDnaTerms)

   
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