import { biomToDwc } from '../converters/dwc.js';
import { getYargs } from '../util/index.js';

import config from '../config.js'

import _ from 'lodash'
import {  readBiom, zipDwcArchive, readMapping, wipeGeneratedDwcFiles } from '../util/filesAndDirectories.js'
import {updateStatusOnCurrentStep, beginStep, stepFinished,  finishedJobSuccesssFully, finishedJobWithError } from "./util.js"




const createDwc = async (id, version) => {
    try {
       
        beginStep('readBiom')
        console.log("Begin read biom from worker")
        const biom = await readBiom(id, version, updateStatusOnCurrentStep)
        
        stepFinished('readBiom')

        
        beginStep('writeDwc')
        console.log("Begin write dwc from worker")
        const mapping = await readMapping(id, version)
        await biomToDwc(biom,  mapping, `${config.dataStorage}${id}/${version}`, updateStatusOnCurrentStep)
        
        stepFinished('writeDwc')
        
        beginStep('zipArchive')
        console.log("Begin zip archive from worker")

        await zipDwcArchive(id, version)
        stepFinished('zipArchive')

        beginStep('cleanUp')
        console.log("Clean up files from worker")
        await wipeGeneratedDwcFiles(id, version, ['archive/dna.txt', 'archive/occurrence.txt','archive/emof.txt', 'archive/meta.xml'])
        stepFinished('cleanUp')
        
        finishedJobSuccesssFully('success')

    } catch (error) {
       // console.log("#########")
        console.log(error)
        finishedJobWithError(error)   
    }
    
}




try {
    const yargs = getYargs()
    const {id, version } = yargs;
    
    createDwc(id, version)

    } catch (error) {
        console.log(error)
    }


