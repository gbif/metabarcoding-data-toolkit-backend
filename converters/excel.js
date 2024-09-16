import xlsx from "xlsx";
import fs from "fs";
import fileNames from "../validation/filenames.js";
import { Biom } from "biojs-io-biom";
import config from "../config.js";
import util, { getTaxonomyArray } from "../util/index.js";
import { writeMapping } from "../util/filesAndDirectories.js";
import { getGroupMetaDataAsJsonString } from "../validation/termMapper.js";
import {getStreamAsArrayBuffer} from 'get-stream';

// import {getDataForBiomFile, getMetadataRowsWithNoIdInOTUtable} from './dataintegrity.js';

const extractTaxaFromOTUtable = (otuTable, samples, termMapping) => {
  try {
    const notSamplIdHeaderIndices = getTaxonHeaderIndicesFromOtuTable(
      otuTable,
      samples,
      termMapping
    );
    const taxonData = otuTable?.data.map((d) =>
      d.filter((val, idx) => notSamplIdHeaderIndices.includes(idx))
    );
    const otuTableData = otuTable?.data.map((d) =>
      d.filter(
        (val, idx) => idx === 0 || !notSamplIdHeaderIndices.includes(idx)
      )
    );

    return {
      otuTable: {
        name: "otuTable",
        data: otuTableData,
      },
      taxa: {
        name: "taxa",
        data: taxonData,
      },
    };
  } catch (error) {
    console.log(error);
  }
};

const getTaxonHeaderIndicesFromOtuTable = (otuTable, samples, termMapping) => {
  let sampleId = termMapping?.samples?.id;

  const sampleHeaders = samples?.data[0];
  if (!sampleId) {
    sampleId = sampleHeaders.find(
      (e) => !!e && ["id", "sampleid"].includes(e.toLowerCase())
    );
  }
  if (!sampleId) {
    throw "No sample id in sample file";
  }
  const sampleIdIndex = sampleHeaders.indexOf(sampleId);
  // Create a Set if sample IDs:
  const sampleIdSet = new Set(
    samples?.data.slice(1).map((s) => s[sampleIdIndex])
  );
  const otuTableHeaders = otuTable?.data[0];

  // Find all headers that are not a sample id
  const notSamplIdHeaderIndices = otuTableHeaders.reduce((acc, curr, idx) => {
    if (!sampleIdSet.has(curr)) {
      acc.push(idx);
    }
    return acc;
  }, []);

  return notSamplIdHeaderIndices;
};

const determineFileNames = (sheets, termMapping) => {
  try {
    let otuTable = sheets.find((f) => {
      let rawFileName = f.name.replace(/[^0-9a-z]/gi, "").toLowerCase();
      return fileNames.otutable.indexOf(rawFileName) > -1;
    });
    console.log(`OTU table ${otuTable}`);
    const samples = sheets.find((f) => {
      let rawFileName = f.name.replace(/[^0-9a-z]/gi, "").toLowerCase();
      return fileNames.samples.indexOf(rawFileName) > -1;
    });

    console.log(`samples ${samples}`);
    let taxa = sheets.find((f) => {
      let rawFileName = f.name.replace(/[^0-9a-z]/gi, "").toLowerCase();
      return fileNames.taxa.indexOf(rawFileName) > -1;
    });

    let defaultValues = sheets.find((f) => {
      let rawFileName = f.name.replace(/[^0-9a-z]/gi, "").toLowerCase();
      return fileNames.defaultvalues.indexOf(rawFileName) > -1;
    });

    if (!otuTable) {
      throw `Could not find the OTU_table in the sheets: ${sheets
        .map((s) => s.name).join(", ")
        .toString()}`;
    }
    if (!taxa) {
      // Try to get get taxon data and a filtered otu table (i.e. 2 file format)
      try {
        const processed = extractTaxaFromOTUtable(
          otuTable,
          samples,
          termMapping
        );
        otuTable = processed?.otuTable;
        taxa = processed?.taxa;
      } catch (error) {
        // console.log(error)
        throw `Could not find the Taxonomy in the sheets: ${sheets
          .map((s) => s.name).join(", ")
          .toString()}`;
      }
    }
    if (!samples) {
      throw `Could not find the Samples in the sheets: ${sheets
        .map((s) => s.name).join(", ")
        .toString()}`;
    }

    return {
      otuTable,
      samples,
      taxa,
      defaultValues,
    };
  } catch (error) {
    //console.log(error);
    throw error;
  }
};

