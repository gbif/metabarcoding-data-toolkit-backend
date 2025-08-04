import fs from 'fs'
import config from '../config.js'
import {Biom} from 'biojs-io-biom';
import child_process from 'child_process';
import {spawn} from 'child_process';
import {getDataset} from "./dataset.js"
import parse from 'csv-parse';
import db from '../server/db/index.js'
import json from 'big-json';
import { error } from 'console';
import _ from 'lodash'



export const parseBigJson = async (file,  processFn = (progress, total, message, summary) => {},) => {
 
  const exists = await fileAtPathExists(file)
    if(!exists){
      throw `Not found: ${file}`
      }
    const {size} = await fs.promises.stat(file);
    let progress = 0;
    let nextPct = 5; // for every 5 pct parsed, update progress
  return new Promise((resolve, reject) => {
    try {
      const readStream = fs.createReadStream(file);
      const parseStream = json.createParseStream();
      
      parseStream.on('data', function(pojo) {
          processFn(size, size)
          resolve(pojo)
      });

      readStream.on('data', (buffer) => {
        progress += buffer.length;
        const progressPct = Math.round(progress/ size*100)
        if(progressPct > nextPct){
          processFn(progress, size)
          nextPct +=5 ;
        }
    })
      
      readStream.pipe(parseStream);
    } catch (error) {
      reject(error)
    }
    

  })
  
}


export const getCurrentDatasetVersion = async id => {
    try {
        let versionList = await fs.promises.readdir(`${config.dataStorage}${id}`)
        return  Math.max(...versionList.filter(v => !isNaN(v) && fs.lstatSync(`${config.dataStorage}${id}/${v}`).isDirectory()))
    } catch (error) {
        console.log(error)
        throw "not found"
    }
    
}

export const writeProcessingReport = async (id, version, json) => {
    await fs.promises.writeFile(`${config.dataStorage}${id}/${version}/processing.json`, JSON.stringify(json, null, 2));
}

export const getProcessingReport = async (id, version) => {
    try {
        let data = await fs.promises.readFile(`${config.dataStorage}${id}/${version}/processing.json`, 'utf8') //writeFile(`${config.dataStorage}${id}/${version}/processing.json`, JSON.stringify(json, null, 2));
        return JSON.parse(data)
    } catch (error) {
        return null
    }
}

export const writeEmlJson = async (id, version, eml) => {
    await fs.promises.writeFile(`${config.dataStorage}${id}/${version}/eml.json`, JSON.stringify(eml, null, 2));
}

export const writeMapping = async (id, version, mapping) => {
  await fs.promises.writeFile(`${config.dataStorage}${id}/${version}/mapping.json`, JSON.stringify(mapping, null, 2));
}



export const writeMetricsToFile = async (id, version, metrics) => {
  await fs.promises.writeFile(`${config.dataStorage}${id}/${version}/metrics.json`, JSON.stringify(metrics, null, 2));
}

export const readMapping = async (id, version) => {
  try {
    let files = await fs.promises.readdir(`${config.dataStorage}${id}/${version}`)     
     if(!!files.find(f => f === 'mapping.json')){
        let data = await fs.promises.readFile(`${config.dataStorage}${id}/${version}/mapping.json`, 'utf8') //writeFile(`${config.dataStorage}${id}/${version}/processing.json`, JSON.stringify(json, null, 2));
        return JSON.parse(data)
     } else {
        return null
     }
} catch (error) {
    console.log(error)
   return null;
}
  
}

export const readMetrics = async (id, version) => {
  try {
    let files = await fs.promises.readdir(`${config.dataStorage}${id}/${version}`)     
     if(!!files.find(f => f === 'metrics.json')){
        let data = await fs.promises.readFile(`${config.dataStorage}${id}/${version}/metrics.json`, 'utf8') //writeFile(`${config.dataStorage}${id}/${version}/processing.json`, JSON.stringify(json, null, 2));
        return JSON.parse(data)
     } else {
        return null
     }
} catch (error) {
   // console.log(error)
   return null;
}
  
}

