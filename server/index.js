import express from 'express';
const app = express();
import upload from './upload.js'
import addRequestId from 'express-request-id';
// const addRequestId = require('express-request-id')();
// const http = require('http').Server(app);
import bodyParser from 'body-parser';
// const config = require('./config');
import validation from './validation.js'
import metadata from './eml.js';
import processing from './process.js'
import dwc from './dwc.js'
import dwcdp from './dwcdp.js'
import terms from './terms.js';
import enums from './enum.js';
import datasets from './datasets.js';
import gbifRegistry from './gbifRegistry.js';
import mapping from './mapping.js';
import files from './files.js';
import data from './data.js';
import explore from './explore.js';
import rss from './rss.js'
import cors from 'cors'
import authController from './Auth/auth.controller.js'
import userController from './Auth/user.controller.js'
import {  initDatabase } from '../util/filesAndDirectories.js'
import config from '../config.js';
/* import SegfaultHandler from 'segfault-handler';
SegfaultHandler.registerHandler('crash.log'); */


// Node exits the process on an unhandled rejection. That is far too blunt here: a promise
// nobody awaited - a bookkeeping database update after a job finished, say - would take the
// whole service down and drop every request and every running worker with it. Log it and
// keep serving.
process.on('unhandledRejection', (reason, promise) => {
    console.log('Unhandled promise rejection - the service is still running, but this should be fixed:')
    console.log(reason)
})

initDatabase()


app.use(cors({exposedHeaders: ['token']}))
app.use(addRequestId());
app.use(bodyParser.json({
    limit: '1mb'
}));
// Add headers before the routes are defined
app.use(function (req, res, next) {

    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    // Nothing this API serves may be held by a shared cache. Two separate reasons, and the
    // second is the serious one:
    //
    //  - Everything under /dataset describes the live state of a dataset - the steps of a run
    //    in progress, the headers a validation has just written. A client polling for progress
    //    would see the state from before its own request and stop, while the run it started
    //    completes unseen.
    //  - Every response here is scoped to the user who asked for it, and authenticated ones
    //    carry a freshly issued JWT in the "token" header, which the client adopts as its
    //    identity. Responses are told apart only by the Authorization request header, so a
    //    cache that does not vary on it would hand one user's response - and one user's token
    //    - to the next caller, logging them in as somebody else.
    //
    // Set on everything rather than on selected prefixes: the routes that must not be cached
    // are not the exception here, they are all of them, and a new route must not have to
    // remember to opt in.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Surrogate-Control', 'no-store');
    res.setHeader('Expires', '0');
    // for any cache that ignores the above, at least keep the responses apart per user.
    // res.vary appends, so it does not clobber a Vary set by the cors middleware
    res.vary('Authorization');

    // Pass to next layer of middleware
    next();
});

// add routes for logins etc
authController(app)
// add routes for listing users datasets
userController(app)
// add routes for initial file upload and dataset creation
upload(app)
// add routes for validation
validation(app)
// add routes for metadata
metadata(app)
// add routes for processing
processing(app)
// add routes for dwc generation
dwc(app)
// add routes for dwcdp generation
dwcdp(app)
// add routes for terms
terms(app)
// add routes for enums
enums(app)
// add routes for term mapping
mapping(app)
// add routes for files
files(app)
// add routes for data display
data(app)
// add routes for parquet data exploration
explore(app)
// Add routes for datasets
datasets(app)
// Add routes for GBIF registry
gbifRegistry(app)
// Add route for RSS feed
rss(app)

app.listen(config.expressPort, function() {
    // console.log("Config "+config.INPUT_PATH )
     console.log('Express server listening on port ' + config.expressPort);
 });