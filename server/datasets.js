
import auth from './Auth/auth.js'
import db from './db/index.js'
import config from '../config.js';
import { getDataset, getDatasetLog } from '../util/dataset.js';
import {getCurrentDatasetVersion, getProcessingReport, writeProcessingReport, readMetrics} from '../util/filesAndDirectories.js'
import {deleteDatasetInGbifUAT} from "../util/gbifRegistry.js"


export default  (app) => {

    app.get("/dataset/:id", async function (req, res) {
        if (!req.params.id) {
            res.sendStatus(404);
        } else {
    
            try {
                let version = req.query?.version;
                if(!version){
                    version = await getCurrentDatasetVersion(req.params.id);
                } 
                const report = await getProcessingReport(req.params.id, version);
                let metrics;
                try {
                    metrics = await readMetrics((req.params.id, version))
                    report.metrics = metrics
                } catch (error) {
                    console.log(`No metrics for dataset ${req.params.id}`)
                }
                if(report){
                    res.json(report)
                } else {
                    res.sendStatus(404)
                }
            } catch (error) {
                console.log(error)
                res.sendStatus(404)
            }
            
    
        }
    });

    app.get("/dataset/:id/log.txt", async function (req, res) {
        if (!req.params.id) {
            res.sendStatus(404);
        } else {
            res.setHeader("Surrogate-Control", "no-store");
            res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
            res.setHeader("Expires", "0");
            try {
                let version = req.query?.version;
                if(!version){
                    version = await getCurrentDatasetVersion(req.params.id);
                } 
                const log = await getDatasetLog(req.params.id, version);
                if(log){
                    res.set('Content-Type', 'text/plain');
                   // res.set('Content-Disposition', 'attachment');
                    res.send(log)
                } else {
                    res.sendStatus(404)
                }
            } catch (error) {
                console.log(error)
                res.sendStatus(500)
            }
            
    
        }
    });

    app.delete("/dataset/:id", auth.userCanModifyDataset(), async function (req, res) {
        if (!req.params.id) {
            res.sendStatus(404);
        } else if(req?.user){
    
            try {
                let version = req.query?.version;
                if(!version){
                    version = await getCurrentDatasetVersion(req.params.id);
                } 
                const report = await getProcessingReport(req.params.id, version)

                if(report/*  && report?.createdBy === req?.user?.userName */){
                    if(report?.publishing?.gbifDatasetKey){
                        try {
                            console.log("delete at UAT")
                            await deleteDatasetInGbifUAT(report?.publishing?.gbifDatasetKey || report?.publishing?.gbifUatDatasetKey, config.gbifUsername, config.gbifPassword)
                            console.log("Successfully deleted at UAT")
                        } catch (error) {
                            console.log(`Could not delete dataset ${report?.publishing?.gbifDatasetKey || report?.publishing?.gbifUatDatasetKey} in the GBIF-UAT Registry`)
                            console.log(error)
                        }
                    }
                    await writeProcessingReport(req.params.id, version, {...report, deletedAt: new Date().toISOString(), deletedBy: req?.user?.userName})
                    await db.deleteUserDataset(req?.user?.userName, req.params.id)
                    res.sendStatus(200)
                } /* else if(report){
                    // Only the user that created it should be able to mark as deleted
                    res.sendStatus(403)
                } */ else {
                    res.sendStatus(404)
                }
                
            } catch (error) {
                console.log(error)
                res.sendStatus(500)
            }        
    
        } else {
            res.sendStatus(401)
        }
    });

    app.get('/datasets',  async function(req, res) {
        try {
            const datasets = await db.getAllDatasets();       
            
            res.json(datasets)
        } catch (error) {
            console.log(error)
            res.sendStatus(404)
        }
    })

    app.get('/datasets/published',  async function(req, res) {
        try {
            /* const limit = isNaN(Number(req?.query?.limit)) ? 20 : Number(req?.query?.limit)
            const offset = isNaN(Number(req?.query?.offset)) ? 20 :  Number(req?.query?.offset) */
            const datasets = await db.getDatasetsOrderedByDwcCreatedNoPaging()       
            
            res.json(datasets)
        } catch (error) {
            console.log(error)
            res.sendStatus(404)
        }
    })
    
}



