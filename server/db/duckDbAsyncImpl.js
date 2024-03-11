import duckdb from 'duckdb';
import config from '../../config.js'
import datasets from '../datasets.js';
import { Database } from "duckdb-async";

// const db = new duckdb.Database(config.duckdb);

let db;   // = new duckdb.Database(':memory:');
let con; // db.connect();



const createUserDatasetStmt = 'INSERT INTO UserDatasets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
const deleteUserDatasetStmt = 'UPDATE UserDatasets SET deleted = ? WHERE dataset_id=? AND user_name=?';

const updateCountsOnDatasetStmt = 'UPDATE UserDatasets SET sample_count=?, taxon_count=? WHERE dataset_id=? AND user_name=?';
const updateOccurrenceCountOnDatasetStmt = 'UPDATE UserDatasets SET occurrence_count=? WHERE dataset_id=? AND user_name=?';

const updateTitleOnDatasetStmt = 'UPDATE UserDatasets SET title=? WHERE dataset_id=? AND user_name=?';
const updateUatKeyOnDatasetStmt = 'UPDATE UserDatasets SET gbif_uat_key=? WHERE dataset_id=? AND user_name=?';


const getDatasetByIdStmt = 'SELECT * FROM UserDatasets WHERE dataset_id = ?';
const getDatasetsForUserStmt = 'SELECT * FROM UserDatasets WHERE user_name = ? ORDER BY created DESC';
const getAllDatasetsStmt = 'SELECT * FROM UserDatasets ORDER BY created DESC';
const getNonDeletedDatasetsStmt = 'SELECT * FROM UserDatasets WHERE deleted IS NULL ORDER BY created DESC';
const getDeletedDatasetsStmt = 'SELECT * FROM UserDatasets WHERE deleted IS NOT NULL ORDER BY created DESC';


const createUserDataset = async (userName, datasetId, title ="") => {
    const now = new Date();
    const sqlDate = now.toISOString().split('T')[0]

    try {
        const stmt = await con.prepare(createUserDatasetStmt)

         await stmt.run(userName, datasetId, title, sqlDate, 0, 0, 0, "", null);
         await stmt.finalize()

    } catch (error) {
        console.log("Error - createUserDataset:")
        console.log(error)
        throw error
    }
   
}

const deleteUserDataset = async (userName, datasetId) => {
    const now = new Date();
    const sqlDate = now.toISOString().split('T')[0]

    try {
        const stmt = await con.prepare(deleteUserDatasetStmt)

         await stmt.run(sqlDate, datasetId, userName);
         await stmt.finalize()

    } catch (error) {
        console.log("Error - deleteUserDataset:")
        console.log(error)
        throw error
    }
   
}

const updateCountsOnDataset = async (userName, datasetId, sampleCount, taxonCount) => {
    try {
        const stmt = await con.prepare(updateCountsOnDatasetStmt)

         await stmt.run(sampleCount, taxonCount, datasetId, userName)
         await stmt.finalize()

    } catch (error) {
        console.log("Error - updateCountsOnDataset:")
        console.log(error)
        throw error
    }
}

const updateOccurrenceCountOnDataset = async (userName, datasetId, occurrenceCount) => {
    try {
        const stmt = await con.prepare(updateOccurrenceCountOnDatasetStmt)

         await stmt.run(occurrenceCount, datasetId, userName)
         await stmt.finalize()

    } catch (error) {
        console.log("Error - updateOccurrenceCountOnDataset:")
        console.log(error)
        throw error
    }
   
}

const updateTitleOnDataset = async (userName, datasetId, title) => {

    try {
        const stmt = await con.prepare(updateTitleOnDatasetStmt)

         await stmt.run(title, datasetId, userName)
         await stmt.finalize()

    } catch (error) {
        console.log("Error - updateTitleOnDataset:")
        console.log(error)
        throw error
    }
}

const updateUatKeyOnDataset = async (userName, datasetId, gbifUatKey) => {

    try {
        const stmt = await con.prepare(updateUatKeyOnDatasetStmt)

         await stmt.run(gbifUatKey, datasetId, userName)
         await stmt.finalize()

    } catch (error) {
        console.log("Error - updateUatKeyOnDataset:")
        console.log(error)
        throw error
    }
}

const getDatasetById = async (dataset_id) => {
    try {
        const stmt = await con.prepare(getDatasetByIdStmt)

        const res = await stmt.all(dataset_id)
        await stmt.finalize()

        return res;
    } catch (error) {
        console.log("Error - getDatasetById:")
        console.log(error)
        throw error
    }
    
}
const getUserDatasets = async (userName) => {

    try {
        const stmt = await con.prepare(getDatasetsForUserStmt)

        const res = await stmt.all(userName)
        await stmt.finalize()

        return res;
    } catch (error) {
        console.log("Error - getUserDatasets:")
        console.log(error)
        throw error
    }
    
}

const getAllDatasets = async (includeDelted = true) => {
    try {
        const stmt = await con.prepare(includeDelted ? getAllDatasetsStmt : getNonDeletedDatasetsStmt)

        const res = await stmt.all()
        await stmt.finalize()
        return res;
    } catch (error) {
        console.log("Error - getAllDatasets:")
        console.log(error)
        throw error
    }
}

const initialize = async (datasets) => {

    try {
        const db_ = await Database.create(":memory:");
        const  con_ = await db_.connect();
        con = con_;
        db = db_;
        await con.run('CREATE TABLE UserDatasets (user_name STRING, dataset_id STRING, title STRING, created DATE, sample_count INTEGER DEFAULT 0, taxon_count INTEGER DEFAULT 0, occurrence_count INTEGER DEFAULT 0, gbif_uat_key STRING, deleted DATE)');
        await con.run('CREATE UNIQUE INDEX ud_idx ON UserDatasets (user_name, dataset_id)');
        const stmt = await con.prepare(createUserDatasetStmt)

        for(const d of datasets){
            
            try {
               // console.log( d.user_name, d.dataset_id, d.title, d.created, d.sample_count, d.taxon_count, d.occurrence_count, d.gbif_uat_key, d.deleted)

                await stmt.run(d.user_name, d.dataset_id, d.title, d.created, d.sample_count, d.taxon_count, d.occurrence_count, d.gbif_uat_key, d.deleted)

            } catch (error) {
                console.log(`Error creating dataset in DB: `)
                console.log(`dataset_id: ${d.dataset_id} user_name: ${d.user_name} title: ${d.title}`)
                
            }
        }
        await stmt.finalize()
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
    updateUatKeyOnDataset,
    initialize
}