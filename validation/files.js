import fs from 'fs'
import config from '../config.js'
import {execSync, exec}  from 'child_process';
import { determineFileNames, analyseCsv } from './tsvformat.js';
import {readDefaultValues} from '../util/streamReader.js';
import {writeMapping, readMapping, getProcessingReport} from '../util/filesAndDirectories.js'
import {isFastaFile} from '../util/index.js'
// there may be hidden 'application/octet-stream' files when unzipping an excel workbook
const mimeTypesToBeRemoved = ['application/zip', 'application/octet-stream']

export const getMimeFromPath = (filePath) => {
    const mimeType = execSync('file --mime-type -b "' + filePath + '"').toString();
    return mimeType.trim();
}



export const unzip = async (id, fileName, version = 1) => {
    return new Promise((resolve, reject) => {
        try {
             execSync(`unzip -j -o "${config.dataStorage}${id}/${version}/original/${fileName}" -d "${config.dataStorage}${id}/${version}/original"`);
             resolve()
        } catch (error) {
            reject(error)
        }

    })
}

const deleteFile = async (id, fileName, version = 1) => {
    return new Promise((resolve, reject) => {
        try {
             execSync(`rm "${config.dataStorage}${id}/${version}/original/${fileName}"`);
             resolve()
        } catch (error) {
            reject(error)
        }

    })
}

export const cleanUploadFromZipAndOctetStream = async (id, version = 1) => {
        try {
            let fileList = await fs.promises.readdir(`${config.dataStorage}${id}/${version}/original`);
            for (const f of fileList) {
                const mimeType = getMimeFromPath(`${config.dataStorage}${id}/${version}/original/${f}`)
                if(mimeTypesToBeRemoved.indexOf(mimeType) > -1){
                    console.log(`Deleting ${f}`)
                    await deleteFile(id, f)
                }
            }
        } catch (error) {
            console.log(`Error in cleanUploadFromZipAndOctetStream`)
            throw error
        }
}


const unzipIfNeeded = async (id, version = 1) => {
    try {
     let fileList = await fs.promises.readdir(`${config.dataStorage}${id}/${version}/original`)

     for(const file of fileList){
        if(getMimeFromPath(`${config.dataStorage}${id}/${version}/original/${file}`) === 'application/zip'){
            await unzip(id, file, version)
            
        }
     }
     
    await cleanUploadFromZipAndOctetStream(id)
    } catch (error) {
        throw error
    }   
}

const getfastaFile = (files) => files.find(f => isFastaFile(f.name))

const determineFormat = (files) => {
   
    const fasta = getfastaFile(files);
    if(files.find(f => f?.mimeType === 'application/x-hdf5')){
        return 'BIOM_2_1'
    } else if(files.length === 1 && files[0].mimeType === 'application/json'){
        return 'BIOM_1'
    } else if(files.length < 3 && files.find(f => f.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || f.name?.endsWith('.xlsx')) ){
        
        return !!fasta ? 'XLSX_WITH_FASTA' : 'XLSX'
    } else if(files.length >= 2){
        return  !!fasta ? 'TSV_WITH_FASTA' : 'TSV'
    } /* else if(files.length === 2){
        return 'TSV_2_FILE'
    } */ else {
        console.log('Unsupported format')
        console.log(JSON.stringify(files))
        return 'INVALID'
    }
}

export const getFileSize = file => {
    try {
        const {size} = fs.statSync(file);
        return size / (1024 * 1000)
    } catch (err){
        console.log(err)
        return 0;
    }
   
}

export const uploadedFilesAndTypes = async (id, version = 1) => {
 
    try {
        await unzipIfNeeded(id, version)
        const fileList = await fs.promises.readdir(`${config.dataStorage}${id}/${version}/original`)
                    // have to filter out some odd files starting with .nfs
        let files = fileList.filter(f => !f.startsWith('.nfs')).map(f => {
           let res = {
            mimeType: getMimeFromPath(`${config.dataStorage}${id}/${version}/original/${f}`),
            name: f,
            size: getFileSize(`${config.dataStorage}${id}/${version}/original/${f}`)
        }
        if(f?.endsWith('.fasta') || f?.endsWith('.fa')){
            res.type = "fasta"
        }
        return res;
    })
        //console.log(JSON.stringify(files))

        const format = determineFormat(files);

        if(format.startsWith("TSV") || format.startsWith("BIOM_2_1")){
            const filePaths = await determineFileNames(id, version);

             files = files.map( f => {
                for(const [key, value] of Object.entries(filePaths)){
                    if(`${config.dataStorage}${id}/${version}/original/${f.name}` === value){
                        f.type = key;
                        f.path = value;
                    }
                }
                return f;
            }) 

            let sampleFile = files.find(f => f.type === "samples")
            if(sampleFile){
                const csvProperties = await analyseCsv(sampleFile.path)
                sampleFile.properties = csvProperties;
            }

            let taxonFile = files.find(f => f.type === "taxa");
            if(taxonFile) {
                const csvProperties = await analyseCsv(taxonFile.path)
                taxonFile.properties = csvProperties;
            }

            let otuTableFile = files.find(f => f.type === "otuTable");
            if(otuTableFile && otuTableFile?.mimeType !== "application/x-hdf5") {
                const csvProperties = await analyseCsv(otuTableFile.path)
                otuTableFile.properties =  csvProperties; // {delimiter : csvProperties.delimiter} ;
            } 

            let defaultValuesFile = files.find(f => f.type === "defaultValues");
            if(defaultValuesFile) {
                const csvProperties = await analyseCsv(defaultValuesFile.path)
                defaultValuesFile.properties =  csvProperties; // {delimiter : csvProperties.delimiter} ;
                const defaultValues = await readDefaultValues(defaultValuesFile?.path, defaultValuesFile?.properties?.delimiter);
                const mapping = await readMapping(id, version)
                await writeMapping(id, version, 
                    {
                      samples: mapping?.samples || {},
                      taxa: mapping?.taxa || {},
                      measurements: mapping?.measurements || {},
                      defaultValues: {...defaultValues, ...(mapping?.defaultValues || {})}
                    })  

            }


        }

        return {
            format,
            files
        }
    } catch (error) {
        console.log(error)
        return error;
    }

}