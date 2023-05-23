import { blast, assignTaxonomy } from "../classifier/index.js";
import {metaDataFileToMap} from "../converters/biom.js"
const datasetId = "2e01762b-2d70-42c6-985c-86d084468439"

const file = '/Users/vgs417/edna-tool-backend/data/2e01762b-2d70-42c6-985c-86d084468439/1/original/taxa.tsv'

const sequence = `ATTGTCAGCAGGAATCGCACATGGAGGAGCATCAGTTGATCTGGCTATTTTTTCATTACACCTAGCAGGAATTTCATCAATTTTGGGGGCAGTAAATTTTATTACAACAGTAATTAATATGCGATCAACAGGGATTACTCTTGATCGAATACCTCTATTTGTATGATCAGTTGTTATTACTGCAATTCTTTTATTATTATCCCTC`
const marker = "COI"

const runtest1 = async () => {

    let res = await blast({
        sequence,
        marker
    })

    console.log(res?.nubMatch?.classification)
}

const runtest2 = async () => {

    let taxa = await metaDataFileToMap(file, {id: 'id', DNA_sequence: 'sequence'})

    console.log(`TAXA size ${taxa.size}`)

    let res = await assignTaxonomy(taxa, 'its')

}





runtest2()