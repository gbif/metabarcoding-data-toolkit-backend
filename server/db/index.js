
import dbImplementation from './duckDbImpl.js'



export const createUserDataset = dbImplementation.createUserDataset;

export const getUserDatasets = dbImplementation.getUserDatasets;

export const getAllDatasets = dbImplementation.getAllDatasets;


export default {
    createUserDataset,
    getUserDatasets,
    getAllDatasets
}