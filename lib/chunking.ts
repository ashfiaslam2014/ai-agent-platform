// ~500 tokens ≈ 400 words; 50-word overlap preserves sentence context across chunk boundaries.
// Word-based splitting avoids tokenizer overhead while staying within the 500-token target.
export function chunkText(text: string, chunkSize = 400, overlap = 50): string[] {
  const words = text.trim().split(/\s+/)
  if (words.length <= chunkSize) return [text.trim()]

  const chunks: string[] = []
  let start = 0

  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length)
    chunks.push(words.slice(start, end).join(' '))
    if (end === words.length) break
    start += chunkSize - overlap
  }

  return chunks
}
