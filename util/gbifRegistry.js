import axios from 'axios'
import _ from "lodash";
import config from '../config.js'

export const isRegisteredInGBIF = async (ednaDatasetID) => {
  const response = await axios.get(`${config.gbifBaseUrl}dataset?identifier=${ednaDatasetID}`);

  const registeredAndNotDeletedDatasets = response?.data.results.filter(d => _.isUndefined(d.deleted))
  if (registeredAndNotDeletedDatasets.length > 1) {
    console.error(
      `Dataset id ${ednaDatasetID} is registered ${registeredAndNotDeletedDatasets.length} times in GBIF`
    );
  }
  return  registeredAndNotDeletedDatasets[0]; // registeredAndNotDeletedDatasets.length === 1;
};

const addIdentifier = async (ednaDatasetID, uuid, username, password, env) => {

  return axios( {
    method: 'post',
    url: `${config.gbifBaseUrl}dataset/${uuid}/identifier`,
    auth: {
        username,
        password
      },
    data: {
        type: "UUID",
        identifier: `${ednaDatasetID}`
      }})
};

const addEndpoint = async (ednaDatasetID, version, uuid, username, password) => {

  return axios({
    method: 'post',
    url: `${config.gbifBaseUrl}dataset/${uuid}/endpoint`,
    auth: {
        username,
        password
      },
    data: {
      type: "DWC_ARCHIVE",
      url: config.env === 'local' ? `${config.dwcPublicAccessUrl}${ednaDatasetID}.zip` : `${config.dwcPublicAccessUrl}${ednaDatasetID}/${version}/archive.zip`
    }
  }); 
 

};
const registerStudy = async (ednaDatasetID, username, password) => {
   
  return axios({
     method: 'post',
    url: `${config.gbifBaseUrl}dataset`,
/*     headers: {
        Authorization: auth
    }, */
   auth: {
        username,
        password
      }, 
    data: {
      title: ednaDatasetID,
      type: "OCCURRENCE",
      publishingOrganizationKey: config.publishingOrganizationKey,
      installationKey: config.installationKey
    }
  }); 
};

const crawlDataset = (uuid, username, password) => {
  return axios({
    method: 'post',
    url: `${config.gbifBaseUrl}dataset/${uuid}/crawl`,
    auth: {
        username,
        password
      },
  });
};

export const registerDatasetInGBIF = async (ednaDatasetID, version, username, password) => {
  


    const registered = await isRegisteredInGBIF(ednaDatasetID);

    if (registered) {
        
        console.log(`Dataset ${ednaDatasetID} is already registered, changes will be picked up on next crawl`);
        await crawlDataset(registered?.key, username, password)
        return registered?.key;
      } else if (!registered) {
       const response = await registerStudy(ednaDatasetID, username, password)
            const uuid = response?.data;
            console.log(`Registered new eDNA dataset ${ednaDatasetID} with uuid: ${uuid}`);
            await addIdentifier(ednaDatasetID, uuid, username, password);
            await addEndpoint(ednaDatasetID, version, uuid, username, password);
            await crawlDataset(uuid, username, password)
            return uuid
          }
}
/* 
  
   return isRegisteredInGBIF(ednaDatasetID).then(registered => {
        if (registered) {
          console.log(`Study ${ednaDatasetID} is already registered, changes will be picked up on next crawl`);
        } else if (!registered) {
          registerStudy(ednaDatasetID, username, password)
            .then(response => {
              const uuid = response?.data;
              console.log(`Registered new eDNA dataset ${ednaDatasetID} with uuid: ${uuid}`);
              addIdentifier(ednaDatasetID, uuid, username, password);
              return addEndpoint(ednaDatasetID, uuid, username, password).then(
                () => crawlDataset(uuid, username, password)
              );
            })
            .catch(err => {
              console.log(err);
            });
        }
      });
    */
  




