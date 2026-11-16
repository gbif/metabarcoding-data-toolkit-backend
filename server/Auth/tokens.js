import crypto from 'crypto'
import config from '../../config.js'

// The MDT's own login tokens. GBIF is only asked who the user is at login; after that a token is
// checked here, against config.tokenSecret.
//
// Browser sessions ("web") are self-contained, so with a tokenSecret in the credentials file they
// survive a restart. Each request renews them, up to WEB_MAX_SECONDS after login.
// API tokens ("api") are listed and revoked from the profile page, so they have to be known to
// the server: they are kept in memory only and end when it restarts.

const WEB_IDLE_SECONDS = 2 * 60 * 60
const WEB_MAX_SECONDS = 24 * 60 * 60
const API_TOKEN_DAYS = [1, 7, 30]
const MAX_API_TOKENS_PER_USER = 10
const SWEEP_MS = 10 * 60 * 1000

const apiTokens = new Map()      // sid -> {userName, user, label, createdAt, expiresAt, lastUsedAt}
const loggedOut = new Map()      // sid -> exp, for web sessions ended before they expire
const gbifTokens = new Map()     // userName -> {token, exp}, the GBIF registry token from login

const now = () => Math.floor(Date.now() / 1000)
const profile = user => ({ userName: user?.userName, firstName: user?.firstName, lastName: user?.lastName, email: user?.email })

// JWTs, HS256 only. A token is accepted only with exactly this header, so no other algorithm
// (or "none") can be slipped in.
const base64url = obj => Buffer.from(JSON.stringify(obj)).toString('base64url')
const HEADER = base64url({ alg: 'HS256', typ: 'JWT' })
const signature = data => crypto.createHmac('sha256', config.tokenSecret).update(data).digest('base64url')

const sign = claims => {
    const data = `${HEADER}.${base64url(claims)}`
    return `${data}.${signature(data)}`
}

const payload = token => {
    try {
        return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    } catch (error) {
        return null
    }
}

const verifySignature = token => {
    const parts = token.split('.')
    if (parts.length !== 3 || parts[0] !== HEADER) {
        return null
    }
    const expected = Buffer.from(signature(`${parts[0]}.${parts[1]}`))
    const given = Buffer.from(parts[2])
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
        return null
    }
    const claims = payload(token)
    return claims && typeof claims.exp === 'number' && claims.exp > now() ? claims : null
}

export const issueWebToken = (user, authTime = now(), sid = crypto.randomUUID()) => {
    const exp = Math.min(now() + WEB_IDLE_SECONDS, authTime + WEB_MAX_SECONDS)
    return sign({ ...profile(user), sub: user.userName, kind: 'web', sid, auth_time: authTime, exp })
}

export const renewWebToken = claims => issueWebToken(claims, claims.auth_time, claims.sid)

// The claims of a valid token, or null
export const verify = authorization => {
    const [scheme, token] = (authorization || '').split(' ')
    if (scheme !== 'Bearer' || !token) {
        return null
    }
    const claims = verifySignature(token)
    if (!claims) {
        return null
    }
    if (claims.kind === 'web') {
        return loggedOut.has(claims.sid) ? null : claims
    }
    if (claims.kind === 'api') {
        const entry = apiTokens.get(claims.sid)
        if (!entry || entry.userName !== claims.sub || entry.expiresAt < now()) {
            return null
        }
        entry.lastUsedAt = now()
        return { ...claims, ...entry.user }
    }
    return null
}

export const logout = claims => {
    if (claims?.kind === 'web') {
        loggedOut.set(claims.sid, claims.exp)
    } else if (claims?.kind === 'api') {
        apiTokens.delete(claims.sid)
    }
}

const describe = (sid, { label, createdAt, expiresAt, lastUsedAt }) => ({ id: sid, label, createdAt, expiresAt, lastUsedAt })

export const listApiTokens = userName => [...apiTokens.entries()]
    .filter(([, entry]) => entry.userName === userName && entry.expiresAt >= now())
    .map(([sid, entry]) => describe(sid, entry))
    .sort((a, b) => a.createdAt - b.createdAt)

export const createApiToken = (user, label, days) => {
    if (!API_TOKEN_DAYS.includes(days)) {
        throw { status: 400, message: `days must be one of ${API_TOKEN_DAYS.join(', ')}` }
    }
    if (typeof label !== 'string' || !label.trim() || label.length > 100) {
        throw { status: 400, message: 'A label of at most 100 characters is needed' }
    }
    if (listApiTokens(user.userName).length >= MAX_API_TOKENS_PER_USER) {
        throw { status: 400, message: `At most ${MAX_API_TOKENS_PER_USER} API tokens; revoke one first` }
    }
    const sid = crypto.randomUUID()
    const entry = { userName: user.userName, user: profile(user), label: label.trim(), createdAt: now(), expiresAt: now() + days * 24 * 60 * 60, lastUsedAt: null }
    apiTokens.set(sid, entry)
    return { ...describe(sid, entry), token: sign({ sub: user.userName, kind: 'api', sid, exp: entry.expiresAt }) }
}

export const revokeApiToken = (userName, sid) => {
    const entry = apiTokens.get(sid)
    if (!entry || entry.userName !== userName) {
        return false
    }
    apiTokens.delete(sid)
    return true
}

// The registry's JWT carries its own expiry (about 30 minutes); keep it only while it is valid
export const setGbifToken = (userName, token) => {
    if (userName && token) {
        gbifTokens.set(userName, { token, exp: payload(token)?.exp || now() + 25 * 60 })
    }
}

export const getGbifToken = userName => {
    const entry = gbifTokens.get(userName)
    return entry && entry.exp > now() + 30 ? entry.token : null
}

export const forgetGbifToken = userName => gbifTokens.delete(userName)

// For the calls that act as the user at GBIF. When there is no valid registry token, or GBIF
// refuses it, the client is asked for the GBIF password again (POST /auth/gbif-login).
export const gbifAuthorization = userName => {
    const token = getGbifToken(userName)
    return token ? `Bearer ${token}` : null
}

export const sendGbifLoginRequired = (res, userName) => {
    forgetGbifToken(userName)
    res.status(401).json({ error: 'gbif-login-required' })
}

const sweep = () => {
    const t = now()
    for (const [sid, exp] of loggedOut) if (exp < t) loggedOut.delete(sid)
    for (const [sid, entry] of apiTokens) if (entry.expiresAt < t) apiTokens.delete(sid)
    for (const [userName, entry] of gbifTokens) if (entry.exp < t) gbifTokens.delete(userName)
}
setInterval(sweep, SWEEP_MS).unref()
