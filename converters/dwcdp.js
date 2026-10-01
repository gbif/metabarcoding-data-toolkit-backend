import _ from 'lodash';
import fs from 'fs';
import util from "../util/index.js"
import emofToEventAssertion from '../enum/emofToEventAssertion.js';
import {once} from 'events';
import { getEml } from '../util/Eml/index.js';


const getEmofData = (evt, termMapping ) => {
    // eventAssertionStream.write(`${["assertionID", "eventID", "assertionValue", ...Object.keys(emofToEventAssertion).map(k => emofToEventAssertion[k])].join("\t")}\n`)

    try {
         let dataString = "";
        const measurements = termMapping?.measurements || {};
            Object.keys(measurements).forEach((m, idx) => {
            const hasValue = (evt.metadata?.[m] && !["null", "na","n/a"].includes(evt.metadata?.[m]?.toString().toLowerCase())) || evt.metadata?.[m] === 0;
              if (hasValue) {
                dataString += `${[evt.id+":"+idx, evt.id, (evt.metadata[m] || ""), ...Object.keys(emofToEventAssertion).map(k => measurements[m][k])].join("\t")}\n`
                }
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
        // archive/eml.xml is written when the metadata form is saved (server/eml.js) and by the
        // FAIRe validation worker - not by the archive builder and not here. So a dataset can
        // reach this point without one: a copy restored without its archive directory, for
        // instance. The data package has no reason to depend on the archive path, so build the
        // eml from eml.json when the file is not there rather than shipping a package with no
        // metadata in it.
        try {
            const emlSource = `${path}/archive/eml.xml`;
            if (fs.existsSync(emlSource)) {
                await fs.promises.copyFile(emlSource, `${path}/dwc-dp/eml.xml`)
                console.log('Eml copied successfully to datapackage');
            } else {
                const emlJson = JSON.parse(await fs.promises.readFile(`${path}/eml.json`, 'utf8'))
                // the BIOM carries the dataset id, which getEml needs for packageId
                await fs.promises.writeFile(`${path}/dwc-dp/eml.xml`, getEml({...emlJson, id: biomData?.id}))
                console.log('No archive/eml.xml found - generated the datapackage eml from eml.json');
            }
        } catch (err) {
            // getEml throws on a missing or invalid license, and eml.json may not exist at all.
            // Neither is worth failing the whole package for - the metadata guard on the route
            // already refuses to generate when the metadata is incomplete.
            console.error('Could not add eml to datapackage:', err?.message || err);

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
        

        const eventTerms = await util.getDwcDPtermsFromSchema('event')
        const identificationTerms = await util.getDwcDPtermsFromSchema('identification')
        const protocolTerms = await util.getDwcDPtermsFromSchema('molecular-protocol')
        const identificationRelevantTaxonHeaders = taxonHeaders.filter(h => identificationTerms.has(h))
      //  const otherTaxonHeaders = taxonHeaders.filter(h => !identificationTerms.has(h))
        const eventRelevantSampleHeaders = sampleHeaders.filter(h => eventTerms.has(h));
       // const otherSampleHeaders = = sampleHeaders.filter(h => !identificationTerms.has(h));
       // Terms DwC-DP renamed, mapped from the name a user's study file may still use to the
       // name the schema now declares. Without this the filter below silently drops the value:
       // the old name is no longer a molecular-protocol field, so it simply stops matching.
       // Keyed old -> new; only add entries where the meaning is unchanged and only the
       // spelling moved.
       const RENAMED_PROTOCOL_TERMS = {
           samp_collec_device: 'samp_collect_device',
           samp_collec_method: 'samp_collect_method',
           DNA_sequence: 'sequence',
       };
       // Each entry is [column name to write, key to read from the study defaults]. They differ
       // only for a renamed term, where the schema's new name heads the column but the value
       // still comes from whatever the user called it.
       const protocolStudyColumns = Object.keys(defaultValues?.sample || {})
           .map(k => [RENAMED_PROTOCOL_TERMS[k] || k, k])
           .filter(([schemaName]) => protocolTerms.has(schemaName));
       const protocolRelevantStudyHeaders = protocolStudyColumns.map(([schemaName]) => schemaName)
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

      
        // So far the MDT does not support multi-assay datasets, so there will be only one protocol
        const molecularProtocolID = 1;
        // Write headers
        // DwC-DP moved from natural keys to surrogate keys: the identifying column of each
        // table is now <table>_pk, and a reference to another table is <table>_fk. The old
        // *ID names survive only where they were primary keys - the foreign ones
        // (eventID in nucleotide-analysis, for instance) no longer exist in the schema.
        //
        // The values are unchanged: <table>_pk carries exactly what <table>ID carried before,
        // and each _fk the value of the column it replaces. That keeps record identity
        // stable, so regenerating an already-published dataset does not create a second set
        // of occurrences. The rows below are written positionally against these arrays, so
        // renaming here is enough - the order and the count are the same as before.
        const analysisHeaders = ["nucleotideAnalysis_pk",  "event_fk", "molecularProtocol_fk", "nucleotideSequence_fk", "readCount", "processedTotalReadCount"];
        analysisStream.write(`${analysisHeaders.join("\t")}\n`)
        const sequenceHeaders = ["nucleotideSequence_pk", "sequence"]
        sequenceStream.write(`${sequenceHeaders.join("\t")}\n`)
        const identificationHeaders = ["identification_pk", "nucleotideSequence_fk", ...identificationRelevantTaxonHeaders]
        identificationStream.write(`${identificationHeaders.join("\t")}\n`)
        const eventHeaders = ["event_pk", ...eventRelevantSampleHeaders]
        eventStream.write(`${eventHeaders.join("\t")}\n`)
        const protocolHeaders = ["molecularProtocol_pk", ...protocolRelevantStudyHeaders];
        protocolStream.write(`${protocolHeaders.join("\t")}\n`)
        // event-assertion declares no primaryKey upstream, and assertionID survives as an
        // ordinary field, so only the reference to event moves
        const eventAssertionHeaders = ["assertionID", "event_fk", "assertionValue", ...Object.keys(emofToEventAssertion).map(k => emofToEventAssertion[k])];
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
        let maxMemoryUsed = process.memoryUsage().heapUsed
for await (const [idx, d] of biomData.data.entries()) {
   try {
                const nucleotideAnalysisID = `${biomData.columns[d[1]].id}:${biomData.rows[d[0]].id}`;
               if (!analysisStream.write(`${[nucleotideAnalysisID,  biomData.columns[d[1]].id, molecularProtocolID, biomData.rows[d[0]].id, d[2], biomData.columns[d[1]].metadata.readCount].join("\t")}\n`)) {
                   await once(analysisStream, 'drain');
               }
                rowsWritten ++;
                if(rowsWritten % 1000 === 0){
                    processFn(rowsWritten, rowTotal, 'Writing data')
                    if(process.memoryUsage().heapUsed > maxMemoryUsed){
                        maxMemoryUsed = process.memoryUsage().heapUsed;
                        
                    }
                }
                if(rowsWritten % 100000 === 0){
                    console.log(`Rows written: ${rowsWritten} of ${rowTotal}`)
                    console.log(`Current Memory usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`)
                    console.log(`Max Memory usage: ${Math.round(maxMemoryUsed / 1024 / 1024)} MB`)
                }
               // processFn(rowsWritten, rowTotal, 'Writing data')

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
                if(!identificationStream.write(`${[r.id, r.id, ...identificationRelevantTaxonHeaders.map(h => r.metadata[h] || "" )].join("\t")}\n`)){
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
        if(!protocolStream.write(`${[molecularProtocolID, ...protocolStudyColumns.map(([, studyKey]) => defaultValues.sample[studyKey])].join("\t")}\n`)){
            await once(protocolStream, 'drain');
        }
        protocolStream.close()

    } catch (error){
        console.log(error)
        reject(error)
      }
      })
}