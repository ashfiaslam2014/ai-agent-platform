import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getGeneratedDocument, renderPdf } from '@/lib/actions/documents'

/** PDF of a generated document. Chromium fallback needs the Node runtime + headroom. */
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const doc = await getGeneratedDocument(getSupabaseAdmin(), id)
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const pdf = await renderPdf(doc.html)
  if (!pdf) {
    return NextResponse.json(
      { error: 'PDF rendering unavailable', html_url: `/documents/${id}` },
      { status: 502 },
    )
  }

  return new Response(Buffer.from(pdf), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${doc.type}-${doc.number}.pdf"`,
    },
  })
}
