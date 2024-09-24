
import dbImplementation from './duckDbAsyncImpl.js'



export const createUserDataset = dbImplementation.createUserDataset;

export const deleteUserDataset = dbImplementation.deleteUserDataset;

export const getUserDatasets = dbImplementation.getUserDatasets;

export const getAllDatasets = dbImplementation.getAllDatasets;

export const updateCountsOnDataset = dbImplementation.updateCountsOnDataset;

export const updateTitleOnDataset = dbImplementation.updateTitleOnDataset;

export const updateDescriptionOnDataset = dbImplementation.updateDescriptionOnDataset;

export const updateUatKeyOnDataset = dbImplementation.updateUatKeyOnDataset;

export const updateProdKeyOnDataset = dbImplementation.updateProdKeyOnDataset;

export const getDatasetById = dbImplementation.getDatasetById

export const updateOccurrenceCountOnDataset = dbImplementation.updateOccurrenceCountOnDataset

export const updatePublishingOrgKeyOnDataset = dbImplementation.updatePublishingOrgKeyOnDataset

export const updateDwcGeneratedOnDataset = dbImplementation.updateDwcGeneratedOnDataset

export const getDatasetsOrderedByDwcCreated = dbImplementation.getDatasetsOrderedByDwcCreated

export const getDatasetsOrderedByDwcCreatedNoPaging = dbImplementation.getDatasetsOrderedByDwcCreatedNoPaging

export const updateVersionOnDataset = dbImplementation.updateVersionOnDataset

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
    updateDescriptionOnDataset,
    updateDwcGeneratedOnDataset,
    updateVersionOnDataset,
    updateUatKeyOnDataset,
    updateProdKeyOnDataset,
    updatePublishingOrgKeyOnDataset,
    getDatasetsOrderedByDwcCreated,
    getDatasetsOrderedByDwcCreatedNoPaging,
    initialize
}