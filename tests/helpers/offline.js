/**
 * Network guard.
 *
 * The suite has to be runnable in CI with no outbound access, and more importantly its results
 * must not depend on whether api.gbif.org answered today. Rather than trust that, this patches
 * http/https at the point axios actually uses them, so an accidental call fails loudly and
 * names the host instead of quietly making a test slow or flaky.
 *
 * Note one call that will legitimately be attempted: util/targetGeneVocabulary.js refreshes the
 * GBIF target_gene vocabulary in the background and falls back to the bundled copy in
 * enum/targetGeneFallback.js. It swallows its own errors, so blocking it is safe and makes the
 * fallback - which is what we want the tests to exercise - the only path taken.
 */
import http from 'node:http';
import https from 'node:https';

const original = { http: http.request, https: https.request };
let attempts = [];

const hostOf = (args) => {
    const [first] = args;
    if (typeof first === 'string') {
        return first;
    }
    return first?.hostname || first?.host || '(unknown host)';
};

export const blockNetwork = () => {
    attempts = [];
    const refuse = (scheme) => function (...args) {
        const host = hostOf(args);
        attempts.push(`${scheme}://${host}`);
        throw new Error(
            `Network access blocked in tests: ${scheme}://${host}. `
            + `Tests must not depend on a remote service - use a fixture or a bundled fallback.`
        );
    };
    http.request = refuse('http');
    https.request = refuse('https');
};

export const restoreNetwork = () => {
    http.request = original.http;
    https.request = original.https;
};

/** Hosts that were reached for while the block was in place, for assertions or debugging. */
export const networkAttempts = () => [...attempts];
