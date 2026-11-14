import { splitLinks } from './links'

// Текст записи с кликабельными ссылками; тап по ссылке не открывает меню записи
export function LinkedText({ text }: { text: string }) {
  return splitLinks(text).map((part, i) =>
    part.kind === 'link' ? (
      <a
        key={i}
        href={part.href}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-orange-700 underline decoration-orange-300 underline-offset-2"
        onClick={(e) => e.stopPropagation()}
      >
        {part.text}
      </a>
    ) : (
      part.text
    ),
  )
}
