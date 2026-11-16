// Форматирование текста записи маркерами, как в Телеграме.
// Текст хранится как есть, с маркерами; оформление строится при показе

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'bold' | 'italic' | 'strike' | 'spoiler'; children: Inline[] }
  | { kind: 'link'; href: string; children: Inline[] }

export type Block =
  | { kind: 'paragraph'; children: Inline[] }
  | { kind: 'quote'; children: Inline[] }
  | { kind: 'codeblock'; text: string }

export const inlineMarkers = { bold: '**', italic: '__', strike: '~~', spoiler: '||' } as const

const markerList = Object.entries(inlineMarkers) as [keyof typeof inlineMarkers, string][]

// Адрес ссылки: без протокола — https, если похож на домен; другие протоколы ссылкой не становятся
export function linkHref(url: string) {
  if (/^https?:\/\/\S+$/i.test(url)) return url
  if (/^[^\s/:]+\.[^\s/:]+/.test(url)) return `https://${url}`
  return null
}

// Ссылка [текст](адрес) с позиции i; скобки внутри адреса должны быть парными
function parseLink(s: string, i: number) {
  const close = s.indexOf('](', i + 1)
  if (close <= i + 1) return null
  const text = s.slice(i + 1, close)
  if (/[[\]\n]/.test(text)) return null
  let depth = 0
  let j = close + 2
  for (; j < s.length; j++) {
    if (s[j] === '(') depth++
    else if (s[j] === ')' && depth-- === 0) break
    else if (/\s/.test(s[j])) return null
  }
  const href = j < s.length ? linkHref(s.slice(close + 2, j)) : null
  return href ? { text, href, end: j + 1 } : null
}

