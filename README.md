# Metabarcoding Data Toolkit Backend

## Requirements
Node v18 or higher

## Deployment

````
git clone git@github.com:gbif/metabarcoding-data-toolkit-backend.git
cd metabarcoding-data-toolkit-backend
npm install
node server/index.js --credentials /Path/to/credentials.json --organizationfile /Path/to/organizations.json
````

In order to run very large datasets, increase heap space
`export NODE_OPTIONS="--max-old-space-size=6144" # Increase to 6 GB`

# API
This section describes the API methods needed to run a dataset through the MDT, from raw data files to a Darwin Core Archive, published to GBIF.org.

In the examples below, the base url of the API is assumed to be `https://mdt.gbif.org/service`. You will need to modify the examples to use the base url of your MDT installation.

## Authentication
In order to operate the Metabarcoding Data Toolkit through the API, you need to login and get a token:

`curl -u username:@password 'https://mdt.gbif.org/service/auth/login' | jq .token`

This will give you an `AUTHORIZATION_TOKEN` valid for 30 minutes,


## Uploading and validating data files
Start by uploading a set of files to the MDT. Replace `@/Path/to/OTU_table.tsv`, `@/Path/to/samples.tsv` etc with the actual paths to your data files.

````
curl 'https://mdt.gbif.org/service/dataset/upload' \
-F 'tables=@/Path/to/OTU_table.tsv' \
-F 'tables=@/Path/to/samples.tsv'  \
-F 'tables=@/Path/to/taxonomy.tsv'  \
-F 'tables=@/Path/to/study.tsv'  \
-H 'Authorization: Bearer <AUTHORIZATION_TOKEN>' 
````
This will return a `DATASET_KEY` (UUID) for the dataset.

After uploading the files, you can verify that the MDT is able to process them, using the validation endpoint: 

````
curl 'https://mdt.gbif.org/service/validate/<DATASET_KEY>' \
  -H 'Authorization: Bearer <AUTHORIZATION_TOKEN>'  | jq .files.format
````

