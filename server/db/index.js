
import dbImplementation from './duckDbAsyncImpl.js'



export const createUserDataset = dbImplementation.createUserDataset;

export const deleteUserDataset = dbImplementation.deleteUserDataset;

export const getUserDatasets = dbImplementation.getUserDatasets;

export const getAllDatasets = dbImplementation.getAllDatasets;

export const updateCountsOnDataset = dbImplementation.updateCountsOnDataset;

export const updateTitleOnDataset = dbImplementation.updateTitleOnDataset;

export const updateUatKeyOnDataset = dbImplementation.updateUatKeyOnDataset;

export const updateProdKeyOnDataset = dbImplementation.updateProdKeyOnDataset;

export const getDatasetById = dbImplementation.getDatasetById

export const updateOccurrenceCountOnDataset = dbImplementation.updateOccurrenceCountOnDataset

export const initialize = dbImplementation.initialize

export default {
    createUserDataset,
    deleteUserDataset,
    getUserDatasets,
    getAllDatasets,
    getDatasetById,
    updateCountsOnDataset,
    updateOccurrenceCountOnDataset,
    updateTitleOnDataset,
    updateUatKeyOnDataset,
    updateProdKeyOnDataset,
    initialize
}