import config from '../../config.js'
import db from '../db/index.js'
import axios from 'axios'

//const url = config.env === "prod" ? config.gbifBaseUrlProd : config.gbifBaseUrl

async function login(auth) {
    let loginRequest = {
        url: `${config.gbifRegistryBaseUrl[config.env]}user/login`,
        method: 'get',
        headers: {
            authorization: auth
        }
    };
    try {
        let response = await axios(loginRequest);
        return response?.data;
    } catch (error) {
        console.log(error)
        throw error
    }
    
}

async function getFromToken(auth) {
    
    let options = {
        method: 'post',
        url: `${config.gbifRegistryBaseUrl[config.env]}user/whoami`,
        headers: {
            authorization: auth
        }
        
    };
    

    try {
        let response = await axios(options);
        let user = response?.data;
        if(user){
            let datasets 
            try {
                datasets = await db.getUserDatasets(user?.userName)
            } catch (error) {
                console.log(error)
            }
           // console.log(datasets)
            return {...user,datasets: datasets, token: response?.headers?.token || ''};
        } else {
            throw "No user from that token, expired?"
        }
        

    } catch (error) {
        if(error?.response?.status || error?.response?.statusText){
            console.log(`Status: ${error?.response?.status} ${error?.response?.statusText || ""}`)
        }
       // console.log(error)
        throw error;  
    }
    
} 

export default {
    
    login: login,
    getFromToken: getFromToken
};