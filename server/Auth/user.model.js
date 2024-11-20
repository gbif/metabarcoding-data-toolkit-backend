import config from '../../config.js'
import db from '../db/index.js'
import axios from 'axios'

//const url = config.env === "prod" ? config.gbifBaseUrlProd : config.gbifBaseUrl

async function login(auth) {
    // Use prod users for all user management
    let loginRequest = {
        url: `${config.gbifRegistryBaseUrl.prod}user/login`,
        method: 'get',
        headers: {
            authorization: auth
        }
    };
    try {
        let response = await axios(loginRequest);
        const user = response?.data
        return {...user, isAdmin: config.installationAdmins.includes(user?.userName)};
    } catch (error) {
        console.log(error)
        throw error
    }
    
}

async function getFromToken(auth) {
    // Use prod users for all user management
    let options = {
        method: 'post',
        url: `${config.gbifRegistryBaseUrl.prod}user/whoami`,
        headers: {
            authorization: auth
        }
        
    };
    

    try {
        let response = await axios(options);
        let user = response?.data;
        if(user){
            let datasets = [] 
            try {
                datasets = await db.getUserDatasets(user?.userName)
            } catch (error) {
                console.log(`DB error, trying to get datasets for ${user?.userName}`)
                console.log(error)
            }
            if(!response?.headers?.token){
                console.log(`No token from registry? Token: ${response?.headers?.token}`)
            }
            return {...user,datasets: datasets, token: response?.headers?.token || '', isAdmin: config.installationAdmins.includes(user.userName)};
        } else {
            throw "No user from that token, expired?"
        }
        

    } catch (error) {
        if(error?.response?.status || error?.response?.statusText){
            console.log(`Status: ${error?.response?.status} ${error?.response?.statusText || ""}`)
        }
        if(auth && [401, 403].includes(error?.response?.status)){
            console.log("Auth header: "+ auth)
        }
       // console.log(error)
        throw error;  
    }
    
} 

export default {
    
    login: login,
    getFromToken: getFromToken
};