import { writeBiom, toBiom, addReadCounts } from '../converters/biom.js';
import { writeHDF5 } from '../converters/hdf5.js'
import {getMetrics} from '../metrics/index.js'
import {writeMetricsToFile} from '../util/filesAndDirectories.js'
import config from '../config.js'

export const updateStatusOnCurrentStep = (progress, total, message, summary) => {
    if (typeof process?.send === 'function') {
        try {
           // process.send('updateStatusOnCurrentStep')

             process.send({
                type: 'updateStatusOnCurrentStep',
                payload: {
                    progress,
                    total,
                    message,
                    summary
                }
    
            }
                
            ) 
        } catch (error) {
            console.log(error)
        }
        
    }
}

export const beginStep = (step) => {
    if (typeof process?.send === 'function') {
       // process.send('beginStep')
         process.send({
            type: 'beginStep',
            payload: step

        }
            
        ) 
    }
}

export const stepFinished = (step) => {
    if (typeof process?.send === 'function') {
        // process.send('stepFinished')
         process.send({
            type: 'stepFinished',
            payload: step

        }
            
        ) 
    }
}

export const hdf5Errors = errors => {

    if (typeof process?.send === 'function') {
        // process.send('stepFinished')
         process.send({
            type: 'hdf5Errors',
            payload: errors

        }
            
        ) 
    }
}

export const missingSampleRecords = errors => {

    if (typeof process?.send === 'function') {
        // process.send('stepFinished')
         process.send({
            type: 'missingSampleRecords',
            payload: errors

        }
            
        ) 
    }
}

export const consistencyCheckReport = data => {

    if (typeof process?.send === 'function') {
        // process.send('stepFinished')
         process.send({
            type: 'consistencyCheck',
            payload: data

        }
            
        ) 
    }
}

export const blastErrors = errors => {

    if (typeof process?.send === 'function') {
        // process.send('stepFinished')
         process.send({
            type: 'blastErrors',
            payload: errors

        }
            
        ) 
    }
}

export const finishedJobSuccesssFully = (status) => {
    if (typeof process?.send === 'function') {
        // process.send('stepFinished')
         process.send({
            type: 'finishedJobSuccesssFully',
            payload: status

        }
            
        ) 
    }
}

export const finishedJobWithError = (error) => {
    if (typeof process?.send === 'function') {
        // process.send('stepFinished')
         process.send({
            type: 'finishedJobWithError',
            payload: error

        }
            
        ) 
    }
}

export const writeBiomFormats = async (biom, id, version) => {
    console.log('writing biom 1.0')
    beginStep('writeBiom1')
    
    await writeBiom(biom, `${config.dataStorage}${id}/${version}/data.biom.json`, updateStatusOnCurrentStep)
    stepFinished('writeBiom1')
    console.log('writing biom 2.1')
    beginStep('writeBiom2')
   
    const { errors } = await writeHDF5(biom, `${config.dataStorage}${id}/${version}/data.biom.h5`, updateStatusOnCurrentStep)
    hdf5Errors(errors || [])
  //  job.processingErrors = { hdf5: errors || [] }
    stepFinished('writeBiom2')
   
}

export const writeMetrics = async (id, version, skipSimiliarityPlots) => {
   // console.log('Generating metrics')
   // console.log(`Generating metrics skipSimiliarityPlots? ${skipSimiliarityPlots}`)
    beginStep('generateMetrics')
    const metrics =  await getMetrics(`${config.dataStorage}${id}/${version}/data.biom.h5`, updateStatusOnCurrentStep, skipSimiliarityPlots);
    await writeMetricsToFile(id, version, metrics)
    stepFinished('generateMetrics')
}