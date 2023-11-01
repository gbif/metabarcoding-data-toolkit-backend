import duckdb from 'duckdb';
import config from '../../config.js'
import datasets from '../datasets.js';

// const db = new duckdb.Database(config.duckdb);

const db = new duckdb.Database(':memory:');
const con = db.connect();

con.run('CREATE TABLE UserDatasets (user_name STRING, dataset_id STRING, title STRING, created DATE, sample_count INTEGER DEFAULT 0, taxon_count INTEGER DEFAULT 0, occurrence_count INTEGER DEFAULT 0, gbif_uat_key STRING)');
con.run('CREATE UNIQUE INDEX ud_idx ON Datasets (user_name, dataset_id)');

const createUserDatasetStmt = con.prepare('INSERT INTO UserDatasets VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
const updateCountsOnDatasetStmt = con.prepare('UPDATE UserDatasets SET sample_count=?, taxon_count=? WHERE dataset_id=? AND user_name=?');
const updateOccurrenceCountOnDatasetStmt = con.prepare('UPDATE UserDatasets SET occurrence_count=? WHERE dataset_id=? AND user_name=?');

const updateTitleOnDatasetStmt = con.prepare('UPDATE UserDatasets SET title=? WHERE dataset_id=? AND user_name=?');

const getDatasetByIdStmt = con.prepare('SELECT * FROM UserDatasets WHERE dataset_id = ?');
const getDatasetsForUserStmt = con.prepare('SELECT * FROM UserDatasets WHERE user_name = ? ORDER BY created DESC');
const getAllDatasetsStmt = con.prepare('SELECT * FROM UserDatasets ORDER BY created DESC');


const createUserDataset = (userName, datasetId, title ="") => {
    const now = new Date();
    const sqlDate = now.toISOString().split('T')[0]
    return new Promise((resolve, reject) => {
        try {
            createUserDatasetStmt.run(userName, datasetId, title, sqlDate, 0, 0, 0, "");
            resolve()
        } catch (error) {
            console.log("duckDB Error")
            console.log(error)
            reject(error)
        }
    })
   
}

const updateCountsOnDataset = (userName, datasetId, sampleCount, taxonCount) => {
 
    return new Promise((resolve, reject) => {
        try {
            updateCountsOnDatasetStmt.run(sampleCount, taxonCount, datasetId, userName);
            resolve()
        } catch (error) {
            console.log(error)
            reject(error)
        }
    })
   
}

const updateOccurrenceCountOnDataset = (userName, datasetId, occurrenceCount) => {
 
    return new Promise((resolve, reject) => {
        try {
            updateOccurrenceCountOnDatasetStmt.run(occurrenceCount, datasetId, userName);
            resolve()
        } catch (error) {
            console.log(error)
            reject(error)
        }
    })
   
}

const updateTitleOnDataset = (userName, datasetId, title) => {
   
    return new Promise((resolve, reject) => {
        try {
            updateTitleOnDatasetStmt.run(title, datasetId, userName);
            resolve()
        } catch (error) {
            console.log(error)
            reject(error)
        }
    })
   
}
const getDatasetById = (dataset_id) => {
    return new Promise((resolve, reject) => {
        try {
            getDatasetByIdStmt.all(dataset_id, function(err, res){
                if (err) {
                    console.log(err)
                    reject(err)
                  } else {
                    resolve(res/* .map(element => element.dataset_id) */)       
                  }
                   
               })
        } catch (error) {
            console.log(error)
            reject(error)
        }
    })
    
}
const getUserDatasets = (userName) => {
    return new Promise((resolve, reject) => {
        try {
            getDatasetsForUserStmt.all(userName, function(err, res){
                if (err) {
                    console.log(err)
                    reject(err)
                  } else {
                    resolve(res/* .map(element => element.dataset_id) */)       
                  }
                   
               })
        } catch (error) {
            console.log(error)
            reject(error)
        }
    })
    
}

const getAllDatasets = () => {
    return new Promise((resolve, reject) => {
        try {
            getAllDatasetsStmt.all(function(err, res){
                if (err) {
                    reject(err)
                  } else {
                    resolve(res/* .map(element => element.dataset_id) */)       
                  }
                   
               })
        } catch (error) {
            reject(error)
        }
    })
    
}
// con.run('CREATE TABLE UserDatasets (user_name STRING, dataset_id STRING, title STRING, created DATE, sample_count INTEGER DEFAULT 0, taxon_count INTEGER DEFAULT 0, occurrence_count INTEGER DEFAULT 0)');

const initialize = (datasets) => {

    return new Promise((resolve, reject) => {
        try {
            datasets.forEach(d => createUserDatasetStmt.run(d.user_name, d.dataset_id, d.title, d.created, d.sample_count, d.taxon_count, d.occurrence_count, d.gbif_uat_key , (err, res) => {
                if(err){
                    console.log(err)
                    console.log(`${d.user_name}, ${d.dataset_id}, ${d.title}, ${d.created}, ${d.sample_count}, ${d.taxon_count}, ${d.occurrence_count}, ${d.gbif_uat_key}`)
                    reject(err)
                }
            } ))
   
           // createUserDatasetStmt.finalize();  
            resolve()
        } catch (error) {
            console.log(error)
            reject(error)
        }
    })

    
}

export default {
    createUserDataset,
    getUserDatasets,
    getAllDatasets,
    getDatasetById,
    updateCountsOnDataset,
    updateOccurrenceCountOnDataset,
    updateTitleOnDataset,
    initialize
}