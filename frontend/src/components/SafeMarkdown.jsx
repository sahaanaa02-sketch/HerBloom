function inlineMarkdown(line) {
  return line.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\x60[^\x60]+\x60)/g).map((part, index) => {
    if (part.startsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*') && part.length > 1) return <em key={index}>{part.slice(1, -1)}</em>
    if (part.startsWith('\x60')) return <code key={index}>{part.slice(1, -1)}</code>
    return part
  })
}

export default function SafeMarkdown({ body }) {
  return body.split(/\n\s*\n/).filter((block) => block.trim()).map((block, index) => {
    const heading = /^(#{1,6})\s+([^\n]+)$/.exec(block)
    if (heading) return <h3 key={index} className="mt-4 text-lg font-bold">{inlineMarkdown(heading[2])}</h3>
    const lines = block.split('\n')
    if (lines.every((line) => /^[-*]\s+/.test(line))) {
      return <ul key={index} className="list-disc pl-6">{lines.map((line, i) => <li key={i}>{inlineMarkdown(line.slice(2))}</li>)}</ul>
    }
    return <p key={index} className="whitespace-pre-line leading-8">{inlineMarkdown(block)}</p>
  })
}
