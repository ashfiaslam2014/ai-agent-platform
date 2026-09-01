/**
 * Google Drive — upload generated files (PDF invoices, etc.), list files in a
 * shared folder, and pull a file's text into the knowledge base.
 *
 * The service account can only see files it owns or that are shared with its
 * email. Point `driveFolderId` at a folder shared with the service account
 * ("Editor") and everything lands there, inheriting that folder's sharing.
 */

import { getGoogleAccessToken } from './auth'

const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive'

export type DriveFile = { id: string; name: string; mimeType: string; webViewLink: string | null }

/**
 * Upload one file. When `folderId` is given the file inherits that folder's
 * sharing; otherwise it is made link-readable so the returned URL works.
 * Returns the file, or null on failure.
 */
export async function uploadToDrive(
  serviceAccountJson: string,
  file: { name: string; mimeType: string; data: Uint8Array; folderId?: string | null },
): Promise<DriveFile | null> {
  const token = await getGoogleAccessToken(serviceAccountJson, [SCOPE_DRIVE])
  if (!token) return null

  const boundary = `bnd${Date.now().toString(36)}`
  const metadata: Record<string, unknown> = { name: file.name, mimeType: file.mimeType }
  if (file.folderId) metadata.parents = [file.folderId]

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
        metadata,
      )}\r\n--${boundary}\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
    ),
    Buffer.from(file.data),
    Buffer.from(`\r\n--${boundary}--`),
  ])

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  )
  if (!res.ok) {
    console.warn('[drive] upload failed:', await res.text())
    return null
  }
  const f = (await res.json()) as DriveFile

  if (!file.folderId) {
    // No shared folder — make the link openable so it's actually useful.
    await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}/permissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    }).catch(() => {})
  }
  return f
}

/** List files (optionally within a folder / matching a name fragment). */
export async function listDriveFiles(
  serviceAccountJson: string,
  opts: { folderId?: string | null; nameContains?: string; pageSize?: number } = {},
): Promise<DriveFile[] | null> {
  const token = await getGoogleAccessToken(serviceAccountJson, [SCOPE_DRIVE])
  if (!token) return null

  const clauses = ['trashed = false']
  if (opts.folderId) clauses.push(`'${opts.folderId}' in parents`)
  if (opts.nameContains) clauses.push(`name contains '${opts.nameContains.replace(/'/g, "\\'")}'`)

  const url = new URL('https://www.googleapis.com/drive/v3/files')
  url.searchParams.set('q', clauses.join(' and '))
  url.searchParams.set('fields', 'files(id,name,mimeType,webViewLink)')
  url.searchParams.set('pageSize', String(Math.min(opts.pageSize ?? 20, 100)))

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    console.warn('[drive] list failed:', await res.text())
    return null
  }
  const data = await res.json()
  return (data.files ?? []) as DriveFile[]
}

/**
 * Read a Drive file as plain text. Google-native Docs/Sheets/Slides are
 * exported; anything else is downloaded and decoded as UTF-8 (good for .txt
 * /.md /.csv, not for binary formats). Returns null on failure.
 */
export async function readDriveFileText(
  serviceAccountJson: string,
  fileId: string,
): Promise<{ name: string; text: string } | null> {
  const token = await getGoogleAccessToken(serviceAccountJson, [SCOPE_DRIVE])
  if (!token) return null

  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!metaRes.ok) {
    console.warn('[drive] metadata failed:', await metaRes.text())
    return null
  }
  const meta = (await metaRes.json()) as { name: string; mimeType: string }

  const isGoogleDoc = meta.mimeType.startsWith('application/vnd.google-apps')
  const contentUrl = isGoogleDoc
    ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`
    : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`

  const res = await fetch(contentUrl, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    console.warn('[drive] download failed:', await res.text())
    return null
  }
  return { name: meta.name, text: await res.text() }
}
