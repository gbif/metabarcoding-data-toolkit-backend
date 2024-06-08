
import * as url from 'url';
import fs from 'fs';
import { getEml } from '../util/Eml/index.js';
import {writeEmlJson, writeEmlXml, getCurrentDatasetVersion} from '../util/filesAndDirectories.js'
import auth from './Auth/auth.js';
import db from './db/index.js'
import config from '../config.js';
import axios from 'axios';
const baseUrl = config.env === "prod" ? config.gbifBaseUrl.prod : config.gbifBaseUrl.uat;

const getOrganizations = async function (req, res) {
    

        try {
            
            const response = await axios.get(`${baseUrl}organization/suggest?q=${req.query.q}`)
            res.send(response?.data) 
        } catch (error) {
            console.log(error)
            res.sendStatus(500)
        }
    
  };

export default  (app) => {
    app.get("/organization/suggest", getOrganizations);

}