export const writeEmlXml = async (id, version, xml) => {
if (!fs.existsSync(`${config.dataStorage}${id}/${version}/archive`)) {
    await fs.promises.mkdir(`${config.dataStorage}${id}/${version}/archive`)
    }
    await fs.promises.writeFile(`${config.dataStorage}${id}/${version}/archive/eml.xml`, xml);
}

export const hasMetadata = async (id, version) => {
    try {
        if(!fs.existsSync(`${config.dataStorage}${id}/${version}/archive`)){
            return false
        }
        let files = await fs.promises.readdir(`${config.dataStorage}${id}/${version}/archive`)     
        return !!files.find(f => f === 'eml.xml')
    } catch (error) {
        console.log(error)
       return false;
    }
    
}

export const getMetadata = async (id, version) => {
    try {
        let files = await fs.promises.readdir(`${config.dataStorage}${id}/${version}`)     
         if(!!files.find(f => f === 'eml.json')){
            let data = await fs.promises.readFile(`${config.dataStorage}${id}/${version}/eml.json`, 'utf8') //writeFile(`${config.dataStorage}${id}/${version}/processing.json`, JSON.stringify(json, null, 2));
            return JSON.parse(data)
         } else {
            return null
         }
    } catch (error) {
        console.log(error)
       return null;
    }
    
}

export const readBiom = async (id, version, processFn = (progress, total, message, summary) => {},) => {
    try {
        let files = await fs.promises.readdir(`${config.dataStorage}${id}/${version}`)     
         if(!!files.find(f => f === 'data.biom.json')){
            /* let data = await fs.promises.readFile(`${config.dataStorage}${id}/${version}/data.biom.json`, 'utf8') //writeFile(`${config.dataStorage}${id}/${version}/processing.json`, JSON.stringify(json, null, 2));
            const biom = new Biom(JSON.parse(data)) */

            let data = await parseBigJson(`${config.dataStorage}${id}/${version}/data.biom.json`, processFn) //writeFile(`${config.dataStorage}${id}/${version}/processing.json`, JSON.stringify(json, null, 2));
            const biom = new Biom(data)
            return biom;
         } else {
            return null
         }
    } catch (error) {
        throw error;
    }
    
}


