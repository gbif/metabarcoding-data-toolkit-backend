import {readFastaAsMap} from '../util/streamReader.js';


const file = '/Users/vgs417/edna-tool-backend/testData/12s_coastal_fish/seq.fasta'

const test = async () => {
   const seqMap = await readFastaAsMap(file);
   seqMap.forEach((value, key) => console.log(`${key} = ${value}`))
}

test()

