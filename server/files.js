
import {deleteOriginalFile, getCurrentDatasetVersion, getProcessingReport, writeProcessingReport, fileExists, wipeGeneratedFilesAndResetProccessing} from '../util/filesAndDirectories.js'
import {validate} from './validation.js'
import {getMimeFromPath} from '../validation/files.js'
import filenames from '../validation/filenames.js'
import auth from './Auth/auth.js';
import config from '../config.js'
import db from './db/index.js';

import fs from "fs"
const deleteUploadedFile = async  (req, res) => {
    if (!req.params.id || !req.params.filename) {
      res.sendStatus(400);
    } else {
        try {
            let version = req?.query?.version;
            if(!version){
                version = await getCurrentDatasetVersion(req.params.id)
            } 
            console.log("delete file")
            await deleteOriginalFile(req.params.id, version, req.params.filename)
            console.log("validate")
            await validate(req.params.id)
            console.log("done")

            const hasBiom = await fileExists(req.params.id, version, 'data.biom.json')
            if(hasBiom){
                await wipeGeneratedFilesAndResetProccessing(req.params.id, version)
                await db.updateDwcGeneratedOnDataset(req?.user?.userName,req.params.id, null )
            }
            res.sendStatus(200) 
        } catch (error) {
            console.log(error)
            res.sendStatus(500)
        }
    }
  };

const downloadFile = async (req, res, fromOriginalDir) => {
    if (!req.params.id || !req.params.filename) {
        res.sendStatus(400);
      } else {
        const id = req.params.id;
        let version = req?.query?.version;
            if(!version){
                version = await getCurrentDatasetVersion(req.params.id)
            } 
            let fileList = await fs.promises.readdir(`${config.dataStorage}${id}/${version}${fromOriginalDir ? '/original':'' }`);
            if(fileList.includes(req.params.filename)){
                const mimeType = getMimeFromPath(`${config.dataStorage}${id}/${version}${fromOriginalDir ? '/original':'' }/${req.params.filename}`)
                res.setHeader("content-type", mimeType);
                fs.createReadStream(`${config.dataStorage}${id}/${version}${fromOriginalDir ? '/original':'' }/${req.params.filename}`).pipe(res);
            } else {
                res.sendStatus(404)
            }
        
      }
     
   
  }

  const fileTypeMapping = async (req, res) => {
        const id = req.params.id;
        let version = req?.query?.version;
       // console.log(req.body)
        try {
            if(!version){
                version = await getCurrentDatasetVersion(req.params.id)
            } 
            let processionReport = await getProcessingReport(id, version)
            await writeProcessingReport(id, version, {...processionReport, files: {...processionReport.files, mapping: req.body}})
            res.sendStatus(201)
        } catch (error) {
            console.log(error)
            res.sendStatus(500)
        }
               
  }
const getFileNameSynonyms = async (req, res) => {

    try {
        res.json(filenames)
        } catch (error) {
            res.sendStatus(500)
        } 
}

export default  (app) => {
    app.delete("/dataset/:id/file/:filename", auth.userCanModifyDataset(),  deleteUploadedFile);
    app.get("/dataset/:id/file/:filename", (req, res) => downloadFile(req, res, false))
    app.get("/dataset/:id/uploaded-file/:filename", (req, res) => downloadFile(req, res, true))
    app.post("/dataset/:id/file-types", auth.userCanModifyDataset(), (req, res) => fileTypeMapping(req, res))
    app.get("/file-name-synonyms", getFileNameSynonyms)

}