# Metabarcoding Data Toolkit Backend

## Requirements
Node v18 or higher

## Deployment

````
git clone git@github.com:gbif/metabarcoding-data-toolkit-backend.git
cd metabarcoding-data-toolkit-backend
npm install
node server/index.js --credentials path/to/credentials.json
````

In order to run large datasets (e.g. Global soil), increase heap space
`export NODE_OPTIONS="--max-old-space-size=6144" # Increase to 6 GB`


