import multer from "multer";
import fs from 'fs';
import config from '../config.js'
import auth from './Auth/auth.js';
import db from './db/index.js'

const storage = multer.diskStorage({
  //Specify the destination directory where the file needs to be saved
  destination: function (req, file, cb) {
    console.log("Uploaded by "+ req?.user?.userName)
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

export default  (app) => {
  app.post('/dataset/upload', auth.appendUser(), upload.array('tables', 3), async function (req, res, next) {
    if(req?.user){
      await db.createUserDataset(req?.user?.userName, req.id)
      console.log(`Dataset ${req.id} created by ${req?.user?.userName}`)
    } else {
      console.log("Upload attention: no user logged in" )
    }
    res.send(req.id)
  })
app.put('/dataset/:id/upload', auth.userCanModifyDataset(), upload.array('tables', 3), function (req, res, next) {
    console.log(req.files)
    console.log(req.id)
    res.send(req?.params?.id)
  })
}
