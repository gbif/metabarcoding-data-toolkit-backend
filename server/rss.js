import getRSS from "../util/rss/getRSS.js";

export default  (app) => {

    app.get("/rss", async (req, res) => {

        try {
           const rss = await getRSS()

        res.set('Content-Type', 'text/xml')
        res.send(rss)
        } catch (error) {
            res.sendStatus(500)
        }     
        
    })
}