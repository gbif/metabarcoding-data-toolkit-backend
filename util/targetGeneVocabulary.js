import axios from 'axios';
import fallbackConcepts from '../enum/targetGeneFallback.js';

const VOCABULARY_URL = 'https://api.gbif.org/v1/vocabularies/target_gene/concepts?limit=250&offset=0&deprecated=false';

// GBIF answers with cache-control: no-store, so without a cache of our own every user, on every
// visit to the mapping step, would reach api.gbif.org. An hour keeps it effectively live while
// bounding that to one request per installation.
const TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20000;

let cache = { concepts: null, fetchedAt: 0, live: false };
let inFlight = null;

// The concept carries a machine name (SSU_rRNA_16S_prokaryotic) and a human label
// ("16S ribosomal small subunit RNA (prokaryotic) (pro16S)"). The name is what we store, the
// label is what we show, and the parent gives the grouping the picker needs - 86 concepts in a
// flat list is worse than the nine hardcoded ones it replaces.
const toConcept = (c, byKey) => ({
    name: c?.name,
    label: (c?.label || []).find(l => l?.language === 'en')?.value || c?.name,
    definition: (c?.definition || []).find(d => d?.language === 'en')?.value || null,
    parent: c?.parentKey ? byKey.get(c.parentKey)?.name ?? null : null,
    alternativeLabels: c?.alternativeLabels || [],
});

const normalise = (results) => {
    const byKey = new Map((results || []).map(c => [c.key, c]));
    return (results || []).map(c => toConcept(c, byKey)).filter(c => !!c.name);
};

// The concepts response does not embed alternative labels - each concept only carries a link to
// them. They matter more than the primary label for matching, because they are where the forms
// people actually write live: 12S, 18S, ITS, COX1, MT-RNR1. Without them almost every value in
// an existing dataset fails to match.
const CONCURRENCY = 8;

const fetchAlternativeLabels = async (concepts) => {
    const queue = [...concepts];
    const worker = async () => {
        while (queue.length) {
            const concept = queue.shift();
            try {
                const res = await axios.get(
                    `https://api.gbif.org/v1/vocabularies/target_gene/concepts/${encodeURIComponent(concept.name)}/alternativeLabels?limit=100`,
                    { timeout: REQUEST_TIMEOUT_MS });
                concept.alternativeLabels = (res?.data?.results || []).map(r => r?.value).filter(Boolean);
            } catch (error) {
                // a concept without its alternative labels still matches on name and label
                concept.alternativeLabels = concept.alternativeLabels || [];
            }
        }
    };
    await Promise.all(Array.from({length: CONCURRENCY}, worker));
    return concepts;
};

// Values MDT has always accepted that the vocabulary deliberately does not offer, because it
// disambiguates where the old list did not. A bare "16S" could be prokaryotic, plastid or
// mitochondrial - but MDT's own classifier has only ever blasted 16S against the Genome Taxonomy
// Database, which is prokaryotic, so that assumption is already baked into the tool. Resolving it
// here makes it explicit, and callers are told it was an assumption so they can say so.
export const ASSUMED_CONCEPTS = {
    '16s': 'SSU_rRNA_16S_prokaryotic',
};

/**
 * The GBIF target_gene vocabulary, cached.
 *
 * Falls back to a bundled copy rather than throwing: this feeds the marker picker in the
 * mapping step and the warning on study-file values, and neither should disappear because
 * api.gbif.org is slow or unreachable. `live` says which you got.
 */
export const getTargetGeneConcepts = async () => {
    const fresh = cache.concepts && (Date.now() - cache.fetchedAt) < TTL_MS;
    if (!fresh) {
        // Refresh in the background and answer from what we already have. Filling the cache
        // means ~86 requests for the alternative labels and takes seconds; this endpoint is
        // loaded with the other enums when the app boots, so waiting on it would stall the
        // whole UI. The bundled copy is complete enough to serve from in the meantime.
        refresh();
    }
    if (!cache.concepts) {
        cache = { concepts: fallbackConcepts, fetchedAt: 0, live: false };
    }
    return cache;
};

// Warms the cache at startup so the first user does not get the bundled copy unnecessarily.
export const warmTargetGeneVocabulary = () => { refresh(); };

const refresh = () => {
    // collapse concurrent refreshes into one request
    if (inFlight) {
        return inFlight;
    }
    inFlight = (async () => {
        try {
            const res = await axios.get(VOCABULARY_URL, { timeout: REQUEST_TIMEOUT_MS });
            const concepts = normalise(res?.data?.results);
            if (concepts.length === 0) {
                throw new Error('vocabulary returned no concepts');
            }
            await fetchAlternativeLabels(concepts);
            cache = { concepts, fetchedAt: Date.now(), live: true };
        } catch (error) {
            console.log(`Could not load the GBIF target_gene vocabulary, using the bundled copy: ${error?.message || error}`);
            // keep a previously fetched list if we have one - it is closer to the truth than
            // the bundled fallback, even once stale
            if (!cache.concepts) {
                cache = { concepts: fallbackConcepts, fetchedAt: 0, live: false };
            }
        } finally {
            inFlight = null;
        }
        return cache;
    })();
    return inFlight;
};

/**
 * Whether a value names a concept in the vocabulary. Matches the concept name first, then its
 * English label and alternative labels, case-insensitively - a study file written by hand is
 * far more likely to say "16S" or a label than the machine name.
 *
 * Returns the matching concept, or null.
 */
export const matchConcept = (value, concepts) => {
    const needle = `${value ?? ''}`.trim().toLowerCase();
    if (!needle) {
        return null;
    }
    const exact = (concepts || []).find(c =>
        c.name?.toLowerCase() === needle ||
        c.label?.toLowerCase() === needle ||
        (c.alternativeLabels || []).some(l => `${l}`.toLowerCase() === needle)
    );
    if (exact) {
        return { concept: exact, assumed: false };
    }
    const assumedName = ASSUMED_CONCEPTS[needle];
    if (assumedName) {
        const concept = (concepts || []).find(c => c.name === assumedName);
        if (concept) {
            return { concept, assumed: true };
        }
    }
    return null;
};

export default { getTargetGeneConcepts, matchConcept };
