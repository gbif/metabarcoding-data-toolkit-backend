import { readHDF5 } from "../converters/hdf5.js";
import {execSync, exec}  from 'child_process';


const runTest = async () => {

    try {
        const biom = await readHDF5('/Users/vgs417/ednaToolData/testData/NOAA_Silliman/table.biom')
        console.log(JSON.stringify(biom, null , 2))
    } catch (error) {
        console.log(error)
    }
}

export const unzipQza = async () => {
    return new Promise((resolve, reject) => {
        try {
             // execSync(`cp /Users/vgs417/ednaToolData/testData/NOAA_Silliman/taxonomy.qza /Users/vgs417/ednaToolData/testData/NOAA_Silliman/tazonomy.zip`)   
             execSync(`unzip -j -o "/Users/vgs417/ednaToolData/testData/NOAA_Silliman/repseqs.qza" -d "/Users/vgs417/ednaToolData/testData/NOAA_Silliman/unzipped"`);
             execSync(`unzip -j -o "/Users/vgs417/ednaToolData/testData/NOAA_Silliman/taxonomy.qza" -d "/Users/vgs417/ednaToolData/testData/NOAA_Silliman/unzipped"`);
             resolve()
        } catch (error) {
            console.log(error)
            reject(error)
        }

    })
}

// runTest()
unzipQza()