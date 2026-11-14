import { useState, type ReactNode } from 'react'
import { LinkedText } from './LinkedText'
import { parseBlocks, type Inline } from './format'

// Текст записи с оформлением; ссылки работают везде, кроме кода
export function RichText({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1 font-serif text-[15px] leading-relaxed whitespace-pre-wrap text-stone-900">
      {parseBlocks(text).map((block, i) => {
        switch (block.kind) {
          case 'paragraph':
            return <div key={i}>{renderInline(block.children)}</div>
          case 'quote':
            return (
              <blockquote key={i} className="border-l-[3px] border-stone-300 pl-3 text-stone-600">
                {renderInline(block.children)}
              </blockquote>
            )
          case 'codeblock':
            return (
              <pre
                key={i}
                className="overflow-x-auto rounded-lg bg-stone-100 px-3 py-2 font-mono text-[13px] leading-snug whitespace-pre text-stone-800"
              >
                {block.text}
              </pre>
            )
        }
      })}
    </div>
  )
}

function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.kind) {
      case 'text':
        return <LinkedText key={i} text={node.text} />
      case 'code':
        return (
          <code key={i} className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[0.85em] text-stone-800">
            {node.text}
          </code>
        )
      case 'bold':
        return (
          <strong key={i} className="font-semibold">
            {renderInline(node.children)}
          </strong>
        )
      case 'italic':
        return <em key={i}>{renderInline(node.children)}</em>
      case 'strike':
        return <s key={i}>{renderInline(node.children)}</s>
      case 'spoiler':
        return <Spoiler key={i}>{renderInline(node.children)}</Spoiler>
    }
  })
}

// Скрытый текст открывается по тапу; до этого тап не уходит ни в ссылки внутри, ни в меню записи
function Spoiler({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false)
  return (
    <span
      className={shown ? 'rounded bg-stone-100' : 'cursor-pointer rounded bg-stone-300 text-transparent select-none [&_*]:text-transparent'}
      onClickCapture={(e) => {
        if (shown) return
        e.preventDefault()
        e.stopPropagation()
        setShown(true)
      }}
    >
      {children}
    </span>
  )
}
