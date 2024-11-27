
import auth from './Auth/auth.js';
import {writeMapping, readMapping, getCurrentDatasetVersion, getProcessingReport, writeProcessingReport} from '../util/filesAndDirectories.js'


const saveMapping = async function (req, res) {
    if (!req.params.id) {
      res.sendStatus(400);
    } else {
        try {
            let version = req?.query?.version;
            if(!version){
                version = await getCurrentDatasetVersion(req.params.id)
            } 
            const oldMapping = await readMapping(req.params.id, version)
            const {createdAt, createdBy, ...rest} = oldMapping || {};
            if(JSON.stringify(rest) !== JSON.stringify(req.body)){
                console.log(`Save mapping for dataset ${req.params.id}`)
                const newMapping = {...req.body, createdAt: new Date(), createdBy: req?.user?.userName}
            await writeMapping(req.params.id, version, newMapping)
            const report = await getProcessingReport(req.params.id, version)
            await writeProcessingReport(req.params.id, version, {...report, mapping: newMapping})
           // console.log(eml)
            res.send(req.body)
            } else {
                console.log(`Mapping was not changed for dataset ${req.params.id}`)
                res.send(req.body)
            }
             
        } catch (error) {
            console.log(error)
            res.sendStatus(500)
        }
    }
  };

export default  (app) => {
    app.put("/dataset/:id/mapping",  auth.userCanModifyDataset(), saveMapping);
    app.post("/dataset/:id/mapping", auth.userCanModifyDataset(), saveMapping);

}