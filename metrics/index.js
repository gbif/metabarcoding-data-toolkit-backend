import _ from 'lodash'
import { mean, std } from 'mathjs'
import {getDataForDissimilarityPlot} from './ordination.js'
let h5wasm;


const init = async () => {
    h5wasm = await import("h5wasm/node");
    await h5wasm?.ready
    return h5wasm
}

init();



export const getSamplesForGeoJson = async (hdf5file) => {
    try {
        let f = new h5wasm.File(hdf5file, "r");
    let decimalLongitude = f.get('sample/metadata/decimalLongitude').to_array() //.filter(l => !isNaN(Number(l) && Number(l) <= 180 && Number(l) >= -180))
    let decimalLatitude = f.get('sample/metadata/decimalLatitude').to_array() // .filter(l => !isNaN(Number(l) && Number(l) <= 90 && Number(l) >= -90))
    let id = f.get('sample/metadata/id').to_array()
        
    f.close()
    return {id, decimalLatitude, decimalLongitude}
    } catch (error) {
        throw error
    }
    

}

export const getSamples = async (hdf5file) => {
    try {
    let f = new h5wasm.File(hdf5file, "r");
    let res = {};
    let keys = f.get('sample/metadata').keys(); //.to_array()
    // console.log(keys)
    keys.forEach(key => {
        res[key] = f.get(`sample/metadata/${key}`).to_array();
    })
    f.close()
    return res;
} catch (error) {
    throw error
}

}

export const getSparseMatrix =  (f, sampleIndex) => {
  /*   if(!h5wasm){
        await init()
    }
    await h5wasm?.ready;

    let f = new h5wasm.File(hdf5file, "r"); */
   // console.log(f.keys())
    const data = f.get("observation/matrix/data").to_array();
    const indices = f.get("observation/matrix/indices").to_array();
    const indptr = f.get("observation/matrix/indptr").to_array();
  //  f.close()
    let indptrIdx = 0;
    let numRows = indptr[indptrIdx + 1] - indptr[indptrIdx];
    const sparseMatrix = data.map((d, idx) => {
        let res = [indptrIdx, indices[idx], d];
        numRows--;
        if (numRows === 0) {
            indptrIdx++
            numRows = indptr[indptrIdx + 1] - indptr[indptrIdx];
        }
        return res;
    })
    const idx = Number(sampleIndex);
    return !isNaN(idx) ? sparseMatrix.filter(row => row[1] === idx) : sparseMatrix;
}

export const getSampleTaxonomy = async  (hdf5file, sampleIndex) => {

    if(!h5wasm){
        await init()
    }
    await h5wasm?.ready;

    let f = new h5wasm.File(hdf5file, "r");
    const data = f.get("observation/matrix/data").to_array();
    const indices = f.get("observation/matrix/indices").to_array();
    const indptr = f.get("observation/matrix/indptr").to_array();

    let observationMetaData = {};
    // Why do we put the id in the taxonomy? It is the only unique handle for an ASV, the scientificName could very well be non-unique across taxa/ASVs
    f.get("observation/metadata").keys().filter(key => ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'id'].includes(key)).forEach(key => {
        observationMetaData[key] = f.get(`observation/metadata/${key}`).to_array()
    });
    // console.log( f.get(`observation/metadata/taxonomy`).dtype)
    let indptrIdx = 0;
    let numRows = indptr[indptrIdx + 1] - indptr[indptrIdx];
    const sparseMatrix = data.map((d, idx) => {
        let res = [indptrIdx, indices[idx], d];
        numRows--;
        if (numRows === 0) {
            indptrIdx++
            numRows = indptr[indptrIdx + 1] - indptr[indptrIdx];
        }
        return res;
    })
    const idx = Number(sampleIndex);
    const parentMap = new Map();
    const filteredSparseMatrix = sparseMatrix.filter(row => row[1] === idx);
    const headers = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'id'].filter(h => Object.keys(observationMetaData).includes(h));

    const result = filteredSparseMatrix.map(row => {
        let obj = {};
        let _id = ""
        for(let i = 0; i < headers.length; i++){
            obj[headers[i]] = observationMetaData[headers[i]][row[0]]
            if(i === headers.length -1){
                obj.name = observationMetaData[headers[i]][row[0]]
                obj.parent = _id
                obj.rank = "ASV"
                obj.value = 1;
            }
            if(i < headers.length -1){
                let id = `${_id}${observationMetaData[headers[i]][row[0]]}_`;
                parentMap.set(id, {parentId : _id, name: observationMetaData[headers[i]][row[0]], rank: headers[i]})
            }
            
            _id += observationMetaData[headers[i]][row[0]] +"_"
            
        }
        obj.readCount = row[2];

        return obj;
    })

    f.close()
    return [...result, ...Array.from(parentMap).map(t => ({id: t[0] || "", parent: t[1].parentId, name: t[1].name, rank: t[1].rank}))];
}


