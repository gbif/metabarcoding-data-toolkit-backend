'use strict';
import compose from 'composable-middleware';
import User from './user.model.js';
import {readOrganizationFile, writeOrganizationFile} from '../../util/filesAndDirectories.js'
import config from '../../config.js';

const appendUser = () => {
    return compose()
    // Attach user to request
        .use(function(req, res, next) {
            User.getFromToken(req?.headers?.authorization)
            .then((user) => {
                if (user) {
                    req.user = {...user, isAdmin: config.installationAdmins.includes(user.userName)};
                    res.setHeader('token', user?.token);

                    res.setHeader("Surrogate-Control", "no-store");
                    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
                    res.setHeader("Expires", "0");
                } else {
                   // removeTokenCookie(res);
                    res.removeHeader('token');
                    delete req.user;
                }
                
                next();
            })
            .catch(function(err) {
               
                res.sendStatus(err?.response?.status || 500)
               // next(err);
            });
        });
}

const userCanModifyDataset = () => {
    return compose()
    // Attach user to request
        .use(function(req, res, next) {
            User.getFromToken(req?.headers?.authorization)
            .then((user) => {
                if (user) {
                    req.user = user;
                    res.setHeader('token', user?.token);
                    const datasets = user?.datasets || [];

                    if(user.isAdmin || datasets.map(d => d.dataset_id).includes(req?.params?.id)){
                       //  console.log('userCanModifyDataset true')
                        next();
                    } else {
                        res.sendStatus(403)
                    }

                } else {
                   // console.log('userCanModifyDataset false')
                    res.removeHeader('token');
                    delete req.user;
                    res.sendStatus(403)
                }
                
            })
            .catch(function(err) {
                console.log('userCanModifyDataset false')
                res.sendStatus(err.statusCode || 403)
               // next(err);
            });
        });
}

/* export const userCanPublishWithOrganisation = async (userName, organisationKey) => {
    try {
        const admin = await readOrganizationFile();
        return admin?.organizations?.[organisationKey]?.includes(userName)
    } catch (error) {
        console.log(error)
        throw error;
    }
} */



export const getOrganisationsForUser = async (userName) => {
    try {
        const admin = await readOrganizationFile();
        if(config?.installationAdmins?.includes(userName)){
            return Object.keys(admin?.organizations || {}).map(key => ({key, name: admin?.organizations?.[key]?.name}))
        } else {
            return Object.keys(admin?.organizations || {}).filter(key => admin?.organizations?.[key]?.users?.includes(userName) ).map(key => ({key, name: admin?.organizations?.[key]?.name}))
        }
    } catch (error) {
        console.log(error)
        throw error;
    }
}

export const getOrganisations = async () => {
    
        try {
            const admin = await readOrganizationFile();
            return admin
        } catch (error) {
            console.log(error)

        }
}

export const writeOrganisations = async (data) => {
    
    try {
         await writeOrganizationFile(data);
    } catch (error) {
        console.log("Failed to write organization file")
        throw error;

    }
}

export default {
    appendUser,
    userCanModifyDataset,
/*     userCanPublishWithOrganisation,
 */    getOrganisationsForUser,
    getOrganisations,
    writeOrganisations
}