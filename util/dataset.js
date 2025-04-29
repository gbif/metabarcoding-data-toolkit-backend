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
        let report = await getDataset(id, version);
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
        const events = []
       // let log = [];
        let initLog = []
        initLog.push(`${report?.createdAt ? new Date(report?.createdAt).toUTCString() + ": " : ""}Dataset ${id} created by ${report?.createdBy}`)
        if(_.isArray(report?.files?.files) && report?.files?.files.length > 0){
            initLog.push(`${spacer}  Files uploaded:`)
            report?.files?.files.forEach(f => {
                initLog.push(`${spacer}   ${f?.name} (${f?.mimeType}), Type: ${_.startCase(f?.type)}`)
            })
        }
        if(report?.mapping?.createdBy && report?.mapping?.createdAt){
           // log.push(`${new Date(report?.mapping?.createdAt).toUTCString()}: Term mapping saved by ${report?.mapping?.createdBy}`)
           events.push({created: new Date(report?.mapping?.createdAt), data: [`${new Date(report?.mapping?.createdAt).toUTCString()}: Term mapping saved by ${report?.mapping?.createdBy}`]})
        }
        if(_.isArray(report?.steps)){
            let log = []
            const steps = report?.steps;
            const processingErrors = report?.processingErrors || {};
            if(report?.processedBy && steps?.[0]?.time){
                log.push(`${new Date(steps?.[0]?.time).toUTCString()}: Data processing started by ${report?.processedBy}`)
            }
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
                    log.push(`${!!steps?.[idx +1]?.time ? new Date(steps?.[idx +1]?.time).toUTCString() +":" : spacer+" "} ${s?.message})}`)
                }
                log.push(`${!!steps?.[idx +1]?.time ? new Date(steps?.[idx +1]?.time).toUTCString() +":" : spacer+" "} ${_.startCase(s?.status)} ${_.startCase(s?.name)}`)
            });
            events.push({created: steps[0]?.time ? new Date(steps[0]?.time) : null, data:log})

        }

        if(_.isArray(report?.dwc?.steps)){
            let log = []
            const steps = report?.dwc?.steps;
            if(report?.dwc?.createdBy && steps[0]?.time){
                log.push(`${new Date(steps[0]?.time).toUTCString()}: Generated DWC archive, started by user ${report?.dwc?.createdBy}`)
            }
            steps.forEach((s, idx ) => {
                if(!!s?.time && !!s?.name){
                    log.push(`${new Date(s?.time).toUTCString()}: ${_.startCase(s?.name)}`)
                };
                if(s?.name === "writeDwc" && !!report?.dwc?.summary?.occurrenceCount){
                    log.push(`${spacer}  Occurrence records: ${report?.dwc?.summary?.occurrenceCount}`)
                }
                
                if(s?.status === "failed" && !!s?.message){
                    log.push(`${!!steps?.[idx +1]?.time ? new Date(steps?.[idx +1]?.time).toUTCString() +":" : spacer+" "} ${s?.message})}`)
                }
                log.push(`${!!steps?.[idx +1]?.time ? new Date(steps?.[idx +1]?.time).toUTCString() +":" : spacer+" "} ${_.startCase(s?.status)} ${_.startCase(s?.name)}`)

            })
            events.push({created: steps[0]?.time ? new Date(steps[0]?.time) : null, data:log})

        }
        if(report?.publishing?.validationId){
           // log.push(`${report?.publishing?.validationCreatedAt ? new Date(report?.publishing?.validationCreatedAt).toUTCString() + ": ":  spacer+"  "}User ${report?.publishing?.validationCreatedBy} created validation report: https://www.gbif.org/tools/data-validator/${report?.publishing?.validationId}`)
           events.push({created: new Date(report?.publishing?.validationCreatedAt), data: [`${report?.publishing?.validationCreatedAt ? new Date(report?.publishing?.validationCreatedAt).toUTCString() + ": ":  spacer+"  "}Validation report created: https://www.gbif.org/tools/data-validator/${report?.publishing?.validationId} (User ${report?.publishing?.validationCreatedBy})`]})

        }
        if(report?.publishing?.gbifUatDatasetKey){
           // log.push(`${report?.publishing?.registeredUAT ? new Date(report?.publishing?.registeredUAT).toUTCString() + ": ":  spacer+"  "}Dataset tested in GBIF-UAT environment: https://www.gbif-uat.org/dataset/${report?.publishing?.gbifUatDatasetKey}`)
           events.push({created: new Date(report?.publishing?.registeredUAT), data:[`${report?.publishing?.registeredUAT ? new Date(report?.publishing?.registeredUAT).toUTCString() + ": ":  spacer+"  "}Dataset tested in GBIF-UAT environment: https://www.gbif-uat.org/dataset/${report?.publishing?.gbifUatDatasetKey} (User ${report?.publishing?.registeredUATby})`]})

        }
        if(report?.publishing?.gbifProdDatasetKey){
           // log.push(`${report?.publishing?.registeredPROD ? new Date(report?.publishing?.registeredPROD).toUTCString() + ": ":  spacer+"  "}Dataset published to GBIF: https://www.gbif.org/dataset/${report?.publishing?.gbifProdDatasetKey}`)
           events.push({created: new Date(report?.publishing?.registeredPROD) , data: [`${report?.publishing?.registeredPROD ? new Date(report?.publishing?.registeredPROD).toUTCString() + ": ":  spacer+"  "}Dataset published to GBIF: https://www.gbif.org/dataset/${report?.publishing?.gbifProdDatasetKey} (User ${report?.publishing?.registeredPRODby})`]})
        }
        if(report?.metadata?.createdAt && report?.metadata?.createdBy){
            events.push({created: new Date(report?.metadata?.createdAt), data: [`${new Date(report?.metadata?.createdAt).toUTCString()}: Metadata (EML) saved by ${report?.metadata?.createdBy}`]})
        }
        if(report?.deletedAt && report?.deletedBy){
            events.push({created: new Date(report?.deletedAt), data: [`${new Date(report?.deletedAt).toUTCString()}: Dataset deleted by ${report?.deletedBy}`]})
        }
        return [...initLog, ...events.sort((a, b) => a?.created - b?.created).map(e => e.data).flat()].join("\n")
    } catch (error) {
        console.log(error)
        return null
    }
}