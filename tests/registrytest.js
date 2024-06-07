import {registerDatasetInGBIF} from '../util/gbifRegistry.js'
import { registerStudyGbrds } from '../util/gbifRegistry.js'
import {getMetadata} from '../util/filesAndDirectories.js'
import config from '../config.js';

const datasetID = "70723436-2b4a-4054-b8c9-a28d61efcd77";

const test = async () => {
    try {
        const metadata = await getMetadata(datasetID, 1)

        // console.log(metadata?.contact)
        /* console.log({
            primaryContactName: `${metadata?.contact?.givenName ? metadata?.contact?.givenName +" ": ""}${metadata?.contact?.surName}`,
            primaryContactEmail:  metadata?.contact?.electronicMailAddress
        }) */
        // {ednaDatasetID, version, auth, env, publishingOrganizationKey}
        const response = await registerStudyGbrds({
        ednaDatasetID: "New Test from eDNA tool using GBRDS", 
        version: 1, 
        auth: 'Basic ZjdlY2YxMmItMjIxZC00ZWVhLTgwNmQtZmI0YjM3ZmFjZTI1OmtXREZHQ0hFdW5ucA==',
        env: 'uat',
        publishingOrganizationKey: "f7ecf12b-221d-4eea-806d-fb4b37face25",
        primaryContact: {
            primaryContactName: `${metadata?.contact?.givenName ? metadata?.contact?.givenName +" ": ""}${metadata?.contact?.surName}`,
            primaryContactEmail: 'tsjeppesen@gbif.org'
        },
        endpoint: 'https://hosted-datasets.gbif-uat.org/edna/0322227a-637e-4af5-b432-f95d119cf621/1/archive.zip'
    })
    console.log("UUID: ")
    console.log(response)
    } catch (error) {
        console.log(error)
    }
}

const testXml = () => {

}
test()

// registerDatasetInGBIF('61f64694-157a-4237-bcdb-61042fff43d5', 'user', 'pw')