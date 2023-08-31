import { toBiom, addReadCounts, metaDataFileToMap } from '../converters/biom.js';
// import config from '../config.js'
import _ from 'lodash'
import { mergeFastaMapIntoTaxonMap, readMapping, readTsvHeaders } from '../util/filesAndDirectories.js'
import { otuTableHasSamplesAsColumns, otuTableHasSequencesAsColumnHeaders } from '../validation/tsvformat.js'
import {uploadedFilesAndTypes} from '../validation/files.js'
import {updateStatusOnCurrentStep, beginStep, stepFinished, blastErrors, finishedJobSuccesssFully, finishedJobWithError, writeBiomFormats, missingSampleRecords, consistencyCheckReport} from "./util.js"
import { md5 } from '../util/index.js';
import { readFastaAsMap } from '../util/streamReader.js';
import { assignTaxonomy } from '../classifier/index.js';
import config from '../config.js';



const processDataset = async (id, version, systemShouldAssignTaxonomy) => {
    try {
        console.log("Processing dataset "+id + " version "+version)
    const mapping = await readMapping(id, version);
    const files = await uploadedFilesAndTypes(id, version)
    const fileMap = _.keyBy(files.files, "type")

    const fasta = files.files.find(f => f.name.endsWith('.fasta') || f.name.endsWith('.fa'))
    

    let sequencesAsHeaders;
    const [samplesAsColumns, errors] =   await otuTableHasSamplesAsColumns(fileMap);
    if (!samplesAsColumns) {
        sequencesAsHeaders = await otuTableHasSequencesAsColumnHeaders(fileMap.otuTable)

    } 
    
    beginStep('readData')
    updateStatusOnCurrentStep(0, 0, 'Reading sample file')
    const samples = await metaDataFileToMap(fileMap?.samples, mapping?.samples, updateStatusOnCurrentStep)  
    updateStatusOnCurrentStep(0, 0, 'Reading taxon file', {sampleCount: samples.size});
    let taxa = fileMap?.taxa ? await metaDataFileToMap(fileMap?.taxa, mapping.taxa, updateStatusOnCurrentStep, sequencesAsHeaders ? md5 : (key) => key) : null; // If there is no Taxon file, create an empty MAP
    
    if(fasta){
        const fastaMap = await readFastaAsMap(`${config.dataStorage}${id}/${version}/original/${fasta.name}`);
        // adds sequences from fasta to taxonomy file
        mergeFastaMapIntoTaxonMap(fastaMap, taxa)
    } else if(sequencesAsHeaders){
       // console.log("#### IT HAS SEQ HEADERS")
        const headers = await readTsvHeaders(fileMap?.otuTable?.path, fileMap?.otuTable?.properties?.delimiter);
       // console.log(`Num sequences ${headers.length}`)
        const fastaMap = new Map(
            headers.slice(1).map(seq => {
                const hash = md5(seq);
                return [hash,{id: hash, DNA_sequence: seq}]
            } )
        )
      //  console.log(`fastaMap size ${fastaMap.size}`)
        if(!taxa){
            taxa = fastaMap;
        } else {
            mergeFastaMapIntoTaxonMap(fastaMap, taxa)
        }    
    }
    updateStatusOnCurrentStep(taxa.size, taxa.size, 'Reading taxon file', {taxonCount: taxa.size});

    stepFinished('readData');

    if(systemShouldAssignTaxonomy){
        beginStep('assignTaxonomy')
        const { errors } = await assignTaxonomy(id, version, taxa, mapping?.defaultValues?.target_gene, updateStatusOnCurrentStep)
        blastErrors(errors || [])
        stepFinished('assignTaxonomy')
    }

    beginStep('convertToBiom')
    updateStatusOnCurrentStep(0, taxa.size, 'Reading OTU table', {taxonCount: taxa.size});
    console.log(`TSV worker running id ${id}`)
   // console.log(`#### TSV worker samplesAsColumns ${samplesAsColumns}`)
    const {biom, consistencyCheck} = await toBiom(fileMap?.otuTable, samples, taxa, samplesAsColumns,  updateStatusOnCurrentStep , mapping, id)
    consistencyCheckReport(consistencyCheck)
    /* if(sampleIdsWithNoRecordInSampleFile?.length > 0){
        // Some ids did not have a corresponding entry in the sample file
        missingSampleRecords(sampleIdsWithNoRecordInSampleFile)
    } */
    stepFinished('convertToBiom');
    beginStep('addReadCounts')
    await addReadCounts(biom, updateStatusOnCurrentStep)
    stepFinished('addReadCounts')
    await writeBiomFormats(biom, id, version)
    finishedJobSuccesssFully('success')
    } catch (error) {
        console.log(error)
        finishedJobWithError(error)   
    }
    
}





const id = process.argv[2]
const version = process.argv[3]
const systemShouldAssignTaxonomy = process.argv?.[4] || false;
processDataset(id, version, systemShouldAssignTaxonomy)

