import axios from 'axios'
import _ from "lodash";
import config from '../config.js'
import db from '../server/db/index.js';
import {URLSearchParams} from 'url';
import {parseString} from 'xml2js'

export const isRegisteredInGBIF = async (ednaDatasetID, env) => {
  const response = await axios.get(`${config.gbifBaseUrl[env]}dataset?identifier=${ednaDatasetID}`);

  const registeredAndNotDeletedDatasets = response?.data.results.filter(d => _.isUndefined(d.deleted))
  if (registeredAndNotDeletedDatasets.length > 1) {
    console.error(
      `Dataset id ${ednaDatasetID} is registered ${registeredAndNotDeletedDatasets.length} times in GBIF`
    );
  }
  return  registeredAndNotDeletedDatasets[0]; // registeredAndNotDeletedDatasets.length === 1;
};

const addIdentifier = async (ednaDatasetID, uuid, auth, env) => {

  return axios( {
    method: 'post',
    url: `${config.gbifBaseUrl[env]}dataset/${uuid}/identifier`,
    headers: {
      authorization: auth
  },
    /* auth: {
        username,
        password
      }, */
    data: {
        type: "UUID",
        identifier: `${ednaDatasetID}`
      }})
};

const addEndpoint = async (ednaDatasetID, version, uuid, auth, env) => {

  return axios({
    method: 'post',
    url: `${config.gbifBaseUrl[[env]]}dataset/${uuid}/endpoint`,
    headers: {
      authorization: auth
  },
   /*  auth: {
        username,
        password
      }, */
    data: {
      type: "DWC_ARCHIVE",
      url: config.env === 'local' ? `${config.dwcPublicAccessUrl}${ednaDatasetID}.zip` : `${config.dwcPublicAccessUrl}${ednaDatasetID}/${version}/archive.zip`
    }
  }); 
 

};
const registerStudy = async ({ednaDatasetID, auth, env, publishingOrganizationKey}) => {

  let registryKeys = {};
  if(env === 'prod'){
    registryKeys = {
      publishingOrganizationKey,
      installationKey: config.prodInstallationKey
    }
  } else if(env === 'uat'){
    registryKeys = {
      publishingOrganizationKey: config.uatPublishingOrganizationKey,
      installationKey: config.uatInstallationKey
    }
  }
   
  return axios({
     method: 'post',
    url: `${config.gbifBaseUrl[[env]]}dataset`,
    headers: {
      authorization: auth
  },
  
    data: {
      title: ednaDatasetID,
      type: "OCCURRENCE",
      ...registryKeys
    }
  }); 
};

export const registerStudyGbrds = async ({ednaDatasetID, auth, env, organisationKey, primaryContact, endpoint, datasetKey, iptKey}) => {

  let urlSearchParams =  !!datasetKey ? new URLSearchParams({
    iptKey,
    name: ednaDatasetID,
    primaryContactType: 'technical',
    ...primaryContact,
    serviceURLs: endpoint,
    serviceTypes: 'DWC-ARCHIVE-OCCURRENCE'
   }) : 
   new URLSearchParams({
    organisationKey,
    iptKey,
    name: ednaDatasetID,
    primaryContactType: 'technical',
    ...primaryContact,
    serviceURLs: endpoint,
    serviceTypes: 'DWC-ARCHIVE-OCCURRENCE'
   })

   try {
    const xmlResponse = await axios({
      method: 'post',
     url: !!datasetKey ? `${config.gbifGbrdsBaseUrl[env]}registry/ipt/resource/${datasetKey}` : `${config.gbifGbrdsBaseUrl[env]}registry/ipt/resource`,
     headers: {
       authorization: auth,
       'content-type': 'application/x-www-form-urlencoded'
   },
     data: urlSearchParams.toString()
   }); 
   const uuid = await new Promise((resolve, reject) => {
    parseString(xmlResponse?.data, { trim: true }, (error, data) => {
      if (error) {
        reject(error)
      } else {
        resolve(data?.iptEntityResponse?.key?.[0]);
       
      }
    });
   })
   return uuid
   
   } catch (error) {
    console.log(error)
    throw error
   }
  


};

export const deleteDatasetInGbifUAT = async (gbifUatKey, auth) => {
   console.log(`delete  ${config.gbifBaseUrl.uat}dataset/${gbifUatKey}`)
  return axios({
     method: 'delete',
     headers: {
      authorization: auth
  },
    url: `${config.gbifBaseUrl.uat}dataset/${gbifUatKey}`,
/*     headers: {
        Authorization: auth
    }, */
  /*  auth: {
        username,
        password
      } */
  }); 
};


