import multer from "multer";
import fs from 'fs';
import config from '../config.js'
import auth from './Auth/auth.js';
import db from './db/index.js'
import {getAuthorString} from '../util/index.js'
import {writeEmlJson,fileExists, wipeGeneratedFilesAndResetProccessing, getMetadata, getProcessingReport, writeProcessingReport, writeEmlXml, getCurrentDatasetVersion} from '../util/filesAndDirectories.js'
import validMimeTypes from "../enum/validMimeTypes.js";
import {hdf5FileExtensions, fastaFileExtensions} from "../enum/validFileExtensions.js"
const storage = multer.diskStorage({
  //Specify the destination directory where the file needs to be saved
  destination: function (req, file, cb) {
    //console.log("Uploaded by "+ req?.user?.userName)
    if (!validMimeTypes.includes(file.mimetype)) {
      if(!(file.mimetype === 'application/octet-stream' && [...hdf5FileExtensions, ...fastaFileExtensions, 'qza', 'xlsx', 'tsv', 'csv'].includes(file.originalname.split('.').pop()))){
        console.log("Unsupported: " +file.mimetype + " " + file.originalname) 
        console.log("Uploaded by "+ req?.user?.userName)
        return cb(new Error('Unsupported file type'))
      }
    }
    let id = req?.params?.id ?? req.id;
    const dir = config.dataStorage + id + `/${req?.query?.version ?? "1"}` + "/original";
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir)
  },
  //Specify the name of the file. The date is prefixed to avoid overwriting of files.
  filename: function (req, file, cb) {
    cb(null, file.originalname)
  },
})

const upload = multer({
  storage: storage,
})

const logMulterError = (error, req, res, next) => {
  console.log('This is the rejected field ->', error.field);
}

const handleUploadError = (error, req, res, next) => {
  console.log(error.message)
  if(error.message === 'Unsupported file type'){
  res.sendStatus(415)
  }
}
export default  (app) => {
  app.post('/dataset/upload', auth.appendUser(), upload.array('tables', 5), handleUploadError, /* logMulterError, */ async function (req, res, next) {
    try {
      const version = req?.query?.version ?? "1";
      if(req?.user){
        const datasetTitle = req.body?.datasetTitle || ""
        const author = getAuthorString(req.user)
        await db.createUserDataset({userName: req?.user?.userName, datasetId: req.id, title: datasetTitle, author, version})
        let  processReport = {id: req.id, createdAt: new Date().toISOString(), createdBy: req?.user?.userName, datasetAuthor: getAuthorString(req?.user)}
        await writeProcessingReport(req.id, version, processReport)
      
    console.log(`Dataset ${req.id} created by ${req?.user?.userName}. Title: ${datasetTitle}`)
        if(datasetTitle){
          await writeEmlJson(req.id, version, {title: datasetTitle})
        }
      } else {
        console.log("Upload attention: no user logged in" )
        res.sendStatus(401) 
      }
      res.send(req.id)
    } catch (error) {
      console.log(error)
      res.sendStatus(500)
    }
    
  })
  
app.put('/dataset/:id/upload', auth.userCanModifyDataset(), upload.array('tables', 5), handleUploadError, async function (req, res, next) {
  try {
    let version = req?.query?.version;
    const currentVersion = await getCurrentDatasetVersion(req.params.id)
   
    const hasBiom = await fileExists(req.params.id, currentVersion, 'data.biom.json')
    if(hasBiom && (!version || version === currentVersion)){
        await wipeGeneratedFilesAndResetProccessing(req.params.id, currentVersion)
    }
    if(!version){
      version = currentVersion
    }
    
    const datasetTitle = req.body?.datasetTitle || ""
    console.log(`Dataset ${req.params.id} changed by ${req?.user?.userName}. Title: ${datasetTitle}`)
    if(datasetTitle){
      let metadata = await getMetadata(req.params.id, version)
      if(metadata?.title !== datasetTitle){
        await writeEmlJson(req.params.id, version, {...metadata, title: datasetTitle})
        try {
          await db.updateTitleOnDataset(req?.user?.userName, req.params.id, datasetTitle)
        } catch (error) {
          console.log(`Could not update dataset title in DB for dataset: ${req.params.id}`)
          console.log(error)
        }
        
      }
    }
    //res.send(req?.params?.id)
    res.sendStatus(204)
 
} catch (error) {
    console.log(error)
    res.sendStatus(500)
}
  
  })
}
