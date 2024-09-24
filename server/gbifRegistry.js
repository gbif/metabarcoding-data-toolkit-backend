
import * as url from 'url';
import fs from 'fs';
import { getEml } from '../util/Eml/index.js';
import {writeEmlJson, writeEmlXml, getCurrentDatasetVersion} from '../util/filesAndDirectories.js'
import auth from './Auth/auth.js';
import db from './db/index.js'
import config from '../config.js';
import axios from 'axios';
const baseUrl = config.env === "prod" ? config.gbifBaseUrl.prod : config.gbifBaseUrl.uat;

const getOrganizations = async  (req, res) => {
    
        try {
            const response = await axios.get(`${baseUrl}organization/suggest?q=${req.query.q}`)
            res.send(response?.data) 
        } catch (error) {
            console.log(error)
            res.sendStatus(500)
        }
    
  };

const getInstallationContactEmail = async (req, res) => {
    try {
        const installationContactEmail = config.installationContactEmail
        res.send({installationContactEmail}) 
    } catch (error) {
        console.log(error)
        res.sendStatus(500)
    }
}

const getInstallationSettings = async (req, res) => {
    try {
        const installationContactEmail = config.installationContactEmail
        const prodPublishingEnabled = config.prodPublishingEnabled
        const termsLink = config.termsLink
        const nodeKey = config.nodeKey
        const gbifRegistryBaseUrl = config.gbifRegistryBaseUrl[config.env]
        const title = config?.title;
        const description =  config?.description;
        const settings = {
            installationContactEmail,
            prodPublishingEnabled,
            termsLink,
            nodeKey,
            gbifRegistryBaseUrl,
            title,
            description
        };
        res.send(settings) 
    } catch (error) {
        console.log(error)
        res.sendStatus(500)
    }
}

const getOrganizationToken = async (req, res) => {
    
    try {
        let options = {
            method: 'get',
            url: `${config.gbifRegistryBaseUrl[config.env]}organization/${req?.params?.key}/password`,
            headers: {
                authorization: req?.headers?.authorization
            }
        }
        const response = await axios(options);

        res.send(response?.data)
        
    } catch (error) {
        console.log(error)
        res.sendStatus(error?.response?.status || 500)
    }
}



export default  (app) => {
    app.get("/organization/:key/password", getOrganizationToken);
    app.get("/organization/suggest", getOrganizations);
    app.get("/installation-contact-email", getInstallationContactEmail);
    app.get("/installation-settings", getInstallationSettings);

}