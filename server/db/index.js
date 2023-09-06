
import dbImplementation from './duckDbImpl.js'



export const createUserDataset = dbImplementation.createUserDataset;

export const getUserDatasets = dbImplementation.getUserDatasets;

export const getAllDatasets = dbImplementation.getAllDatasets;

export const updateCountsOnDataset = dbImplementation.updateCountsOnDataset;

export const updateTitleOnDataset = dbImplementation.updateTitleOnDataset;

export const getDatasetById = dbImplementation.getDatasetById

export const updateOccurrenceCountOnDataset = dbImplementation.updateOccurrenceCountOnDataset

export default {
    createUserDataset,
    getUserDatasets,
    getAllDatasets,
    getDatasetById,
    updateCountsOnDataset,
    updateOccurrenceCountOnDataset,
    updateTitleOnDataset
}