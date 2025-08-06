
import * as url from 'url';

import fs from 'fs'
import base64 from 'base-64';
// import {getYargs} from './util/index.js'
const gbifBaseUrl = {
    prod: "https://api.gbif.org/v1/",
    test: "https://api.gbif-test.org/v1/"
}

const gbifRegistryBaseUrl = {
    prod: 'https://registry-api.gbif.org/',
    test: 'https://registry-api.gbif-test.org/',
    local: 'https://registry-api.gbif-test.org/'
}
const getYargs = () =>  process.argv.reduce((acc, curr, idx) => {
    if(curr?.startsWith('--')){
      acc[curr.substring(2)] = process.argv[idx+1]
    }
    return acc
   }, {})



let gbifCredentials = {
    uatUsername: null,
    uatPassword: null,
    uatInstallationKey: null,
    uatPublishingOrganizationKey: null,
    dataDirectory: "",
    uatAuth: null,
    organizationFilePath: null,
    prodPublishingEnabled: false,
    prodInstallationKey: null,
    dataDirectory : null,
 	dwcPublicAccessUrl: null,
    port: 9000
}



try {
    console.log("Reading credentials from "+ process.argv)
    const yargs = getYargs()
    const creds = fs.readFileSync(`${yargs.credentials || '../somefakepathfortesting/gbifCredentials.json'}`,
    { encoding: 'utf8', flag: 'r' });
     gbifCredentials = JSON.parse(creds)
     gbifCredentials.uatAuth = `Basic ${base64.encode(gbifCredentials.uatPublishingOrganizationKey + ":" + gbifCredentials.uatOrganizationToken)}`
     gbifCredentials.organizationFilePath = yargs.organizationfile;
     if(!!yargs?.port){
        gbifCredentials.port = yargs?.port
     }
/*      gbifCredentials.prodPublishingEnabled = yargs.prodPublishingEnabled
 */     console.log(`Organization configuration file located at ${gbifCredentials.organizationFilePath} - this must be writable`)

} catch (error) {
    console.log("No GBIF user credentials given")
    throw error
}



const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const env = process.env.NODE_ENV || 'local';



