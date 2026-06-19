import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/embedding'
import { chunkText } from '@/lib/chunking'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { content } = body

    if (!content) {
      return NextResponse.json(
        { error: 'content is required' },
        { status: 400 }
      )
    }

    // Resolve the document's filename + business_id so we can replace all its chunks
    const { data: existing, error: fetchError } = await supabase
      .from('documents')
      .select('filename, business_id')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const { filename, business_id } = existing

    // Delete all chunks for this document
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('filename', filename)
      .eq('business_id', business_id)

    if (deleteError) {
      console.error('Supabase delete error during edit:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    // Re-chunk, re-embed, and re-insert
    const chunks = chunkText(content)
    const rows: {
      business_id: string
      filename: string
      chunk_index: number
      content: string
      embedding: number[]
    }[] = []

    for (let i = 0; i < chunks.length; i++) {
      let embedding: number[]
      try {
        embedding = await generateEmbedding(chunks[i])
      } catch (err) {
        console.error('Embedding error on chunk', i, err)
        return NextResponse.json(
          { error: 'Failed to generate embedding' },
          { status: 502 }
        )
      }
      rows.push({ business_id, filename, chunk_index: i, content: chunks[i], embedding })
    }

    const { error: insertError } = await supabase
      .from('documents')
      .insert(rows)

    if (insertError) {
      console.error('Supabase insert error during edit:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, chunks: chunks.length }, { status: 200 })
  } catch (error) {
    console.error('PUT route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Resolve filename + business_id so we can delete all chunks for this document
    const { data: existing, error: fetchError } = await supabase
      .from('documents')
      .select('filename, business_id')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const { filename, business_id } = existing

    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('filename', filename)
      .eq('business_id', business_id)

    if (error) {
      console.error('Supabase delete error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Delete route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
