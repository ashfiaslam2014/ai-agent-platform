import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/embedding'
import { chunkText } from '@/lib/chunking'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { business_id, content, filename, title, metadata } = body

    if (!business_id || !content) {
      return NextResponse.json(
        { error: 'business_id and content are required' },
        { status: 400 }
      )
    }

    const documentFilename = filename ?? title ?? 'untitled'
    const chunks = chunkText(content)
    const baseMetadata = { ...(metadata ?? {}), ...(title ? { title } : {}) }

    const rows: {
      business_id: string
      filename: string
      chunk_index: number
      content: string
      embedding: number[]
      metadata: Record<string, unknown>
    }[] = []

    for (let i = 0; i < chunks.length; i++) {
      const embedding = await generateEmbedding(chunks[i])
      rows.push({
        business_id,
        filename: documentFilename,
        chunk_index: i,
        content: chunks[i],
        embedding,
        metadata: baseMetadata,
      })
    }

    const { data, error } = await supabase
      .from('documents')
      .insert(rows)
      .select('id')

    if (error) {
      console.error('Supabase insert error:', error)
      return NextResponse.json(
        { error: 'Failed to store document chunks' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { ids: data.map((r: { id: string }) => r.id), chunks: chunks.length },
      { status: 201 }
    )
  } catch (error) {
    console.error('Upload route error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
