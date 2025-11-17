import config from '../../config.js'
import datasets from '../datasets.js';
/* import { Database } from "duckdb-async";
 import duckdb from '@duckdb/node-api';*/
import { DuckDBInstance as Database } from '@duckdb/node-api';

// const db = new duckdb.Database(config.duckdb);

let db;   // = new duckdb.Database(':memory:');
let con; // db.connect();

const insertDatasetVars = ["user_name", "dataset_id", "title", "created" , "sample_count", "taxon_count", "occurrence_count", "gbif_uat_key", "gbif_prod_key", "deleted", "node_key", "publishing_org_key", "dataset_description", "dataset_author", "dwc_generated", "current_version", "validation_id" ]
const createUserDatasetStmt = `INSERT INTO UserDatasets VALUES (${insertDatasetVars.map(v => "$"+v).join(", ")})`;
//const createUserDatasetStmt = 'INSERT INTO UserDatasets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

const deleteUserDatasetStmt = 'UPDATE UserDatasets SET deleted = $deleted WHERE dataset_id=$dataset_id AND user_name=$user_name';

const updateCountsOnDatasetStmt = 'UPDATE UserDatasets SET sample_count=$sample_count, taxon_count=$taxon_count WHERE dataset_id=$dataset_id AND user_name=$user_name';
const updateOccurrenceCountOnDatasetStmt = 'UPDATE UserDatasets SET occurrence_count=$occurrence_count WHERE dataset_id=$dataset_id AND user_name=$user_name';

const updateTitleOnDatasetStmt = 'UPDATE UserDatasets SET title=$title WHERE dataset_id=$dataset_id AND user_name=$user_name';
const updateDescriptionOnDatasetStmt = 'UPDATE UserDatasets SET dataset_description=$dataset_description WHERE dataset_id=$dataset_id AND user_name=$user_name';
const updateDwcGeneratedStmt = 'UPDATE UserDatasets SET dwc_generated=$dwc_generated WHERE dataset_id=$dataset_id AND user_name=$user_name';
const updateVersionStmt = 'UPDATE UserDatasets SET version=$version WHERE dataset_id=$dataset_id AND user_name=$user_name';

const updateUatKeyOnDatasetStmt = 'UPDATE UserDatasets SET gbif_uat_key=$gbif_uat_key WHERE dataset_id=$dataset_id AND user_name=$user_name';
const updateProdKeyOnDatasetStmt = 'UPDATE UserDatasets SET gbif_prod_key=$gbif_prod_key WHERE dataset_id=$dataset_id AND user_name=$user_name';
const updatePublishingOrgKeyOnDatasetStmt = 'UPDATE UserDatasets SET publishing_org_key=$publishing_org_key WHERE dataset_id=$dataset_id AND user_name=$user_name';
const updateValidationIdOnDatasetStmt = 'UPDATE UserDatasets SET validation_id=$validation_id WHERE dataset_id=$dataset_id';

const getDatasetByIdStmt = 'SELECT * FROM UserDatasets WHERE dataset_id = $dataset_id';
const getDatasetsForUserStmt = `SELECT * FROM UserDatasets WHERE user_name = $userName ORDER BY created DESC`;
const getAllDatasetsStmt = 'SELECT * FROM UserDatasets ORDER BY created DESC';
const getNonDeletedDatasetsStmt = 'SELECT * FROM UserDatasets WHERE deleted IS NULL ORDER BY created DESC';
const getDeletedDatasetsStmt = 'SELECT * FROM UserDatasets WHERE deleted IS NOT NULL ORDER BY created DESC';

const getDatasetsOrderedByDwcCreatedStmt = 'SELECT * FROM UserDatasets WHERE dwc_generated IS NOT NULL AND deleted IS NULL ORDER BY dwc_generated DESC LIMIT $limit OFFSET $offset';
const getDatasetsOrderedByDwcCreatedNoPagingStmt = 'SELECT * FROM UserDatasets WHERE dwc_generated IS NOT NULL AND deleted IS NULL ORDER BY dwc_generated DESC';



