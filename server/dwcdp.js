import { getProcessingReport, writeProcessingReport, getMetadata, getCurrentDatasetVersion,  wipeGeneratedDwcDpFiles} from '../util/filesAndDirectories.js'

import {getFileSize} from '../validation/files.js'
import config from '../config.js'
import auth from './Auth/auth.js';
import queue from 'async/queue.js';
import DWCDPSTEPS from '../enum/dwcDpSteps.js'
import runningJobs from '../workers/runningJobs.js';
import { createDwcDP} from '../workers/supervisor.js'



 const q = queue(async (options) => {
    const {id, version} = options;
    let job = runningJobs.get(`${id}:dwcdp`);
    job.summary = {};
    try {
        job.version = version;
        job.steps = job.steps.filter(j => j.status !== 'queued');

        await createDwcDP(job.id, version, job)

    } catch (error) {
        console.log(error)
        
       throw error
    }

}, 3)

const pushJob = async (id, version, user) => {
    const dwcdpID = `${id}:dwcdp`
    runningJobs.set(dwcdpID, { id: id, version, createdBy: user?.userName, steps: [{ status: 'queued', time: Date.now() }] })
    // remove previously generated files
        await wipeGeneratedDwcDpFiles(id, version)
   
    try {
       
        q.push({ id: id, version }, async (error, result) => {
            if (error) {
                console.log(error);
                let job = runningJobs.get(dwcdpID);
                job.steps.push({ status: 'failed', message: error?.message, time: Date.now() })
                runningJobs.delete(dwcdpID)
                //runningJobs.set(id, {...runningJobs.get(id), status: 'failed'} )
               // throw error
            } else {
                try {
                    let job = runningJobs.get(dwcdpID);
                job.steps.push({ status: 'finished', time: Date.now() })
                let report = await getProcessingReport(id, version);
                    let file = {
                        fileName:'dwc-dp.zip',
                        format: "DWCDP",
                        size: getFileSize(`${config.dataStorage}${id}/${version}/dwc-dp.zip`), 
                        mimeType: 'application/zip'
                    }
                    // Filter out previously generated DWC 
                    report.filesAvailable = report.filesAvailable ?    [...report.filesAvailable.filter(f => f?.format !== "DWCDP"), file] :[file]
                    report.dwcdp = job;
                
               
                await writeProcessingReport(id, version, report)
                runningJobs.delete(dwcdpID)
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

const processDwcDP = async function (req, res) {

    console.log("processDwcDP")
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
                if(!runningJobs.has(`${req.params.id}:dwcdp`)){
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


  const addPendingSteps = job => {
    const steps_ = job.steps;
    
    return [...steps_, ...Object.keys(DWCDPSTEPS).filter(s => !steps_.map(a => a?.name).includes(s)).map(k => DWCDPSTEPS[k])]
}



const getDwcDpProcess = async (req, res) => {
   
        // this will only find jobs that are being processed -will need
        const dwcdpID = `${req.params.id}:dwcdp`

        const job = runningJobs.get(dwcdpID);

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
               
                let dwcdp = {...job, steps: addPendingSteps(job)};
                return {...report, dwcdp: dwcdp};
            } else {        
                return report
           
        }
        } catch (error) {
            console.log(error)
            throw error
            // res.sendStatus(404)
        }
        

    
}


export const dwcDpQueue = q;
export default  (app) => {
    app.post("/dataset/:id/dwc-dp", auth.userCanModifyDataset(), processDwcDP);


    app.get("/dataset/:id/dwc-dp/:version?", async (req, res) => {
        if (!req.params.id) {
            res.sendStatus(404);
        } else {

            try {
                const report = await getDwcDpProcess(req, res)
                if(!!report){
                    res.json(report)
                } else {
                    res.sendStatus(404)
                }
            } catch (error) {
                console.log(error)
                res.sendStatus(404)
            }
            

        }
    })

    app.get("/dataset/:id/dwcdp-status", async (req, res) => {
        if (!req.params.id) {
            res.sendStatus(404);
        } else {

            try {
                const report = await getDwcDpProcess(req, res)
                if (report?.dwcdp?.steps) {
                    const filteredSteps = report?.dwcdp?.steps.filter(s => s?.status !== 'pending' && !!s?.name)
                    res.json(filteredSteps[filteredSteps.length -1])
                } else {
                    res.sendStatus(404)
                }
            } catch (error) {
                console.log(error)
                res.sendStatus(404)
            }
            

        }
    })


}