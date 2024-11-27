import { getProcessingReport, writeProcessingReport, getMetadata, getCurrentDatasetVersion, wipeGeneratedDwcFiles, rsyncToPublicAccess, dwcArchiveExists} from '../util/filesAndDirectories.js'
import {registerDatasetInGBIF, registerDatasetInGBIFusingGBRDS, registerBiomEndpoints} from '../util/gbifRegistry.js'
import { biomToDwc } from '../converters/dwc.js';
import {getMimeFromPath, getFileSize} from '../validation/files.js'
import config from '../config.js'
import auth from './Auth/auth.js';
import queue from 'async/queue.js';
import DWCSTEPS from '../enum/dwcSteps.js'
import runningJobs from '../workers/runningJobs.js';
import {createDwc} from '../workers/supervisor.js'
import base64 from 'base-64';
import axios from '../node_modules/axios/index.js';

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
                report.publishing.registeredUAT = Date.now()
                report.publishing.registeredUATby = req?.user?.userName;
                try {
                    await registerBiomEndpoints({ednaDatasetID: req.params.id,
                        version,
                        env,
                        auth: config?.uatAuth,
                        gbifDatasetKey: gbifUatDatasetKey
                    })
                } catch (error) {
                    console.log(`Error registering BIOM endpoints:`)
                    console.log(error)
                }
            } else if(env === "prod"){
               // const gbifProdDatasetKey = await registerDatasetInGBIF(req.params.id, version, req?.headers?.authorization, 'prod', req?.query?.publishingOrganizationKey)
               const orgs = await auth.getOrganisations()  //.getOrganisationsForUser(req?.user?.userName)
               const organization = orgs.organizations?.[req?.query?.organizationKey];
               const userCanPublishWithOrg = organization?.users?.includes(req?.user?.userName)
               if(!organization){
                throw `Organization with key: ${req?.query?.organizationKey} was not found in the config file`
               } else if(!userCanPublishWithOrg && !req?.user?.isAdmin) {
                throw `User ${req?.user?.userName} is not allowed to publish with Organization with key: ${req?.query?.organizationKey}`
               } else {
                const authheader = `Basic ${base64.encode(req?.query?.organizationKey + ":" + organization?.token)}`
                const gbifProdDatasetKey = await registerDatasetInGBIFusingGBRDS({
                ednaDatasetID: req.params.id,
                version,
                env,
                auth: authheader,
                metadata,
                processingReport: report,
                publishingOrganizationKey: req?.query?.organizationKey,
                userName: req?.user?.userName
                })
                report.publishing.gbifProdDatasetKey = gbifProdDatasetKey;
                report.publishing.publishingOrgKey = req?.query?.organizationKey
                report.publishing.registeredPROD = Date.now()
                report.publishing.registeredPRODby = req?.user?.userName;
                try {
                    await registerBiomEndpoints({ednaDatasetID: req.params.id,
                        version,
                        env,
                        auth: authheader,
                        gbifDatasetKey: gbifProdDatasetKey
                    })
                } catch (error) {
                    console.log(`Error registering BIOM endpoints:`)
                    console.log(error)
                }
               }
               
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

export const addNetwork = async (req, res) => {
    try {
        let version = req?.query?.version;
        if(!version){
            version = await getCurrentDatasetVersion(req.params.id)
        } 
          
        let report = await getProcessingReport(req.params.id, version);
        const gbifProdDatasetKey = report?.publishing?.gbifProdDatasetKey;
        const publishingOrgKey =  report.publishing.publishingOrgKey
        if(!gbifProdDatasetKey){
            throw "The dataset must be published before adding a Network"
        }

        const orgs = await auth.getOrganisations()  //.getOrganisationsForUser(req?.user?.userName)
               const organization = orgs.organizations?.[publishingOrgKey];
               const userCanPublishWithOrg = organization?.users?.includes(req?.user?.userName)
               if(!organization){
                throw `Organization with key: ${publishingOrgKey} was not found in the config file`
               } else if(!userCanPublishWithOrg && !req?.user?.isAdmin) {
                throw `User ${req?.user?.userName} is not allowed to publish with Organization with key: ${publishingOrgKey}`
               }

               const authheader = `Basic ${base64.encode(publishingOrgKey + ":" + organization?.token)}`

        await axios(
            {
                method: 'post',
                url: `${config.gbifGbrdsBaseUrl.prod}registry/resource/${gbifProdDatasetKey}/network/${req?.params?.netWorkKey}`,
                headers: {
                    authorization: authheader,
                    'content-type': 'application/x-www-form-urlencoded'
                }
            }
            ) 
        report.publishing.netWorkKey = req?.params?.netWorkKey;
        await writeProcessingReport(req.params.id, version, report)
        res.sendStatus(201)

    } catch (error) {
        console.log(error)
    }
}

const getDwcProcess = async (req, res) => {
   
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
                return {...report, dwc: dwc};
            } else {        
                return report
           
        }
        } catch (error) {
            console.log(error)
            throw error
            // res.sendStatus(404)
        }
        

    
}


export const dwcQueue = q;
export default  (app) => {
    app.post("/dataset/:id/dwc", auth.userCanModifyDataset(), processDwc);

    app.post("/dataset/:id/register-in-gbif-uat", auth.userCanModifyDataset(), (req, res) => publishDwc(req, res, 'uat' ));
    app.post("/dataset/:id/register-in-gbif-prod", auth.userCanModifyDataset(), (req, res) => publishDwc(req, res, 'prod' ));
    app.post("/dataset/:id/network/:netWorkKey", auth.userCanModifyDataset(), addNetwork);

    app.get("/dataset/:id/dwc/:version?", async (req, res) => {
        if (!req.params.id) {
            res.sendStatus(404);
        } else {

            try {
                const report = await getDwcProcess(req, res)
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

    app.get("/dataset/:id/dwc-status", async (req, res) => {
        if (!req.params.id) {
            res.sendStatus(404);
        } else {

            try {
                const report = await getDwcProcess(req, res)
                if (report?.dwc?.steps) {
                    const filteredSteps = report?.dwc?.steps.filter(s => s?.status !== 'pending' && !!s?.name)
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