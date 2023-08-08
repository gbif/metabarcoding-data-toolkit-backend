import duckdb from 'duckdb';
import config from '../../config.js'

const db = new duckdb.Database(config.duckdb);
const con = db.connect();

con.run('CREATE TABLE UserDatasets (user_name STRING, dataset_id STRING)');
con.run('CREATE UNIQUE INDEX ud_idx ON Datasets (user_name, dataset_id)');

const createUserDatasetStmt = con.prepare('INSERT INTO UserDatasets VALUES (?, ?)');
const getDatasetsForUserStmt = con.prepare('SELECT dataset_id FROM UserDatasets WHERE user_name = ?');
const getAllDatasetsStmt = con.prepare('SELECT dataset_id, user_name FROM UserDatasets');

const createUserDataset = (userName, datasetId) => {
    return new Promise((resolve, reject) => {
        try {
            createUserDatasetStmt.run(userName, datasetId);
            resolve()
        } catch (error) {
            reject(error)
        }
    })
   
}

const getUserDatasets = (userName) => {
    return new Promise((resolve, reject) => {
        try {
            getDatasetsForUserStmt.all(userName, function(err, res){
                if (err) {
                    reject(err)
                  } else {
                    resolve(res.map(element => element.dataset_id))       
                  }
                   
               })
        } catch (error) {
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
                    resolve(res.map(element => element.dataset_id))       
                  }
                   
               })
        } catch (error) {
            reject(error)
        }
    })
    
}

export default {
    createUserDataset,
    getUserDatasets,
    getAllDatasets
}