const config = {
    local: {
        expressPort: gbifCredentials?.port,
        env: 'local',
        prodPublishingEnabled: gbifCredentials?.prodPublishingEnabled,
        nodeKey: gbifCredentials?.nodeKey,
        termsLink: gbifCredentials?.termsLink,
        installationAdmins: gbifCredentials?.installationAdmins,
        installationContactEmail: gbifCredentials?.installationContactEmail,
        dataStorage :   gbifCredentials?.dataDirectory,
        ebiOntologyService: 'https://www.ebi.ac.uk/ols/api/search',
        dwcPublicAccessUrl: gbifCredentials?.dwcPublicAccessUrl,
        rsyncDirectory: 'tsjeppesen@labs.gbif.org:~/public_html/edna',
        gbifBaseUrl,
        gbifRegistryBaseUrl,
        blastService: "http://blast.gbif-dev.org",
        uatInstallationKey: gbifCredentials?.uatInstallationKey,
        uatPublishingOrganizationKey: gbifCredentials?.uatPublishingOrganizationKey,
     /*    uatUsername: gbifCredentials?.uatUsername,
        uatPassword: gbifCredentials?.uatPassword, */
        uatAuth: gbifCredentials.uatAuth ,
        prodInstallationKey:  gbifCredentials?.prodInstallationKey,
        gbifGbrdsBaseUrl: {
            prod: 'https://gbrds.gbif-test.org/',
            uat: 'https://gbrds.gbif-test.org/',
            local: 'https://gbrds.gbif-test.org/'
        },
        organizationFilePath: gbifCredentials.organizationFilePath,
        title: gbifCredentials?.title,
        description: gbifCredentials?.description,
        frontendUrl: gbifCredentials?.frontendUrl,
	    backendProxyUrl: gbifCredentials?.backendProxyUrl
    },
    test: {
        expressPort: gbifCredentials?.port,
        env: 'test',
        prodPublishingEnabled: gbifCredentials?.prodPublishingEnabled,
        nodeKey: gbifCredentials.nodeKey,
        termsLink: gbifCredentials?.termsLink,
        installationAdmins: gbifCredentials?.installationAdmins,
        installationContactEmail: gbifCredentials?.installationContactEmail,
        dataStorage :   gbifCredentials?.dataDirectory,
        //dataStorage : "/mnt/auto/misc/hosted-datasets.gbif-uat.org/edna/" + gbifCredentials?.dataDirectory,
        ebiOntologyService: "https://www.ebi.ac.uk/ols/api/search",
        dwcPublicAccessUrl: gbifCredentials?.dwcPublicAccessUrl,
        rsyncDirectory: '', // Only for dev env, will already be accessible via http on UAT
        gbifBaseUrl,
        gbifRegistryBaseUrl,
        blastService: "http://blast.gbif-dev.org",
        uatInstallationKey: gbifCredentials?.uatInstallationKey,
        uatPublishingOrganizationKey: gbifCredentials?.uatPublishingOrganizationKey,
        /* uatUsername: gbifCredentials?.uatUsername,
        uatPassword: gbifCredentials?.uatPassword, */
        uatAuth: gbifCredentials.uatAuth,
        prodInstallationKey:  gbifCredentials?.prodInstallationKey,
        gbifGbrdsBaseUrl: {
            prod: 'https://gbrds.gbif-test.org/', // if the env is UAT, we do not publish to prod
            test: 'https://gbrds.gbif-test.org/',
            uat: 'https://gbrds.gbif-test.org/'
        },
        organizationFilePath: gbifCredentials.organizationFilePath,
        title: gbifCredentials?.title,
        description: gbifCredentials?.description,
        frontendUrl: gbifCredentials?.frontendUrl,
	    backendProxyUrl: gbifCredentials?.backendProxyUrl

       /*  installationKey: "aec88852-acfa-4b12-af59-b4b50d6f07b2",
        publishingOrganizationKey: "f7ecf12b-221d-4eea-806d-fb4b37face25",
        gbifUsername: gbifCredentials?.username,
        gbifPassword: gbifCredentials?.password */
    },
    prod: {
        expressPort: gbifCredentials.port,
        env: 'prod',
        prodPublishingEnabled: gbifCredentials?.prodPublishingEnabled,
        nodeKey: gbifCredentials.nodeKey,
        termsLink: gbifCredentials?.termsLink,
        installationAdmins: gbifCredentials?.installationAdmins,
        installationContactEmail: gbifCredentials?.installationContactEmail,
        dataStorage :   gbifCredentials?.dataDirectory,
        // dataStorage : "/mnt/auto/misc/hosted-datasets.gbif.org/edna/"  + gbifCredentials?.dataDirectory,
        ebiOntologyService: "https://www.ebi.ac.uk/ols/api/search",
        dwcPublicAccessUrl: gbifCredentials?.dwcPublicAccessUrl,
        rsyncDirectory: '', // Only for dev env, will already be accessible via http on UAT
        gbifBaseUrl,
        gbifRegistryBaseUrl,
        blastService: "http://blast.gbif-dev.org",
        uatInstallationKey: gbifCredentials?.uatInstallationKey,
        uatPublishingOrganizationKey: gbifCredentials?.uatPublishingOrganizationKey,
       /*  uatUsername: gbifCredentials?.uatUsername,
        uatPassword: gbifCredentials?.uatPassword, */
        uatAuth: gbifCredentials.uatAuth,
        prodInstallationKey:  gbifCredentials?.prodInstallationKey,
        gbifGbrdsBaseUrl: {
            prod: 'https://gbrds.gbif.org/', // This can publish to prod
            uat: 'https://gbrds.gbif-test.org/'
        },
        organizationFilePath: gbifCredentials.organizationFilePath,
        title: gbifCredentials?.title,
        description: gbifCredentials?.description,
        frontendUrl: gbifCredentials?.frontendUrl,
	    backendProxyUrl: gbifCredentials?.backendProxyUrl
        /* installationKey: "aec88852-acfa-4b12-af59-b4b50d6f07b2",
        publishingOrganizationKey: "f7ecf12b-221d-4eea-806d-fb4b37face25",
        gbifUsername: gbifCredentials?.username,
        gbifPassword: gbifCredentials?.password */
    },
}


export default config[env]
