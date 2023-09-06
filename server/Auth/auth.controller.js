
import User from './user.model.js';
import db from '../db/index.js'

/* module.exports = function(app) {
    app.use(cors({exposedHeaders: ['token']}))
    app.use('/auth', router);
}; */

export default  (app) => {
    app.get('/auth/login', async (req, res) => {
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
                console.log(user)
                res.json({...user, datasets: datasets})
        } catch (error) {
            res.sendStatus(403)
        }
       
            
            
    })
    
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
            console.log(err)
            res.sendStatus(403)
        }
       
    })

}



