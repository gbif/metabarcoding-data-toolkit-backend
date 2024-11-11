import {partitionArray} from '../util/index.js'


export const filterAndValidateCoordinates = data => {
    const allFeatures = data?.id.map((id, idx) => {
       // console.log([ data.decimalLongitude[idx], data.decimalLatitude[idx]])
        return {
            "type": "Feature",
            "geometry": {
              "type": "Point",
              "coordinates": [ data.decimalLongitude[idx], data.decimalLatitude[idx]]
            },
            "properties": {
              "id": id
            }
          }
    })

    const [features, invalidSamples] = partitionArray(allFeatures, f => {
        const lat = f?.geometry?.coordinates?.[1] //    data.decimalLongitude[idx]
        const lon = f?.geometry?.coordinates?.[0]
        if(isValidDecimalLatitude(lat) && isValidDecimalLongitude(lon)){
            return true
        } else {
           
            return false
        }
    })

    

    return [invalidSamples, features]


    
}

export const isValidDecimalLatitude = lat => (!isNaN(Number(lat) && Number(lat) <= 90 && Number(lat) >= -90))
export const isValidDecimalLongitude = lon => (!isNaN(Number(lon) && Number(lon) <= 180 && Number(lon) >= -180))