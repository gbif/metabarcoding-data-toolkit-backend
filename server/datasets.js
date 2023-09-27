
import auth from './Auth/auth.js'
import db from './db/index.js'
import { getDataset } from '../util/dataset.js';
import {getCurrentDatasetVersion, getProcessingReport} from '../util/filesAndDirectories.js'


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

    app.get('/datasets',  async function(req, res) {
        try {
            const datasets = await db.getAllDatasets();        // .getUserDatasets(req.user?.userName)
            /* const datasets = []
            for (const id of datasetIds) {
                console.log(id)
                const dataset = await getDataset(id)
                datasets.push(dataset || {id: id})
            } */
            res.json(datasets)
        } catch (error) {
            console.log(error)
            res.sendStatus(404)
        }
    })
    
}



