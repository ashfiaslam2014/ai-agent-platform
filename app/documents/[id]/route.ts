import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getGeneratedDocument } from '@/lib/actions/documents'

/**
 * Public view of a generated quote / invoice / receipt — the link the
 * `generate_quote` skill hands to customers. The id is an unguessable UUID;
 * that is the access control, same as a share link.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const doc = await getGeneratedDocument(getSupabaseAdmin(), id)
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return new Response(doc.html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}
