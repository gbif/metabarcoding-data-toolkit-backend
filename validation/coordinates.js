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

// Number("") and Number(null) are 0, so a blank has to be ruled out before the range check
const isCoordinateInRange = (value, limit) => {
    if(value === null || value === undefined || value.toString().trim() === ''){
        return false
    }
    const number = Number(value)
    return !isNaN(number) && number <= limit && number >= -limit
}

export const isValidDecimalLatitude = lat => isCoordinateInRange(lat, 90)
export const isValidDecimalLongitude = lon => isCoordinateInRange(lon, 180)