// Маркер без пары остаётся обычным текстом; внутри кода разметки нет
export function parseInline(s: string): Inline[] {
  const out: Inline[] = []
  let buffer = ''
  const flush = () => {
    if (buffer) out.push({ kind: 'text', text: buffer })
    buffer = ''
  }
  let i = 0
  while (i < s.length) {
    if (s[i] === '`') {
      const end = s.indexOf('`', i + 1)
      if (end > i + 1) {
        flush()
        out.push({ kind: 'code', text: s.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }
    if (s[i] === '[') {
      const link = parseLink(s, i)
      if (link) {
        flush()
        out.push({ kind: 'link', href: link.href, children: parseInline(link.text) })
        i = link.end
        continue
      }
    }
    const marker = markerList.find(([, m]) => s.startsWith(m, i))
    if (marker) {
      const [kind, m] = marker
      const end = s.indexOf(m, i + m.length)
      if (end > i + m.length) {
        flush()
        out.push({ kind, children: parseInline(s.slice(i + m.length, end)) })
        i = end + m.length
        continue
      }
    }
    buffer += s[i]
    i++
  }
  flush()
  return out
}

const fence = '```'

export function parseBlocks(text: string): Block[] {
  const lines = text.split('\n')
  const blocks: Block[] = []
  let paragraph: string[] = []
  let quote: string[] = []
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', children: parseInline(paragraph.join('\n')) })
    paragraph = []
  }
  const flushQuote = () => {
    if (quote.length) blocks.push({ kind: 'quote', children: parseInline(quote.join('\n')) })
    quote = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    // Блок кода в одну строку: ```код```
    if (trimmed.length > 6 && trimmed.startsWith(fence) && trimmed.endsWith(fence)) {
      flushParagraph()
      flushQuote()
      blocks.push({ kind: 'codeblock', text: trimmed.slice(3, -3) })
      continue
    }
    // Блок кода между строками ``` ; язык после открывающих кавычек не учитывается
    if (trimmed.startsWith(fence)) {
      const close = lines.findIndex((l, j) => j > i && l.trim().startsWith(fence))
      if (close !== -1) {
        flushParagraph()
        flushQuote()
        blocks.push({ kind: 'codeblock', text: lines.slice(i + 1, close).join('\n') })
        i = close
        continue
      }
    }
    if (line.startsWith('>')) {
      flushParagraph()
      quote.push(line.replace(/^>\s?/, ''))
      continue
    }
    flushQuote()
    paragraph.push(line)
  }
  flushParagraph()
  flushQuote()
  return blocks
}

type PlainOptions = { hideSpoilers?: boolean; skipCode?: boolean; skipLinks?: boolean }

function inlineText(nodes: Inline[], o: PlainOptions): string {
  return nodes
    .map((n) => {
      switch (n.kind) {
        case 'text':
          return n.text
        case 'code':
          return o.skipCode ? ' ' : n.text
        case 'spoiler':
          return o.hideSpoilers ? '•••' : inlineText(n.children, o)
        case 'link':
          return o.skipLinks ? ' ' : inlineText(n.children, o)
        default:
          return inlineText(n.children, o)
      }
    })
    .join('')
}

// Текст без маркеров: для превью, поиска ссылок и прочих мест без оформления
export function plainText(text: string, o: PlainOptions = {}) {
  return parseBlocks(text)
    .map((b) => (b.kind === 'codeblock' ? (o.skipCode ? '' : b.text) : inlineText(b.children, o)))
    .join('\n')
}

// Ссылки, оформленные как [текст](адрес): их адрес в тексте не виден
export function markupLinks(text: string) {
  const links: string[] = []
  const walk = (nodes: Inline[]) => {
    for (const n of nodes) {
      if (n.kind === 'link') links.push(n.href)
      if ('children' in n) walk(n.children)
    }
  }
  for (const b of parseBlocks(text)) if (b.kind !== 'codeblock') walk(b.children)
  return links
}

export type FormatKind = keyof typeof inlineMarkers | 'code' | 'codeblock' | 'quote' | 'link'

// Ссылка, текст которой ровно выделен
function linkAround(value: string, start: number, end: number) {
  const link = value[start - 1] === '[' ? parseLink(value, start - 1) : null
  return link && start + link.text.length === end ? link : null
}

const codeMarker = '`'
const allMarkers: [FormatKind, string][] = [...markerList, ['code', codeMarker]]

// Маркеры вплотную перед позицией, от внешнего к внутреннему
function markersBefore(value: string, pos: number) {
  const run: string[] = []
  for (;;) {
    const m = allMarkers.find(([, m]) => pos >= m.length && value.slice(pos - m.length, pos) === m)?.[1]
    if (!m) return { start: pos, run }
    run.unshift(m)
    pos -= m.length
  }
}

// Маркеры вплотную после позиции, от внутреннего к внешнему
function markersAfter(value: string, pos: number) {
  const run: string[] = []
  for (;;) {
    const m = allMarkers.find(([, m]) => value.startsWith(m, pos))?.[1]
    if (!m) return run
    run.push(m)
    pos += m.length
  }
}

// Выделение вместе с маркерами сужается до текста внутри них
function innerSelection(value: string, start: number, end: number) {
  for (;;) {
    const selected = value.slice(start, end)
    const m = allMarkers.find(([, m]) => selected.length > 2 * m.length && selected.startsWith(m) && selected.endsWith(m))?.[1]
    if (!m) return { start, end }
    start += m.length
    end -= m.length
  }
}

function lineRange(value: string, start: number, end: number) {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const lineEnd = value.indexOf('\n', end)
  return { lineStart, lineEnd: lineEnd === -1 ? value.length : lineEnd }
}

// Оформление, которое уже есть у выделенного текста
export function activeFormats(value: string, start: number, end: number): Set<FormatKind> {
  const s = innerSelection(value, start, end)
  const before = markersBefore(value, s.start).run
  const after = markersAfter(value, s.end)
  const active = new Set<FormatKind>(allMarkers.filter(([, m]) => before.includes(m) && after.includes(m)).map(([kind]) => kind))
  const { lineStart, lineEnd } = lineRange(value, start, end)
  if (value.slice(lineStart, lineEnd).split('\n').every((line) => line.startsWith('>'))) active.add('quote')
  if (value.slice(0, s.start).endsWith(`${fence}\n`) && value.slice(s.end).startsWith(`\n${fence}`)) active.add('codeblock')
  if (linkAround(value, s.start, s.end)) active.add('link')
  return active
}

// Кнопка оформления работает как переключатель: добавляет оформление или снимает уже наложенное.
// href — адрес новой ссылки
export function toggleFormat(value: string, start: number, end: number, kind: FormatKind, href = '') {
  const s = innerSelection(value, start, end)
  if (!activeFormats(value, start, end).has(kind)) return applyFormat(value, s.start, s.end, kind, href)
  switch (kind) {
    case 'link': {
      const link = linkAround(value, s.start, s.end)!
      return {
        text: value.slice(0, s.start - 1) + value.slice(s.start, s.end) + value.slice(link.end),
        selectionStart: s.start - 1,
        selectionEnd: s.end - 1,
      }
    }
    case 'quote': {
      const { lineStart, lineEnd } = lineRange(value, start, end)
      const block = value
        .slice(lineStart, lineEnd)
        .split('\n')
        .map((line) => line.replace(/^>\s?/, ''))
        .join('\n')
      return { text: value.slice(0, lineStart) + block + value.slice(lineEnd), selectionStart: lineStart, selectionEnd: lineStart + block.length }
    }
    case 'codeblock': {
      const open = fence.length + 1
      return {
        text: value.slice(0, s.start - open) + value.slice(s.start, s.end) + value.slice(s.end + open),
        selectionStart: s.start - open,
        selectionEnd: s.end - open,
      }
    }
    default: {
      const m = kind === 'code' ? codeMarker : inlineMarkers[kind]
      const { start: runStart, run: before } = markersBefore(value, s.start)
      const after = markersAfter(value, s.end)
      // Снимается ближайшая к тексту пара маркеров этого вида
      const openAt = runStart + before.slice(0, before.lastIndexOf(m)).join('').length
      const closeAt = s.end + after.slice(0, after.indexOf(m)).join('').length
      return {
        text: value.slice(0, openAt) + value.slice(openAt + m.length, closeAt) + value.slice(closeAt + m.length),
        selectionStart: s.start - m.length,
        selectionEnd: s.end - m.length,
      }
    }
  }
}

// Оборачивает выделение маркерами; возвращает новый текст и выделение без маркеров
function applyFormat(value: string, start: number, end: number, kind: FormatKind, href: string) {
  const selected = value.slice(start, end)
  const before = value.slice(0, start)
  const after = value.slice(end)
  // Блоки начинаются и заканчиваются на отдельной строке
  const lead = before === '' || before.endsWith('\n') ? '' : '\n'
  const tail = after === '' || after.startsWith('\n') ? '' : '\n'
  let open: string
  let inner = selected
  let close: string
  switch (kind) {
    case 'code':
      open = close = '`'
      break
    case 'link':
      open = '['
      close = `](${href})`
      break
    case 'codeblock':
      open = `${lead}${fence}\n`
      close = `\n${fence}${tail}`
      break
    case 'quote':
      open = lead
      inner = selected
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
      close = tail
      break
    default:
      open = close = inlineMarkers[kind]
  }
  return {
    text: before + open + inner + close + after,
    selectionStart: start + open.length,
    selectionEnd: start + open.length + inner.length,
  }
}
