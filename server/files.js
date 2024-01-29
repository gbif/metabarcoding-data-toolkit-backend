
import {deleteOriginalFile, getCurrentDatasetVersion, fileExists, wipeGeneratedFilesAndResetProccessing} from '../util/filesAndDirectories.js'
import {validate} from './validation.js'
import {getMimeFromPath} from '../validation/files.js'
import auth from './Auth/auth.js';
import config from '../config.js'

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
            await deleteOriginalFile(req.params.id, version, req.params.filename)
            await validate(req.params.id)
            const hasBiom = await fileExists(req.params.id, version, 'data.biom.json')
            if(hasBiom){
                await wipeGeneratedFilesAndResetProccessing(req.params.id, version)
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

export default  (app) => {
    app.delete("/dataset/:id/file/:filename", auth.userCanModifyDataset(),  deleteUploadedFile);
    app.get("/dataset/:id/file/:filename", (req, res) => downloadFile(req, res, false))
    app.get("/dataset/:id/uploaded-file/:filename", (req, res) => downloadFile(req, res, true))

}