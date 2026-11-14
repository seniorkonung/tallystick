import { find } from 'linkifyjs'

export type TextPart = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string }

// Ссылки распознаются и без протокола, по списку доменных зон — как в Телеграме.
// Открываются только http(s): другие схемы ссылками не становятся
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = []
  let last = 0
  for (const link of find(text, 'url', { defaultProtocol: 'https' })) {
    if (!/^https?:\/\//i.test(link.href)) continue
    if (link.start > last) parts.push({ kind: 'text', text: text.slice(last, link.start) })
    parts.push({ kind: 'link', text: link.value, href: link.href })
    last = link.end
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) })
  return parts
}

export function extractLinks(text: string) {
  return splitLinks(text).flatMap((p) => (p.kind === 'link' ? [p] : []))
}

// Домен как он написан в тексте: URL отдаёт кириллические домены в punycode
export function linkHost(text: string) {
  return text.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0]
}
