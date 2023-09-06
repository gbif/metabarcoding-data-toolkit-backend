'use strict';
import compose from 'composable-middleware';
import User from './user.model.js';



const appendUser = () => {
    return compose()
    // Attach user to request
        .use(function(req, res, next) {
            User.getFromToken(req?.headers?.authorization)
            .then((user) => {
                if (user) {
                    req.user = user;
                    res.setHeader('token', user?.token);
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
                    const datasets = user?.datasets || [];

                    if(datasets.map(d => d.dataset_id).includes(req?.params?.id)){
                        console.log('userCanModifyDataset true')
                        next();
                    }

                } else {
                    console.log('userCanModifyDataset false')
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

export default {
    appendUser,
    userCanModifyDataset
}