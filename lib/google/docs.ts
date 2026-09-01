/**
 * Google Docs — create a document from plain text (proposals, meeting notes,
 * summaries) and read a document back as text.
 *
 * Uses the Docs API for content and the Drive API to place the file in a
 * shared folder / make its link openable. Service-account auth (see ./auth).
 */

import { getGoogleAccessToken } from './auth'

const SCOPE_DOCS = 'https://www.googleapis.com/auth/documents'
const SCOPE_DOCS_RO = 'https://www.googleapis.com/auth/documents.readonly'
const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive'

export type CreatedDoc = { id: string; url: string }

/** Create a Doc with `title` and `body` text. Returns the doc + its edit URL, or null. */
export async function createGoogleDoc(
  serviceAccountJson: string,
  input: { title: string; body: string; folderId?: string | null },
): Promise<CreatedDoc | null> {
  const token = await getGoogleAccessToken(serviceAccountJson, [SCOPE_DOCS, SCOPE_DRIVE])
  if (!token) return null

  const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: input.title }),
  })
  if (!createRes.ok) {
    console.warn('[docs] create failed:', await createRes.text())
    return null
  }
  const doc = (await createRes.json()) as { documentId: string }

  if (input.body.trim()) {
    await fetch(`https://docs.googleapis.com/v1/documents/${doc.documentId}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{ insertText: { location: { index: 1 }, text: input.body } }],
      }),
    }).catch(() => {})
  }

  if (input.folderId) {
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${doc.documentId}?addParents=${input.folderId}&removeParents=root`,
      { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } },
    ).catch(() => {})
  } else {
    await fetch(`https://www.googleapis.com/drive/v3/files/${doc.documentId}/permissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    }).catch(() => {})
  }

  return { id: doc.documentId, url: `https://docs.google.com/document/d/${doc.documentId}/edit` }
}

/** Read a Doc's visible text. Returns null on failure. */
export async function readGoogleDocText(
  serviceAccountJson: string,
  documentId: string,
): Promise<{ title: string; text: string } | null> {
  const token = await getGoogleAccessToken(serviceAccountJson, [SCOPE_DOCS_RO])
  if (!token) return null

  const res = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    console.warn('[docs] read failed:', await res.text())
    return null
  }
  const doc = (await res.json()) as {
    title: string
    body?: { content?: { paragraph?: { elements?: { textRun?: { content?: string } }[] } }[] }
  }

  const text = (doc.body?.content ?? [])
    .flatMap((el) => el.paragraph?.elements ?? [])
    .map((e) => e.textRun?.content ?? '')
    .join('')
    .trim()

  return { title: doc.title, text }
}
