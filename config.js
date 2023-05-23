
import * as url from 'url';
import gbifCredentials from '../ednaToolData/gbifCredentials.json' assert { type: "json" }

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const DEV = {
    duckdb:  __dirname + "../ednaToolData/edna_duck.db",
    dataStorage :  __dirname + "data/",
    outputPath: __dirname + "output/",
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
}

export default DEV