const createUserDataset = async ({userName : user_name, datasetId: dataset_id, title, gbifUatKey: gbif_uat_key, gbifProdKey: gbif_prod_key,  nodeKey: node_key, publishingOrgKey: publishing_org_key, description: dataset_description, author: dataset_author, dwcGenerated: dwc_generated, version: current_version, validationId: validation_id}) => {
    const now = new Date();
    const sqlDate = now.toISOString().split('T')[0]

    try {
        /* const stmt = await con.prepare(createUserDatasetStmt)
        // d.user_name, d.dataset_id, d.title, d.created, d.sample_count, d.taxon_count, d.occurrence_count, d.gbif_uat_key, d.gbif_prod_key, d.deleted, d.node_key, d.publishing_org_key
         await stmt.run(userName, datasetId, title, sqlDate, 0, 0, 0, gbifUatKey || null, gbifProdKey || null, null, nodeKey || null, publishingOrgKey || null, description || null, author || null, dwcGenerated || null, version || 1, validationId || null);
         await stmt.finalize() */
          await con.run(createUserDatasetStmt, {user_name, dataset_id, title, created: sqlDate, sample_count: 0, taxon_count: 0, occurrence_count: 0, gbif_uat_key: gbif_uat_key || null, gbif_prod_key: gbif_prod_key || null, deleted: null, node_key: node_key || null, publishing_org_key: publishing_org_key || null, dataset_description: dataset_description || null, dataset_author: dataset_author || null, dwc_generated: dwc_generated || null, current_version: current_version || 1, validation_id: validation_id || null});
                

    } catch (error) {
        console.log("Error - createUserDataset:")
        console.log(error)
        throw error
    }
   
}

const deleteUserDataset = async (userName, datasetId) => {
    const now = new Date();
    const deleted = now.toISOString().split('T')[0]

    try {
        await con.run(deleteUserDatasetStmt, {deleted, dataset_id: datasetId, user_name: userName})

       

    } catch (error) {
        console.log("Error - deleteUserDataset:")
        console.log(error)
        throw error
    }
   
}

const updateCountsOnDataset = async (userName, datasetId, sampleCount, taxonCount) => {
    try {
        await con.run(updateCountsOnDatasetStmt, {sample_count: sampleCount, taxon_count: taxonCount, dataset_id: datasetId, user_name: userName})

    } catch (error) {
        console.log("Error - updateCountsOnDataset:")
        console.log(error)
        throw error
    }
}

const updateOccurrenceCountOnDataset = async (userName, datasetId, occurrenceCount) => {
    try {
        await con.run(updateOccurrenceCountOnDatasetStmt, {occurrence_count: occurrenceCount, dataset_id: datasetId, user_name: userName})

    } catch (error) {
        console.log("Error - updateOccurrenceCountOnDataset:")
        console.log(error)
        throw error
    }
   
}

const updateTitleOnDataset = async (userName, datasetId, title) => {

    try {
        await con.run(updateTitleOnDatasetStmt, {title, dataset_id: datasetId, user_name: userName})

    } catch (error) {
        console.log("Error - updateTitleOnDataset:")
        console.log(error)
        throw error
    }
}

const updateDescriptionOnDataset = async (userName, datasetId, description) => {

    try {
        await con.run(updateDescriptionOnDatasetStmt, {dataset_description: description, dataset_id: datasetId, user_name: userName})

    } catch (error) {
        console.log("Error - updateDescriptionOnDataset:")
        console.log(error)
        throw error
    }
}

const updateDwcGeneratedOnDataset = async (userName, datasetId, timestamp) => {

    try {
        await con.run(updateDwcGeneratedStmt, {dwc_generated: timestamp, dataset_id: datasetId, user_name: userName})

    } catch (error) {
        console.log("Error - updateDwcGeneratedOnDataset:")
        console.log(error)
        throw error
    }
}

const updateVersionOnDataset = async (userName, datasetId, version) => {

    try {
        await con.run(updateVersionOnDatasetStmt, {version, dataset_id: datasetId, user_name: userName})

    } catch (error) {
        console.log("Error - updateVersionOnDataset:")
        console.log(error)
        throw error
    }
}


const updateUatKeyOnDataset = async (userName, datasetId, gbifUatKey) => {

    try {
        await con.run(updateUatKeyOnDatasetStmt, {gbif_uat_key: gbifUatKey, dataset_id: datasetId, user_name: userName})

    } catch (error) {
        console.log("Error - updateUatKeyOnDataset:")
        console.log(error)
        throw error
    }
}

const updateProdKeyOnDataset = async (userName, datasetId, gbifProdKey) => {

    try {
        await con.run(updateProdKeyOnDatasetStmt, {gbif_prod_key: gbifProdKey, dataset_id: datasetId, user_name: userName})

    } catch (error) {
        console.log("Error - updateProdKeyOnDataset:")
        console.log(error)
        throw error
    }
}

const updatePublishingOrgKeyOnDataset = async (userName, datasetId, publishingOrganizationKey) => {

    try {
        await con.run(updatePublishingOrgKeyOnDatasetStmt, {publishing_org_key: publishingOrganizationKey, dataset_id: datasetId, user_name: userName})

    } catch (error) {
        console.log("Error - updatePublishingOrgKeyOnDataset:")
        console.log(error)
        throw error
    }
}


