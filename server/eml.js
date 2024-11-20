
import * as url from 'url';
import fs from 'fs';
import axios from 'axios'
import { getEml } from '../util/Eml/index.js';
import {writeEmlJson, writeEmlXml, getCurrentDatasetVersion, getMetadata, dwcArchiveExists, getProcessingReport, writeProcessingReport} from '../util/filesAndDirectories.js'
import auth from './Auth/auth.js';
import db from './db/index.js'
import { md5 } from '../util/index.js';
import config from '../config.js';

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

const submitDwcToDataValidator = async (req, res) => {
    if (!req.params.id) {
        res.sendStatus(400);
      } else {
            try {
                let version = req?.query?.version
                 if(!version){
                    version = await getCurrentDatasetVersion(req.params.id)
                } 
                const hasDwcArchive = await  dwcArchiveExists(req.params.id, version)
                if(!hasDwcArchive){
                    throw "No DWC Archive found"
                }
                const fileUrl =  config.env === 'local' ? `${config.dwcPublicAccessUrl}${req.params.id}.zip` : `${config.dwcPublicAccessUrl}${req.params.id}/${version}/archive.zip`
                const formData = new FormData();
                formData.append("fileUrl", fileUrl);
                const response = await axios({
                    method: 'post',
                   url:  `${config.gbifBaseUrl.prod}validation/url`,
                   headers: {
                     authorization: req.headers.authorization,
                     'content-type': 'multipart/form-data'
                 },
                   data: formData
                 }); 
                 
                
                let report = await getProcessingReport(req.params.id, version);
                report.publishing = report?.publishing || {}
                report.publishing.validationId = response?.data?.key;
                report.publishing.validationCreatedBy = req.user?.userName;
                report.publishing.validationCreatedAt = Date.now()
                await writeProcessingReport(req.params.id, version, report)
                await db.updateValidationIdOnDataset(response?.data?.key, req.params.id)
                 console.log(response?.data)
                res.json({key: response?.data?.key})
            } catch (error) {
                console.log(error)
                if(error === "No DWC Archive found"){
                    res.status(400).send(error)
                } else {
                    res.sendStatus(500)
                }
            }
        }
}

export default  (app) => {
    app.put("/dataset/:id/metadata", auth.userCanModifyDataset(), processEml);
    app.post("/dataset/:id/metadata", auth.userCanModifyDataset(), processEml);
    app.get("/agents", auth.appendUser(), getAgentsFromOtherResources);
    app.post("/dataset/:id/data-validator", auth.appendUser(), submitDwcToDataValidator)
}