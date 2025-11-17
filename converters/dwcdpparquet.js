import {tsvToParquet} from "../util/tsvToParquet.js"
import fs from 'fs';

export const dwcdpParquet = async (path, termMapping) => {
    const hasEmof = Object.keys((termMapping?.measurements || {})).length > 0;

    if (!fs.existsSync(`${path}/parquet`)){
        await fs.promises.mkdir(`${path}/parquet/data`, { recursive: true });
     }
     for await (const f of ['nucleotide-analysis', 'event', 'nucleotide-sequence', 'identification', 'molecular-protocol']) {
         tsvToParquet(`${path}/dwc-dp/data/${f}.tsv`, `${path}/parquet/data/${f}.parquet`)
     }
     if(hasEmof){
         await tsvToParquet(`${path}/dwc-dp/data/event-assertion.tsv`, `${path}/parquet/data/event-assertion.parquet`)
     }

     try {
        const emlXmlContent = await fs.promises.readFile(`${path}/dwc-dp/eml.xml`, 'utf-8');
        await fs.promises.writeFile(`${path}/parquet/eml.xml`, emlXmlContent);
        const dataPackageJsonContent = await fs.promises.readFile(`${path}/dwc-dp/datapackage.json`, 'utf-8');
        const dataPackageJsonContentParsed = JSON.parse(dataPackageJsonContent);
        dataPackageJsonContentParsed.resources = dataPackageJsonContentParsed.resources.map( r => {
            r.path = r.path.replace('dwc-dp/data/', 'parquet/data/').replace('.tsv', '.parquet');
            return r;
        })
        const dataPackageJsonContentUpdated = JSON.stringify(dataPackageJsonContentParsed, null, 2);
        await fs.promises.writeFile(`${path}/parquet/datapackage.json`, dataPackageJsonContentUpdated);
     } catch (error) {
        console.log("Error copying meta.xml or datapackage.json to parquet folder")
        throw error
     }
}

export default dwcdpParquet;