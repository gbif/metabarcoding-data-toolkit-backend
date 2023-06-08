
import * as url from 'url';
import auth from './Auth/auth.js';
import _ from 'lodash'
import { getCurrentDatasetVersion, writeProcessingReport, wipeGeneratedFilesAndResetProccessing, readTsvHeaders, readMapping } from '../util/filesAndDirectories.js'
import { getDataset } from '../util/dataset.js';

import {processDataset} from '../workers/supervisor.js'
import queue from 'async/queue.js';
import STEPS from '../enum/processingSteps.js'
import runningJobs from '../workers/runningJobs.js';


const q = queue(async (options) => {
    const id = options?.id;
    let job = runningJobs.get(id);
    job.summary = {};
    try {
        const version = await getCurrentDatasetVersion(id)
        //  let job = runningJobs.get(id);
        job.version = version;
        job.steps = job.steps.filter(j => j.status !== 'queued');


        const mapping = await readMapping(id, version);
        if (!mapping) {
            // should we just warn that no mapping was created? or should it throw?
            job.mapping = { samples: {}, taxa: {} };
        } else {
            job.mapping = mapping;
        }
        console.log(`Start processing of dataset ${id}`)
        await processDataset(id, version, job)

    } catch (error) {
        console.log("There was an error")
        console.log(error)
        job.steps.push({ status: 'failed', message: error?.message, time: Date.now() })
        // throw error
        // callback(error)
    }

}, 3)


const pushJob = async (id, assignTaxonomy, user) => {

    try {
        // in case the user starts the proceesing again 
        let version = await getCurrentDatasetVersion(id);
        await wipeGeneratedFilesAndResetProccessing(id, version)
        runningJobs.set(id, { id: id, createdBy: user?.userName, assignTaxonomy: assignTaxonomy, filesAvailable: [], steps: [{ status: 'queued', time: Date.now() }] })
        q.push({ id: id }, async (error, result) => {
            if (error) {
                console.log(error);
                let job = runningJobs.get(id);
                job.steps.push({ status: 'failed', message: 'unsupported format', time: Date.now() })
                await writeProcessingReport(id, job.version, job)
                runningJobs.delete(id)

                //runningJobs.set(id, {...runningJobs.get(id), status: 'failed'} )
                //  throw error
            } else {
                let job = runningJobs.get(id);
                if(job?.steps?.[job?.steps?.length -1]?.status !== 'failed'){
                    job.steps.push({ status: 'finished', time: Date.now() })
                }
                await writeProcessingReport(id, job.version, job)
                runningJobs.delete(id)
            }
        })
    } catch (error) {
        console.log(error)
        throw error
    }


}



const addPendingSteps = job => {
    const steps_ = job.steps;

    return [...steps_, ...Object.keys(STEPS).filter(s => (!job.unzip ? s !== 'extractArchive' : true) && (!job.assignTaxonomy ? s !== 'assignTaxonomy' : true) && !steps_.map(a => a?.name).includes(s)).map(k => STEPS[k])]
}

export default (app) => {
    app.post("/dataset/:id/process", auth.userCanModifyDataset(), async function (req, res) {
        if (!req.params.id) {
            res.sendStatus(404);
        } else {
            try {
                // Make sure a job is not already running
                if (!runningJobs.has(req.params.id)) {
                    let assignTaxonomy = req?.query?.assignTaxonomy && (req?.query?.assignTaxonomy === true || req?.query?.assignTaxonomy === "true" )
                    
                    pushJob(req.params.id, assignTaxonomy, req?.user );
                    res.sendStatus(201)
                } else {
                    res.sendStatus(302)
                }

            } catch (error) {
                res.sendStatus(500)
            }

        }
    });


    app.get("/dataset/:id/process/:version?", async function (req, res) {

        if (!req.params.id) {
            res.sendStatus(404);
        } else {

            
          //  console.log("Process request 1")
            // this will only find jobs that are being processed -will need
            const job = runningJobs.get(req.params.id);
          //  console.log("Process request 2")
            try {
                let version = req.params?.version;
                if (!version) {
                    
                    version = await getCurrentDatasetVersion(req.params.id);
                   // console.log("Process request 3")
                }
                let report = await getDataset(req.params.id, version);
              //  console.log("Process request 4")

                if (job) {
                    let data = { ...report, ...job, steps: addPendingSteps(job) };
                  //  console.log("Process request 5")

                    res.json(data);
                } else {
                  //  console.log("Process request 6")

                    if (report) {
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
    });
}