If your file names comply with the [naming convention](https://docs.gbif-uat.org/mdt-user-guide/en/#fitting-the-data-into-a-template), and you have `id` columns in the sample and taxonomy files, the validation should respond with one of the formats listed here: https://mdt.gbif.org/service/enum/format
If the response is `INVALID`, you will probably need to tell the API which file is the OTU table, taxonomy and sample file.

You will do this by posting a simple mapping like the following:
````
curl 'https://mdt.gbif.org/service/dataset/<DATASET_KEY>/file-types' \
  -H 'Authorization: Bearer <AUTHORIZATION_TOKEN>' \
  -H 'Content-Type: application/json' \
  --data-raw '{"MyArbitraryNamedOTUTable.tsv":"otuTable","MyArbitraryNamedSamples.tsv":"samples","MyArbitraryNamedTaxa.tsv":"taxa","MyArbitraryNamedStudy.txt":"defaultValues"}'
````

You can now re-run the validation to verify that the files have been properly mapped to entities.


## Mapping field names (tsv headers) to Darwin Core terms

If you use recognised DWC fields such as `decimalLatitude`, `decimalLongitude`, `eventDate` etc, this step is not needed. However, if you want to translate some of your sample metadata into the extended measurement or fact extension, you will need to post a mapping (see the "measurements" property in the example below)

````
curl 'https://mdt.gbif.org/service/dataset/<DATASET_KEY>/mapping' \
  -H 'Authorization: Bearer <AUTHORIZATION_TOKEN>' \
  -H 'Content-Type: application/json' \
  --data-raw '{"taxa":{"id":"id","kingdom":"kingdom","phylum":"phylum","class":"class","order":"order","family":"family","genus":"genus","DNA_sequence":"sequence","scientificName":"species","verbatimIdentification":"taxpath"},"samples":{"id":"id","decimalLatitude":"Latitude","decimalLongitude":"Longitude","footprintWKT":"polygon","eventDate":"Date"},"defaultValues":{"env_medium":"soil [ENVO:00001998]","target_gene":"ITS2","pcr_primer_forward":"GTGARTCATCGARTCTTTG","pcr_primer_name_forward":"gITS7","pcr_primer_reverse":"TCCTCCGCTTATTGATATGC","pcr_primer_name_reverse":"ITS4","sop":"https://www.biorxiv.org/content/10.1101/2023.08.03.551543v1","seq_meth":"Illumina MiSeq","samplingProtocol":"https://dx.doi.org/10.17504/protocols.io.bp2l69y7klqe/v2","samp_vol_we_dna_ext":"1000 mL","annealingTemp":"69.5","annealingTempUnit":"Degrees Celsius","amplificationReactionVolume":"25","amplicationReactionVolumeUnit":"µl","nucl_acid_ext":"https://dx.doi.org/10.17504/protocols.io.ewov1qyyygr2/v1","nucl_acid_amp":"https://dx.doi.org/10.17504/protocols.io.dm6gp3wpdvzp/v1","lib_layout":"paired","otu_db":"UNITE v9.3"},"measurements":{"surfacetemp_sd_all":{"measurementType":"surfacetemp_sd_all","measurementUnit":"Degrees (Celcius)","measurementAccuracy":"0.1"}}}'
````

## Processing data

Start processing of the data:

````
curl 'https://mdt.gbif.org/service/dataset/<DATASET_KEY>/process' \
  -X 'POST' \
  -H 'Authorization: Bearer <AUTHORIZATION_TOKEN>' \
````

The processing status can be retrieved:

````
curl 'https://mdt.gbif.org/service/dataset/<DATASET_KEY>/process-status' | jq .status
````
The status can be `processing` or `queued`, and when it is `finished` you can move on to the next steps. 
If the status is `failed`, you will need to investigate what went wrong. The log file will be available at `https://mdt.gbif.org/dataset/<DATASET_KEY>/log.txt`


## Creating Dataset Metadata (EML)

The Dataset Metadata can be posted as a JSON object.

````
curl 'https://mdt.gbif.org/service/dataset/<DATASET_KEY>/metadata' \
  -H 'Authorization: Bearer <AUTHORIZATION_TOKEN>' \
  -H 'Content-Type: application/json' \
  --data-raw '{"title":"My first Metabarcoding dataset","license":"CC0","contact":{"givenName":"Thomas Stjernegaard","surName":"Jeppesen","organizationName":"GBIF","electronicMailAddress":"your@email.com","phone":"","userId":"0000-0003-1691-239X","deliveryPoint":"Universitetsparken 15","city":"København Ø","administrativeArea":"","country":"DK"},"description":"A good description of my first Metabarcoding dataset.","creator":[{"givenName":"Thomas Stjernegaard","surName":"Jeppesen","organizationName":"GBIF","electronicMailAddress":"your@email.com","phone":"","userId":"0000-0003-1691-239X","deliveryPoint":"Universitetsparken 15","city":"København Ø","administrativeArea":"","country":"DK"}]}'
````


## Generating the DWC archive

````
curl 'https://mdt.gbif.org/service/dataset/<DATASET_KEY>/dwc' \
  -X 'POST' \
  -H 'Authorization: Bearer <AUTHORIZATION_TOKEN>'
````

The DWC processing status can be retrieved:
````
curl 'https://mdt.gbif.org/service/dataset/<DATASET_KEY>/dwc-status' | jq .status
````
The status can be `processing` or `queued`, and when it is `finished` you can move on to the next steps. Usually it will take a few seconds.
If the status is `failed`, you will need to investigate what went wrong. The log file will be available at `https://mdt.gbif.org/dataset/<DATASET_KEY>/log.txt`.


## Testing and validating the Darwin Core Archive

The dwc archive can be tested in the [gbif-uat test environment](https://www.gbif-uat.org/). 

````
curl 'https://mdt.gbif.org/service/dataset/<DATASET_KEY>/register-in-gbif-uat' \
  -X 'POST' \
  -H 'Authorization: Bearer <AUTHORIZATION_TOKEN>' | jq .publishing.gbifUatDatasetKey
````

This will return a `GBIF_UAT_DATASET_KEY` for the gif-uat environment. The dataset will be available at `https://www.gbif-uat.org/dataset/<GBIF_UAT_DATASET_KEY>`

It is also possible to run a validation report, using the [GBIF data-validator](https://www.gbif.org/tools/data-validator)

````
curl 'https://mdt.gbif.org/service/dataset/<DATASET_KEY>/data-validator' \
  -X 'POST' \
  -H 'Authorization: Bearer <AUTHORIZATION_TOKEN>' | jq .key
````

This will return a `VALIDATION_KEY` from the gif data validator. The validation report will be accessible at `https://www.gbif.org/tools/data-validator/<VALIDATION_KEY>`. You will receive an email when the validation has finished.


## Publishing the dataset to GBIF.org

To publish the dataset to gbif.org, your user account must be an admin within the tool, or the account must be paired with the organization. Once enabled you must provide a `PUBLISHING_ORGANIZATION_KEY`

````
curl 'https://mdt.gbif.org/service/dataset/<DATASET_KEY>/register-in-gbif-prod?organizationKey=<PUBLISHING_ORGANIZATION_KEY>' \
  -X 'POST' \
  -H 'Authorization: Bearer <AUTHORIZATION_TOKEN>' | jq .publishing.gbifProdDatasetKey
````

This will return a `GBIF_PROD_DATASET_KEY` for gbif.org. The dataset will be published and available at `https://www.gbif.org/dataset/<GBIF_PROD_DATASET_KEY>`
