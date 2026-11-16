import config from '../../config.js'
import db from '../db/index.js'
import axios from 'axios'
import { issueWebToken, renewWebToken, verify, setGbifToken } from './tokens.js'

const adminFlags = userName => ({
    isAdmin: config.installationAdmins?.includes(userName) || config.supportAdmins.includes(userName),
    isSupportAdmin: config.supportAdmins.includes(userName)
})

// GBIF accounts are the identity: the user's Basic auth goes to the registry (prod, for all
// environments) once. The registry's token is kept server side for the few calls that act as
// the user at GBIF; the client gets the MDT's own token.
async function gbifLogin(auth) {
    const response = await axios({
        url: `${config.gbifRegistryBaseUrl.prod}user/login`,
        method: 'get',
        headers: {
            authorization: auth
        }
    });
    const { token: gbifToken, ...user } = response?.data || {}
    if (!user?.userName) {
        throw { response: { status: 403 } }
    }
    return { user, gbifToken }
}

async function login(auth) {
    const { user, gbifToken } = await gbifLogin(auth)
    setGbifToken(user.userName, gbifToken)
    return { ...user, token: issueWebToken(user), ...adminFlags(user.userName) };
}

// The user behind an MDT token, or null. For a browser session, user.token is the renewed token
async function getFromToken(auth) {
    const claims = verify(auth)
    if (!claims) {
        return null
    }
    const userName = claims.sub
    let datasets = []
    try {
        datasets = await db.getUserDatasets(userName)
    } catch (error) {
        console.log(`DB error, trying to get datasets for ${userName}`)
        console.log(error)
    }
    return {
        userName,
        firstName: claims.firstName,
        lastName: claims.lastName,
        email: claims.email,
        datasets,
        claims,
        token: claims.kind === 'web' ? renewWebToken(claims) : undefined,
        ...adminFlags(userName)
    };
}

export default {
    login,
    gbifLogin,
    getFromToken
};
