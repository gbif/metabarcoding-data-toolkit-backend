import util from "../util/index.js";
import license from "../enum/license.js";
import format from "../enum/format.js";
import supportedMarkers from "../enum/supportedMarkers.js";
import agentRole from "../enum/agentRole.js"
import filenames from "../validation/filenames.js";
import config from "../config.js"
import axios from "axios";

export default  (app) => {

    app.get("/enum/networks", async (req, res) => {

        try {
            
            let options = {
                method: 'get',
                url: `${config.gbifGbrdsBaseUrl[config.env]}registry/network.json`,
               
            }
            const response = await axios(options);
    
            res.send(response?.data)
            
        } catch (error) {
            console.log(error)
            res.sendStatus(error?.response?.status || 500)
        }
    }
);

    
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

    app.get("/enum/supported-markers", async (req, res) => {

        try {
        
        res.json(supportedMarkers)
        } catch (error) {
            res.sendStatus(500)
        }     
        
    })

    app.get("/enum/agent-roles", async (req, res) => {

        try {
        
        res.json(agentRole)
        } catch (error) {
            res.sendStatus(500)
        }     
        
    })

    app.get("/enum/file-types", async (req, res) => {

        try {
        
        res.json(Object.keys(filenames))
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