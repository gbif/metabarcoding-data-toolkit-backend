import {getSamplesForGeoJson, getSamples, getSampleMetadataTypes, getSampleTaxonomy, getSampleIndicesForOtu, getSampleMetadataColumn, getTaxonomyForAllSamples, getMetrics} from "../metrics/index.js"
import { fileAtPathExists, getCurrentDatasetVersion, readMetrics, writeMetricsToFile} from '../util/filesAndDirectories.js'
import config from '../config.js'

export default  (app) => {

    app.get("/dataset/:id/data/geojson", async (req, res) => {

        if (!req.params.id) {
            res.sendStatus(400);
          } else {
              try {
                  let version = req?.query?.version;
                  if(!version){
                      version = await getCurrentDatasetVersion(req.params.id)
                  } 
                const data =  await getSamplesForGeoJson(`${config.dataStorage}${req.params.id}/${version}/data.biom.h5`)
              
                let geoJson = {
                    "type": "FeatureCollection",
                    "features": data?.id.map((id, idx) => {
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
                }
                 // console.log(eml)data
                  res.send(geoJson) 
              } catch (error) {
                 // Will throw if lat / lon does not exists
                 // console.log(error)
                  res.sendStatus(404)
              }
          }   
        
    })

    app.get("/dataset/:id/data/samples", async (req, res) => {

        if (!req.params.id ) {
            res.sendStatus(400);
          } else {
              try {
                  let version = req?.query?.version;
                  if(!version){
                      version = await getCurrentDatasetVersion(req.params.id)
                  } 
                const data =  await getSamples(`${config.dataStorage}${req.params.id}/${version}/data.biom.h5`)
            
                 // console.log(eml)data
                  res.send(data) 
              } catch (error) {
                  console.log(error)
                  res.sendStatus(500)
              }
          }   
        
    })

    app.get("/dataset/:id/data/sample/metadata/:column", async (req, res) => {

        if (!req.params.id ) {
            res.sendStatus(400);
          } else {
              try {
                  let version = req?.query?.version;
                  if(!version){
                      version = await getCurrentDatasetVersion(req.params.id)
                  } 
                const data =  await getSampleMetadataColumn(`${config.dataStorage}${req.params.id}/${version}/data.biom.h5`, req.params.column)
            
                 // console.log(eml)data
                  res.send(data) 
              } catch (error) {
                  console.log(error)
                  res.sendStatus(500)
              }
          }   
        
    })



    app.get("/dataset/:id/data/sample/:index/taxonomy", async (req, res) => {

        if (!req.params.id ) {
            res.sendStatus(400);
          } else {
              try {
                  let version = req?.query?.version;
                  if(!version){
                      version = await getCurrentDatasetVersion(req.params.id)
                  } 
                const data =  await getSampleTaxonomy(`${config.dataStorage}${req.params.id}/${version}/data.biom.h5`, req.params.index)
            
                 // console.log(eml)data
                  res.send(data) 
              } catch (error) {
                  console.log(error)
                  res.sendStatus(500)
              }
          }   
        
    })

    app.get("/dataset/:id/data/taxonomy", async (req, res) => {

        if (!req.params.id ) {
            res.sendStatus(400);
          } else {
              try {
                  let version = req?.query?.version;
                  if(!version){
                      version = await getCurrentDatasetVersion(req.params.id)
                  } 
                const data =  await getTaxonomyForAllSamples(`${config.dataStorage}${req.params.id}/${version}/data.biom.h5`)
            
                 // console.log(eml)data
                  res.send(data) 
              } catch (error) {
                  console.log(error)
                  res.sendStatus(500)
              }
          }   
        
    })

    app.get("/dataset/:id/data/metrics", async (req, res) => {

        if (!req.params.id ) {
            res.sendStatus(400);
          } else {
              try {
                  let version = req?.query?.version;
                  if(!version){
                      version = await getCurrentDatasetVersion(req.params.id)
                  } 
                let metrics = await readMetrics(req.params.id, version)
                /* if(!metrics){
                    const h5BiomFileExists = await fileAtPathExists(`${config.dataStorage}${req.params.id}/${version}/data.biom.h5`)

                    if(!h5BiomFileExists){
                        res.sendStatus(404)
                        return;
                    } else {
                        metrics =  await getMetrics(`${config.dataStorage}${req.params.id}/${version}/data.biom.h5`)
                        await writeMetricsToFile(req.params.id, version, metrics)
                         
                    }
                    
                } */
                  if(metrics){
                    res.send(metrics)
                  } else {
                    res.sendStatus(404)
                  }
                
                 // console.log(eml)data
                 
              } catch (error) {
                  console.log(error)
                  res.sendStatus(500)
              }
          }   
        
    })

    app.get("/dataset/:id/data/observation/:index", async (req, res) => {

        if (!req.params.id ) {
            res.sendStatus(400);
          } else {
              try {
                  let version = req?.query?.version;
                  if(!version){
                      version = await getCurrentDatasetVersion(req.params.id)
                  } 
                const data =  await getSampleIndicesForOtu(`${config.dataStorage}${req.params.id}/${version}/data.biom.h5`, req.params.index)
                

                 // console.log(eml)data
                  res.send(data) 
              } catch (error) {
                  console.log(error)
                  res.sendStatus(500)
              }
          }   
        
    })

    app.get("/dataset/:id/data/sample/datatypes", async (req, res) => {

        if (!req.params.id ) {
            res.sendStatus(400);
          } else {
              try {
                  let version = req?.query?.version;
                  if(!version){
                      version = await getCurrentDatasetVersion(req.params.id)
                  } 
                const data =  await getSampleMetadataTypes(`${config.dataStorage}${req.params.id}/${version}/data.biom.h5`)
                

                 // console.log(eml)data
                  res.send(data) 
              } catch (error) {
                  console.log(error)
                  res.sendStatus(500)
              }
          }   
        
    })

    

/*     app.get("/dataset/:id/data/read-counts", async (req, res) => {

        if (!req.params.id ) {
            res.sendStatus(400);
          } else {
              try {
                  let version = req?.query?.version;
                  if(!version){
                      version = await getCurrentDatasetVersion(req.params.id)
                  } 
                const data =  await getReadCountPrSample(`${config.dataStorage}${req.params.id}/${version}/data.biom.h5`)
                

                 // console.log(eml)data
                  res.send(data) 
              } catch (error) {
                  console.log(error)
                  res.sendStatus(500)
              }
          }   
        
    }) */

    
}