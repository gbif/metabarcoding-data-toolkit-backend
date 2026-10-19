import {toBiom, addReadCounts, writeBiom } from '../../converters/biom.js';
import {biomToDwc, otuTableToDWC} from '../../converters/dwc.js';
import {processWorkBookFromFile} from '../../converters/excel.js'
import {writeHDF5} from '../../converters/hdf5.js';
import * as url from 'url';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const termMappingBiowide = {
    'taxa': {
        'sequence': 'DNA_sequence',
        'species': 'scientificName'
    },
    'samples': {
       // 'id': 'eventID',
        'site_name': 'locality',
        'marker': 'target_gene'
    } 
}

const termMappingGlobalSoil = {
    'taxa': {
        'Seq': 'DNA_sequence',
        'UNITE_SH': 'scientificName',
        'species': 'specificEpithet'
    },
    'samples': {
        'latitude': 'decimalLatitude',
        'longitude': 'decimalLongitude',
        'biome': 'env_broad_scale',
        'area': 'location'
    } 
}

const testGlobalSoilToBiom = async () => {
    console.log("Reading Global Soil dataset to Biom")
    try {
       console.time('toBiom');

       let biom = await toBiom(`../testData/global_soil/OTU_table.txt`,`../testData/global_soil/samples.txt`,`../testData/global_soil/taxa.txt`);
       console.timeEnd('toBiom');
       console.time('addReadCounts')
       await addReadCounts(biom)
       console.timeEnd('addReadCounts');

        console.log(`004ac16df5b07dd3ed641fb8637606fbc62c1275 rows[765].id ${biom.rows[765].id}`)
         console.log(biom.getDataAt("004ac16df5b07dd3ed641fb8637606fbc62c1275", "10MR")) // 6

         console.log(`00b7da9fade1549bde8c9a0849a08052abcb8226 rows[1943].id ${biom.rows[1943].id}`)
        console.log(biom.getDataAt("00b7da9fade1549bde8c9a0849a08052abcb8226", "10MR")) // 2

        console.log(`0163904018bf1aa36c7443ece309da8f740b313d rows[3833].id ${biom.rows[3833].id}`)
        console.log(biom.getDataAt("0163904018bf1aa36c7443ece309da8f740b313d", "10MR")) // 7

        console.log(`0270028e0a265e8d1f337689cf3a453efe455319 rows[6818].id ${biom.rows[6818].id}`)
        console.log(biom.getDataAt("0270028e0a265e8d1f337689cf3a453efe455319", "10MR")) // 1

        console.log(`02c893d95f0ad42a440743d3eed340534b353ab9 rows[7785].id ${biom.rows[7785].id}`)
        console.log(biom.getDataAt("02c893d95f0ad42a440743d3eed340534b353ab9", "10MR")) // 2
        return biom;
    } catch (error) {
        console.log(error)
    }
}

const testBiowideToBiom = async (version = "") => {
    console.log("Reading eDNA Fungi dataset to Biom")

    try {
        console.time('toBiom');
       let biom = await toBiom(`../testData/biowide_fungi${version}/OTU_table.tsv`,`../testData/biowide_fungi${version}/sample.tsv`,`../testData/biowide_fungi${version}/taxa.tsv`);
       console.timeEnd('toBiom');
        console.time('addReadCounts')
        await addReadCounts(biom)
        console.timeEnd('addReadCounts');

        /*  console.log(biom.getDataAt("39efbae3f448393c8795c2ee920ab1041e947c37", "NV001"))
        console.log(biom.getDataAt("39efbae3f448393c8795c2ee920ab1041e947c37", "NV002"))
        console.log(biom.getDataAt("39efbae3f448393c8795c2ee920ab1041e947c37", "NV003"))
        console.log(biom.getDataAt("39efbae3f448393c8795c2ee920ab1041e947c37", "NV004")) 

        console.log(biom.getDataAt("0445a4bfdacacee7d17d933aa2c29ee32847bf62", "NV001"))  */

        await writeBiom(biom, `../output/archive/biowide.biom.json`)
        await writeHDF5(biom, `../output/archive/biowide.biom.h5`)
        return biom;
  
    } catch (error) {
        console.log(error)
    }
}

const simpleTest = () => {
   const biom = new Biom({
        rows: [{id: 'r1'},{id: 'r2'},{id: 'r3'},{id: 'r4'},{id: 'r5'}],
        columns: [{id: 'c1'},{id: 'c2'},{id: 'c3'},{id: 'c4'},{id: 'c5'}],
        matrix_type: 'sparse',
        data: [[0,1,11],[1,2,13],[4,4,9]]
    });
    console.log(biom.getDataAt('r1','c2'));
    // 11
}


const globalSoilOtuTableToDwc = async () => {
    
    try {
      //  otuTableToDWC(`../testData/biowide_fungi/OTU_table.tsv`,`../testData/biowide_fungi/sample.tsv`,`../testData/biowide_fungi/taxa.tsv`, termMappingBiowide);
      otuTableToDWC(`../testData/global_soil/OTU_table.txt`,`../testData/global_soil/samples.txt`,`../testData/global_soil/taxa.txt`, termMappingGlobalSoil);

  
    } catch (error) {
        console.log(error)
    }
}


const biowideOtuTableToDwc = async (version = "") => {
    

    try {
        otuTableToDWC(`../testData/biowide_fungi${version}/OTU_table.tsv`,`../testData/biowide_fungi${version}/sample.tsv`,`../testData/biowide_fungi${version}/taxa.tsv`, termMappingBiowide);

  
    } catch (error) {
        console.log(error)
    }
}

const biowideToBiomToDwc = async (version = "") =>{

    const biom = await testBiowideToBiom(version)
    console.time('toDwc');
    await biomToDwc(biom, termMappingBiowide)
    console.timeEnd('toDwc');
}

const globalSoilToBiomToDwc = async () =>{

    const biom = await testGlobalSoilToBiom()
    console.time('toDwc');
    await biomToDwc(biom, termMappingGlobalSoil)
    console.timeEnd('toDwc');
}

const testExcel = () => {
    processWorkBookFromFile(__dirname +`../testData/danish_reefs/Data Sheet 1/Danish_Reefs_eDNA_gen.xlsx`)
}

//biowideToBiomToDwc('_min')
testExcel()