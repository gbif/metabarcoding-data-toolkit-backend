
import * as url from 'url';
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import fs from 'fs'

const creds = fs.readFileSync(`${yargs(hideBin(process.argv)).argv?.credentials || '../ednaToolData/gbifCredentials.json'}`,
    { encoding: 'utf8', flag: 'r' });
const gbifCredentials = JSON.parse(creds)
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const env = process.env.NODE_ENV || 'local';


const config = {
    local: {
        duckdb:  __dirname + "../ednaToolData/edna_duck.db",
        dataStorage :  __dirname + "../ednaToolData/data/",
        ebiOntologyService: 'https://www.ebi.ac.uk/ols/api/search',
        dwcPublicAccessUrl: 'http://labs.gbif.org/~tsjeppesen/edna/',
        rsyncDirectory: 'tsjeppesen@labs.gbif.org:~/public_html/edna',
        gbifBaseUrl: "https://api.gbif-uat.org/v1/",
        gbifBaseUrlProd: "https://api.gbif.org/v1/",
        gbifRegistryBaseUrl: 'https://registry-api.gbif-uat.org/',
        blastService: "http://blast.gbif-dev.org",
        installationKey: "fb5e4c2a-579c-434b-a446-3a665dd732ad",
        publishingOrganizationKey: "fbca90e3-8aed-48b1-84e3-369afbd000ce",
        gbifUsername: gbifCredentials.username,
        gbifPassword: gbifCredentials.password
    },
    uat: {
        duckdb:  __dirname + "../ednaToolData/edna_duck.db",
        dataStorage :  __dirname + "../ednaToolData/data/",
        ebiOntologyService: 'https://www.ebi.ac.uk/ols/api/search',
        dwcPublicAccessUrl: 'http://labs.gbif.org/~tsjeppesen/edna/',
        rsyncDirectory: 'tsjeppesen@labs.gbif.org:~/public_html/edna',
        gbifBaseUrl: "https://api.gbif-uat.org/v1/",
        gbifBaseUrlProd: "https://api.gbif.org/v1/",
        gbifRegistryBaseUrl: 'https://registry-api.gbif-uat.org/',
        blastService: "http://blast.gbif-dev.org",
        installationKey: "aec88852-acfa-4b12-af59-b4b50d6f07b2",
        publishingOrganizationKey: "f7ecf12b-221d-4eea-806d-fb4b37face25",
        gbifUsername: gbifCredentials.username,
        gbifPassword: gbifCredentials.password
    },
}


export default config[env]