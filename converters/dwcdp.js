import _ from 'lodash';
import fs from 'fs';
import parse from 'csv-parse';
import transform from "stream-transform";
import util from "../util/index.js"
import emofToEventAssertion from '../enum/emofToEventAssertion.js';
import {once} from 'events';

const getEmofData = (evt, termMapping ) => {
    // eventAssertionStream.write(`${["assertionID", "eventID", "assertionValue", ...Object.keys(emofToEventAssertion).map(k => emofToEventAssertion[k])].join("\t")}\n`)

    try {
         let dataString = "";
        const measurements = termMapping?.measurements || {};
            Object.keys(measurements).forEach((m, idx) => {
              dataString += `${[evt.id+":"+idx, evt.id, (evt.metadata[m] || ""), ...Object.keys(emofToEventAssertion).map(k => measurements[m][k])].join("\t")}\n`
        })
        return dataString;
    } catch (error) {
        console.log(error)
        return ""
    }
}

const getDpResources = async ({hasEmof, analysisHeaders, sequenceHeaders, identificationHeaders, eventHeaders, protocolHeaders, eventAssertionHeaders}) => {

    try {
      const event = await  util.getDwcDPSchema('event')
      const eventAssertion = await  util.getDwcDPSchema('event-assertion')
      const identification = await  util.getDwcDPSchema('identification')
      const molecularProtocol = await util.getDwcDPSchema('molecular-protocol')
      const nucleotideAnalysis = await util.getDwcDPSchema('nucleotide-analysis')
      const nucleotideSequence = await util.getDwcDPSchema('nucleotide-sequence')

      let resources = [
        {
            "name": "event",
            "path": "data/event.tsv",
            "schema": {...event,  
                foreignKeys: event?.foreignKeys ? event.foreignKeys.filter(k => eventHeaders.includes(k.fields)):[], 
                fields: event.fields.filter(f => eventHeaders.includes(f.name)).sort((a,b) => eventHeaders.indexOf(a.name)- eventHeaders.indexOf(b.name))},
          } ,
          {
            "name": "identification",
            "path": "data/identification.tsv",
            "schema": {...identification, 
                foreignKeys: identification?.foreignKeys ? identification.foreignKeys.filter(k => identificationHeaders.includes(k.fields)):[], 
                fields: identification.fields.filter(f => identificationHeaders.includes(f.name)).sort((a,b) => identificationHeaders.indexOf(a.name)- identificationHeaders.indexOf(b.name))}, 
          } ,
          {
            "name": "molecular-protocol",
            "path": "data/molecular-protocol.tsv",
            "schema": {...molecularProtocol, 
                foreignKeys: molecularProtocol?.foreignKeys ? molecularProtocol.foreignKeys.filter(k => protocolHeaders.includes(k.fields)):[],
                fields: molecularProtocol.fields.filter(f => protocolHeaders.includes(f.name)).sort((a,b) => protocolHeaders.indexOf(a.name)- protocolHeaders.indexOf(b.name))}, 
          } ,
          {
            "name": "nucleotide-analysis",
            "path": "data/nucleotide-analysis.tsv",
            "schema":  {...nucleotideAnalysis, 
                foreignKeys: nucleotideAnalysis?.foreignKeys ? nucleotideAnalysis.foreignKeys.filter(k => analysisHeaders.includes(k.fields)):[],
                uniqueKeys: nucleotideAnalysis?.uniqueKeys ? nucleotideAnalysis.uniqueKeys.filter(k => analysisHeaders.includes(k.fields)):[],
                fields: nucleotideAnalysis.fields.filter(f => analysisHeaders.includes(f.name)).sort((a,b) => analysisHeaders.indexOf(a.name)- analysisHeaders.indexOf(b.name))}, 
          } ,
          {
            "name": "nucleotide-sequence",
            "path": "data/nucleotide-sequence.tsv",
            "schema":{...nucleotideSequence, 
                foreignKeys: nucleotideSequence?.foreignKeys ? nucleotideSequence.foreignKeys.filter(k => sequenceHeaders.includes(k.fields)):[],
            fields: nucleotideSequence.fields.filter(f => sequenceHeaders.includes(f.name)).sort((a,b) => sequenceHeaders.indexOf(a.name)- sequenceHeaders.indexOf(b.name))}, 
          } 
      ]
      if(hasEmof){
        resources.push({
            "name": "event-assertion",
            "path": "data/event-assertion.tsv",
            "schema": {...eventAssertion, 
                foreignKeys: eventAssertion?.foreignKeys ? eventAssertion.foreignKeys.filter(k => eventAssertionHeaders.includes(k.fields)):[],
                fields: eventAssertion.fields.filter(f => eventAssertionHeaders.includes(f.name)).sort((a,b) => eventAssertionHeaders.indexOf(a.name)- eventAssertionHeaders.indexOf(b.name))}
          }) 
      }
      return resources
      
    } catch (error) {
        console.log(error)
    }
} 

