import queue from 'async/queue.js';


const q = queue(async (options, callback) => {

    console.log(options)
    console.log("CHECK TYPEOF CB  "+ typeof callback)
    throw "It errored"
    // return "it resolved"
})


const pushJob = async (id) => {
    
        q.push({ id: id }, async (error, result) => {
            if (error) {
                console.log(error);
                //runningJobs.set(id, {...runningJobs.get(id), status: 'failed'} )
                throw error
            } else {
                await Promise.resolve()
                console.log(result)
            }
        })
   
    

}

pushJob(99)

