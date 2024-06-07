import { getProcessingReport, writeProcessingReport, getMetadata, getCurrentDatasetVersion, wipeGeneratedDwcFiles, rsyncToPublicAccess, dwcArchiveExists} from '../util/filesAndDirectories.js'
import {registerDatasetInGBIF, registerDatasetInGBIFusingGBRDS} from '../util/gbifRegistry.js'
import { biomToDwc } from '../converters/dwc.js';
import {getMimeFromPath, getFileSize} from '../validation/files.js'
import config from '../config.js'
import auth from './Auth/auth.js';
import queue from 'async/queue.js';
import DWCSTEPS from '../enum/dwcSteps.js'
import runningJobs from '../workers/runningJobs.js';
import {createDwc} from '../workers/supervisor.js'

//const runningJobs = new Map();

/* const STEPS = {
    "readBiom": {
        "name": "readBiom",
        "status": "pending",
        "message": "Reading BIOM",
        "messagePending": "Read BIOM"
      },
      "writeDwc": {
        "name": "writeDwc",
        "status": "pending",
        "message": "Writing DWC",
        "messagePending": "Write DWC"
      },
      "zipArchive": {
        "name": "zipArchive",
        "status": "pending",
        "message": "Zipping files",
        "messagePending": "Zip files"
      },

} */

 const q = queue(async (options) => {
    const {id, version} = options;
    console.log("Options "+ JSON.stringify(options) )
    let job = runningJobs.get(id);
    job.summary = {};
    try {
        job.version = version;
        job.steps = job.steps.filter(j => j.status !== 'queued');

        await createDwc(id, version, job)


/* 
        job.steps.push({...DWCSTEPS.readBiom, status: 'processing', time: Date.now() })
        runningJobs.set(id, job);
        console.log("Read Biom")

        const biom = await readBiom(id, version)
        job.steps[job.steps.length -1] = {...job.steps[job.steps.length -1], status: 'finished'}
        job.steps.push({...DWCSTEPS.writeDwc, status: 'processing', time: Date.now() })

        runningJobs.set(id, job);
        console.log("Write Dwc")
        await biomToDwc(biom, undefined, `${config.dataStorage}${id}/${version}`)
        console.log("Dwc written")
        job.steps[job.steps.length -1] = {...job.steps[job.steps.length -1], status: 'finished'}
        job.steps.push({...DWCSTEPS.zipArchive, status: 'processing', time: Date.now() })
        runningJobs.set(id, job);
        await zipDwcArchive(id, version)
        console.log("Archive zipped")
        job.steps[job.steps.length -1] = {...job.steps[job.steps.length -1], status: 'finished'} */


    } catch (error) {
        console.log(error)
        
       throw error
    }

}, 3)

const pushJob = async (id, version, user) => {
    runningJobs.set(id, { id: id, version, createdBy: user?.userName, steps: [{ status: 'queued', time: Date.now() }] })
    // remove previously generated files
    await wipeGeneratedDwcFiles(id, version)
    try {
       
        q.push({ id: id, version }, async (error, result) => {
            if (error) {
                console.log(error);
                let job = runningJobs.get(id);
                job.steps.push({ status: 'failed', message: error?.message, time: Date.now() })
                runningJobs.delete(id)
                //runningJobs.set(id, {...runningJobs.get(id), status: 'failed'} )
               // throw error
            } else {
                try {
                    let job = runningJobs.get(id);
                job.steps.push({ status: 'finished', time: Date.now() })
                let report = await getProcessingReport(id, version);
                let file = {
                    fileName:'archive.zip',
                    format: "DWC", fileName:'archive.zip',
                    size: getFileSize(`${config.dataStorage}${id}/${version}/archive.zip`), 
                    mimeType: 'application/zip'
                }
                // Filter out previously generated DWC 
                report.filesAvailable = report.filesAvailable ?    [...report.filesAvailable.filter(f => f?.format !== "DWC"), file] :[file]
                report.dwc = job;
                await writeProcessingReport(id, version, report)
                runningJobs.delete(id)
                } catch (error) {
                    console.log(error)
                }
                
            }
        })
    } catch (error) {
        console.log(error)
        throw error
    }
} 