export const getMapFromMatrix = (matrix, mapping) => {
  const reverseMapping = util.objectSwap(mapping);

  const mapRecord = (record) => {
    // return record;
    return Object.keys(record).reduce((acc, key) => {
      if (reverseMapping[key]) {
        acc[reverseMapping[key]] = record[key];
      } else {
        acc[key] = record[key];
      }
      return acc;
    }, {});
  };

  const columns = matrix[0];

  const rows = matrix.slice(1);

  const arr = rows
    .map((row) => {
      return columns.reduce((acc, e, idx) => {
        acc[e] = row[idx] ? row[idx] : "";
        return acc;
      }, {});
    })
    .map(mapRecord);

  return new Map(arr.filter((d) => !!d.id).map((d) => [ typeof d.id === "string" ? d.id.trim() :d.id, d]));
};

// converts an otu table with sample and taxon metada files to BIOM format
export const toBiom = async (
  otuTable,
  sampleMap,
  taxaMap,
  termMapping,
  processFn = (progress, total, message, summary) => {}
) => {
  return new Promise((resolve, reject) => {
    try {
      let sampleIdsWithNoRecordInSampleFile = [];
      let sampleIdsWithNoRecordInOtuTable = [];
      let taxonIdsWithNoRecordInTaxonFile = [];
      let taxonIdsWithNoRecordInOtuTable = [];
      const sparseData = [];
      let columns = otuTable.data[0].slice(1).map((c) => c.trim());
      const otuTableColumnIds = new Set(columns);
      sampleIdsWithNoRecordInOtuTable = [...sampleMap]
        .filter((e) => !otuTableColumnIds.has(e[0]))
        .map((e) => e[0]);
      const cols = columns.filter((c) => {
        if (sampleMap.has(c)) {
          return true;
        } else {
          sampleIdsWithNoRecordInSampleFile.push(c);
          return false;
        }
      });
      processFn(
        columns.length,
        columns.length,
        "Reading OTU table from spreadsheet",
        {
          sampleCount:
            columns.length - sampleIdsWithNoRecordInSampleFile.length,
        }
      );
      // rows will only be rows that has a value in the taxon file
      let rows = [];
      // otuTableRowIds will be all ids in the OTU table
      const otuTableRowIds = new Set();
      // console.log(otuTable.data.length)
      let count = 0;
      otuTable.data.slice(1).forEach((row, rowIndex) => {
        if (!!row[0] && taxaMap.has(row[0])) {
         
          let columnIdx = 0;
        //  rows.push(row[0]);
          let hasValidColumns = false;

          row.slice(1).forEach((val, index) => {
            if (
              !isNaN(Number(val)) &&
              Number(val) > 0 &&
              sampleMap.has(columns[index])
            ) {
              // cannot rely on rowIndex if there are rows in the OTU table that has taxon ids not in the taxon file
              sparseData.push([count /* rows.length-1 *//* rowIndex */, columnIdx, Number(val)]);
              
              // If we get at least one valid column, we can increment the row
              hasValidColumns = true;
            }
            if (sampleMap.has(columns[index])) {
              columnIdx++;
            }
          });

          if(hasValidColumns){
            count ++;
            rows.push(row[0]);
          }
          
          if (rowIndex + (1 % 100) === 0) {
            processFn(
              rowIndex,
              rows.length,
              "Reading OTU table  from spreadsheet",
              { taxonCount: rows.length }
            );
          }
        } else if (!!row[0] && !taxaMap.has(row[0])) {
          taxonIdsWithNoRecordInTaxonFile.push(row[0]);
        }
        if (!!row[0]) {
          otuTableRowIds.add(row[0]);
        }
      });
      taxonIdsWithNoRecordInOtuTable = [...taxaMap]
        .filter((e) => !otuTableRowIds.has(e[0]))
        .map((e) => e[0]);
      processFn(
        rows.length,
        rows.length,
        "Reading OTU table  from spreadsheet",
        { taxonCount: rows.length }
      );
      
      console.log("taxonIdsWithNoRecordInTaxonFile length "+ taxonIdsWithNoRecordInTaxonFile.length)
      console.log(
        `Samples in metadata: ${sampleMap.size} in OTU table: ${columns.length}`
      );
      console.log(`Cols length: ${cols.length}`)
      console.log(
        `Taxa in metadata: ${taxaMap.size} in OTU table: ${rows.length}`
      );
      console.log(`Rows length: ${rows.length}`)
      const biom = new Biom({
        type: 'OTU table',
        rows: rows.map((r) => ({ id: r, metadata: {...taxaMap.get(r), taxonomy: getTaxonomyArray({metadata: taxaMap.get(r)}) }})), // rows.map(r => ({id: r, metadata: taxaMap.get(r)})),
        comment: getGroupMetaDataAsJsonString(termMapping),
        columns: cols.map((c) => ({ id: c, metadata: sampleMap.get(c) })), // columns.map(c => ({id: c, metadata: sampleMap.get(c)})),
        matrix_type: "sparse",
        matrix_element_type: "int",
        date: new Date().toISOString().split("Z")[0],
        shape: [rows.length, cols.length], // [rows.length, columns.length], //[taxaMap.size, sampleMap.size],
        data: sparseData,
      });
      resolve({
        biom,
        consistencyCheck: {
          sampleIdsWithNoRecordInOtuTable,
          sampleIdsWithNoRecordInSampleFile,
          taxonIdsWithNoRecordInOtuTable,
          taxonIdsWithNoRecordInTaxonFile,
        } /* sampleIdsWithNoRecordInSampleFile */,
      });
    } catch (error) {
      console.log(error);
      reject(error);
    }
  });
};

