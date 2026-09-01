import type { AppSupabaseClient as SupabaseClient } from '@/lib/supabase'

/**
 * Document generation — quotes, invoices, receipts from a line-item list.
 *
 * Produces self-contained HTML (print-ready, works as a shareable link today).
 * PDF rendering: renderPdf() uses DOCUMENT_PDF_ENDPOINT if set (any HTML->PDF
 * service that takes { html } and returns PDF bytes), otherwise falls back to a
 * bundled headless-Chromium renderer so PDFs work with no external setup.
 */

export type DocType = 'quote' | 'invoice' | 'receipt'

export type LineItem = { description: string; quantity: number; unitPrice: number }

export type DocumentInput = {
  businessId: string
  type: DocType
  customerName: string
  customerContact?: string | null
  items: LineItem[]
  currency?: string
  taxRatePct?: number
  notes?: string | null
  dueDate?: string | null
}

export type GeneratedDocument = {
  id: string
  number: string
  type: DocType
  html: string
  total: number
  currency: string
  createdAt: string
}

export async function generateDocument(
  supabase: SupabaseClient,
  input: DocumentInput,
): Promise<{ ok: true; doc: GeneratedDocument } | { ok: false; error: string }> {
  if (!input.items?.length) return { ok: false, error: 'at least one line item is required' }

  const currency = input.currency ?? 'AED'
  const subtotal = input.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0)
  const tax = input.taxRatePct ? +(subtotal * (input.taxRatePct / 100)).toFixed(2) : 0
  const total = +(subtotal + tax).toFixed(2)

  const { data: biz } = await supabase
    .from('businesses')
    .select('name')
    .eq('id', input.businessId)
    .single()

  const { count } = await supabase
    .from('documents_generated')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', input.businessId)
    .eq('type', input.type)

  const seq = (count ?? 0) + 1
  const number = `${input.type.slice(0, 3).toUpperCase()}-${String(seq).padStart(4, '0')}`

  const html = renderHtml({
    number,
    type: input.type,
    businessName: (biz?.name as string) ?? 'Business',
    input,
    currency,
    subtotal,
    tax,
    total,
  })

  const { data, error } = await supabase
    .from('documents_generated')
    .insert({
      business_id: input.businessId,
      type: input.type,
      number,
      customer_name: input.customerName,
      customer_contact: input.customerContact ?? null,
      items: input.items,
      currency,
      subtotal,
      tax,
      total,
      notes: input.notes ?? null,
      due_date: input.dueDate ?? null,
      html,
    })
    .select('id, created_at')
    .single()

  if (error || !data) return { ok: false, error: 'could not save the document' }

  return {
    ok: true,
    doc: {
      id: data.id as string,
      number,
      type: input.type,
      html,
      total,
      currency,
      createdAt: data.created_at as string,
    },
  }
}

/** Fetch a stored document by id (for the public /documents/<id> routes). */
export async function getGeneratedDocument(
  supabase: SupabaseClient,
  id: string,
): Promise<{ number: string; type: DocType; html: string } | null> {
  const { data } = await supabase
    .from('documents_generated')
    .select('number, type, html')
    .eq('id', id)
    .single()
  if (!data) return null
  return { number: data.number as string, type: data.type as DocType, html: data.html as string }
}

/**
 * HTML -> PDF. Prefers DOCUMENT_PDF_ENDPOINT; otherwise renders with a bundled
 * headless Chromium. Returns null only if both paths fail.
 */
export async function renderPdf(html: string): Promise<Uint8Array | null> {
  const endpoint = process.env.DOCUMENT_PDF_ENDPOINT
  if (endpoint) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html }),
      })
      if (res.ok) return new Uint8Array(await res.arrayBuffer())
      console.warn('[pdf] endpoint failed, falling back to chromium:', res.status)
    } catch (err) {
      console.warn('[pdf] endpoint error, falling back to chromium:', err)
    }
  }
  return renderPdfWithChromium(html)
}

async function renderPdfWithChromium(html: string): Promise<Uint8Array | null> {
  try {
    const [{ default: chromium }, { default: puppeteer }] = await Promise.all([
      import('@sparticuz/chromium'),
      import('puppeteer-core'),
    ])
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    })
    try {
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'load' })
      const pdf = await page.pdf({ format: 'A4', printBackground: true })
      return new Uint8Array(pdf)
    } finally {
      await browser.close()
    }
  } catch (err) {
    console.warn('[pdf] chromium render failed:', err)
    return null
  }
}

function money(n: number, currency: string): string {
  return `${currency} ${n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function renderHtml(p: {
  number: string
  type: DocType
  businessName: string
  input: DocumentInput
  currency: string
  subtotal: number
  tax: number
  total: number
}): string {
  const rows = p.input.items
    .map(
      (it) => `<tr>
      <td>${escapeHtml(it.description)}</td>
      <td class="num">${it.quantity}</td>
      <td class="num">${money(it.unitPrice, p.currency)}</td>
      <td class="num">${money(it.quantity * it.unitPrice, p.currency)}</td>
    </tr>`,
    )
    .join('')

  const title = p.type.charAt(0).toUpperCase() + p.type.slice(1)

  return `<!doctype html><html><head><meta charset="utf-8"><title>${title} ${p.number}</title>
<style>
  *{box-sizing:border-box} body{font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#18181b;margin:0;padding:40px;max-width:720px}
  h1{font-size:22px;margin:0 0 4px} .muted{color:#71717a} .row{display:flex;justify-content:space-between;margin:24px 0}
  table{width:100%;border-collapse:collapse;margin-top:16px} th,td{text-align:left;padding:8px 6px;border-bottom:1px solid #e4e4e7}
  th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#71717a} .num{text-align:right}
  .totals{margin-top:16px;margin-left:auto;width:260px} .totals div{display:flex;justify-content:space-between;padding:4px 0}
  .grand{font-weight:700;border-top:2px solid #18181b;margin-top:6px;padding-top:8px}
  .notes{margin-top:32px;white-space:pre-wrap} @media print{body{padding:0}}
</style></head><body>
  <div class="row">
    <div><h1>${p.businessName}</h1><div class="muted">${title}</div></div>
    <div style="text-align:right">
      <div><strong>${p.number}</strong></div>
      <div class="muted">${new Date().toLocaleDateString('en-AE')}</div>
      ${p.input.dueDate ? `<div class="muted">Due ${escapeHtml(p.input.dueDate)}</div>` : ''}
    </div>
  </div>
  <div><span class="muted">Bill to</span><br><strong>${escapeHtml(p.input.customerName)}</strong>${
    p.input.customerContact ? `<br>${escapeHtml(p.input.customerContact)}` : ''
  }</div>
  <table><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="totals">
    <div><span>Subtotal</span><span>${money(p.subtotal, p.currency)}</span></div>
    ${p.tax ? `<div><span>Tax (${p.input.taxRatePct}%)</span><span>${money(p.tax, p.currency)}</span></div>` : ''}
    <div class="grand"><span>Total</span><span>${money(p.total, p.currency)}</span></div>
  </div>
  ${p.input.notes ? `<div class="notes"><span class="muted">Notes</span><br>${escapeHtml(p.input.notes)}</div>` : ''}
</body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
