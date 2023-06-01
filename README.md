# eDNA tool backend

## Requirements
Node v18 or higher

## Deployment

````
git clone git@github.com:gbif/edna-tool-backend.git
cd edna-tool-backend
npm install
node server/index.js --credentials path/to/credentials.json
````

In order to run large datasets (e.g. Global soil), increase heap space
`export NODE_OPTIONS="--max-old-space-size=6144" # Increase to 6 GB`


