import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { AttachmentTile, AttachmentViewer } from './AttachmentViews'
import { FieldInput } from './FieldInput'
import { ProjectEditor } from './ProjectEditor'
import { ProjectPicker } from './ProjectPicker'
import { TypeEditor } from './TypeEditor'
import { TypePicker } from './TypePicker'
import { prepareFile } from './attachments'
import { useComposer } from './composerStore'
import { useThread } from './threadStore'
import { addEntry, db, isEmptyValue, updateEntry, valuesForType, type EntryType, type PreparedFile } from './db'
import { formatValue } from './fields'
import { applyFormat, plainText, type FormatKind } from './format'
import { useMeasuredHeight } from './useMeasuredHeight'

// Редактор типа: null — новый тип
type TypeEditing = { type: EntryType | null } | null

export function Composer() {
  const types = useLiveQuery(() => db.types.toArray())
  const projects = useLiveQuery(() => db.projects.toArray())
  const { draft, editingEntryId, update, stopEditing, clearAfterSend, replyToId, cancelReply } = useComposer()
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
  const [pickingProjects, setPickingProjects] = useState(false)
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  // Есть выделение в поле ввода — показываем панель форматирования
  const [hasSelection, setHasSelection] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [viewing, setViewing] = useState<PreparedFile | null>(null)
  const galleryInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

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
      setHasSelection(!!el && document.activeElement === el && el.selectionStart !== el.selectionEnd)
    }
    document.addEventListener('selectionchange', onChange)
    return () => document.removeEventListener('selectionchange', onChange)
  }, [])

  useEffect(() => {
    if (editingEntryId || replyToId) textarea.current?.focus()
  }, [editingEntryId, replyToId])

  if (!types || !projects) return null
  const sortedTypes = [...types].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  // Тип сохраняется для следующей записи; если его удалили — берём первый
  const type = types.find((t) => t.id === draft.typeId) ?? sortedTypes[0]
  const activeField = type.fields.find((f) => f.id === activeFieldId)
  const hasValues = Object.keys(valuesForType(type, draft.values)).length > 0
  const canSend = !preparing && (draft.text.trim() !== '' || hasValues || draft.attachments.length > 0)
  const selectedProjects = draft.projectIds.flatMap((id) => projects.find((p) => p.id === id) ?? [])

  function selectType(id: string) {
    update({ typeId: id })
    setActiveFieldId(null)
  }

  function format(kind: FormatKind) {
    const el = textarea.current
    if (!el) return
    const result = applyFormat(el.value, el.selectionStart, el.selectionEnd, kind)
    update({ text: result.text })
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(result.selectionStart, result.selectionEnd)
    })
  }

  // Превью строится сразу при выборе, чтобы отправка не ждала
  async function attach(list: FileList | null) {
    setAttachMenuOpen(false)
    if (!list?.length) return
    setPreparing(true)
    try {
      const prepared = await Promise.all([...list].map(prepareFile))
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
    const projectIds = selectedProjects.map((p) => p.id)
    const newFiles = draft.attachments.filter((a) => !a.existingId).map((a) => a.file)
    try {
      if (editingEntry) {
        // Значения полей, которых нет в новом типе, пропадают — сначала предупреждаем
        const lost = Object.keys(editingEntry.values).filter((id) => !type.fields.some((f) => f.id === id))
        if (lost.length && !window.confirm(`Значения полей, которых нет в типе «${type.name}», пропадут. Сохранить?`)) return
        const kept = draft.attachments.flatMap((a) => a.existingId ?? [])
        await updateEntry(editingEntry.id, type, draft.text.trim(), draft.values, projectIds, kept, newFiles)
        stopEditing()
      } else {
        await addEntry(type, draft.text.trim(), draft.values, projectIds, replyTarget?.id ?? null, newFiles)
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
        {hasSelection && (
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
              ] as [FormatKind, string, string][]
            ).map(([kind, label, style]) => (
              <button
                key={kind}
                type="button"
                className={`shrink-0 rounded-2xl px-3 py-2 text-sm text-stone-800 hover:bg-stone-100 ${style}`}
                // Нажатие не должно снимать выделение и фокус с поля ввода
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => format(kind)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {attachMenuOpen && (
          <div className="mb-2 flex gap-2 rounded-3xl border border-stone-200 bg-white p-2 shadow-sm">
            {[
              { label: 'Фото или видео', input: galleryInput },
              { label: 'Камера', input: cameraInput },
              { label: 'Файл', input: fileInput },
            ].map(({ label, input }) => (
              <button
                key={label}
                type="button"
                className="flex-1 rounded-2xl bg-stone-100 px-2 py-3 text-sm text-stone-800"
                onClick={() => input.current?.click()}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <input ref={galleryInput} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => void attach(e.target.files).then(() => (e.target.value = ''))} />
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void attach(e.target.files).then(() => (e.target.value = ''))} />
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => void attach(e.target.files).then(() => (e.target.value = ''))} />

        {activeField && (
          <FieldInput
            field={activeField}
            value={draft.values[activeField.id]}
            onChange={(value) => {
              const next = { ...draft.values }
              if (value === undefined) delete next[activeField.id]
              else next[activeField.id] = value
              update({ values: next })
            }}
            onClose={() => setActiveFieldId(null)}
          />
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
          <textarea
            ref={textarea}
            value={draft.text}
            rows={1}
            placeholder="Что произошло?"
            className="block max-h-[200px] w-full resize-none bg-transparent px-2 py-2 font-serif text-[15px] outline-none placeholder:text-stone-400"
            onChange={(e) => update({ text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void send()
              }
            }}
          />

          {type.fields.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-1 pb-2">
              {type.fields.map((field) => {
                const value = draft.values[field.id]
                const filled = !isEmptyValue(value)
                return (
                  <button
                    key={field.id}
                    type="button"
                    onClick={() => setActiveFieldId(activeFieldId === field.id ? null : field.id)}
                    className={`rounded-full px-3 py-1 text-sm ${
                      filled ? 'bg-stone-100 text-stone-900' : 'border border-dashed border-stone-300 text-stone-500'
                    } ${activeFieldId === field.id ? 'ring-2 ring-stone-900' : ''}`}
                  >
                    {field.name}
                    {filled && value !== undefined && <span className="ml-1 font-medium">{formatValue(field, value).join(', ')}</span>}
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <button
                type="button"
                aria-label="Вложения"
                className={`flex size-9 items-center justify-center rounded-full text-xl text-stone-600 hover:bg-stone-100 ${attachMenuOpen ? 'bg-stone-100' : ''}`}
                onClick={() => setAttachMenuOpen(!attachMenuOpen)}
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
                aria-label="Проекты"
                className="flex items-center gap-1 rounded-full px-3 py-2 text-sm text-stone-600 hover:bg-stone-100"
                onClick={() => setPickingProjects(true)}
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
                {selectedProjects.length > 0 ? selectedProjects.length : 'Проект'}
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

      {pickingProjects && (
        <ProjectPicker
          selectedIds={draft.projectIds}
          onToggle={(project) =>
            update({
              projectIds: draft.projectIds.includes(project.id)
                ? draft.projectIds.filter((id) => id !== project.id)
                : [...draft.projectIds, project.id],
            })
          }
          onEdit={(project) => setEditingProjectId(project.id)}
          onClose={() => setPickingProjects(false)}
        />
      )}

      {viewing && <AttachmentViewer file={viewing} onClose={() => setViewing(null)} />}

      {editingProjectId && (
        <ProjectEditor
          projectId={editingProjectId}
          onClose={() => setEditingProjectId(null)}
          onShowEntries={() => {
            setEditingProjectId(null)
            setPickingProjects(false)
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
