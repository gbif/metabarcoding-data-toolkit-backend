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
import rss from './rss.js'
import cors from 'cors'
import authController from './Auth/auth.controller.js'
import userController from './Auth/user.controller.js'
import {  initDatabase } from '../util/filesAndDirectories.js'
import config from '../config.js';
/* import SegfaultHandler from 'segfault-handler';
SegfaultHandler.registerHandler('crash.log'); */


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