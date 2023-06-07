import { biomToDwc } from '../converters/dwc.js';
//import config from '../config.js'
import _ from 'lodash'
import {  readBiom, zipDwcArchive } from '../util/filesAndDirectories.js'
import {updateStatusOnCurrentStep, beginStep, stepFinished,  finishedJobSuccesssFully, finishedJobWithError } from "./util.js"




const createDwc = async (id, version, dataStorage) => {
    try {
       
        beginStep('readBiom')
        console.log("Begin read biom from worker")
        const biom = await readBiom(id, version, updateStatusOnCurrentStep)
        
        stepFinished('readBiom')

        
        beginStep('writeDwc')
        console.log("Begin write dwc from worker")

        await biomToDwc(biom, undefined, `${dataStorage}${id}/${version}`, updateStatusOnCurrentStep)
        
        stepFinished('writeDwc')
        
        beginStep('zipArchive')
        console.log("Begin zip archive from worker")

        await zipDwcArchive(id, version)
        stepFinished('zipArchive')
        finishedJobSuccesssFully('success')

    } catch (error) {
        console.log("#########")
        console.log(error)
        finishedJobWithError(error)   
    }
    
}




const id = process.argv[2]
const version = process.argv[3]
const dataStorage = process.argv[4]

createDwc(id, version, dataStorage)

