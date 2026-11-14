import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { AttachmentTile, AttachmentViewer } from './AttachmentViews'
import { FilterChips } from './FilterChips'
import { useFilterChips } from './useFilterChips'
import { isImage, isVideo } from './attachments'
import { extractLinks, linkHost } from './links'
import { db, type Attachment } from './db'
import { matchEntry, useFilters } from './filterStore'
import { focusEntry } from './focusEntry'

type Tab = 'media' | 'files' | 'links'

// Вложения записей, которые проходят текущие фильтры ленты, — от новых к старым
export function Gallery({ onClose }: { onClose: () => void }) {
  const filters = useFilters((s) => s.filters)
  const entries = useLiveQuery(() => db.entries.toArray())
  const types = useLiveQuery(() => db.types.toArray())
  const attachments = useLiveQuery(() => db.attachments.orderBy('createdAt').reverse().toArray())
  const [tab, setTab] = useState<Tab>('media')
  const [viewing, setViewing] = useState<Attachment | null>(null)
  const chips = useFilterChips({ withText: true })
  if (!entries || !types || !attachments) return null

  const typesById = new Map(types.map((t) => [t.id, t]))
  const shownEntries = entries.filter((e) => matchEntry(filters, e, typesById))
  const shownEntryIds = new Set(shownEntries.map((e) => e.id))
  // Ссылки не хранятся отдельно — извлекаются из текста записей, от новых к старым
  const links = shownEntries
    .sort((a, b) => b.createdAt - a.createdAt)
    .flatMap((entry) => extractLinks(entry.text).map((link, i) => ({ key: `${entry.id}-${i}`, link, entry })))
  const shown = attachments.filter((a) => shownEntryIds.has(a.entryId))
  const media = shown.filter((a) => isImage(a.mime) || isVideo(a.mime))
  const files = shown.filter((a) => !isImage(a.mime) && !isVideo(a.mime))
  const list = tab === 'media' ? media : tab === 'files' ? files : []

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
              {links.map(({ key, link, entry }) => (
                <li key={key} className="rounded-2xl border border-stone-200 bg-white px-3 py-2.5">
                  <a href={link.href} target="_blank" rel="noopener noreferrer" className="block">
                    <span className="block font-medium text-stone-900">{linkHost(link.text)}</span>
                    <span className="block truncate text-sm text-orange-700">{link.text}</span>
                  </a>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <span className="truncate text-xs text-stone-400">{entry.text}</span>
                    <button
                      type="button"
                      className="shrink-0 text-xs text-stone-500"
                      onClick={() => {
                        onClose()
                        requestAnimationFrame(() => focusEntry(entry.id))
                      }}
                    >
                      К записи
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
                <AttachmentTile key={a.id} file={a} onOpen={() => setViewing(a)} />
              ))}
            </div>
          </>
        )}
      </div>

      {viewing && (
        <AttachmentViewer
          file={viewing}
          onClose={() => setViewing(null)}
          onGoToEntry={() => {
            const entryId = viewing.entryId
            onClose()
            // Лента под галереей уже на месте — переходим после её закрытия
            requestAnimationFrame(() => focusEntry(entryId))
          }}
        />
      )}
    </div>
  )
}
