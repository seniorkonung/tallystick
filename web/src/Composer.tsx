import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { AttachSheet } from './AttachSheet'
import { AttachmentTile, AttachmentViewer } from './AttachmentViews'
import { FieldsSheet } from './FieldsSheet'
import { TagChip } from './TagChip'
import { TagEditor } from './TagEditor'
import { TagPicker } from './TagPicker'
import { TypeEditor } from './TypeEditor'
import { TypePicker } from './TypePicker'
import { prepareFile } from './attachments'
import { useComposer } from './composerStore'
import { useThread } from './threadStore'
import { addEntry, db, isEmptyValue, updateEntry, valuesForType, type EntryType, type PreparedFile } from './db'
import { formatValue } from './fields'
import { activeFormats, linkHref, plainText, toggleFormat, type FormatKind } from './format'
import { useMeasuredHeight } from './useMeasuredHeight'

// Редактор типа: null — новый тип
type TypeEditing = { type: EntryType | null } | null

export function Composer() {
  const types = useLiveQuery(() => db.types.toArray())
  const tags = useLiveQuery(() => db.tags.toArray())
  const { draft, editingEntryId, update, stopEditing, clearAfterSend, replyToId, cancelReply, fromChatId, cancelFromChat } = useComposer()
  const threadId = useThread((s) => s.stack.at(-1))
  const editingEntry = useLiveQuery(
    () => (editingEntryId ? db.entries.get(editingEntryId) : undefined),
    [editingEntryId],
  )
  // На экране ответов новая запись по умолчанию отвечает на его исходную запись
  const replyTargetId = replyToId ?? threadId ?? null
  const replyTarget = useLiveQuery(
    () => (replyTargetId ? db.entries.get(replyTargetId) : undefined),
    [replyTargetId],
  )
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [typeEditing, setTypeEditing] = useState<TypeEditing>(null)
  const [pickingTags, setPickingTags] = useState(false)
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  // Выделение в поле ввода — показываем панель форматирования
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [viewing, setViewing] = useState<PreparedFile | null>(null)

  // Лента получает нижний отступ по высоте панели, чтобы последняя запись не пряталась под ней
  const measure = useMeasuredHeight('--composer-height')

  // Текст меняется и снаружи — при загрузке записи в редактирование
  useEffect(() => {
    const el = textarea.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [draft.text])

  // Выделение на телефоне меняется долгим тапом и маркерами — следим за selectionchange документа
  useEffect(() => {
    const onChange = () => {
      const el = textarea.current
      setSelection(el && document.activeElement === el && el.selectionStart !== el.selectionEnd ? { start: el.selectionStart, end: el.selectionEnd } : null)
    }
    document.addEventListener('selectionchange', onChange)
    return () => document.removeEventListener('selectionchange', onChange)
  }, [])

  useEffect(() => {
    if (editingEntryId || replyToId || fromChatId) textarea.current?.focus()
  }, [editingEntryId, replyToId, fromChatId])

  if (!types || !tags) return null
  const sortedTypes = [...types].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  // Тип сохраняется для следующей записи; если его удалили — берём первый
  const type = types.find((t) => t.id === draft.typeId) ?? sortedTypes[0]
  const formats = selection ? activeFormats(draft.text, selection.start, selection.end) : new Set<FormatKind>()
  const hasValues = Object.keys(valuesForType(type, draft.values)).length > 0
  const canSend = !preparing && (draft.text.trim() !== '' || hasValues || draft.attachments.length > 0)
  const selectedTags = draft.tagIds.flatMap((id) => tags.find((p) => p.id === id) ?? [])

  function selectType(id: string) {
    update({ typeId: id })
    setActiveFieldId(null)
  }

  function format(kind: FormatKind) {
    const el = textarea.current
    if (!el) return
    const { selectionStart, selectionEnd } = el
    let href = ''
    if (kind === 'link' && !formats.has('link')) {
      href = window.prompt('Адрес ссылки')?.trim() ?? ''
      if (!href) return el.focus()
      if (!linkHref(href)) {
        window.alert('Это не адрес сайта')
        return el.focus()
      }
    }
    const result = toggleFormat(el.value, selectionStart, selectionEnd, kind, href)
    update({ text: result.text })
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(result.selectionStart, result.selectionEnd)
    })
  }

  // Превью строится сразу при выборе, чтобы отправка не ждала
  async function attach(list: File[]) {
    if (!list.length) return
    setPreparing(true)
    try {
      const prepared = await Promise.all(list.map(prepareFile))
      const current = useComposer.getState().draft.attachments
      update({
        attachments: [...current, ...prepared.map((file) => ({ key: crypto.randomUUID(), existingId: null, file }))],
      })
    } finally {
      setPreparing(false)
    }
  }

  async function send() {
    if (!canSend) return
    const tagIds = selectedTags.map((p) => p.id)
    const newFiles = draft.attachments.filter((a) => !a.existingId).map((a) => a.file)
    try {
      if (editingEntry) {
        // Значения полей, которых нет в новом типе, пропадают — сначала предупреждаем
        const lost = Object.keys(editingEntry.values).filter((id) => !type.fields.some((f) => f.id === id))
        if (lost.length && !window.confirm(`Значения полей, которых нет в типе «${type.name}», пропадут. Сохранить?`)) return
        const kept = draft.attachments.flatMap((a) => a.existingId ?? [])
        await updateEntry(editingEntry.id, type, draft.text.trim(), draft.values, tagIds, kept, newFiles)
        stopEditing()
      } else {
        await addEntry(type, draft.text.trim(), draft.values, tagIds, replyTarget?.id ?? null, newFiles, fromChatId)
        clearAfterSend()
      }
    } catch (error) {
      // Запись не сохранилась целиком — черновик остаётся в панели
      const quota = error instanceof Error && (error.name === 'QuotaExceededError' || error.message.includes('QuotaExceeded'))
      window.alert(
        quota
          ? 'Не хватает места в хранилище браузера. Уберите большие вложения или освободите место на устройстве.'
          : `Не удалось сохранить запись: ${error instanceof Error ? error.message : String(error)}`,
      )
      return
    }
    setActiveFieldId(null)
  }

  return (
    <>
      {/* Панель висит над лентой: прозрачные места пропускают касания в ленту */}
      <div
        ref={measure}
        className="pointer-events-none absolute inset-x-0 bottom-0 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] *:pointer-events-auto"
      >
        {/* Над полем ввода: поля типа, а пока выделен текст — панель форматирования на их месте */}
        {selection ? (
          <div className="mb-2 flex gap-1 overflow-x-auto rounded-3xl border border-stone-200 bg-white p-1.5 shadow-sm">
            {(
              [
                ['bold', 'Ж', 'font-bold'],
                ['italic', 'К', 'italic'],
                ['strike', 'З', 'line-through'],
                ['code', 'Моно', 'font-mono'],
                ['codeblock', 'Код', 'font-mono'],
                ['quote', 'Цитата', ''],
                ['spoiler', 'Скрытый', ''],
                ['link', 'Ссылка', ''],
              ] as [FormatKind, string, string][]
            ).map(([kind, label, style]) => (
              <button
                key={kind}
                type="button"
                aria-pressed={formats.has(kind)}
                className={`shrink-0 rounded-2xl px-3 py-2 text-sm ${formats.has(kind) ? 'bg-stone-900 text-white' : 'text-stone-800 hover:bg-stone-100'} ${style}`}
                // Нажатие не должно снимать выделение и фокус с поля ввода
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => format(kind)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          type.fields.length > 0 && (
            // Отступы внутри строки, чтобы прокрутка не обрезала тень плашек
            <div className="mb-1 flex gap-1.5 overflow-x-auto pt-0.5 pb-1">
              {type.fields.map((field) => {
                const value = draft.values[field.id]
                const filled = !isEmptyValue(value)
                return (
                  <button
                    key={field.id}
                    type="button"
                    onClick={() => setActiveFieldId(field.id)}
                    className={`flex shrink-0 items-center rounded-full border bg-white px-3 py-1.5 text-sm whitespace-nowrap text-stone-500 shadow-sm ${
                      filled ? 'border-stone-200' : 'border-dashed border-stone-300'
                    }`}
                  >
                    {field.name}
                    {/* Название приглушено, значение выделено цветом */}
                    {filled && value !== undefined && <span className="ml-1.5 font-medium text-stone-900">{formatValue(field, value).join(', ')}</span>}
                  </button>
                )
              })}
            </div>
          )
        )}

        <div className="rounded-3xl border border-stone-200 bg-white p-2 shadow-sm">
          {editingEntry && (
            <div className="mb-1 flex items-center gap-2 rounded-2xl bg-orange-50 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-orange-700">Редактирование</p>
                <p className="truncate text-xs text-stone-500">{plainText(editingEntry.text, { hideSpoilers: true }) || 'Запись без текста'}</p>
              </div>
              <button type="button" aria-label="Отменить редактирование" className="px-1 text-stone-400" onClick={stopEditing}>
                ✕
              </button>
            </div>
          )}
          {!editingEntry && replyTarget && (
            <div className="mb-1 flex items-center gap-2 rounded-2xl border-l-4 border-orange-500 bg-[#F7EFE8] px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-orange-700">Ответ на запись</p>
                <p className="truncate text-xs text-stone-500">{plainText(replyTarget.text, { hideSpoilers: true }) || 'Запись без текста'}</p>
              </div>
              {replyToId && (
                <button type="button" aria-label="Отменить ответ" className="px-1 text-stone-400" onClick={cancelReply}>
                  ✕
                </button>
              )}
            </div>
          )}
          {!editingEntry && fromChatId && (
            <div className="mb-1 flex items-center gap-2 rounded-2xl bg-stone-100 px-3 py-2">
              <p className="flex-1 text-xs font-medium text-stone-600">Из чата — выберите тип и теги</p>
              <button type="button" aria-label="Не связывать с чатом" className="px-1 text-stone-400" onClick={cancelFromChat}>
                ✕
              </button>
            </div>
          )}
          {draft.attachments.length > 0 && (
            <div className="flex gap-2 overflow-x-auto px-1 pt-2 pb-1">
              {draft.attachments.map((a) => (
                <AttachmentTile
                  key={a.key}
                  file={a.file}
                  onOpen={() => setViewing(a.file)}
                  onRemove={() => update({ attachments: draft.attachments.filter((x) => x.key !== a.key) })}
                />
              ))}
            </div>
          )}
          {preparing && <p className="px-2 pt-1 text-xs text-stone-400">Готовлю вложения…</p>}
          {/* Выбранные теги своей строкой; тап открывает выбор, крестик убирает тег */}
          {selectedTags.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto px-1 pt-1 pb-1">
              {selectedTags.map((tag) => (
                // Не button: внутри плашки своя кнопка «Убрать»
                <div key={tag.id} role="button" tabIndex={0} className="shrink-0 cursor-pointer whitespace-nowrap" onClick={() => setPickingTags(true)}>
                  <TagChip tag={tag} onRemove={() => update({ tagIds: draft.tagIds.filter((id) => id !== tag.id) })} />
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={textarea}
            value={draft.text}
            rows={1}
            placeholder="Что произошло?"
            className="block max-h-[200px] w-full resize-none bg-transparent px-2 py-2 font-serif text-[15px] outline-none placeholder:text-stone-400"
            onChange={(e) => update({ text: e.target.value })}
            // Вставленные картинки и файлы становятся вложениями, а не текстом
            onPaste={(e) => {
              const pasted = [...e.clipboardData.files]
              if (!pasted.length) return
              e.preventDefault()
              void attach(pasted)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void send()
              }
            }}
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <button
                type="button"
                aria-label="Вложения"
                className="flex size-9 items-center justify-center rounded-full text-xl text-stone-600 hover:bg-stone-100"
                onClick={() => setAttachMenuOpen(true)}
              >
                +
              </button>
              <button
                type="button"
                className="flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
                onClick={() => setPicking(true)}
              >
                {type.name}
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Теги"
                className="flex items-center gap-1 rounded-full px-3 py-2 text-sm text-stone-600 hover:bg-stone-100"
                onClick={() => setPickingTags(true)}
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
                  <circle cx="7.5" cy="7.5" r="1" fill="currentColor" />
                </svg>
                {selectedTags.length > 0 ? selectedTags.length : 'Тег'}
              </button>
            </div>
            <button
              type="button"
              aria-label={editingEntry ? 'Сохранить' : 'Отправить'}
              disabled={!canSend}
              onClick={() => void send()}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-orange-600 text-white disabled:bg-stone-200"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d={editingEntry ? 'M5 12.5l4.5 4.5L19 7.5' : 'M12 19V5M5 12l7-7 7 7'} />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {picking && (
        <TypePicker
          types={sortedTypes}
          currentId={type.id}
          onSelect={(t) => {
            selectType(t.id)
            setPicking(false)
          }}
          onEdit={(t) => setTypeEditing({ type: t })}
          onCreate={() => setTypeEditing({ type: null })}
          onClose={() => setPicking(false)}
        />
      )}

      {pickingTags && (
        <TagPicker
          selectedIds={draft.tagIds}
          onToggle={(tag) =>
            update({
              tagIds: draft.tagIds.includes(tag.id)
                ? draft.tagIds.filter((id) => id !== tag.id)
                : [...draft.tagIds, tag.id],
            })
          }
          onEdit={(tag) => setEditingTagId(tag.id)}
          onClose={() => setPickingTags(false)}
        />
      )}

      <AttachSheet open={attachMenuOpen} onClose={() => setAttachMenuOpen(false)} onFiles={(files) => void attach(files)} />
      {viewing && <AttachmentViewer file={viewing} onClose={() => setViewing(null)} />}

      {activeFieldId && type.fields.some((f) => f.id === activeFieldId) && (
        <FieldsSheet
          type={type}
          values={draft.values}
          focusId={activeFieldId}
          onChange={(fieldId, value) => {
            const next = { ...useComposer.getState().draft.values }
            if (value === undefined) delete next[fieldId]
            else next[fieldId] = value
            update({ values: next })
          }}
          onClose={() => setActiveFieldId(null)}
        />
      )}

      {editingTagId && (
        <TagEditor
          tagId={editingTagId}
          onClose={() => setEditingTagId(null)}
          onShowEntries={() => {
            setEditingTagId(null)
            setPickingTags(false)
          }}
        />
      )}

      {typeEditing && (
        <TypeEditor
          type={typeEditing.type}
          types={sortedTypes}
          onSaved={(saved) => {
            if (!typeEditing.type) {
              selectType(saved.id)
              setPicking(false)
            }
            setTypeEditing(null)
          }}
          onDeleted={(targetTypeId) => {
            if (typeEditing.type?.id === type.id) selectType(targetTypeId)
            setTypeEditing(null)
          }}
          onClose={() => setTypeEditing(null)}
        />
      )}
    </>
  )
}