export const biomToDwcDp  = async (biomData, termMapping = { taxa: {}, samples: {}, defaultValues: {}, measurements: {}}, path, processFn = (progress, total, message, summary) => {}, ignoreHeaderLines = 1) => {
    const hasEmof = Object.keys((termMapping?.measurements || {})).length > 0;
      return new Promise(async (resolve, reject) => {
        try{
    
          if (!fs.existsSync(`${path}/dwc-dp`)){
           await fs.promises.mkdir(`${path}/dwc-dp/data`, { recursive: true });
        }
        try {
            await fs.promises.copyFile(`${path}/archive/eml.xml`, `${path}/dwc-dp/eml.xml`)
            console.log('Eml copied successfully to datapackage');
        } catch (err) {
            console.error('Error copying eml to datapackage:', err);

        }
        let defaultValues = {};
        if(biomData.comment){
            try {
               defaultValues = JSON.parse(biomData.comment).defaultValues; 
            } catch (error) {
                console.log("Failed to parse default values")
            }
        }
        const taxonHeaders = Object.keys(_.get(biomData, 'rows[0].metadata'));
        const sampleHeaders = Object.keys(_.get(biomData, 'columns[0].metadata'));
        const sampleHeaderSet = new Set(sampleHeaders);
        const taxonHeaderSet = new Set(taxonHeaders);

        const eventTerms = await util.getDwcDPtermsFromSchema('event')
        const identificationTerms = await util.getDwcDPtermsFromSchema('identification')
        const protocolTerms = await util.getDwcDPtermsFromSchema('molecular-protocol')
        const identificationRelevantTaxonHeaders = taxonHeaders.filter(h => identificationTerms.has(h))
      //  const otherTaxonHeaders = taxonHeaders.filter(h => !identificationTerms.has(h))
        const eventRelevantSampleHeaders = sampleHeaders.filter(h => eventTerms.has(h));
       // const otherSampleHeaders = = sampleHeaders.filter(h => !identificationTerms.has(h));
       const protocolRelevantStudyHeaders = Object.keys(defaultValues?.sample || {}).filter(k => protocolTerms.has(k))
       // console.log(biomData.data);
        const rowTotal = biomData.data.length + biomData.columns.length + biomData.rows.length;
        let rowsWritten = 0;
        const analysisStream = fs.createWriteStream(`${path}/dwc-dp/data/nucleotide-analysis.tsv`, {
                  flags: "a",
                });
        const eventStream = fs.createWriteStream(`${path}/dwc-dp/data/event.tsv`, {
                    flags: "a",
                });
        const eventAssertionStream = hasEmof ? fs.createWriteStream(`${path}/dwc-dp/data/event-assertion.tsv`, {
                    flags: "a",
                }) : null; 
        const sequenceStream = fs.createWriteStream(`${path}/dwc-dp/data/nucleotide-sequence.tsv`, {
                    flags: "a",
                });
        const identificationStream = fs.createWriteStream(`${path}/dwc-dp/data/identification.tsv`, {
                    flags: "a",
                });
        const protocolStream = fs.createWriteStream(`${path}/dwc-dp/data/molecular-protocol.tsv`, {
                    flags: "a",
                });
        let dataPackageJsonWritten = false;
        let analysisStreamClosed = false;
        let eventStreamClosed = false;
        let sequenceStreamClosed = false;
        let identificationStreamClosed = false;
        let protocolStreamClosed = false;
        let eventAssertionStreamClosed = !hasEmof;
        const allStreamsClosed = () => {
            return dataPackageJsonWritten && analysisStreamClosed  && eventStreamClosed  && sequenceStreamClosed && identificationStreamClosed  && protocolStreamClosed && eventAssertionStreamClosed
        }
        analysisStream.on("finish", () => {
          console.log("Molecular analysis stream finished");
          processFn(
            biomData.data.length,
            biomData.data.length,
            "Finished writing Data files"
          );
          analysisStreamClosed = true;
          if (allStreamsClosed()) {
            resolve();
          }
        });
        eventStream.on("finish", () => {
          console.log("Event stream finished");
          eventStreamClosed = true;
          if (allStreamsClosed()) {
            resolve();
          }
        });
        sequenceStream.on("finish", () => {
          console.log("Sequence stream finished");
          sequenceStreamClosed = true;
          if (allStreamsClosed()) {
            resolve();
          }
        });
        identificationStream.on("finish", () => {
          console.log("Identification stream finished");
          identificationStreamClosed = true;
          if (allStreamsClosed()) {
            resolve();
          }
        });
        protocolStream.on("finish", () => {
          console.log("Protocol stream finished");
          protocolStreamClosed = true;
          if (allStreamsClosed()) {
            resolve();
          }
        });    
        if(hasEmof && !!eventAssertionStream){
            eventAssertionStream.on("finish", () => {
                console.log("eventAssertion Stream finished");
                eventAssertionStreamClosed = true;
                if (allStreamsClosed()) {
                  resolve();
                }
              }); 
        }  

        // TODO: We are not guaranteed a specific rank, we need to make a rule for a "good pick" for which higher taxon to use
        const higherClassificationRank = "family"
        // So far the MDT does not support multi-assay datasets, so there will be only one protocol
        const molecularProtocolID = 1;
        // Write headers
        const analysisHeaders = ["nucleotideAnalysisID",  "eventID", "molecularProtocolID", "nucleotideSequenceID", "readCount", "totalReadCount"];
        analysisStream.write(`${analysisHeaders.join("\t")}\n`)
        const sequenceHeaders = ["nucleotideSequenceID", "nucleotideSequence"]
        sequenceStream.write(`${sequenceHeaders.join("\t")}\n`)
        const identificationHeaders = ["identificationID", "basedOnNucleotideSequenceID", "higherClassificationName", "higherClassificationRank", ...identificationRelevantTaxonHeaders]
        identificationStream.write(`${identificationHeaders.join("\t")}\n`)
        const eventHeaders = ["eventID", ...eventRelevantSampleHeaders]
        eventStream.write(`${eventHeaders.join("\t")}\n`)
        const protocolHeaders = ["molecularProtocolID", ...protocolRelevantStudyHeaders];
        protocolStream.write(`${protocolHeaders.join("\t")}\n`)
        const eventAssertionHeaders = ["assertionID", "eventID", "assertionValue", ...Object.keys(emofToEventAssertion).map(k => emofToEventAssertion[k])];
        if(hasEmof && !!eventAssertionStream){
            eventAssertionStream.write(`${eventAssertionHeaders.join("\t")}\n`)
        } 

        try {
            const resources = await getDpResources({hasEmof, analysisHeaders, sequenceHeaders, identificationHeaders, eventHeaders, protocolHeaders, eventAssertionHeaders})
            await fs.promises.writeFile(`${path}/dwc-dp/datapackage.json`, util.dataPackageJson({hasEmof, resources}))
            dataPackageJsonWritten = true;
            console.log("datapackage.json written")
            if (allStreamsClosed()) {
                resolve();
              }
        } catch (error) {
            console.log("Could not write datapackage.json at "+path)
        }
for await (const [idx, d] of biomData.data.entries()) {
   try {
                const nucleotideAnalysisID = `${biomData.columns[d[1]].id}:${biomData.rows[d[0]].id}`;
               if (!analysisStream.write(`${[nucleotideAnalysisID,  biomData.columns[d[1]].id, molecularProtocolID, biomData.rows[d[0]].id, d[2], biomData.columns[d[1]].metadata.readCount].join("\t")}\n`)) {
                   await once(analysisStream, 'drain');
               }
                rowsWritten ++;
                processFn(rowsWritten, rowTotal, 'Writing data')

            } catch (e){
                console.log(e)
                console.log(`biomData.data idx ${idx}`)
                console.log(d)
            }
}
      /*   biomData.data.forEach((d, idx) => {
            try {
                const nucleotideAnalysisID = `${biomData.columns[d[1]].id}:${biomData.rows[d[0]].id}`;
                analysisStream.write(`${[nucleotideAnalysisID,  biomData.columns[d[1]].id, molecularProtocolID, biomData.rows[d[0]].id, d[2], biomData.columns[d[1]].metadata.readCount].join("\t")}\n`)
                rowsWritten ++;
                processFn(rowsWritten, rowTotal, 'Writing data')

            } catch (e){
                console.log(e)
                console.log(`biomData.data idx ${idx}`)
                console.log(d)
            }

        })  */                
        analysisStream.close()
for await (const [idx, r] of biomData.rows.entries()) {
    try {
                if(!sequenceStream.write(`${[r.id, r.metadata.DNA_sequence].join("\t")}\n`)){
                    await once(sequenceStream, 'drain');
                }
                rowsWritten ++;
                if(!identificationStream.write(`${[r.id, r.id, r.metadata?.[higherClassificationRank] || "", higherClassificationRank, ...identificationRelevantTaxonHeaders.map(h => r.metadata[h] || "" )].join("\t")}\n`)){
                    await once(identificationStream, 'drain');
                }
                rowsWritten ++;
                processFn(rowsWritten, rowTotal, 'Writing data')

            } catch (e){
                console.log(e)
                console.log(`biomData.rows idx ${idx}`)
                console.log(d)
            }
}
       /*  biomData.rows.forEach((r, idx) => {
            try {
                sequenceStream.write(`${[r.id, r.metadata.DNA_sequence].join("\t")}\n`)
                rowsWritten ++;
                identificationStream.write(`${[r.id, r.id, r.metadata?.[higherClassificationRank] || "", higherClassificationRank, ...identificationRelevantTaxonHeaders.map(h => r.metadata[h] || "" )].join("\t")}\n`)
                rowsWritten ++;
                processFn(rowsWritten, rowTotal, 'Writing data')

            } catch (e){
                console.log(e)
                console.log(`biomData.rows idx ${idx}`)
                console.log(d)
            }

        })  */
        sequenceStream.close()
        identificationStream.close()
        for await (const [idx, c] of biomData.columns.entries()) {
           try {
                if(!eventStream.write(`${[c.id, ...eventRelevantSampleHeaders.map(h => c.metadata[h] || "") ].join("\t")}\n`)){
                   await once(eventStream, 'drain');
               }

                if(hasEmof && !!eventAssertionStream){
                  if(!eventAssertionStream.write(getEmofData(c, termMapping))){
                    await once(eventAssertionStream, 'drain');

                  }
                    
                }
                rowsWritten ++;
                processFn(rowsWritten, rowTotal, 'Writing data')
            } catch (e) {
                console.log(e)
                console.log(`biomData.columns idx ${idx}`)
                console.log(c) 
            }
        }
      /*   biomData.columns.forEach((c, idx) => {
            try {
                eventStream.write(`${[c.id, ...eventRelevantSampleHeaders.map(h => c.metadata[h] || "") ].join("\t")}\n`)

                if(hasEmof && !!eventAssertionStream){
                    eventAssertionStream.write(getEmofData(c, termMapping))
                }
                rowsWritten ++;
                processFn(rowsWritten, rowTotal, 'Writing data')
            } catch (e) {
                console.log(e)
                console.log(`biomData.columns idx ${idx}`)
                console.log(c) 
            }
        }) */
        if(hasEmof && !!eventAssertionStream){
            eventAssertionStream.close()
        }
        eventStream.close()
        if(!protocolStream.write(`${[molecularProtocolID, ...protocolRelevantStudyHeaders.map(k => defaultValues.sample[k])].join("\t")}\n`)){
            await once(protocolStream, 'drain');
        }
        protocolStream.close()

    } catch (error){
        console.log(error)
        reject(error)
      }
      })
}