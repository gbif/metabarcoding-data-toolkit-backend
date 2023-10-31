
import fs from 'fs';
import config from '../config.js'
import axios from 'axios'
import pLimit from 'p-limit';
import supportedMarkers from '../enum/supportedMarkers.js'
import taxonomyFileHeaders from './taxonFileHeaders.js'
const BLAST_CONCURRENCY = 8;

const RANKS = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species']
const gbifBaseUrl = config.gbifBaseUrlProd


const randomizer = () => {
    return Math.random() <   0.8//0.01;
};

export const blast = async ({ DNA_sequence, id}, marker , verbose = false) => {
     if(randomizer()) {
        throw new Error("test error")
    } 
    try {
        let response = await axios({
            method: 'POST',
            url: `${config.blastService}/blast${verbose ? '?verbose=true' : ''}`,
            data: {
                marker,
                sequence: DNA_sequence
            },
            json: true
        });
        let result = {...response.data, id}
        if (result.matchType) {
            try {
                let decorated = await decorateWithGBIFspecies(result);
                /* if (verbose && response.data.alternatives) {
                    await decorateAlternatives(response.data.alternatives);
                } */
                return decorated;
            } catch (err) {
                console.log(err)
                return result;
            }
        } else {
            throw "No blast response"
        }
    } catch (err){
        throw err
    }
    
    
   
}

const  decorateWithGBIFspecies = async (e) => {
   // console.log(`${gbifBaseUrl}species/match2?name=${e.name}`)
    try {
        let url =  `${gbifBaseUrl}species/match2?name=${e.name}`
    let nub = await axios({method: 'GET', url: url, json: true});
    // console.log(nub)
    let nubMatch = nub.data;
  //  console.log(nubMatch)
    if (['UNRANKED', 'SPECIES'].includes(nubMatch?.usage?.rank)) {
        const species = nubMatch.classification.find((t) => t.rank === 'SPECIES');
        if (species?.name === e.name || nubMatch?.usage?.name === e.name) {
            /* let formatted = await scientificName.getParsedName(
                nubMatch.usage.key
            );
            nubMatch.usage.formattedName = formatted; */
            e.nubMatch = nubMatch;
            return e;
        } else {
            return e;
        }
    } else {
        return e;
    }
    } catch (err){
        console.log(err)
    }
    
}

const assignTaxonomyToEntry = (blastResult, taxaMap) => {
    let entry = taxaMap.get(blastResult?.id)

        if(blastResult?.nubMatch?.classification){
            const taxonomy = blastResult?.nubMatch?.classification?.reduce((acc, cur) => {
                if(cur?.rank){
                    acc[cur?.rank?.toLowerCase()] = cur
                }
                return acc;
            }, {})

            if(entry){
                RANKS.forEach(r => {
                    entry[r] = taxonomy?.[r]?.name || ''
                })

                if(blastResult?.matchType === "BLAST_EXACT_MATCH"){
                    entry.scientificName = blastResult?.name

                } else if(blastResult?.matchType === "BLAST_CLOSE_MATCH"){
                    entry.scientificName = taxonomy?.genus?.name || taxonomy?.family?.name || taxonomy?.order?.name || taxonomy?.class?.name ||  taxonomy?.phylum?.name ||  taxonomy?.kingdom?.name
                } else {
                    // TODO deal with ambiguous and weak matches
                    entry.scientificName = '';
                }
            }

        } else {

            // We will wipe the verbatim taxonomy annotation if we have no match. (it will still be in the original files for reference)
            if(entry){
                RANKS.forEach(r => {
                    entry[r] =  ''
                })
                if(blastResult?.matchType === "BLAST_EXACT_MATCH"){
                    entry.scientificName = blastResult?.name

                } else if(blastResult?.matchType === "BLAST_CLOSE_MATCH"){
                    let splitted = blastResult?.name?.split(" ")
                    entry.scientificName = splitted?.[0] || ''
                } else {
                    // TODO deal with ambiguous and weak matches
                    entry.scientificName = '';
                } 
                
            }
        }
        if(blastResult?.id){
            taxaMap.set(blastResult?.id, entry)
        }
}


const writeRow = (stream, blastResult, seq) => {

    let taxonomy = {};
    if(blastResult?.nubMatch?.classification){
        taxonomy = blastResult?.nubMatch?.classification?.reduce((acc, cur) => {
            if(cur?.rank){
                acc[cur?.rank?.toLowerCase()] = cur
            }
            return acc;
        }, {})
    } 

    const classification = RANKS.map(r => taxonomy?.[r]?.name || '').join('\t')

    stream.write(`${blastResult?.id}\t${blastResult?.matchType}\t${!isNaN(blastResult?.bitScore) ? blastResult?.bitScore: ''}\t${!isNaN(blastResult?.expectValue) ? blastResult?.expectValue: ''}\t${!isNaN(blastResult?.qcovs) ? blastResult?.qcovs : '' }\t${classification}\t${blastResult?.name || ''}\t${seq}\n`);
}

const blastAll = async (taxa, marker, processFn = (progress, total, message, summary) => {}, path, taxonomyStream, erroredItems = new Map(), retries = 5, matchCount = 0, total_) => {
    const blastlimit = pLimit(BLAST_CONCURRENCY);

   // let erroredItems = new Map();
   // let retries = 5;
   // let matchCount = 0;
    let total =  total_ ? total_ : taxa.size;
    

    let res = await Promise.all(([...taxa.values()]/* .slice(0,10) */).map(async (s) => {
        try {
            const res = await blastlimit(blast, s, marker)

                assignTaxonomyToEntry(res, taxa)
                matchCount ++;
                writeRow(taxonomyStream, res, s?.DNA_sequence)
                if(matchCount % 100 === 0){
                    processFn(matchCount, total)
                    console.log(`Blasted ${matchCount} of ${total} sequences`)
                }
                if(erroredItems.has(s.id)){
                    erroredItems.delete(s.id)
                }
                return res
        } catch (error) {
            erroredItems.set(s.id, s)
           // erroredItems.push(s)
        }
        }))
        // TODO handle retries

         if ( erroredItems.size > 0 && retries > 0 ) {
            console.log(`${erroredItems.size} failed blasts, ${retries} left`)
            retries --;
           await blastAll(erroredItems, marker, processFn, path, taxonomyStream, erroredItems, retries, matchCount, total);
        } 
        return {errors : erroredItems.size > 0 ? [`Failed to match ${erroredItems.size} of ${taxa.size} sequences`] : []}

}


// Taxa should be a Map, keyed by taxon (ASV) id
export const assignTaxonomy = async (id, version, taxa, marker, processFn = (progress, total, message, summary) => {}) => {
    const taxonFilePath = `${config.dataStorage}${id}/${version}/taxonomy.tsv`
    try {
        if(!supportedMarkers.map(m => m?.name).includes((marker || '').toLowerCase())){
            throw 'unsupported marker'
        }
        const taxonomyStream = fs.createWriteStream(taxonFilePath, {
            flags: "a",
          });
        taxonomyStream.write(`${taxonomyFileHeaders.join("\t")}\n`)
       const res = await blastAll(taxa, marker, processFn, taxonFilePath, taxonomyStream)
       taxonomyStream.end()
       return res;
        /* taxa.forEach((value, key) => {
            console.log(key, value);
        }) */
        
    } catch (error) {
        console.log(error)
    }
    
}



