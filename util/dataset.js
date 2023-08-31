import { getCurrentDatasetVersion, getMetadata, getProcessingReport, readMapping } from './filesAndDirectories.js'
import { uploadedFilesAndTypes} from '../validation/files.js'


export const getDataset = async (id, version) =>  {
    try {
        if(!version){
            version = await getCurrentDatasetVersion(id);
        } 
        let report = await getProcessingReport(id, version);
       
        if(!report){
            report = {id: id, version: version}
            const files = await uploadedFilesAndTypes(id, version)
            if(!!files){
            report.files = files
        }
        }
        
        const mapping = await readMapping(id, version);
        if(!!mapping){
            report.mapping = mapping
        }
        const metadata = await getMetadata(id, version)
        if(!!metadata){
            report.metadata = metadata
        }
        return report
    } catch (error) {
        console.log(error)
        return null
    }
}