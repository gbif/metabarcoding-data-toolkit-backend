import axios from "axios"
import base64 from "base-64"
import {getYargs} from '../util/index'


export const registerBiomEndpoints = async ({auth, datasetKey}) => {

    const biom_2_1_endpoint = `https://www.test.org/data.biom.h5`
    const biom_1_0_endpoint = `https://www.test.org/data.biom.json`
    const endpoints = [{type: 'BIOM-1-0', url: biom_1_0_endpoint},{type: 'BIOM-2-1', url: biom_2_1_endpoint}]
    for (const ep of endpoints) {
      try {
        const urlSearchParams = new URLSearchParams({
          resourceKey: datasetKey,
          url: ep.url,
          type:  ep.type
         })
    
        const xmlResponse = await axios({
          method: 'post',
         url:  `https://gbrds.gbif.org/registry/service`, 
         headers: {
           authorization: auth
           ,
           'content-type': 'application/x-www-form-urlencoded'
       },
         data: urlSearchParams.toString()
       }); 
    
       console.log(xmlResponse)
      } catch (error) {
        console.log(`Error trying to create ${ep.type} endpont for dataset ${datasetKey} using ${`https://gbrds.gbif.org/registry/service`}`)
        console.log(error)
      }
    }
  }

  const yargs = getYargs()
  const {orgKey, token, datasetKey} = yargs;
  registerBiomEndpoints({auth: `Basic ${base64.encode(orgKey+ ":" +token)}`, datasetKey})