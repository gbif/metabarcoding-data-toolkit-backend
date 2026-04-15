import { getYargs } from '../util/index.js';
import { addReadCounts } from '../converters/biom.js';
import { loadFAIReComponents, toBiom } from '../converters/faire.js';
import { readMapping, getProcessingReport } from '../util/filesAndDirectories.js';
import {
    updateStatusOnCurrentStep,
    beginStep,
    stepFinished,
    consistencyCheckReport,
    finishedJobSuccesssFully,
    finishedJobWithError,
    writeBiomFormats,
    writeMetrics
} from './util.js';

const processDataset = async (id, version, skipSimilarityPlots) => {
    try {
        console.log(`Processing FAIRe dataset ${id} version ${version}`);

        const mapping = await readMapping(id, version);
        const processingReport = await getProcessingReport(id, version);
        const preferredAssay = processingReport?.files?.selectedAssay ?? null;

        beginStep('readData');
        const components = await loadFAIReComponents(id, version, preferredAssay);
        stepFinished('readData');

        beginStep('convertToBiom');
        const { biom, consistencyCheck } = await toBiom({
            id,
            otuFinal:       components.otuFinal,
            sampleMetadata: components.sampleMetadata,
            taxaFinal:      components.taxaFinal,
            termMapping:    mapping,
            processFn:      updateStatusOnCurrentStep
        });
        consistencyCheckReport(consistencyCheck);
        stepFinished('convertToBiom');

        beginStep('addReadCounts');
        await addReadCounts(biom, updateStatusOnCurrentStep);
        stepFinished('addReadCounts');

        await writeBiomFormats(biom, id, version);
        await writeMetrics(id, version, skipSimilarityPlots);

        finishedJobSuccesssFully('success');
    } catch (error) {
        console.log(error);
        finishedJobWithError(error?.message || error);
    }
};

try {
    const yargs = getYargs();
    const { id, version, skipsimiliarityplots } = yargs;
    processDataset(id, version, skipsimiliarityplots);
} catch (error) {
    console.log(error);
}
