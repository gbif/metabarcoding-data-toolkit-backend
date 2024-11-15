import { getCurrentDatasetVersion, getMetadata, getProcessingReport, readMapping, fileAtPathExists, readMetrics } from './filesAndDirectories.js'
import { uploadedFilesAndTypes} from '../validation/files.js';
import {getSamplesForGeoJson} from "../metrics/index.js"
import { filterAndValidateCoordinates } from "../validation/coordinates.js"
import config from '../config.js';
import _ from "lodash";

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

export const getDatasetLog = async (id, version) =>  {
    try {
        if(!version){
            version = await getCurrentDatasetVersion(id);
        } 
        let report = await getProcessingReport(id, version);
        const hasHdf5 = await fileAtPathExists(`${config.dataStorage}${id}/${version}/data.biom.h5`)
        let metrics;

        let invalidSamples = [], features = [];
        if(hasHdf5){
            try {
                const data =  await getSamplesForGeoJson(`${config.dataStorage}${id}/${version}/data.biom.h5`)
                const [invalidSamples_, features_] =  filterAndValidateCoordinates(data) 
                invalidSamples = invalidSamples_;
                features = features_
                metrics = await readMetrics(id, version)
            } catch (error) {
                
            }          

        }
        const spacer = '                             '
        let log = [];

        log.push(`${report?.createdAt ? new Date(report?.createdAt).toUTCString() + ": " : ""}Dataset ${id} created by ${report?.createdBy}`)
        if(_.isArray(report?.files?.files) && report?.files?.files.length > 0){
            log.push(`${spacer}  Files uploaded:`)
            report?.files?.files.forEach(f => {
                log.push(`${spacer}   ${f?.name} (${f?.mimeType}), Type: ${_.startCase(f?.type)}`)
            })
        }
        if(_.isArray(report?.steps)){
            const steps = report?.steps;
            const processingErrors = report?.processingErrors || {};
            steps.forEach((s, idx ) => {
                if(!!s?.time && !!s?.name){
                    log.push(`${new Date(s?.time).toUTCString()}: ${_.startCase(s?.name)}`)
                };
                if(s?.name === "validating"){
                    log.push(`${spacer}  File format: ${report.files?.format}`)
                
            }
                if(s?.name === "validating" && _.isObject(report?.processingErrors?.consistencyCheck) ) {
                    Object.keys(processingErrors?.consistencyCheck).forEach(key => {
                        const arr = _.isArray(processingErrors?.consistencyCheck?.[key]) ? processingErrors?.consistencyCheck?.[key] : [];
                        if(arr?.length === 0){
                            log.push(`${spacer}  ${_.startCase(key)}: 0`)
                        } else {
                            log.push(`${spacer}  ${_.startCase(key)} (${arr.length}): ${arr.join(", ")}`)
                        }
                    })

                     
                }
                if(s?.name === "validating" && invalidSamples?.length > 0){
                        log.push(`${spacer}  Invalid coordinates (${invalidSamples.length}): ${invalidSamples.map(s => `${s?.properties?.id}: [${s?.geometry?.coordinates[0]}, ${s?.geometry?.coordinates[1]}]`).join(", ")}`)
                    
                }
                if(s?.name === "validating" && invalidSamples?.length === 0 && features?.length >0){
                    log.push(`${spacer}  All samples has valid coordinates (${features?.length})`)
                
                     }

                if(s?.name === "assignTaxonomy" && _.isArray(processingErrors?.blast) && processingErrors?.blast?.length > 0){
                    log.push(`${spacer}  ${processingErrors?.blast.join(", ")}`)
                }
                if(s?.name === "assignTaxonomy" && _.isArray(processingErrors?.blast) && processingErrors?.blast?.length === 0){
                    log.push(`${spacer}  Matched ${s?.total} sequences`)
                }
                if(s?.name === "writeBiom2" && _.isArray(processingErrors?.hdf5) && processingErrors?.hdf5?.length > 0){
                    log.push(`${spacer}  ${processingErrors?.hdf5.join(", ")}`)
                }
                if(s?.name === "generateMetrics" && s?.status === "finished" && report?.summary?.sampleCount && report?.summary?.taxonCount){
                    log.push(`${spacer}  Samples: ${report?.summary?.sampleCount}`)
                    log.push(`${spacer}  Taxa: ${report?.summary?.taxonCount}`)
                }
                 if(s?.name === "generateMetrics" && s?.status === "finished" && !!metrics){
                    ['otuCountPrSample', 'readSumPrSample', 'sequenceLength'].forEach((m => {
                        log.push(`${spacer}  ${_.startCase(m)}: Mean ${metrics?.[m].mean?.toFixed(2)} (±${metrics?.[m].stdev?.toFixed(2)})`)
                    }))
                    if(metrics?.singletonsTotal){
                        log.push(`${spacer}  Total reads: ${metrics.singletonsTotal}`)
                    }
                    if(metrics?.totalReads){
                        log.push(`${spacer}  Total reads: ${metrics.totalReads}`)
                    }
                } 
                if(s?.status === "failed" && !!s?.message){
                    log.push(`${!!steps?.[idx +1]?.time ? new Date(report?.steps?.[idx +1]?.time).toUTCString() +":" : spacer+" "} ${s?.message})}`)
                }
                log.push(`${!!steps?.[idx +1]?.time ? new Date(report?.steps?.[idx +1]?.time).toUTCString() +":" : spacer+" "} ${_.startCase(s?.status)} ${_.startCase(s?.name)}`)
            });
        }

        if(_.isArray(report?.dwc?.steps)){
            const steps = report?.dwc?.steps;
            steps.forEach((s, idx ) => {
                if(!!s?.time && !!s?.name){
                    log.push(`${new Date(s?.time).toUTCString()}: ${_.startCase(s?.name)}`)
                };
                if(s?.name === "writeDwc" && !!report?.dwc?.summary?.occurrenceCount){
                    log.push(`${spacer}  Occurrence records: ${report?.dwc?.summary?.occurrenceCount}`)
                }
                
                if(s?.status === "failed" && !!s?.message){
                    log.push(`${!!steps?.[idx +1]?.time ? new Date(report?.steps?.[idx +1]?.time).toUTCString() +":" : spacer+" "} ${s?.message})}`)
                }
                log.push(`${!!steps?.[idx +1]?.time ? new Date(report?.steps?.[idx +1]?.time).toUTCString() +":" : spacer+" "} ${_.startCase(s?.status)} ${_.startCase(s?.name)}`)

            })

            if(report?.publishing?.gbifUatDatasetKey){
                log.push(`${report?.publishing?.registeredUAT ? new Date(report?.publishing?.registeredUAT).toUTCString() + ": ":  spacer+"  "}Dataset tested in GBIF-UAT environment: https://www.gbif-uat.org/dataset/${report?.publishing?.gbifUatDatasetKey}`)
            }
            if(report?.publishing?.gbifProdDatasetKey){
                log.push(`${report?.publishing?.registeredPROD ? new Date(report?.publishing?.registeredPROD).toUTCString() + ": ":  spacer+"  "}Dataset published to GBIF: https://www.gbif.org/dataset/${report?.publishing?.gbifProdDatasetKey}`)
            }
        }

        return log.join("\n")
    } catch (error) {
        console.log(error)
        return null
    }
}