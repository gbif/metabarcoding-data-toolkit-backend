import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { fork } from 'child_process';
import STEPS from '../enum/processingSteps.js'
import DWCSTEPS from '../enum/dwcSteps.js'
import DWCDPSTEPS from '../enum/dwcDpSteps.js'

import config from '../config.js'
import runningJobs from './runningJobs.js';
import { uploadedFilesAndTypes, getFileSize, unzip } from '../validation/files.js'
import { determineFileNames} from '../validation/tsvformat.js'
import {  readTsvHeaders } from '../util/filesAndDirectories.js'
import _ from 'lodash'
import db from '../server/db/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url));

const workers = {
    TSV: 'tsvworker.js',
    TSV_WITH_FASTA: 'tsvworker.js',
    XLSX: 'xlsxworker.js',
    XLSX_WITH_FASTA: 'xlsxworker.js',
    BIOM_2_1: 'biomworker.js'
}

const prepareForProcessing = async (id, version, job) => {
    job.steps.push({ ...STEPS.validating, status: 'processing', time: Date.now() })
        runningJobs.set(id, job);

        let files = await uploadedFilesAndTypes(id, version)
        const fileMap = _.keyBy(files.files, "type")

      //  console.log(JSON.stringify(files, null, 2))
        console.log("Determined files")
        if (files.format === 'ZIP') {
            console.log("Its zipped")
            job.steps.push({ ...STEPS.extractArchive, status: 'processing', time: Date.now() })
            runningJobs.set(id, { ...job });
            await unzip(id, files.files[0].name);
            job.steps[job.steps.length - 1] = { ...job.steps[job.steps.length - 1], status: 'finished' }
            files = await uploadedFilesAndTypes(id, version)

            job.files = files
            job.unzip = true;
        } else {
            job.files = files
            job.unzip = false;
        }

        if (files.format.startsWith('TSV')) {
            console.log("Its some TSV format") // is this check needed here??
            const filePaths = await determineFileNames(id, version);
            if (filePaths?.samples) {
                job.sampleHeaders = await readTsvHeaders(filePaths?.samples, fileMap?.samples?.properties?.delimiter)
            }

            if (filePaths?.taxa) {
                job.taxonHeaders = await readTsvHeaders(filePaths?.taxa, fileMap?.taxa?.properties?.delimiter)
            }
        }
        job.steps[0] = { ...job.steps[0], status: 'finished' }
        // has files added
        runningJobs.set(id, { ...job });
        return job;
}

const getWorker = job => {
    if(workers[job.files.format]){
        return workers[job.files.format]
    } else {
        throw 'Unsupported format'
    }
}

/* 
This function will distribute a job to a dedicated worker and take care of messaging between the worker and the main thread

*/
export const processDataset = (id, version, job) => {

    return new Promise(async (resolve, reject) => {
        //  Unzip data if needed, determine format etc
        await prepareForProcessing(id, version, job)
        // Get the appropriate worker for the job
        const worker = getWorker(job)
        console.log("Worker "+worker)
        console.log("FORK "+__dirname + '/' + worker)
        console.log(process.argv)
        const args = job?.assignTaxonomy ? [...process.argv,'--id', id, '--version', version, '--assigntaxonomy',  job?.assignTaxonomy] : [...process.argv, '--id', id, '--version', version];
       console.log(args)
        const work = fork(__dirname + '/' + worker, args);
        console.log("Worker got started")
        work.on('message', (message) => {
            if(message?.type === 'beginStep' && !!message?.payload){
                console.log("BEGIN STEP "+message?.payload)
                
                job.steps.push({ ...STEPS[message?.payload], status: 'processing', time: Date.now() })
                runningJobs.set(id, { ...job });
            }
            if(message?.type === 'stepFinished' && message?.payload){
                const finishedJob = job.steps.find(s => s.name === message?.payload);
                finishedJob.status = 'finished'
               // job.steps[job.steps.length - 1] = { ...job.steps[job.steps.length - 1], status: 'finished' }
                if(message?.payload === 'writeBiom1'){
                    job.filesAvailable = [...job.filesAvailable, { format: 'BIOM 1.0', fileName: 'data.biom.json', size: getFileSize(`${config.dataStorage}${id}/${version}/data.biom.json`), mimeType: 'application/json' }]
    
                }
                if(message?.payload === 'writeBiom2'){
                    job.filesAvailable = [...job.filesAvailable, { format: 'BIOM 2.1', fileName: 'data.biom.h5', size: getFileSize(`${config.dataStorage}${id}/${version}/data.biom.h5`), mimeType: 'application/x-hdf5' }]
    
                }
                if(message?.payload === 'assignTaxonomy'){
                    job.filesAvailable = [...job.filesAvailable, { format: 'TSV', fileName: 'taxonomy.tsv', size: getFileSize(`${config.dataStorage}${id}/${version}/taxonomy.tsv`), mimeType: 'text/tab-separated-values' }]
    
                }
                runningJobs.set(id, { ...job });
               
            }
            if(message?.type === 'hdf5Errors'){
                job.processingErrors = { ...(job.processingErrors || {}), hdf5: message?.payload }
            }
            if(message?.type === 'blastErrors'){
                job.processingErrors = { ...(job.processingErrors || {}), blast: message?.payload }
            }
            if(message?.type === 'missingSampleRecords'){
                job.processingErrors = { ...(job.processingErrors || {}), missingSamples: message?.payload }
            }
            if(message?.type === 'consistencyCheck'){
                job.processingErrors = { ...(job.processingErrors || {}), consistencyCheck: message?.payload }
            }

            

            if(message?.type === 'updateStatusOnCurrentStep' && message?.payload){
                let step = job.steps[job.steps.length - 1];
              //  console.log(job.steps)
            
                // step.message = message || step.message;
                if ( message?.payload?.message) {
                    step.subTask = message?.payload?.message
                }
                step.progress = message?.payload?.progress ?? step.progress;
                step.total = message?.payload?.total ?? step.total;
                if (message?.payload?.summary) {
                    job.summary = { ...job.summary, ...message?.payload?.summary }
                }
                runningJobs.set(id, { ...job });
            } 
            if(message?.type === 'finishedJobSuccesssFully'){
                 if(job?.summary?.taxonCount && job?.summary?.sampleCount){
                    db.updateCountsOnDataset(job.createdBy, id, job?.summary?.sampleCount, job?.summary?.taxonCount)
                } 
                resolve()
            }
            if(message?.type === 'finishedJobWithError'){
               
               // Get the last step, add the error message and add it to the step 
             //  console.log("############")
             //  console.log(Object.keys(message.payload))
                if( job.steps.length > 0){
                    job.steps[job.steps.length-1].message = message.payload;
                    job.steps[job.steps.length-1].status = "failed"
                }
                runningJobs.set(id, { ...job });
                reject(message?.payload)
            }
      
        })
    
        work.on('error', (err) => {
            console.log("Worker error:")
            console.log(err)
            reject(err)
        })
    })

}

