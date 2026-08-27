import { biomToDwc } from '../converters/dwc.js';
import { getYargs } from '../util/index.js';

import config from '../config.js'

import _ from 'lodash'
import {  readBiom, zipDwcArchive, readMapping, wipeGeneratedDwcFiles, fileExists } from '../util/filesAndDirectories.js'
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

        // meta.xml declares metadata="eml.xml", so zipping without it produces an archive
        // whose manifest points at a file that is not in it. zip -r * reports no error for a
        // file that was never there, so this has to be checked rather than left to the zip.
        // The route refuses incomplete metadata before the job is queued - this catches a
        // dataset whose eml.xml went missing some other way, and fails the job visibly
        // instead of shipping a broken archive.
        const hasEmlXml = await fileExists(id, version, 'archive/eml.xml')
        if(!hasEmlXml){
            throw new Error('No eml.xml was found for the dataset. Save the metadata before creating the archive.')
        }

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
        finishedJobWithError(error?.message || error)   
    }
    
}




try {
    const yargs = getYargs()
    const {id, version } = yargs;
    
    createDwc(id, version)

    } catch (error) {
        console.log(error)
    }


