
import User from './user.model.js';
import auth from './auth.js'
import db from '../db/index.js'
import { getDataset } from '../../util/dataset.js';


export default  (app) => {
    app.get('/user/datasets', auth.appendUser(), async function(req, res) {
        try {
            const datasets = await db.getUserDatasets(req.user?.userName)
           
            //const datasets = []
           /*  for (const id of datasetIds) {
                const dataset = await getDataset(id)
                datasets.push(dataset || {id: id})
            }
            res.json(datasets) */
            res.json(datasets)
        } catch (error) {
            console.log(error)
            res.sendStatus(404)
        }
    })
    
}