export const createDwc = (id, version, job) => {

    return new Promise(async (resolve, reject) => {
        const work = fork(__dirname + '/dwcworker.js', [...process.argv, '--id', id, '--version', version]);


        work.on('message', (message) => {
            if(message?.type === 'beginStep' && !!message?.payload){
                console.log("BEGIN STEP "+message?.payload)
                
                job.steps.push({ ...DWCSTEPS[message?.payload], status: 'processing', time: Date.now() })
                runningJobs.set(id, { ...job });
            }

            if(message?.type === 'stepFinished' && message?.payload){
                const finishedJob = job.steps.find(s => s.name === message?.payload);
                finishedJob.status = 'finished'
               
                runningJobs.set(id, { ...job });
               
            }

            if(message?.type === 'finishedJobSuccesssFully'){
                    if(job?.summary?.occurrenceCount){
                        
                       db.updateOccurrenceCountOnDataset(job.createdBy, id, job?.summary?.occurrenceCount)
                   }  
                   try {
                    db.updateDwcGeneratedOnDataset(job.createdBy, id, new Date().toISOString())    
                   } catch (error) {
                    console.log(error)
                   } 
                     
                resolve()
            }
            if(message?.type === 'finishedJobWithError'){
                reject(message?.payload)
            }

            // TODO: progress for DwC conversion
            if(message?.type === 'updateStatusOnCurrentStep' && message?.payload){
                let step = job.steps[job.steps.length - 1];
              //  console.log(job.steps)
                // step.message = message || step.message;
                if ( message?.payload?.message) {
                    step.subTask = message?.payload?.message
                }
                step.progress = message?.payload?.progress ?? step.progress;
                step.total = message?.payload?.total ?? step.total;
                if (message?.payload?.summary) {
                    job.summary = { ...job.summary, ...message?.payload?.summary }
                }
                runningJobs.set(id, { ...job });
            } 

        })


    })
}

export const createDwcDP = (id, version, job) => {
    return new Promise(async (resolve, reject) => {
        const work = fork(__dirname + '/dwcdpworker.js', [...process.argv, '--id', id, '--version', version]);
        work.on('message', (message) => {
            if(message?.type === 'beginStep' && !!message?.payload){
                console.log("BEGIN STEP "+message?.payload)
                
                job.steps.push({ ...DWCDPSTEPS[message?.payload], status: 'processing', time: Date.now() })
                runningJobs.set(id, { ...job });
            }

            if(message?.type === 'stepFinished' && message?.payload){
                const finishedJob = job.steps.find(s => s.name === message?.payload);
                finishedJob.status = 'finished'
               
                runningJobs.set(id, { ...job });
               
            }

            if(message?.type === 'finishedJobSuccesssFully'){
                   
                     
                resolve()
            }
            if(message?.type === 'finishedJobWithError'){
                reject(message?.payload)
            }

            if(message?.type === 'updateStatusOnCurrentStep' && message?.payload){
                let step = job.steps[job.steps.length - 1];
              //  console.log(job.steps)
            
                // step.message = message || step.message;
                if ( message?.payload?.message) {
                    step.subTask = message?.payload?.message
                }
                step.progress = message?.payload?.progress ?? step.progress;
                step.total = message?.payload?.total ?? step.total;
                if (message?.payload?.summary) {
                    job.summary = { ...job.summary, ...message?.payload?.summary }
                }
                runningJobs.set(id, { ...job });
            } 

        })
    })
}

export const validateXlSX = (id, version, userName) => {

    return new Promise(async (resolve, reject) => {
        const work = fork(__dirname + '/xlsxvalidationworker.js', [...process.argv, '--id', id, '--version', version, '--username', userName]);


        work.on('message', (message) => {
            
            if(message?.type === 'finishedJobSuccesssFully'){
                           
                resolve()
            }
            if(message?.type === 'finishedJobWithError'){
                reject(message?.payload)
            }

        })


    })
}