export const getSampleCompositions = async  (hdf5file) => {
    if(!h5wasm){
        await init()
    }
    await h5wasm?.ready;
    let f = new h5wasm.File(hdf5file, "r");
    const data = f.get("observation/matrix/data").to_array();
    const indices = f.get("observation/matrix/indices").to_array();
    const indptr = f.get("observation/matrix/indptr").to_array();

  /*   let observationMetaData = {};
    // Why do we put the id in the taxonomy? It is the only unique handle for an ASV, the scientificName could very well be non-unique across taxa/ASVs
    f.get("observation/metadata").keys().filter(key => ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'id'].includes(key)).forEach(key => {
        const rankData = f.get(`observation/metadata/${key}`);
        observationMetaData[key] = rankData ? rankData.to_array() : []
    }); */
    // console.log( f.get(`observation/metadata/taxonomy`).dtype)
    let indptrIdx = 0;
    let numRows = indptr[indptrIdx + 1] - indptr[indptrIdx];
    const sparseMatrix = data.map((d, idx) => {
        let res = [indptrIdx, indices[idx], d];
        numRows--;
        if (numRows === 0) {
            indptrIdx++
            numRows = indptr[indptrIdx + 1] - indptr[indptrIdx];
        }
        return res;
    })
    const sampleIdData = f.get(`sample/metadata/id`);
    const sampleIds = sampleIdData ? sampleIdData.to_array(): []
    const result = sparseMatrix.reduce((acc, curr) => {
        if(acc?.[sampleIds[curr[1]]]){
            acc[sampleIds[curr[1]]].push(curr[0])
        } else {
            acc[sampleIds[curr[1]]] = [curr[0]]
        }
        return acc;
    }, {})
    f.close()
    return result;

}

export const getTaxonomyForAllSamples = async  (hdf5file) => {

    if(!h5wasm){
        await init()
    }
    await h5wasm?.ready;

    let f = new h5wasm.File(hdf5file, "r");
    const data = f.get("observation/matrix/data").to_array();
    const indices = f.get("observation/matrix/indices").to_array();
    const indptr = f.get("observation/matrix/indptr").to_array();

    let observationMetaData = {};
    // Why do we put the id in the taxonomy? It is the only unique handle for an ASV, the scientificName could very well be non-unique across taxa/ASVs
    f.get("observation/metadata").keys().filter(key => ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'id'].includes(key)).forEach(key => {
        observationMetaData[key] = f.get(`observation/metadata/${key}`).to_array()
    });
    const sampleIds = f.get(`sample/metadata/id`).to_array()
    f.close()

    const result = sampleIds.map(id => ({id, taxonomy: []}))
    // console.log( f.get(`observation/metadata/taxonomy`).dtype)
    let indptrIdx = 0;
    let numRows = indptr[indptrIdx + 1] - indptr[indptrIdx];
    const sparseMatrix = data.map((d, idx) => {
        let res = [indptrIdx, indices[idx], d];
        numRows--;
        if (numRows === 0) {
            indptrIdx++
            numRows = indptr[indptrIdx + 1] - indptr[indptrIdx];
        }
        return res;
    })
    // const idx = Number(sampleIndex);
    
    // const filteredSparseMatrix = sparseMatrix.filter(row => row[1] === idx);
    const headers = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'id'].filter(h => Object.keys(observationMetaData).includes(h));

    sparseMatrix.forEach(row => {
        const sampleIndex = row[1]
      //  const parentMap = new Map();
        let obj = {};
        let _id = ""
        for(let i = 0; i < headers.length; i++){
            obj[headers[i]] = observationMetaData[headers[i]][row[0]]
            if(i === headers.length -1){
                obj.name = observationMetaData[headers[i]][row[0]]
                obj.parent = _id
                obj.rank = "ASV"
                obj.value = 1;
            }
            
            
        }
        obj.readCount = row[2];
        result[sampleIndex].taxonomy.push(obj)
        //return [...obj, ...Array.from(parentMap).map(t => ({id: t[0] || "", parent: t[1].parentId, name: t[1].name, rank: t[1].rank}))]// obj;
    })

   
    return result; // [...result, ...Array.from(parentMap).map(t => ({id: t[0] || "", parent: t[1].parentId, name: t[1].name, rank: t[1].rank}))];
}

