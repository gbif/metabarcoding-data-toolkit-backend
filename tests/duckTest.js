// import db from "../server/db/index.js";
import { DuckDBInstance as Database } from '@duckdb/node-api';
import { readDataStorage } from "../util/filesAndDirectories.js";

const insertDatasetVars = ["user_name", "dataset_id", "title", "created" , "sample_count", "taxon_count", "occurrence_count", "gbif_uat_key", "gbif_prod_key", "deleted", "node_key", "publishing_org_key", "dataset_description", "dataset_author", "dwc_generated", "current_version", "validation_id" ]
const createUserDatasetStmt = `INSERT INTO UserDatasets VALUES (${insertDatasetVars.map(v => "$"+v).join(", ")})`;
//const createUserDatasetStmt = 'INSERT INTO Datasets VALUES ($user_name, $dataset_id)';

/* const run = async () => {
  const data = await readDataStorage()
  console.log(data[0])
} */
/* const dataset = {
  user_name: 'thomasgbif',
  dataset_id: '00372405-7d4f-4cc7-905c-191d056169f0',
  title: 'Test quiime from localhost',
  created: '2024-10-30',
  sample_count: 28,
  taxon_count: 134,
  occurrence_count: 555,
  gbif_uat_key: 'c63529a8-6a27-45a0-99dc-fb6ec5c022d2',
  gbif_prod_key: '',
  deleted: null,
  node_key: '',
  publishing_org_key: '',
  dataset_description: '',
  dataset_author: 'tsjeppesen@gbif.org (Thomas Stjernegaard Jeppesen)',
  dwc_generated: '2024-10-30T11:57:56.285Z',
  current_version: 1,
  validation_id: ''
} */

const run = async () => {
    try {
    const datasets = await readDataStorage();
    console.log(`Read ${datasets.length} datasets from data storage`)
    const db = await Database.create(":memory:");
    const  con = await db.connect();
    //await con.run('CREATE TABLE UserDatasets (user_name STRING, dataset_id STRING, title STRING, created DATE)');
    await con.run('CREATE TABLE UserDatasets (user_name STRING, dataset_id STRING, title STRING, created DATE, sample_count INTEGER DEFAULT 0, taxon_count INTEGER DEFAULT 0, occurrence_count INTEGER DEFAULT 0, gbif_uat_key STRING, gbif_prod_key STRING, deleted DATE, node_key STRING, publishing_org_key STRING, dataset_description STRING, dataset_author STRING, dwc_generated TIMESTAMP, current_version INTEGER DEFAULT 1, validation_id STRING)');
   for(const d of datasets){
    await con.run(createUserDatasetStmt, d);
    //await stmt.run(dataset);
   // await con.run(`INSERT INTO Datasets VALUES ('${dataset.user_name}', '${dataset.dataset_id}')`);
    console.log("Inserted dataset")
   }
    } catch (err){
        console.log(err)
    }
    
}
run()