export const processWorkBookFromFile = async (
  id,
  fileName,
  version,
  termMapping,
  processFn = (progress, total, message, summary) => {}
) => {
  return new Promise(async (resolve, reject) => {
    try {
      const stream = fs.createReadStream(
        `${config.dataStorage}${id}/${version}/original/${fileName}`
      );
      stream.on("error", (error) => {
        reject(error);
      });
      try {
        const buffer = await getStreamAsArrayBuffer(stream) //Buffer.concat(buffers);
        // console.log(buffer)
         const workbook = xlsx.read(buffer, {type: "array", dense: true, cellDates: true });

        console.log(workbook.SheetNames);
        if (workbook.SheetNames.length < 2) {
          throw "There must be minimum 2 sheets, otuTable and samples";
        } else {
          // const sheet = workbook.Sheets[workbook.SheetNames[0]];
          //  const data = xlsx.utils.sheet_to_json(sheet)
          // console.log(data)
          //        workbook.SheetNames.map(n => ({name: n, data: xlsx.utils.sheet_to_json(workbook.Sheets[n])}))

          const data = workbook.SheetNames.map((n) => ({
            name: n,
            data: xlsx.utils.sheet_to_json(workbook.Sheets[n], { header: 1 }),
          }));
          const mappedData = determineFileNames(data, termMapping);
          const biom = await toBiom(mappedData, termMapping, processFn);

          resolve(biom);
        }
      } catch (error) {
        reject(error)
      }
     
      
    } catch (error) {
      reject(error);
    }
  });
};

export const readWorkBookFromFile = async (
  id,
  fileName,
  version,
  termMapping,
  processFn = (progress, total, message, summary) => {}
) => {
  return new Promise(async (resolve, reject) => {
    try {
      const stream = fs.createReadStream(
        `${config.dataStorage}${id}/${version}/original/${fileName}`
      );

     
      stream.on("error", (error) => {
        reject(error);
      });
      try {
        const buffer = await getStreamAsArrayBuffer(stream) //Buffer.concat(buffers);
        // console.log(buffer)
         const workbook = xlsx.read(buffer, {type: "array", dense: true, cellDates: true });

        console.log(workbook.SheetNames);
        if (workbook.SheetNames.length < 2) {
          throw "There must be minimum 2 sheets, otuTable and samples";
        } else {
          // const sheet = workbook.Sheets[workbook.SheetNames[0]];
          //  const data = xlsx.utils.sheet_to_json(sheet)
          // console.log(data)
          //        workbook.SheetNames.map(n => ({name: n, data: xlsx.utils.sheet_to_json(workbook.Sheets[n])}))

          const data = workbook.SheetNames.map((n) => ({
            name: n,
            data: xlsx.utils.sheet_to_json(workbook.Sheets[n], { header: 1 }),
          }));
          const mappedData = determineFileNames(data, termMapping);
          resolve(mappedData);
          /*  const biom = await toBiom(mappedData, termMapping, processFn)
        resolve(biom) */
        }
      } catch (error) {
        reject(error);

      }
    } catch (error) {
      reject(error);
    }
  });
};

