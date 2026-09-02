
import User from './user.model.js';
import db from '../db/index.js'

/* module.exports = function(app) {
    app.use(cors({exposedHeaders: ['token']}))
    app.use('/auth', router);
}; */

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
    // POST, because the response body carries the user's JWT and the request is told apart
    // from every other user's only by the Authorization header. As a GET it was a cacheable
    // URL holding a credential, so a shared cache that does not vary on Authorization would
    // serve one user's token to the next person who signed in.
    app.post('/auth/login', login);
    // Deprecated - kept only so a browser still running an older UI bundle can sign in.
    // Remove once the UI change has been out long enough; the no-store headers in
    // server/index.js are what make it safe in the meantime.
    app.get('/auth/login', login);
    
    app.post('/auth/whoami', async (req, res) => {

        try {
           const user = await User.getFromToken(req.headers.authorization)
           if (user) {
            const datasets = await db.getUserDatasets(user?.userName)
            
            res.setHeader('token', user?.token);
            res.json({...user, datasets: datasets })
        } else {
           // removeTokenCookie(res);
            res.removeHeader('token');
            throw "No user"
        }
        } catch (err) {
            console.log(err?.response?.data || err)
            res.sendStatus(err?.response?.status || 403)
        }
       
    })

}



