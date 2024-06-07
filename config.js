
import * as url from 'url';

import fs from 'fs'
import base64 from 'base-64';
import {getYargs} from './util/index.js'
const gbifBaseUrl = {
    prod: "https://api.gbif.org/v1/",
    uat: "https://api.gbif-uat.org/v1/"
}

const gbifRegistryBaseUrl = {
    prod: 'https://registry-api.gbif.org/',
    uat: 'https://registry-api.gbif-uat.org/',
    local: 'https://registry-api.gbif-uat.org/'
}




let gbifCredentials = {
    uatUsername: null,
    uatPassword: null,
    uatInstallationKey: null,
    uatPublishingOrganizationKey: null,
    dataDirectory: "",
    uatAuth: null,
    adminFilePath: null
}

try {
    console.log("Reading credentials from "+process.argv)
    const yargs = getYargs()
    const creds = fs.readFileSync(`${yargs.credentials || '../somefakepathfortesting/gbifCredentials.json'}`,
    { encoding: 'utf8', flag: 'r' });
     gbifCredentials = JSON.parse(creds) 
     gbifCredentials.uatAuth = `Basic ${base64.encode(gbifCredentials.uatPublishingOrganizationKey + ":" + gbifCredentials.uatOrganizationToken)}`
     gbifCredentials.adminFilePath = yargs.adminfile
     console.log(`Admin file located at ${gbifCredentials.adminFilePath} - this must be writable`)

} catch (error) {
    console.log("No GBIF user credentials given")
}



const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const env = process.env.NODE_ENV || 'local';



const config = {
    local: {
        env: 'local',
        dataStorage :  __dirname + "../ednaToolData/data/" + gbifCredentials?.dataDirectory,
        ebiOntologyService: 'https://www.ebi.ac.uk/ols/api/search',
        dwcPublicAccessUrl: 'http://labs.gbif.org/~tsjeppesen/edna/',
        rsyncDirectory: 'tsjeppesen@labs.gbif.org:~/public_html/edna',
        gbifBaseUrl,
        gbifRegistryBaseUrl,
        blastService: "http://localhost:9100", //"http://blast.gbif-dev.org",
        uatInstallationKey: gbifCredentials?.uatInstallationKey, 
        uatPublishingOrganizationKey: gbifCredentials?.uatPublishingOrganizationKey,  
     /*    uatUsername: gbifCredentials?.uatUsername,
        uatPassword: gbifCredentials?.uatPassword, */
        uatAuth: gbifCredentials.uatAuth ,
        gbifGbrdsBaseUrl: {
            prod: 'https://gbrds.gbif-uat.org/',
            uat: 'https://gbrds.gbif-uat.org/'
        },
        adminFilePath: gbifCredentials.adminFilePath
    },
    uat: {
        env: 'uat',
        dataStorage : "/mnt/auto/misc/hosted-datasets.gbif-uat.org/edna/" + gbifCredentials?.dataDirectory,
        ebiOntologyService: "https://www.ebi.ac.uk/ols/api/search",
        dwcPublicAccessUrl: "https://hosted-datasets.gbif-uat.org/edna/"  + gbifCredentials?.dataDirectory,  // 'http://labs.gbif.org/~tsjeppesen/edna/',
        rsyncDirectory: '', // Only for dev env, will already be accessible via http on UAT
        gbifBaseUrl,
        gbifRegistryBaseUrl,
        blastService: "http://blast.gbif-dev.org",
        uatInstallationKey: gbifCredentials?.uatInstallationKey, 
        uatPublishingOrganizationKey: gbifCredentials?.uatPublishingOrganizationKey,  
        /* uatUsername: gbifCredentials?.uatUsername,
        uatPassword: gbifCredentials?.uatPassword, */
        uatAuth: gbifCredentials.uatAuth,
        gbifGbrdsBaseUrl: {
            prod: 'https://gbrds.gbif-uat.org/',
            uat: 'https://gbrds.gbif-uat.org/'
        },
        adminFilePath: gbifCredentials.adminFilePath

       /*  installationKey: "aec88852-acfa-4b12-af59-b4b50d6f07b2",
        publishingOrganizationKey: "f7ecf12b-221d-4eea-806d-fb4b37face25",
        gbifUsername: gbifCredentials?.username,
        gbifPassword: gbifCredentials?.password */
    },
    prod: {
        env: 'prod',
        dataStorage : "/mnt/auto/misc/hosted-datasets.gbif.org/edna/"  + gbifCredentials?.dataDirectory,
        ebiOntologyService: "https://www.ebi.ac.uk/ols/api/search",
        dwcPublicAccessUrl: "https://hosted-datasets.gbif.org/edna/"  + gbifCredentials?.dataDirectory,  // 'http://labs.gbif.org/~tsjeppesen/edna/',
        rsyncDirectory: '', // Only for dev env, will already be accessible via http on UAT
        gbifBaseUrl,
        gbifRegistryBaseUrl,
        blastService: "http://blast.gbif-dev.org",
        uatInstallationKey: gbifCredentials?.uatInstallationKey, 
        uatPublishingOrganizationKey: gbifCredentials?.uatPublishingOrganizationKey,  
       /*  uatUsername: gbifCredentials?.uatUsername,
        uatPassword: gbifCredentials?.uatPassword, */
        uatAuth: gbifCredentials.uatAuth,
        gbifGbrdsBaseUrl: {
            prod: 'https://gbrds.gbif.org/',
            uat: 'https://gbrds.gbif-uat.org/'
        },
        adminFilePath: gbifCredentials.adminFilePath
        /* installationKey: "aec88852-acfa-4b12-af59-b4b50d6f07b2",
        publishingOrganizationKey: "f7ecf12b-221d-4eea-806d-fb4b37face25",
        gbifUsername: gbifCredentials?.username,
        gbifPassword: gbifCredentials?.password */
    },
}


export default config[env]