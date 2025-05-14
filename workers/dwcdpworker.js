import { biomToDwcDp } from '../converters/dwcdp.js';
import { getYargs } from '../util/index.js';

import config from '../config.js'

import _ from 'lodash'
import {  readBiom, zipDwcDatapackage, readMapping } from '../util/filesAndDirectories.js'
import {updateStatusOnCurrentStep, beginStep, stepFinished,  finishedJobSuccesssFully, finishedJobWithError } from "./util.js"




const createDwcDp = async (id, version) => {
    try {
       
        beginStep('readBiom')
        console.log("Begin read biom from worker")
        const biom = await readBiom(id, version, updateStatusOnCurrentStep)
        
        stepFinished('readBiom')

        
        beginStep('writeDwcDp')
        console.log("Begin write dwc data package from worker")
        const mapping = await readMapping(id, version)
        await biomToDwcDp(biom,  mapping, `${config.dataStorage}${id}/${version}`, updateStatusOnCurrentStep)
        
        stepFinished('writeDwcDp')
        
        beginStep('zipDataPackage')
        console.log("Begin zip archive from worker")

        await zipDwcDatapackage(id, version)
        stepFinished('zipDataPackage')
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
    
    createDwcDp(id, version)

    } catch (error) {
        console.log(error)
    }