const processDwc = async function (req, res) {

    console.log("processDwc")
    if (!req.params.id) {
      res.sendStatus(400);
    } else {
        try {
            let version = req?.query?.version;
            if(!version){
                version = await getCurrentDatasetVersion(req.params.id)
            } 
            console.log("Version "+version)
                // Make sure a job is not already running
                if(!runningJobs.has(req.params.id)){
                    console.log("Push job")
                    pushJob(req.params.id, version, req.user );
                    res.sendStatus(201)
                } else {
                    res.sendStatus(302)
                }
                     
           
           // console.log(eml)
           // res.sendStatus(201)
        } catch (error) {
            console.log(error)
            res.sendStatus(500)
        }
    }
  };

  const publishDwc = async function (req, res, env) {

    console.log(`Publish Dwc to ${env}`)
    if (!req.params.id) {
      res.sendStatus(400);
    } else {
        try {
            let version = req?.query?.version;
            if(!version){
                version = await getCurrentDatasetVersion(req.params.id)
            } 
            const hasDwcArchive = await  dwcArchiveExists(req.params.id, version)
            const metadata = await getMetadata(req.params.id, version)   
            let report = await getProcessingReport(req.params.id, version);
            report.publishing = report?.publishing || {} // {steps : []}
         
            if(config?.env === 'local'){
                // When doing local development, the data needs to be moved to a public url
                await rsyncToPublicAccess(req.params.id, version)
            }
            
            if(env === "uat"){
                // On UAT we use the default user and authorize with Basic auth
                // const gbifUatDatasetKey = await registerDatasetInGBIF(req.params.id, version, config.uatAuth, 'uat')
                const gbifUatDatasetKey = await registerDatasetInGBIFusingGBRDS({
                    ednaDatasetID: req.params.id,
                    version,
                    env,
                    auth: config?.uatAuth,
                    metadata,
                    processingReport: report,
                    publishingOrganizationKey: config?.uatPublishingOrganizationKey,
                    userName: req?.user?.userName
                })
                report.publishing.gbifUatDatasetKey = gbifUatDatasetKey;
            } else if(env === "prod"){
                // On PROD we use the logged in users registry token. So the user must have access to publish datasets under the chosen organisation 
                const gbifProdDatasetKey = await registerDatasetInGBIF(req.params.id, version, req?.headers?.authorization, 'prod', req?.query?.publishingOrganizationKey)
                report.publishing.gbifProdDatasetKey = gbifProdDatasetKey;
            }
            
            console.log(`Dataset registered in GBIF ${env}, crawl triggered`)
            await writeProcessingReport(req.params.id, version, report)
            
                if(report){
                    if(!!metadata){
                        report.metadata = metadata
                    }
                    res.json(report)
                } else {
                    res.sendStatus(404)
                }
        } catch (error) {
            if(error === "DwC archive does not exist"){
                res.status(400);
            }
            console.log(error)
            res.sendStatus(500)
        }
    }
  };

  const addPendingSteps = job => {
    const steps_ = job.steps;
    
    return [...steps_, ...Object.keys(DWCSTEPS).filter(s => !steps_.map(a => a?.name).includes(s)).map(k => DWCSTEPS[k])]
}

export default  (app) => {
    app.post("/dataset/:id/dwc", auth.userCanModifyDataset(), processDwc);

    app.post("/dataset/:id/register-in-gbif-uat", auth.userCanModifyDataset(), (req, res) => publishDwc(req, res, 'uat' ));
    app.post("/dataset/:id/register-in-gbif-prod", auth.userCanModifyDataset(), (req, res) => publishDwc(req, res, 'prod' ));

    app.get("/dataset/:id/dwc/:version?", async (req, res) => {
        if (!req.params.id) {
            res.sendStatus(404);
        } else {

            // this will only find jobs that are being processed -will need
            const job = runningJobs.get(req.params.id);

            try {
                let version = req.params?.version;
                if(!version){
                    version = await getCurrentDatasetVersion(req.params.id);
                } 
                let report = await getProcessingReport(req.params.id, version);
                const metadata = await getMetadata(req.params.id, version)

                if(!!metadata){
                    report.metadata = metadata
                }
                if (job) {
                   
                    let dwc = {...job, steps: addPendingSteps(job)};
                    res.json({...report, dwc: dwc});
                } else {     
                if(report){
                    
                    res.json(report)
                } else {
                    res.sendStatus(404)
                }
            }
            } catch (error) {
                console.log(error)
                res.sendStatus(404)
            }
            

        }
    })



}