export const readXlsxHeaders = async (id, fileName, version) => {
  return new Promise(async (resolve, reject) => {
    try {
      const stream = fs.createReadStream(
        `${config.dataStorage}${id}/${version}/original/${fileName}`
      );

      
      stream.on("error", (error) => {
        reject(error);
      });
      try {
        const buffer = await getStreamAsArrayBuffer(stream) //Buffer.concat(buffers);
       // console.log(buffer)
        const workbook = xlsx.read(buffer, {type: "array", dense: true, cellDates: true });

      console.log(workbook.SheetNames);
      if (workbook.SheetNames.length < 2) {
        throw "There must be minimum 2 sheets, otuTable and samples";
      } else {
        const data = workbook.SheetNames.map((n) => ({
          name: n,
          data: xlsx.utils.sheet_to_json(workbook.Sheets[n], { header: 1 }),
        }));
        const { otuTable, taxa, samples, defaultValues } =
          determineFileNames(data);

        const otuTableColumns = (otuTable?.data?.[0]?.slice(1) || []).map(
          (c) => c.trim()
        );
        const otuColumnSet = new Set(otuTableColumns);

        // If there are default values on a fourth sheet in the workbook, write a mapping
        if (defaultValues) {
          await writeMapping(id, version, {
            samples: {},
            taxa: {},
            measurements: {},
            defaultValues: defaultValues?.data
              ?.slice(1)
              .reduce((acc, curr) => {
                acc[curr?.[0]] = curr?.[1];
                return acc;
              }, {}),
          });
        }
        let headers = {
          sampleHeaders: samples?.data?.[0],
          taxonHeaders: taxa?.data?.[0],
        };
        console.log(headers)
        let sampleId = headers.sampleHeaders.find(
          (e) => !!e && ["id", "sampleid"].includes(e.toLowerCase())
        );
        console.log("samp id "+sampleId)
        const sampleIdIndex = headers.sampleHeaders.indexOf(sampleId);

        console.log("sampleIdIndex "+sampleIdIndex)
        // Create a Set if sample IDs:
        const sampleIds = samples?.data
          .slice(1)
          .filter((s) => !!s[sampleIdIndex])
          .map((s) => {
            try {
              return s[sampleIdIndex].toString().trim()
            } catch (error) {
              console.log("error on ")
              console.log(s[sampleIdIndex])
            }
          });

        const sampleSet = new Set(sampleIds);

        // const sampleSet = new Set(headers.sampleHeaders)
        const sampleIdsNotInOtuTableHeaders = sampleIds.reduce(
          (acc, curr) => (!otuColumnSet.has(curr) ? acc + 1 : acc),
          0
        );
        const otuTableHeadersNotInSampleIds = otuTableColumns.reduce(
          (acc, curr) => (!sampleSet.has(curr) ? acc + 1 : acc),
          0
        );

        const COLUMN_LIMIT = 100;
        let sheets = [otuTable, taxa, samples, defaultValues]
          .filter((e) => !!e)
          .map((entity) => {
            const ROW_LIMIT =
              entity === defaultValues ? entity?.data?.length : 100;
            const errors = [];

            if (entity === otuTable && otuTableHeadersNotInSampleIds > 0) {
              errors.push(
                `${otuTableHeadersNotInSampleIds} of ${otuTableColumns.length} columns in the OTU table does not have a corresponding row in the sample file`
              );
            }
            if (entity === samples && sampleIdsNotInOtuTableHeaders > 0) {
              errors.push(
                `${sampleIdsNotInOtuTableHeaders} of ${sampleIds.length} samples are not in the OTU table`
              );
            }

            return {
              name: entity?.name,
              headers:
                entity?.data?.[0].length > COLUMN_LIMIT
                  ? entity?.data?.[0].slice(0, COLUMN_LIMIT)
                  : entity?.data?.[0],
              rows:
                entity?.data?.[0].length > COLUMN_LIMIT
                  ? entity?.data
                      ?.slice(0, ROW_LIMIT)
                      .map((r) => r.slice(0, COLUMN_LIMIT))
                  : entity?.data?.slice(0, ROW_LIMIT),
              isInConsistent: false,
              numColumns: entity?.data?.[0].length,
              columnLimit: COLUMN_LIMIT,
              errors,
            };
          });

        resolve({ headers, sheets });
      }
      } catch (error) {
        reject(error);
      }
    } catch (error) {
      reject(error);
    }
  });
};