export const zipDwcArchive = (id, version) => {
    return new Promise((resolve, reject) => {
      child_process.exec(
        `zip -r ${config.dataStorage}${id}/${version}/archive.zip *`,
        {
          cwd: `${config.dataStorage}${id}/${version}/archive`,
        },
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  };

  export const zipDwcDatapackage = (id, version) => {
    return new Promise((resolve, reject) => {
      child_process.exec(
        `zip -r ${config.dataStorage}${id}/${version}/dwc-dp.zip *`,
        {
          cwd: `${config.dataStorage}${id}/${version}/dwc-dp`,
        },
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  };



  export const rsyncToPublicAccess = (id, version) => {
    return new Promise((resolve, reject) => {
      child_process.exec(
        `rsync -chavzP ${config.dataStorage}${id}/${version}/archive.zip ${config.rsyncDirectory}/${id}.zip`,
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  };

  export const readTsvHeaders = async (path, delimiter = "\t") => {
    return new Promise((resolve, reject) => {
        const parser = parse( {
            delimiter: delimiter || "\t",
            columns: false,
            ltrim: true,
            rtrim: true,
            escape: '\\',

          //  quote: null,
            to_line: 1
          })
          let headers;
          parser.on('readable', function(){
            let line;
            while ((line = parser.read()) !== null) {
              headers = line;
            }
          });
          // Catch any error
          parser.on('error', function(err){
            console.error(err.message);
            reject(err)
          });
          // Test that the parsed records matched the expected records
          parser.on('end', function(){
            resolve(headers)
          });
        const inputStream = fs.createReadStream(path);    
        inputStream.pipe(parser)
    })
};

export const dwcArchiveExists = async (id, version) => {
  return new Promise((resolve, reject) => {
  fs.access(`${config.dataStorage}${id}/${version}/archive.zip`, (error) => {
    if (error) {
      reject("DwC archive does not exist")
    }
    resolve(true)
  });
})
}

export const deleteOriginalFile = async (id, version, fileName) => {
  return new Promise((resolve, reject) => {
    fs.unlink(`${config.dataStorage}${id}/${version}/original/${fileName}`, (err) => {
      if (err) {
        reject(err);
      }
      resolve()
      console.log("Deleted File successfully.");
  });
  
})
}

export const deleteFile = async (id, version, fileName) => {
  return new Promise((resolve, reject) => {
    fs.unlink(`${config.dataStorage}${id}/${version}/${fileName}`, (err) => {
      if (err) {
        reject(err);
      }
      resolve()
      console.log("Deleted File successfully.");
  });
  
})
}

export const fileExists = async (id, version, fileName) => {
  return new Promise((resolve, reject) => {
  fs.access(`${config.dataStorage}${id}/${version}/${fileName}`, (error) => {
    if (error) {
      resolve(false)
    }
    resolve(true)
  });
})
}

export const fileAtPathExists = async (file) => {
  return new Promise((resolve, reject) => {
  fs.access(file, (error) => {
    if (error) {
      console.log(error)
      resolve(false)
    }
    resolve(true)
  });
})
}


const resetFilesAndProcessingStepsInReport = async (id, version) => {
  let processingReportExists;
  try {
     processingReportExists = await fileExists(id, version, 'processing.json')
      if(processingReportExists){
        let report = await getDataset(id, version);
        delete report?.filesAvailable;
        delete report?.steps;
        delete report?.dwc;
        delete report?.dwcdp;

        delete report?.summary;
      //  console.log("Write report")
     //   console.log(report)
        await writeProcessingReport(id, version, report)
      } 
  } catch (error) {
    // If the report does not exist ignore error, just means that this is the first run
    if(processingReportExists){
      console.log(error)
    }
  }
}

export const wipeGeneratedFilesAndResetProccessing = async (id, version) => {
  return new Promise(async (resolve, reject) => {
    try {
      const files = ['data.biom.json', 'data.biom.h5','taxonomy.tsv', 'metrics.json', 'archive.zip', 'archive/dna.txt', 'archive/occurrence.txt','archive/emof.txt', 'archive/meta.xml'];
      for (let f of files) {
        const exists = await fileExists(id, version, f)
        if(exists){
          await deleteFile(id, version, f)
        }
        
      }
      await wipeGeneratedDwcDpFiles(id, version)
      await resetFilesAndProcessingStepsInReport(id, version)
      resolve(`Cleaned directories`)
    } catch (error) {
      reject(error)
    }
      
})

}

export const wipeGeneratedDwcFiles = async (id, version, files = ['archive.zip', 'archive/dna.txt', 'archive/occurrence.txt','archive/emof.txt', 'archive/meta.xml']) => {
  return new Promise(async (resolve, reject) => {
    try {
     // const files = ['archive.zip', 'archive/dna.txt', 'archive/occurrence.txt','archive/emof.txt', 'archive/meta.xml'];
      for (let f of files) {
        const exists = await fileExists(id, version, f)
        if(exists){
          await deleteFile(id, version, f)
        }
        
      }
      resolve(`Cleaned directories`)
    } catch (error) {
      reject(error)
    }
      
})

}

export const wipeGeneratedDwcDpFiles = async (id, version, keepZip = false) => {
  return new Promise(async (resolve, reject) => {
    try {
        const exists = await fileExists(id, version, 'dwc-dp.zip')
        if(exists && !keepZip){
          await deleteFile(id, version, 'dwc-dp.zip')
        }
        await fs.promises.rm(`${config.dataStorage}${id}/${version}/dwc-dp`, {recursive: true, force: true})
        
      
      resolve(`Cleaned directories`)
    } catch (error) {
      reject(error)
    }
      
})

}

export const mergeFastaMapIntoTaxonMap = (fastaMap, taxonMap) => {
  // if the taxonMap size is 0, no taxon file was provided. If there is a fastaMap, we will populate the empte taxonMap with the fastaMap data
  if(taxonMap.size > 0){
    taxonMap.forEach((value, key) => {
      taxonMap.set(key, {...value, DNA_sequence: fastaMap.get(key) || ""})
    })
   return taxonMap;
  } else if(taxonMap.size === 0 && fastaMap.size > 0){
    fastaMap.forEach((value, key) => {
      taxonMap.set(key, {id: key, DNA_sequence: value})
    })
    return taxonMap;
  }
  
}

export const readOrganizationFile = async () => {
  try {
    let data = await fs.promises.readFile(config.organizationFilePath, 'utf8') //writeFile(`${config.dataStorage}${id}/${version}/processing.json`, JSON.stringify(json, null, 2));
        return JSON.parse(data)
} catch (error) {
   // console.log(error)
   return null;
  }
}

export const writeOrganizationFile = async adminData => {
  await fs.promises.writeFile(config.organizationFilePath, JSON.stringify(adminData, null, 2));
}

const getDwcGeneratedFromStoredDataset = (dataset) => _.isArray(dataset?.dwc?.steps) ? new Date(dataset?.dwc?.steps[dataset?.dwc?.steps.length -1]?.time).toISOString() || null : null;

export const readDataStorage = async () => {
  try{
    const datasets = []
    const dirs = await fs.promises.readdir(`${config.dataStorage}`)
    for(const dir of dirs){
      if(fs.lstatSync(`${config.dataStorage}${dir}`).isDirectory()){
        const versions = await fs.promises.readdir(`${config.dataStorage}${dir}`)
        const validVersions = versions.filter(v => !isNaN(Number(v)) && fs.lstatSync(`${config.dataStorage}${dir}/${v}`).isDirectory());
        const currentVersion = Math.max(validVersions);

        // user_name STRING, dataset_id STRING, title STRING, created DATE, sample_count INTEGER DEFAULT 0, taxon_count INTEGER DEFAULT 0, occurrence_count INTEGER DEFAULT 0
        const storedDataset = await getDataset(dir, currentVersion);
        if(!storedDataset?.id){
          console.log("NO DATASET ID "+dir)
        }
        try {
          datasets.push({
            user_name: storedDataset?.createdBy || "",
            dataset_id: storedDataset?.id,
            title: storedDataset?.metadata?.title || '',
            created: storedDataset?.createdAt ? storedDataset?.createdAt.split('T')[0] : storedDataset?.steps?.[0]?.time ? new Date(storedDataset?.steps?.[0]?.time).toISOString().split('T')[0] : null/* new Date().toISOString().split('T')[0] */,
            sample_count: storedDataset?.summary?.sampleCount || 0,
            taxon_count: storedDataset?.summary?.taxonCount || 0,
            occurrence_count: storedDataset?.dwc?.summary?.occurrenceCount || 0,
            gbif_uat_key: storedDataset?.publishing?.gbifDatasetKey /* deprecated - use env specific keys from now on */ || storedDataset?.publishing?.gbifUatDatasetKey || "",
            gbif_prod_key: storedDataset?.publishing?.gbifProdDatasetKey || "",
            deleted: storedDataset?.deletedAt ? storedDataset?.deletedAt.split('T')[0] : null,
            node_key: storedDataset?.nodeKey || "",
            publishing_org_key: storedDataset?.publishing?.publishingOrgKey || "",
            publishing_org_key: storedDataset?.publishing?.publishingOrgKey || "",
            dataset_description: !!storedDataset?.metadata?.description ? storedDataset?.metadata?.description.substring(0, 300) : "",
            dataset_author: storedDataset?.datasetAuthor || "",
            dwc_generated: getDwcGeneratedFromStoredDataset(storedDataset),
            current_version: currentVersion,
            validation_id: storedDataset?.publishing?.validationId || ""
          })
        } catch (error) {
          console.log(error)
          console.log("ERR ID "+ storedDataset?.id)
          console.log(storedDataset?.deletedAt )
        }
       
      } 
    }
   // console.log(datasets)
    return datasets;
  } catch(err){
    console.log(err)
    throw error
  }
}

export const initDatabase = async () => {
  try {
    const datasets = await readDataStorage();
    await db.initialize(datasets)
  } catch (err){
    console.log(err)
  }
}