export const getGeographicScope =  (f) => {

    try {
        
       const latitudes = f.get(`sample/metadata/decimalLatitude`).to_array();
       const longitudes = f.get(`sample/metadata/decimalLongitude`).to_array();
       return {
        northBoundingCoordinate: Math.max(...latitudes),
        southBoundingCoordinate: Math.min(...latitudes),
        westBoundingCoordinate: Math.min(...longitudes),
        eastBoundingCoordinate: Math.max(...longitudes)
       }
    } catch (error) {
        console.log(error)
        throw error
    }
   
}

export const getTemporalScope =   (f) => {

    try {
       
        const dates = f.get(`sample/metadata/eventDate`).to_array();
       return {
        from: dates.reduce((min, c) => c < min ? c : min),
        to: dates.reduce((max, c) => c > max ? c : max)
       }
    } catch (error) {
        console.log(error)
        throw error
    }
   
}

export const getTaxonomicScope =   (f) => {

    try {
       
        const taxonomicScope = {};
        f.get("observation/metadata").keys().filter(key => ['kingdom', 'phylum', 'class', 'order', 'family'].includes(key)).forEach(key => {
            const rank = f.get(`observation/metadata/${key}`).to_array().filter(x => !!x)
            if(rank.length > 0){
            taxonomicScope[key] = [...new Set(rank)]
            }
        });
       return taxonomicScope
    } catch (error) {
        console.log(error)
        throw error
    }
   
}

export const getTotalReads =   (f) => {

    try {
       
        const data = f.get("observation/matrix/data").to_array();
       return  data.reduce((a, b) => a + b, 0)
    } catch (error) {
        console.log(error)
        throw error
    }
   
}

export const getOtuCountPrSample =   (f) => {

    try {
       
        const indptr = f.get("sample/matrix/indptr").to_array();
        const data = indptr.map((val, idx) => idx === 0 ? val : val - indptr[idx-1]).slice(1)
       return { mean: mean(...data), stdev: std(...data)}
    } catch (error) {
        console.log(error)
        throw error
    }
   
}

export const getSampleIndicesForOtu = async (hdf5file, OTUidx) => {
    try {
        if(!h5wasm){
            await init()
        }
        await h5wasm?.ready;
        let f = new h5wasm.File(hdf5file, "r");
        const indices = f.get("observation/matrix/indices").to_array();
        const indptr = f.get("observation/matrix/indptr").to_array();
        f.close()
       // console.log(indptr.length)
       // console.log(`From ${Number(OTUidx)} to ${Number(OTUidx) +1}`)
        return indices.slice(indptr[Number(OTUidx)], indptr[Number(OTUidx) +1])
        
       
    } catch (error) {
        console.log(error)
        throw error
    }

}

export const getSampleMetadataColumn = async (hdf5file, column) => {
    try {
        if(!h5wasm){
            await init()
        }
        await h5wasm?.ready;
        let f = new h5wasm.File(hdf5file, "r");
        const data = f.get(`sample/metadata/${column}`).to_array();
        f.close()
       
        return data
        
       
    } catch (error) {
        console.log(error)
        throw error
    }

}

export const getSampleMetadataTypes = async (hdf5file, column) => {
    try {
        if(!h5wasm){
            await init()
        }
        await h5wasm?.ready;
        let f = new h5wasm.File(hdf5file, "r");
        const keys = f.get(`sample/metadata`).keys();
        const result = keys.map(key => ({key, type: f.get(`sample/metadata/${key}`).dtype}))
        f.close()
       
        return result
        
       
    } catch (error) {
        console.log(error)
        throw error
    }

}

export const getSampleCountPrOtu =   (f) => {

    try {
       
        const indices = f.get("sample/matrix/indices").to_array();
          const data = indices.reduce((acc, curr) => {
            if(!acc[curr]){
                acc[curr] = 1
            } else {
                acc[curr] ++
            }
            return acc
        },{})  

         

        const mapped = Object.keys(data).map(key => ({key, val: data[key] })).sort((a,b)=> b.val- a.val)
        const mostFrequent = mapped.slice(0, 10)
        /* console.log('mostFrequent')
        console.log(mostFrequent) */
        const lastNonSingletonIndex = mapped.findLastIndex(e => e.val > 1);
        const singletonsTotal = mapped.length - 1 - lastNonSingletonIndex;
        const leastFrequent = mapped.slice(Math.max(lastNonSingletonIndex - 10, 0), lastNonSingletonIndex)
       /*  console.log('leastFrequent')
        console.log(leastFrequent) */
       // const singletons = mapped.slice(Math.max(mapped.findLastIndex(e => e.val === 1) - 5, 0))
        f.get("observation/metadata").keys().filter(key => ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'scientificName', 'DNA_sequence', 'id'].includes(key)).forEach(key => {
            const rank = f.get(`observation/metadata/${key}`).to_array()
            mostFrequent.forEach(e => e[key] = rank[Number(e.key)]) 
            leastFrequent.forEach(e => e[key] = rank[Number(e.key)])

        });
       return {mostFrequent, leastFrequent, singletonsTotal}
    } catch (error) {
        console.log(error)
        throw error
    }
   
}

