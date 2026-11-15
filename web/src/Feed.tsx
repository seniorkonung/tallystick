import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AttachmentTile, AttachmentViewer } from './AttachmentViews'
import { EntryMenu } from './EntryMenu'
import { RichText } from './RichText'
import { plainText } from './format'
import { useComposer } from './composerStore'
import { isFiltered, matchEntry, matchMark, useFilters } from './filterStore'
import { TagChip } from './TagChip'
import { db, isEmptyValue, type Attachment, type Entry, type EntryType, type Mark, type Tag } from './db'
import { formatValue } from './fields'
import { pluralRu } from './plural'
import { useDateJump } from './dateJumpStore'
import { focusEntry, useHighlight } from './focusEntry'
import { useThread } from './threadStore'
import { openChat } from './chatView'

const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
const dayWithYearFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })

function dayKey(time: number) {
  const d = new Date(time)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function dayStart(time: number) {
  const d = new Date(time)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function dayLabel(time: number) {
  const now = new Date()
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime()
  if (dayKey(time) === dayKey(now.getTime())) return `Сегодня, ${dayFormat.format(time)}`
  if (dayKey(time) === dayKey(yesterday)) return `Вчера, ${dayFormat.format(time)}`
  return new Date(time).getFullYear() === now.getFullYear() ? dayFormat.format(time) : dayWithYearFormat.format(time)
}

export function Feed() {
  const entries = useLiveQuery(() => db.entries.orderBy('createdAt').toArray())
  const types = useLiveQuery(() => db.types.toArray())
  const tags = useLiveQuery(() => db.tags.toArray())
  const marks = useLiveQuery(() => db.marks.toArray())
  // Записи вложений: сами файлы браузер читает с диска, только когда их показывают
  const attachments = useLiveQuery(() => db.attachments.orderBy('createdAt').toArray())
  const [viewing, setViewing] = useState<Attachment | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  // Ушли вверх дальше чем на экран — показываем кнопку «вниз»
  const [farFromBottom, setFarFromBottom] = useState(false)
  const [menuEntryId, setMenuEntryId] = useState<string | null>(null)
  const editingEntryId = useComposer((s) => s.editingEntryId)
  const filters = useFilters((s) => s.filters)
  const threadId = useThread((s) => s.stack.at(-1))
  const openThread = useThread((s) => s.open)
  const highlightId = useHighlight((s) => s.id)
  const lastId = entries?.at(-1)?.id
  const prevLastId = useRef(lastId)

  // Записи добавляются только в конец ленты: новая последняя запись — только что созданная
  useEffect(() => {
    if (prevLastId.current !== undefined && lastId !== prevLastId.current) {
      // В column-reverse нулевая прокрутка — самый низ
      scroller.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
    prevLastId.current = lastId
  }, [lastId])

  // Новый набор фильтров или другой экран ответов показывают самые свежие записи
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [filters, threadId])

  if (!entries || !types || !tags || !marks || !attachments) return <div className="flex-1" />

  const typesById = new Map(types.map((t) => [t.id, t]))
  const tagsById = new Map(tags.map((p) => [p.id, p]))
  const entriesById = new Map(entries.map((e) => [e.id, e]))
  const attachmentsByEntry = new Map<string, Attachment[]>()
  for (const a of attachments) attachmentsByEntry.set(a.entryId, [...(attachmentsByEntry.get(a.entryId) ?? []), a])
  const replyCounts = new Map<string, number>()
  for (const e of entries) if (e.replyTo) replyCounts.set(e.replyTo, (replyCounts.get(e.replyTo) ?? 0) + 1)

  // Экран ответов — хронология прямых ответов на исходную запись, фильтры на него не действуют
  const root = threadId ? entriesById.get(threadId) : undefined
  const shownEntries = root
    ? entries.filter((e) => e.replyTo === root.id)
    : entries.filter((e) => matchEntry(filters, e, typesById))
  const shownMarks = root ? [] : marks.filter((m) => matchMark(filters, m))
  // Записи и служебные отметки в одной хронологии; при равном времени отметка идёт раньше
  const items: Item[] = [
    ...shownMarks.map((mark): Item => ({ kind: 'mark', mark, time: mark.createdAt })),
    ...shownEntries.map((entry): Item => ({ kind: 'entry', entry, time: entry.createdAt })),
  ].sort((a, b) => a.time - b.time)
  const days: { key: string; time: number; items: Item[] }[] = []
  for (const item of items) {
    const key = dayKey(item.time)
    const last = days.at(-1)
    if (last?.key === key) last.items.push(item)
    else days.push({ key, time: item.time, items: [item] })
  }

  const menuEntry = entries.find((e) => e.id === menuEntryId)

  const card = (entry: Entry) => (
    <EntryCard
      key={entry.id}
      entry={entry}
      type={typesById.get(entry.typeId)}
      tags={entry.tagIds.flatMap((id) => tagsById.get(id) ?? [])}
      attachments={attachmentsByEntry.get(entry.id) ?? []}
      onAttachment={setViewing}
      // На экране ответов цитата исходной записи не нужна — она наверху
      quote={entry.replyTo && entry.replyTo !== root?.id ? (entriesById.get(entry.replyTo) ?? 'deleted') : undefined}
      replyCount={entry.id === root?.id ? 0 : (replyCounts.get(entry.id) ?? 0)}
      highlighted={entry.id === editingEntryId || entry.id === highlightId}
      onOpen={() => setMenuEntryId(entry.id)}
      onQuote={focusEntry}
      onReplies={() => openThread(entry.id)}
    />
  )

  return (
    // column-reverse держит прокрутку у нижнего края, как в мессенджере
    <>
      <div
        ref={scroller}
        className="flex flex-1 flex-col-reverse overflow-y-auto overscroll-y-contain"
        // В column-reverse прокрутка вверх отрицательная, ноль — самый низ
        onScroll={(e) => setFarFromBottom(-e.currentTarget.scrollTop > e.currentTarget.clientHeight)}
      >
        <div className="flex flex-col gap-2 px-3 pt-[calc(var(--topbar-height,0px)+0.5rem)] pb-[calc(var(--composer-height,0px)+0.5rem)]">
          {root && (
            <>
              <h2 className="py-2 text-center text-xs font-medium text-stone-400">{dayLabel(root.createdAt)}</h2>
              {card(root)}
              <p className="py-2 text-center text-xs font-medium text-stone-500">
                {shownEntries.length
                  ? `${shownEntries.length} ${pluralRu(shownEntries.length, ['ответ', 'ответа', 'ответов'])}`
                  : 'Ответов пока нет'}
              </p>
            </>
          )}
          {!root && shownEntries.length === 0 && (
            <p className="py-10 text-center text-sm text-stone-400">
              {isFiltered(filters) ? 'Под фильтры ничего не подходит' : 'Записей пока нет'}
            </p>
          )}
          {days.map((day) => (
            <section
              key={day.key}
              data-day={dayStart(day.time)}
              className="flex scroll-mt-[calc(var(--topbar-height,0px)+0.5rem)] flex-col gap-2"
            >
              {/* На экране ответов день исходной записи уже подписан над ней */}
              {(!root || day.key !== dayKey(root.createdAt)) && (
                <button
                  type="button"
                  className="self-center py-2 text-xs font-medium text-stone-400"
                  onClick={() => useDateJump.setState({ open: true })}
                >
                  {dayLabel(day.time)}
                </button>
              )}
              {day.items.map((item) =>
                item.kind === 'entry' ? (
                  card(item.entry)
                ) : (
                  <MarkLine key={item.mark.id} mark={item.mark} tag={tagsById.get(item.mark.tagId)} />
                ),
              )}
            </section>
          ))}
        </div>
        {menuEntry && <EntryMenu entry={menuEntry} onClose={() => setMenuEntryId(null)} />}
        {viewing && <AttachmentViewer file={viewing} onClose={() => setViewing(null)} />}
      </div>
      {farFromBottom && (
        <button
          type="button"
          aria-label="Вниз к свежим записям"
          className="absolute bottom-[calc(var(--composer-height,0px)+0.75rem)] left-1/2 flex size-11 -translate-x-1/2 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 shadow-md"
          onClick={() => scroller.current?.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </button>
      )}
    </>
  )
}

type Item = { kind: 'entry'; entry: Entry; time: number } | { kind: 'mark'; mark: Mark; time: number }

function MarkLine({ mark, tag }: { mark: Mark; tag: Tag | undefined }) {
  const name = `«${tag?.name ?? 'Тег'}»`
  let text: string
  switch (mark.kind) {
    case 'archived':
      text = `${name} в архиве · ${mark.entryCount ?? 0} ${pluralRu(mark.entryCount ?? 0, ['запись', 'записи', 'записей'])}`
      break
    case 'restored':
      text = `${name} возвращён из архива`
      break
  }
  return (
    <p className="py-1 text-center text-xs text-stone-400">
      {text} · {timeFormat.format(mark.createdAt)}
    </p>
  )
}

type EntryCardProps = {
  entry: Entry
  type: EntryType | undefined
  tags: Tag[]
  attachments: Attachment[]
  onAttachment: (attachment: Attachment) => void
  // Исходная запись, если это ответ; 'deleted' — исходную удалили
  quote: Entry | 'deleted' | undefined
  replyCount: number
  // Запись в редактировании или найдена по цитате
  highlighted: boolean
  onOpen: () => void
  onQuote: (entryId: string) => void
  onReplies: () => void
}

function EntryCard(props: EntryCardProps) {
  const { entry, type, tags, attachments, onAttachment, quote, replyCount, highlighted, onOpen, onQuote, onReplies } = props
  const fields = type?.fields.filter((f) => !isEmptyValue(entry.values[f.id])) ?? []
  return (
    <article
      id={`entry-${entry.id}`}
      onClick={onOpen}
      className={`cursor-pointer rounded-2xl border px-4 py-3 transition-shadow ${entry.actual ? 'bg-white' : 'bg-[#F3F1EA]'} ${
        highlighted ? 'border-orange-400 ring-2 ring-orange-200' : 'border-stone-200'
      }`}
    >
      <div className="mb-1 flex items-center justify-between text-xs text-stone-500">
        <span>
          {type?.name}
          {entry.chatId && (
            <button
              type="button"
              className="ml-2 text-orange-700"
              onClick={(e) => {
                e.stopPropagation()
                openChat(entry.chatId!)
              }}
            >
              из чата
            </button>
          )}
          {!entry.actual && <span className="ml-2 rounded-full bg-stone-200 px-2 py-0.5 text-stone-600">Неактуально</span>}
        </span>
        <span>{timeFormat.format(entry.createdAt)}</span>
      </div>
      <div className={entry.actual ? '' : 'opacity-55'}>
        {quote === 'deleted' && (
          <p className="mb-2 rounded-lg border-l-[3px] border-stone-300 bg-stone-100 px-2.5 py-1.5 text-xs text-stone-500">
            Запись удалена
          </p>
        )}
        {quote && quote !== 'deleted' && (
          <button
            type="button"
            className="mb-2 block w-full rounded-lg border-l-[3px] border-orange-500 bg-[#F7EFE8] px-2.5 py-1.5 text-left"
            onClick={(e) => {
              e.stopPropagation()
              onQuote(quote.id)
            }}
          >
            <span className="block truncate text-xs text-stone-600">
              {plainText(quote.text, { hideSpoilers: true }) || 'Запись без текста'}
            </span>
          </button>
        )}
        {tags.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <TagChip key={tag.id} tag={tag} />
            ))}
          </div>
        )}
        {entry.text && <CollapsibleText text={entry.text} actual={entry.actual} />}
        {attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {attachments.map((a) => (
              <AttachmentTile key={a.id} file={a} onOpen={() => onAttachment(a)} />
            ))}
          </div>
        )}
        {fields.length > 0 && (
          <dl className="mt-2 flex flex-col gap-1 text-sm">
            {fields.map((field) => {
              const labels = formatValue(field, entry.values[field.id])
              return (
                <div key={field.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <dt className="text-stone-500">{field.name}</dt>
                  {field.kind === 'multi' ? (
                    labels.map((label, i) => (
                      <dd key={i} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-800">
                        {label}
                      </dd>
                    ))
                  ) : (
                    <dd className="text-stone-900">{labels[0]}</dd>
                  )}
                </div>
              )
            })}
          </dl>
        )}
      </div>
      {replyCount > 0 && (
        <button
          type="button"
          className="mt-2 text-sm font-medium text-orange-700"
          onClick={(e) => {
            e.stopPropagation()
            onReplies()
          }}
        >
          {replyCount} {pluralRu(replyCount, ['ответ', 'ответа', 'ответов'])} →
        </button>
      )}
    </article>
  )
}

// Длинный текст записи обрезается по высоте; поля, теги и вложения показываются всегда
function CollapsibleText({ text, actual }: { text: string; actual: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  // Высота текста зависит от ширины экрана и оформления, поэтому её меряют после вёрстки
  useLayoutEffect(() => {
    const el = box.current
    if (!el || expanded) return
    const measure = () => setOverflowing(el.scrollHeight > el.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [text, expanded])

  const collapsed = !expanded && overflowing
  return (
    <div>
      <div ref={box} className={`relative ${expanded ? '' : 'max-h-96 overflow-hidden'}`}>
        <RichText text={text} />
        {collapsed && (
          <div className={`pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t ${actual ? 'from-white' : 'from-[#F3F1EA]'}`} />
        )}
      </div>
      {collapsed && (
        <button
          type="button"
          className="mt-1 text-sm font-medium text-orange-700"
          onClick={(e) => {
            e.stopPropagation()
            setExpanded(true)
          }}
        >
          Показать ещё
        </button>
      )}
    </div>
  )
}