const updateValidationIdOnDataset = async (validationId, datasetId) => {

    try {
        await con.run(updateValidationIdOnDatasetStmt, {validation_id: validationId, dataset_id: datasetId})

    } catch (error) {
        console.log("Error - updateValidationIdOnDataset:")
        console.log(error)
        throw error
    }
}

const getDatasetById = async (dataset_id) => {
    try {
        const reader = await con.runAndReadAll(getDatasetByIdStmt, {dataset_id})

        const res = reader.getRowObjectsJson();
        return res;
    } catch (error) {
        console.log("Error - getDatasetById:")
        console.log(error)
        throw error
    }
    
}
const getUserDatasets = async (userName) => {

    try {
        const reader = await con.runAndReadAll(getDatasetsForUserStmt, {userName})
        return reader.getRowObjectsJson();
    } catch (error) {
        console.log("Error - getUserDatasets:")
        console.log(error)
        throw error
    }
    
}

const getAllDatasets = async (includeDeleted = true) => {
    try {
        const reader = await con.runAndReadAll((includeDeleted ? getAllDatasetsStmt : getNonDeletedDatasetsStmt))
        return reader.getRowObjectsJson();
    } catch (error) {
        console.log("Error - getAllDatasets:")
        console.log(error)
        throw error
    }
}

const getDatasetsOrderedByDwcCreated = async (limit, offset = 0) => {
    try {
        const reader = await con.runAndReadAll(getDatasetsOrderedByDwcCreatedStmt, {limit, offset})
        const res = reader.getRowObjectsJson();

        return res;
    } catch (error) {
        console.log("Error - getDatasetsOrderedByDwcCreated:")
        console.log(error)
        throw error
    }
    
}

const getDatasetsOrderedByDwcCreatedNoPaging = async () => {
    try {
        const reader = await con.runAndReadAll(getDatasetsOrderedByDwcCreatedNoPagingStmt)
        const res = reader.getRowObjectsJson();

        return res;
    } catch (error) {
        console.log("Error - getDatasetsOrderedByDwcCreatedNoPaging:")
        console.log(error)
        throw error
    }
    
}

const initialize = async (datasets) => {

    try {
        
        db = await Database.create(":memory:");
        con = await db.connect();
        await con.run('CREATE TABLE UserDatasets (user_name STRING, dataset_id STRING, title STRING, created DATE, sample_count INTEGER DEFAULT 0, taxon_count INTEGER DEFAULT 0, occurrence_count INTEGER DEFAULT 0, gbif_uat_key STRING, gbif_prod_key STRING, deleted DATE, node_key STRING, publishing_org_key STRING, dataset_description STRING, dataset_author STRING, dwc_generated TIMESTAMP, current_version INTEGER DEFAULT 1, validation_id STRING)');
       // await con.run('CREATE UNIQUE INDEX ud_idx ON UserDatasets (user_name, dataset_id)');
       // await con.run('CREATE INDEX upd_idx ON UserDatasets (dwc_generated)');
        console.log("Initialized DuckDB database in memory");
       

        for(const d of datasets){
            try {
   
                 await con.run(createUserDatasetStmt, d);
                    // console.log(`Created dataset in DB: `)
                   // console.log(`dataset_id: ${d.dataset_id} user_name: ${d.user_name} title: ${d.title}`)

            } catch (error) {
                console.log(error)
                console.log(`Error creating dataset in DB: `)
                console.log(`dataset_id: ${d.dataset_id} user_name: ${d.user_name} title: ${d.title}`)
                
            }
        }
        console.log(`Inserted ${datasets.length} datasets into DB`)
       
       // await stmt.finalize()
       // const initStmt = `INSERT INTO UserDatasets VALUES ${datasets.map(d => ("("+[d.user_name, d.dataset_id, d.title, d.created, d.sample_count, d.taxon_count, d.occurrence_count, d.gbif_uat_key].join(", ") +")") ).join(", ")}`
       // await con.run(initStmt);  
    } catch (error) {
        console.log("Error initialising database:")
        console.log(error)
        throw error
    }    
}

export default {
    createUserDataset,
    deleteUserDataset,
    getUserDatasets,
    getAllDatasets,
    getDatasetById,
    updateCountsOnDataset,
    updateOccurrenceCountOnDataset,
    updateTitleOnDataset,
    updateDescriptionOnDataset,
    updateDwcGeneratedOnDataset,
    updateVersionOnDataset,
    updateUatKeyOnDataset,
    updateProdKeyOnDataset,
    updatePublishingOrgKeyOnDataset,
    updateValidationIdOnDataset,
    getDatasetsOrderedByDwcCreated,
    getDatasetsOrderedByDwcCreatedNoPaging,
    initialize
}