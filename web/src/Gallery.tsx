import type { ModelMessage } from 'ai'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { AttachmentTile, AttachmentViewer } from './AttachmentViews'
import { FilterChips } from './FilterChips'
import { useFilterChips } from './useFilterChips'
import { isImage, isVideo } from './attachments'
import { openChat } from './chatView'
import { plainText } from './format'
import { extractLinks, linkHost, type TextPart } from './links'
import { db, type PreparedFile } from './db'
import { matchChatItem, matchEntry, useFilters } from './filterStore'
import { focusEntry } from './focusEntry'

type Tab = 'media' | 'files' | 'links'

// Откуда вложение или ссылка: запись в ленте или чат
type Source = { kind: 'entry'; id: string; label: string } | { kind: 'chat'; id: string; label: string }

type GalleryFile = { id: string; createdAt: number; file: PreparedFile; source: Source }

type GalleryLink = { key: string; createdAt: number; link: Extract<TextPart, { kind: 'link' }>; source: Source }

function chatText(message: ModelMessage) {
  if (message.role !== 'user' && message.role !== 'assistant') return ''
  if (typeof message.content === 'string') return message.content
  return message.content.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n')
}

// Вложения и ссылки записей, которые проходят текущие фильтры ленты, и чатов — от новых к старым
export function Gallery({ onClose }: { onClose: () => void }) {
  const filters = useFilters((s) => s.filters)
  const entries = useLiveQuery(() => db.entries.toArray())
  const types = useLiveQuery(() => db.types.toArray())
  const attachments = useLiveQuery(() => db.attachments.toArray())
  const chats = useLiveQuery(() => db.chats.toArray())
  const chatFiles = useLiveQuery(() => db.chatFiles.toArray())
  const chatMessages = useLiveQuery(() => db.chatMessages.toArray())
  const [tab, setTab] = useState<Tab>('media')
  const [viewing, setViewing] = useState<GalleryFile | null>(null)
  const chips = useFilterChips({ withText: true })
  if (!entries || !types || !attachments || !chats || !chatFiles || !chatMessages) return null

  const typesById = new Map(types.map((t) => [t.id, t]))
  const chatTitles = new Map(chats.map((c) => [c.id, c.title]))
  const shownEntries = new Map(entries.filter((e) => matchEntry(filters, e, typesById)).map((e) => [e.id, e]))
  const entrySource = (id: string): Source => ({ kind: 'entry', id, label: plainText(shownEntries.get(id)?.text ?? '', { hideSpoilers: true }) })
  const chatSource = (id: string): Source => ({ kind: 'chat', id, label: chatTitles.get(id) ?? 'Чат' })

  const shown: GalleryFile[] = [
    ...attachments.filter((a) => shownEntries.has(a.entryId)).map((a) => ({ id: a.id, createdAt: a.createdAt, file: a, source: entrySource(a.entryId) })),
    ...chatFiles.filter((f) => matchChatItem(filters, f.createdAt)).map((f) => ({ id: f.id, createdAt: f.createdAt, file: f, source: chatSource(f.chatId) })),
  ].sort((a, b) => b.createdAt - a.createdAt)
  // Ссылки не хранятся отдельно — извлекаются из текста записей и сообщений
  const links: GalleryLink[] = [
    ...[...shownEntries.values()].flatMap((entry) =>
      extractLinks(plainText(entry.text, { skipCode: true })).map((link, i) => ({ key: `${entry.id}-${i}`, createdAt: entry.createdAt, link, source: entrySource(entry.id) })),
    ),
    ...chatMessages
      .filter((m) => matchChatItem(filters, m.createdAt))
      .flatMap((m) => extractLinks(chatText(m.message)).map((link, i) => ({ key: `${m.id}-${i}`, createdAt: m.createdAt, link, source: chatSource(m.chatId) }))),
  ].sort((a, b) => b.createdAt - a.createdAt)
  const media = shown.filter((a) => isImage(a.file.mime) || isVideo(a.file.mime))
  const files = shown.filter((a) => !isImage(a.file.mime) && !isVideo(a.file.mime))
  const list = tab === 'media' ? media : tab === 'files' ? files : []

  // Лента под галереей уже на месте — переходим после её закрытия
  function goTo(source: Source) {
    onClose()
    if (source.kind === 'chat') openChat(source.id)
    else requestAnimationFrame(() => focusEntry(source.id))
  }

  const tabClass = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm ${active ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`

  return (
    <div className="fixed inset-0 z-20 mx-auto flex max-w-xl flex-col bg-stone-50">
      <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <button type="button" aria-label="Закрыть вложения" className="flex size-9 items-center justify-center rounded-full hover:bg-stone-100" onClick={onClose}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <h1 className="font-semibold">Вложения</h1>
      </header>

      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <button type="button" className={tabClass(tab === 'media')} onClick={() => setTab('media')}>
          Фото и видео · {media.length}
        </button>
        <button type="button" className={tabClass(tab === 'files')} onClick={() => setTab('files')}>
          Файлы · {files.length}
        </button>
        <button type="button" className={tabClass(tab === 'links')} onClick={() => setTab('links')}>
          Ссылки · {links.length}
        </button>
      </div>
      {chips.length > 0 && (
        <div className="px-4 pb-3">
          <FilterChips chips={chips} />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {tab === 'links' ? (
          <>
            {links.length === 0 && <p className="py-10 text-center text-sm text-stone-400">Ссылок нет</p>}
            <ul className="flex flex-col gap-2">
              {links.map(({ key, link, source }) => (
                <li key={key} className="rounded-2xl border border-stone-200 bg-white px-3 py-2.5">
                  <a href={link.href} target="_blank" rel="noopener noreferrer" className="block">
                    <span className="block font-medium text-stone-900">{linkHost(link.text)}</span>
                    <span className="block truncate text-sm text-orange-700">{link.text}</span>
                  </a>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <span className="truncate text-xs text-stone-400">{source.label}</span>
                    <button type="button" className="shrink-0 text-xs text-stone-500" onClick={() => goTo(source)}>
                      {source.kind === 'chat' ? 'К чату' : 'К записи'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            {list.length === 0 && <p className="py-10 text-center text-sm text-stone-400">Вложений нет</p>}
            <div className={tab === 'media' ? 'grid grid-cols-4 gap-2' : 'flex flex-col gap-2'}>
              {list.map((a) => (
                <AttachmentTile key={a.id} file={a.file} onOpen={() => setViewing(a)} />
              ))}
            </div>
          </>
        )}
      </div>

      {viewing && (
        <AttachmentViewer
          file={viewing.file}
          onClose={() => setViewing(null)}
          goTo={{ label: viewing.source.kind === 'chat' ? 'К чату' : 'К записи', action: () => goTo(viewing.source) }}
        />
      )}
    </div>
  )
}
