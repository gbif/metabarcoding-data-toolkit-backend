
import auth from './Auth/auth.js'
import db from './db/index.js'
import { getDataset } from '../util/dataset.js';
import {getCurrentDatasetVersion, getProcessingReport, writeProcessingReport} from '../util/filesAndDirectories.js'


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
                if(report){
                    res.json(report)
                } else {
                    res.status(404)
                }
            } catch (error) {
                console.log(error)
                res.status(404)
            }
            
    
        }
    });

    app.delete("/dataset/:id", auth.appendUser(), async function (req, res) {
        if (!req.params.id) {
            res.sendStatus(404);
        } else if(req?.user){
    
            try {
                let version = req.query?.version;
                if(!version){
                    version = await getCurrentDatasetVersion(req.params.id);
                } 
                const report = await getProcessingReport(req.params.id, version)

                if(report && report?.createdBy === req?.user?.userName){
                    await writeProcessingReport(req.params.id, version, {...report, deletedAt: new Date().toISOString()})
                    await db.deleteUserDataset(req?.user?.userName, req.params.id)
                    res.sendStatus(200)
                } else if(report){
                    // Only the user that created it should be able to mark as deleted
                    res.sendStatus(403)
                } else {
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
    
}



