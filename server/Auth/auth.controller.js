
import User from './user.model.js';
import db from '../db/index.js'
import { logout, setGbifToken } from './tokens.js'

/* module.exports = function(app) {
    app.use(cors({exposedHeaders: ['token']}))
    app.use('/auth', router);
}; */

const withoutClaims = ({ claims, ...user }) => user

const login = async (req, res) => {
   // console.log(req.headers.authorization)
    try {
        const user = await User.login(req.headers.authorization)
            console.log("Login: "+ user?.userName)
            let datasets = []
            try {
                datasets = await db.getUserDatasets(user?.userName)
            } catch (error) {
                console.log(error)
            }
            res.json({...user, datasets: datasets})
    } catch (error) {
        console.log(error?.response?.data || error)
        res.sendStatus(error?.response?.status || 403)
    }
}

export default  (app) => {
    // POST, because the response body carries the user's token and the request is told apart
    // from every other user's only by the Authorization header.
    app.post('/auth/login', login);


    app.post('/auth/whoami', async (req, res) => {

        try {
           const user = await User.getFromToken(req.headers.authorization)
           if (user) {
            if (user.token) {
                res.setHeader('token', user.token);
            }
            res.json(withoutClaims(user))
        } else {
           // removeTokenCookie(res);
            res.removeHeader('token');
            res.sendStatus(401)
        }
        } catch (err) {
            console.log(err)
            res.sendStatus(500)
        }

    })

    app.post('/auth/logout', async (req, res) => {
        const user = await User.getFromToken(req.headers.authorization)
        if (user) {
            logout(user.claims)
        }
        res.removeHeader('token');
        res.sendStatus(204)
    })

    // A new GBIF login for the calls that act as the user at GBIF, when the one from login has
    // expired. The MDT token says who is asking; the Basic auth must be the same GBIF account.
    app.post('/auth/gbif-login', async (req, res) => {
        try {
            const user = await User.getFromToken(req.headers['x-mdt-token'])
            if (!user) {
                return res.sendStatus(401)
            }
            const { user: gbifUser, gbifToken } = await User.gbifLogin(req.headers.authorization)
            if (gbifUser.userName !== user.userName) {
                return res.status(403).json({ error: 'The GBIF account is not the one logged in to the MDT' })
            }
            setGbifToken(user.userName, gbifToken)
            res.sendStatus(204)
        } catch (error) {
            console.log(error?.response?.status || error)
            res.sendStatus(403)
        }
    })

}
