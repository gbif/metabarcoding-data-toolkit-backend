
import * as url from 'url';
import fs from 'fs';
import { getEml } from '../util/Eml/index.js';
import {writeEmlJson, writeEmlXml, getCurrentDatasetVersion, getMetadata} from '../util/filesAndDirectories.js'
import auth from './Auth/auth.js';
import db from './db/index.js'
import { md5 } from '../util/index.js';

const processEml = async function (req, res) {
    if (!req.params.id) {
      res.sendStatus(400);
    } else {
        try {
            let version = req?.query?.version;
            if(!version){
                version = await getCurrentDatasetVersion(req.params.id)
            } 
            await writeEmlJson(req.params.id, version, req.body)
            const xml = getEml({...req.body, id : req.params.id})
            await writeEmlXml(req.params.id, version, xml)
            await db.updateTitleOnDataset(req?.user?.userName, req.params.id, req.body?.title)

            if(!!req.body?.description){
                await db.updateDescriptionOnDataset(req?.user?.userName, req.params.id, req.body?.description.substring(0, 300))
            }
           // console.log(eml)
            res.send(req.body) 
        } catch (error) {
            console.log(error)
            res.sendStatus(500)
        }
    }
  };

const getAgentsFromOtherResources = async (req, res) => {

    try {
        const datasets = await db.getUserDatasets(req.user?.userName);
        
        const agents = []
        for (const dataset of datasets){
            if(dataset?.dataset_id){
                const metaData = await getMetadata(dataset?.dataset_id, dataset?.version || 1);
                for (const entity of ['contact', 'creator', 'metadataProvider', 'associatedParty', 'projectPersonnel'])
                    if(metaData?.[entity]){
                        agents.push(metaData?.[entity])
                    }
            }     
        }
        // Return an array of alle the unique agents of the users datasets
        res.json(Array.from(new Map(agents.flat().map(a => [md5(JSON.stringify(a)), a])).values()))
    } catch (error) {
        res.sendStatus(500)
    }
}

export default  (app) => {
    app.put("/dataset/:id/metadata", auth.userCanModifyDataset(), processEml);
    app.post("/dataset/:id/metadata", auth.userCanModifyDataset(), processEml);
    app.get("/agents", auth.appendUser(), getAgentsFromOtherResources);

}