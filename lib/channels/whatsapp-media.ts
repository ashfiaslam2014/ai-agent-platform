/**
 * WhatsApp media (image / voice note) → text, so the harness only ever deals
 * with text. No new vendor: STT via Groq Whisper, vision via Gemini
 * (both keys already in the env).
 */

const WHATSAPP_API_VERSION = 'v25.0'

export async function downloadWhatsAppMedia(
  mediaId: string,
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) return null

  const metaRes = await fetch(`https://graph.facebook.com/${WHATSAPP_API_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!metaRes.ok) {
    console.error('[wa-media] metadata fetch failed:', await metaRes.text())
    return null
  }
  const { url, mime_type } = await metaRes.json()

  const fileRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!fileRes.ok) {
    console.error('[wa-media] file fetch failed:', fileRes.status)
    return null
  }
  return { bytes: new Uint8Array(await fileRes.arrayBuffer()), mimeType: mime_type ?? 'application/octet-stream' }
}

/** Groq Whisper. Returns the transcript, or null. */
export async function transcribeAudio(bytes: Uint8Array, mimeType: string): Promise<string | null> {
  const key = process.env.GROQ_API_KEY
  if (!key) return null

  const form = new FormData()
  form.append('file', new Blob([bytes as unknown as BlobPart], { type: mimeType }), 'audio.ogg')
  form.append('model', 'whisper-large-v3')
  form.append('response_format', 'text')

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  })
  if (!res.ok) {
    console.error('[wa-media] transcription failed:', await res.text())
    return null
  }
  return (await res.text()).trim()
}

/** Gemini vision. Returns a plain-language description grounded by the caption. */
export async function describeImage(
  bytes: Uint8Array,
  mimeType: string,
  caption: string | null,
): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null

  const b64 = Buffer.from(bytes).toString('base64')
  const prompt = caption
    ? `A customer sent this image with the message: "${caption}". Describe what's in the image in one or two sentences, focusing on anything relevant to that message.`
    : "A customer sent this image with no caption. Describe what's in it in one or two sentences."

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: b64 } }] }],
      }),
    },
  )
  if (!res.ok) {
    console.error('[wa-media] vision failed:', await res.text())
    return null
  }
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null
}
