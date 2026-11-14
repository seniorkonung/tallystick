import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { FieldInput } from './FieldInput'
import { ProjectChip } from './ProjectChip'
import { ProjectEditor } from './ProjectEditor'
import { ProjectPicker } from './ProjectPicker'
import { TypeEditor } from './TypeEditor'
import { TypePicker } from './TypePicker'
import { useComposer } from './composerStore'
import { addEntry, db, isEmptyValue, updateEntry, valuesForType, type EntryType } from './db'
import { formatValue } from './fields'
import { useMeasuredHeight } from './useMeasuredHeight'

// Редактор типа: null — новый тип
type TypeEditing = { type: EntryType | null } | null

export function Composer() {
  const types = useLiveQuery(() => db.types.toArray())
  const projects = useLiveQuery(() => db.projects.toArray())
  const { draft, editingEntryId, update, stopEditing, clearAfterSend } = useComposer()
  const editingEntry = useLiveQuery(
    () => (editingEntryId ? db.entries.get(editingEntryId) : undefined),
    [editingEntryId],
  )
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [typeEditing, setTypeEditing] = useState<TypeEditing>(null)
  const [pickingProjects, setPickingProjects] = useState(false)
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)

  // Лента получает нижний отступ по высоте панели, чтобы последняя запись не пряталась под ней
  const measure = useMeasuredHeight('--composer-height')

  // Текст меняется и снаружи — при загрузке записи в редактирование
  useEffect(() => {
    const el = textarea.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [draft.text])

  useEffect(() => {
    if (editingEntryId) textarea.current?.focus()
  }, [editingEntryId])

  if (!types || !projects) return null
  const sortedTypes = [...types].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  // Тип сохраняется для следующей записи; если его удалили — берём первый
  const type = types.find((t) => t.id === draft.typeId) ?? sortedTypes[0]
  const activeField = type.fields.find((f) => f.id === activeFieldId)
  const hasValues = Object.keys(valuesForType(type, draft.values)).length > 0
  const canSend = draft.text.trim() !== '' || hasValues
  const selectedProjects = draft.projectIds.flatMap((id) => projects.find((p) => p.id === id) ?? [])

  function selectType(id: string) {
    update({ typeId: id })
    setActiveFieldId(null)
  }

  async function send() {
    if (!canSend) return
    const projectIds = selectedProjects.map((p) => p.id)
    if (editingEntry) {
      // Значения полей, которых нет в новом типе, пропадают — сначала предупреждаем
      const lost = Object.keys(editingEntry.values).filter((id) => !type.fields.some((f) => f.id === id))
      if (lost.length && !window.confirm(`Значения полей, которых нет в типе «${type.name}», пропадут. Сохранить?`)) return
      await updateEntry(editingEntry.id, type, draft.text.trim(), draft.values, projectIds)
      stopEditing()
    } else {
      await addEntry(type, draft.text.trim(), draft.values, projectIds)
      clearAfterSend()
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
                <p className="truncate text-xs text-stone-500">{editingEntry.text || 'Запись без текста'}</p>
              </div>
              <button type="button" aria-label="Отменить редактирование" className="px-1 text-stone-400" onClick={stopEditing}>
                ✕
              </button>
            </div>
          )}
          {selectedProjects.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-2 pt-1">
              {selectedProjects.map((project) => (
                <ProjectChip
                  key={project.id}
                  project={project}
                  onRemove={() => update({ projectIds: draft.projectIds.filter((id) => id !== project.id) })}
                />
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
