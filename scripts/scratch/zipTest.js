import { zipDwcArchive } from "../../util/filesAndDirectories.js";


const test = async  ( ) => {
    try {
        console.log("ZIP test")
        await zipDwcArchive('b2e07a3a-6592-4b7e-9a57-af026d019f53',1)
        console.log("ZIP completed")
    } catch (error) {
        console.log(error)
    }
}


test()