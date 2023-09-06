
import auth from './Auth/auth.js'
import db from './db/index.js'
import { getDataset } from '../util/dataset.js';


export default  (app) => {
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



