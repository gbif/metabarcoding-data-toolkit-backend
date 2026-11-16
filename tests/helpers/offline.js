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
import { EventEmitter } from 'node:events';

const original = { http: http.request, https: https.request };
let attempts = [];

const hostOf = (args) => {
    const [first] = args;
    if (typeof first === 'string') {
        return first;
    }
    return first?.hostname || first?.host || '(unknown host)';
};

/**
 * Refuses the request the way an unreachable host does: by returning a request object that emits
 * an `error` event, rather than by throwing.
 *
 * Throwing synchronously from http.request is not a failure mode any client is written for. It
 * escaped axios's promise chain entirely, and because util/targetGeneVocabulary.js refreshes the
 * GBIF vocabulary in a deliberately non-awaited background task, the escaped rejection surfaced
 * after the test had finished and failed it from the outside. Emitting an error instead means
 * the caller's own error handling runs - which is both faithful to a real outage and lets that
 * module fall back to enum/targetGeneFallback.js exactly as it does in production.
 */
const refusedRequest = (message) => {
    const request = new EventEmitter();
    Object.assign(request, {
        end: () => request,
        write: () => true,
        abort: () => {},
        destroy: () => request,
        setTimeout: () => request,
        setHeader: () => request,
        getHeader: () => undefined,
        removeHeader: () => {},
        setNoDelay: () => {},
        setSocketKeepAlive: () => {},
        flushHeaders: () => {},
    });
    // next tick, so the caller has attached its listeners before the error arrives
    process.nextTick(() => request.emit('error', new Error(message)));
    return request;
};

export const blockNetwork = () => {
    attempts = [];
    const refuse = (scheme) => function (...args) {
        const host = hostOf(args);
        attempts.push(`${scheme}://${host}`);
        return refusedRequest(
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