const crawlDataset = (uuid, auth, env) => {
  return axios({
    method: 'post',
    url: `${config.gbifBaseUrl[env]}dataset/${uuid}/crawl`,
    headers: {
      authorization: auth
  },
    /* auth: {
        username,
        password
      }, */
  });
};

export const registerDatasetInGBIF = async (ednaDatasetID, version, auth, env, publishingOrganizationKey) => {
  

  try {
    const registered = await isRegisteredInGBIF(ednaDatasetID, env);

    if (registered) {
        
        console.log(`Dataset ${ednaDatasetID} is already registered, changes will be picked up on next crawl`);
        await crawlDataset(registered?.key, auth, env)
        return registered?.key;
      } else if (!registered) {
       const response = await registerStudy({ednaDatasetID, auth, env, publishingOrganizationKey})
            const uuid = response?.data;
            if(env === "uat"){
              await db.updateUatKeyOnDataset(username, ednaDatasetID, uuid )
              console.log(`Registered new eDNA dataset ${ednaDatasetID} with uuid: ${uuid} env: ${env}`);
            } else if(env === "prod") {
              await db.updateProdKeyOnDataset(username, ednaDatasetID, uuid )
              console.log(`Registered new eDNA dataset ${ednaDatasetID} with uuid: ${uuid} env: ${env}`);
            }
           
            await addIdentifier(ednaDatasetID, uuid, auth, env);
            await addEndpoint(ednaDatasetID, version, uuid, auth, env);
            await crawlDataset(uuid, auth, env)
            return uuid
          }
  } catch (error) {
    throw error
  }
   
}

export const registerDatasetInGBIFusingGBRDS = async ({ednaDatasetID, userName, version, auth, env, publishingOrganizationKey,  metadata, processingReport}) => {
  

  try {
    let registeredKey;
    if (env === "prod"){
      registeredKey = processingReport?.publishing?.gbifProdDatasetKey
    } else if(env === "uat"){
      registeredKey = processingReport?.publishing?.gbifUatDatasetKey
    }

    if (!!registeredKey) {
        
        console.log(`Dataset ${ednaDatasetID} is already registered, changes will be picked up on next crawl`);
        // TODO how to crawl an existing dataset using GBRDS ???
        // await crawlDataset(registered?.key, auth, env)
        await registerStudyGbrds({
          ednaDatasetID: metadata?.title || ednaDatasetID,
          auth,
          env,
          datasetKey: registeredKey,
          iptKey:  env === "prod" ? config.prodInstallationKey : config.uatInstallationKey,
          primaryContact: {
            primaryContactName: `${metadata?.contact?.givenName ? metadata?.contact?.givenName +" ": ""}${metadata?.contact?.surName}`,
            primaryContactEmail:  metadata?.contact?.electronicMailAddress
        },
        endpoint: config.env === 'local' ? `${config.dwcPublicAccessUrl}${ednaDatasetID}.zip` : `${config.dwcPublicAccessUrl}${ednaDatasetID}/${version}/archive.zip`
        });
        return registeredKey;
      } else if (!registeredKey) {
            const uuid = await registerStudyGbrds({
              ednaDatasetID: metadata?.title || ednaDatasetID,
              auth,
              env,
              organisationKey: env === "prod" ? publishingOrganizationKey : config.uatPublishingOrganizationKey,
              iptKey:  env === "prod" ? config.prodInstallationKey : config.uatInstallationKey,
              primaryContact: {
                primaryContactName: `${metadata?.contact?.givenName ? metadata?.contact?.givenName +" ": ""}${metadata?.contact?.surName}`,
                primaryContactEmail:  metadata?.contact?.electronicMailAddress
            },
            endpoint: config.env === 'local' ? `${config.dwcPublicAccessUrl}${ednaDatasetID}.zip` : `${config.dwcPublicAccessUrl}${ednaDatasetID}/${version}/archive.zip`
            });
            try {
              if(env === "uat"){
                await db.updateUatKeyOnDataset(userName, ednaDatasetID, uuid )
                console.log(`Registered new eDNA dataset ${ednaDatasetID} with uuid: ${uuid} env: ${env}`);
              } else if(env === "prod") {
                await db.updateProdKeyOnDataset(userName, ednaDatasetID, uuid )
                await db.updatePublishingOrgKeyOnDataset(userName, ednaDatasetID, publishingOrganizationKey)
                console.log(`Registered new eDNA dataset ${ednaDatasetID} with uuid: ${uuid} env: ${env}`);
              }
            } catch (error) {
              console.log("Error updating DB:")
              console.log(error)
            }
            
           
           
            return uuid
          }
  } catch (error) {
    throw error
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
  