export const getReadSumPrSample = (f) => {

    try {
      
        const data = f.get(`sample/metadata/readCount`).to_array();

       return { mean: mean(...data), stdev: std(...data)}
    } catch (error) {
        console.log(error)
        throw error
    }
   
}

export const getReadCountPrSample =  (f) => {

    try {
       /*  if(!h5wasm){
            await init()
        }
        await h5wasm?.ready;
        let f = new h5wasm.File(hdf5file, "r") */;
      
        const data = f.get(`sample/metadata/readCount`).to_array();
        //f.close()
       return data
    } catch (error) {
        console.log(error)
        throw error
    }
   
}

export const getDNAsequenceLength = (f) => {

    try {
      
        const data = f.get(`observation/metadata/DNA_sequence`).to_array().map(s => s.length);

        let mean_;
        let stdev_;
        try {
            mean_ = mean(data)
        } catch (error) {
            console.log("metrics mean")
            console.log(error)
        }
        try {
            stdev_ = std(data)
        } catch (error) {
            console.log("metrics stdev_")
            console.log(error)
        }
       return { mean: mean_, stdev: stdev_}
    } catch (error) {
        console.log(error)
        throw error
    }
   
}

export const getSampleIds = (f) => {

    try {
      
        const data = f.get(`sample/ids`).to_array();

       return data
    } catch (error) {
        console.log(error)
        throw error
    }
   
}

export const getMetrics = async (hdf5file, processFn = (progress, total, message, summary) => {}) => {
    try {
        if(!h5wasm){
            await init()
        }
        await h5wasm?.ready;
        let f = new h5wasm.File(hdf5file, "r");
        const sampleIds = getSampleIds(f);
        const sparseMatrix = getSparseMatrix(f);
        let jaccard;
        let brayCurtis;
        let temporalScope;
        let geographicScope;
        let taxonomicScope;
        try {
            jaccard = getDataForDissimilarityPlot(processFn, sparseMatrix, 'jaccard', sampleIds)
        } catch (error) {
            console.log("Not able to generate Jaccard index")
            console.log(error)
        }
        try {
            brayCurtis = getDataForDissimilarityPlot(processFn, sparseMatrix, 'bray-curtis', sampleIds, getReadCountPrSample(f))
        } catch (error) {
            console.log("Not able to generate Bray-Curtis index")
            console.log(error)
        }

        try {
            temporalScope = getTemporalScope(f);
        } catch (error) {
            console.log("Not able to generate temporalScope")
            console.log(error)
        }

        try {
            geographicScope = getGeographicScope(f)
        } catch (error) {
            console.log("Not able to generate geographicScope")
            console.log(error)
        }

        try {
            taxonomicScope = getTaxonomicScope(f)

        } catch (error) {
            console.log("Not able to generate taxonomicScope")
            console.log(error)
        }



        const metrics =  {
           
            totalReads: getTotalReads(f),
            otuCountPrSample: getOtuCountPrSample(f),
            readSumPrSample: getReadSumPrSample(f),
            sequenceLength: getDNAsequenceLength(f),
            sampleCountPrOtu: getSampleCountPrOtu(f)
        }
        if(metrics?.sampleCountPrOtu?.singletonsTotal){
            metrics.singletonsTotal = metrics?.sampleCountPrOtu?.singletonsTotal
        }
        if(jaccard){
            metrics.jaccard = jaccard
        }
        if(brayCurtis){
            metrics.brayCurtis = brayCurtis
        }
        if(geographicScope){
            metrics.geographicScope = geographicScope
        }
        if(temporalScope){
            metrics.temporalScope = temporalScope
        }
        if(taxonomicScope){
            metrics.taxonomicScope = taxonomicScope
        }
        

       f.close()
       return metrics
    } catch (error) {
        console.log(error)
        throw error
    }
}

