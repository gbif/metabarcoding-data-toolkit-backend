
import User from './user.model.js';
import auth from './auth.js'
import db from '../db/index.js'
import { getDataset } from '../../util/dataset.js';
import { listApiTokens, createApiToken, revokeApiToken } from './tokens.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i


export default  (app) => {
    app.get('/user/datasets', auth.appendUser(), async function(req, res) {
        try {
            const datasets = await db.getUserDatasets(req.user?.userName)
           
            //const datasets = []
           /*  for (const id of datasetIds) {
                const dataset = await getDataset(id)
                datasets.push(dataset || {id: id})
            }
            res.json(datasets) */
            res.json(datasets)
        } catch (error) {
            console.log(error)
            res.sendStatus(404)
        }
    })

    app.get('/user/organizations', auth.appendUser(), async (req, res) => {

        try {
            const organizations = await auth.getOrganisationsForUser(req?.user)
            res.json(organizations)
        } catch (error) {
            console.log(error)
            res.sendStatus(500)
        }
    })

    app.get('/user/tokens', auth.appendUser(), (req, res) => {
        res.json(listApiTokens(req.user.userName))
    })

    app.post('/user/tokens', auth.appendUser(), auth.webSessionOnly(), (req, res) => {
        try {
            res.status(201).json(createApiToken(req.user, req.body?.label, Number(req.body?.days)))
        } catch (error) {
            if (error?.status) {
                res.status(error.status).json({ error: error.message })
            } else {
                console.log(error)
                res.sendStatus(500)
            }
        }
    })

    app.delete('/user/tokens/:tokenId', auth.appendUser(), auth.webSessionOnly(), (req, res) => {
        if (!UUID.test(req.params.tokenId)) {
            return res.sendStatus(400)
        }
        res.sendStatus(revokeApiToken(req.user.userName, req.params.tokenId) ? 204 : 404)
    })

    app.get('/admin/organizations', auth.appendUser(), auth.webSessionOnly(), async (req, res) => {
        if(!req.user.isAdmin){
            res.sendStatus(403)
        } else {
            try {
                const organizations = await auth.getOrganisations()
                res.json(organizations)
            } catch (error) {
                console.log(error)
                res.sendStatus(500)
            }
        }
        
    })

    app.post('/admin/organizations', auth.appendUser(), auth.webSessionOnly(), async (req, res) => {
        if(!req.user.isAdmin){
            res.sendStatus(403)
        } else {
            try {
                 await auth.writeOrganisations(req.body)
                res.sendStatus(201)
            } catch (error) {
                console.log(error)
                res.sendStatus(500)
            }
        }
        
    })
    
}



