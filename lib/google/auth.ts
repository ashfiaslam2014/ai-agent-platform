/**
 * Google service-account auth — mint an OAuth2 access token from a
 * service-account key JSON, for any set of scopes.
 *
 * No `googleapis` dependency: the JWT is signed with Web Crypto and exchanged
 * at the token endpoint directly. Shared by lib/google/{calendar,drive,docs}.
 *
 * The service account must be granted access to each resource it touches:
 *   - a calendar shared with its email ("Make changes to events")
 *   - a Drive folder shared with its email ("Editor")
 */

type ServiceAccountKey = { client_email: string; private_key: string }

export function parseServiceAccount(json: string): ServiceAccountKey | null {
  try {
    const key = JSON.parse(json) as ServiceAccountKey
    if (!key.client_email || !key.private_key) return null
    return key
  } catch {
    return null
  }
}

/** Returns a bearer token string, or null on any failure (callers degrade gracefully). */
export async function getGoogleAccessToken(
  serviceAccountJson: string,
  scopes: string[],
): Promise<string | null> {
  const key = parseServiceAccount(serviceAccountJson)
  if (!key) return null

  const now = Math.floor(Date.now() / 1000)
  const claim = {
    iss: key.client_email,
    scope: scopes.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(
    JSON.stringify(claim),
  )}`

  let jwt: string
  try {
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      pemToBytes(key.private_key) as BufferSource,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const sig = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      new TextEncoder().encode(unsigned),
    )
    jwt = `${unsigned}.${base64urlBytes(new Uint8Array(sig))}`
  } catch (err) {
    console.warn('[google] JWT signing failed:', err)
    return null
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!res.ok) {
    console.warn('[google] token exchange failed:', await res.text())
    return null
  }
  const data = await res.json()
  return (data.access_token as string) ?? null
}

function base64url(s: string): string {
  return Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function base64urlBytes(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function pemToBytes(pem: string): Uint8Array {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  return new Uint8Array(Buffer.from(body, 'base64'))
}
