import { getTargetGeneConcepts, matchConcept } from '../util/targetGeneVocabulary.js';

/**
 * Checks a dataset's target_gene default against the GBIF target_gene vocabulary, and reports
 * the concept name it should be stored as.
 *
 * target_gene is vocabulary-constrained in the mapping step, but a value can also arrive from a
 * study/defaults file, an xlsx Study sheet or FAIRe projectMetadata - none of which go through
 * the picker. So the check has to happen in validation, where every route meets.
 *
 * Returns { warning, normalised }:
 *  - warning: {file, message} for the upload page, or null
 *  - normalised: the concept name to store, or null to leave the value alone
 *
 * A recognised value is normalised to its concept name so that the same marker is not recorded
 * as "12S" when it came from a study file and SSU_rRNA_12S_mitochondrial when it came from the
 * picker - it is the concept name that ends up in the published data package. The user is always
 * told when their value is changed.
 */
export const checkTargetGene = async (defaultValues, fileName) => {
    const value = `${defaultValues?.target_gene ?? ''}`.trim();
    if (!value) {
        // absence is a different problem - defaultRequired handles it
        return { warning: null, normalised: null };
    }

    const { concepts, live } = await getTargetGeneConcepts();
    const match = matchConcept(value, concepts);
    const suffix = live ? '' : ' (checked against a cached copy of the vocabulary)';

    if (!match) {
        return {
            normalised: null,
            warning: {
                file: fileName,
                message: `The target_gene value "${value}" is not in the GBIF target_gene vocabulary.`
                    + ` Pick a value from the list in the mapping step, otherwise the marker cannot be`
                    + ` interpreted and taxonomy cannot be assigned.${suffix}`,
            },
        };
    }

    const { concept, assumed } = match;

    if (assumed) {
        return {
            normalised: concept.name,
            warning: {
                file: fileName,
                message: `The target_gene value "${value}" does not say which 16S region was targeted.`
                    + ` The GBIF vocabulary distinguishes prokaryotic, plastid and mitochondrial 16S.`
                    + ` It has been recorded as "${concept.label}" (${concept.name}) - change it in the`
                    + ` mapping step if that is not what you meant.${suffix}`,
            },
        };
    }

    if (concept.name !== value) {
        // a recognised synonym or label, so no doubt about the meaning - but the stored value
        // changes, and the user should not discover that by reading the data package
        return {
            normalised: concept.name,
            warning: {
                file: fileName,
                message: `The target_gene value "${value}" has been recorded as "${concept.name}",`
                    + ` the GBIF vocabulary term for "${concept.label}".`,
            },
        };
    }

    return { warning: null, normalised: null };
};

/**
 * Applies checkTargetGene to a defaultValues object, returning the object to store and the
 * warning to show. The input is not mutated.
 */
export const normaliseTargetGene = async (defaultValues, fileName) => {
    const { warning, normalised } = await checkTargetGene(defaultValues, fileName);
    return {
        warning,
        defaultValues: normalised
            ? { ...(defaultValues || {}), target_gene: normalised }
            : defaultValues,
    };
};

export default { checkTargetGene, normaliseTargetGene };
