import util from "../util/index.js";
import license from "../enum/license.js";
import format from "../enum/format.js";
import config from "../config.js"
import axios from "axios";
export default  (app) => {

    app.get("/enum/license", async (req, res) => {

        try {
        res.json(license)
        } catch (error) {
            res.sendStatus(500)
        }     
        
    })

    app.get("/enum/format", async (req, res) => {

        try {
        
        res.json(format)
        } catch (error) {
            res.sendStatus(500)
        }     
        
    })

    app.get("/ontology/:ontology", async (req, res) => {

        try {
            const {data} = await axios({
                method: 'get',
                url: `${config.ebiOntologyService}?q=${req?.query?.q || ''}&groupField=iri&ontology=${req?.params?.ontology}&start=${req?.query?.start || 0}&rows=${req?.query?.rows || 10}`,
                responseType: 'stream',
                
                
              })
              data.pipe(res)
        } catch (error) {
            console.log(error)
            res.sendStatus(500)
        }     
        
    })

}