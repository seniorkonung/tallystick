import { useLiveQuery } from 'dexie-react-hooks'
import { Fragment, useState, type ReactNode } from 'react'
import { goToEntry, useChatView } from './chatView'
import { db } from './db'
import { openFilterLink } from './filterLinks'
import { focusEntry } from './focusEntry'
import { LinkedText } from './LinkedText'
import { parseBlocks, parseInline, type Inline } from './format'

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

// Внутри ссылки адреса в тексте ссылками не становятся: ссылка в ссылке невозможна
function renderInline(nodes: Inline[], inLink = false): ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.kind) {
      case 'text':
        return inLink ? node.text : <LinkedText key={i} text={node.text} />
      case 'entry':
        return (
          <EntryLink key={i} id={node.id}>
            {renderInline(node.children, true)}
          </EntryLink>
        )
      case 'filter':
        return (
          <button
            key={i}
            type="button"
            className="inline rounded bg-[#F7EFE8] px-1 text-left text-orange-700"
            onClick={(e) => {
              e.stopPropagation()
              openFilterLink(node.href)
            }}
          >
            {renderInline(node.children, true)}
          </button>
        )
      case 'link':
        return (
          <a
            key={i}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-700 underline decoration-orange-300 underline-offset-2"
            onClick={(e) => e.stopPropagation()}
          >
            {renderInline(node.children, true)}
          </a>
        )
      case 'code':
        return (
          <code key={i} className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[0.85em] text-stone-800">
            {node.text}
          </code>
        )
      case 'bold':
        return (
          <strong key={i} className="font-semibold">
            {renderInline(node.children, inLink)}
          </strong>
        )
      case 'italic':
        return <em key={i}>{renderInline(node.children, inLink)}</em>
      case 'strike':
        return <s key={i}>{renderInline(node.children, inLink)}</s>
      case 'spoiler':
        return <Spoiler key={i}>{renderInline(node.children, inLink)}</Spoiler>
    }
  })
}

// Сообщение пользователя в чате: маркеры оформления остаются как есть, но ссылки на записи и фильтры показываются подписью
const appLink = /(\[[^[\]\n]+\]\((?:entry|filter):[\w-]+\))/

export function MessageText({ text }: { text: string }) {
  return text.split(appLink).map((part, i) => (i % 2 ? <Fragment key={i}>{renderInline(parseInline(part))}</Fragment> : <LinkedText key={i} text={part} />))
}

// Ссылка на запись прокручивает к ней ленту, из чата — закрыв его; удалённая запись остаётся подписью без перехода
function EntryLink({ id, children }: { id: string; children: ReactNode }) {
  // undefined — ещё загружается, null — запись удалили
  const exists = useLiveQuery(async () => !!(await db.entries.get(id)), [id])
  if (exists === false) {
    return (
      <span className="rounded bg-stone-100 px-1 text-stone-400">
        {children} <span className="text-xs">(удалена)</span>
      </span>
    )
  }
  return (
    <button
      type="button"
      className="inline rounded bg-[#F7EFE8] px-1 text-left text-orange-700"
      onClick={(e) => {
        e.stopPropagation()
        if (useChatView.getState().chatId) goToEntry(id)
        else focusEntry(id)
      }}
    >
      {children}
    </button>
  )
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
