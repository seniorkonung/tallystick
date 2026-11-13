import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useRef, useState } from 'react'
import { FieldInput } from './FieldInput'
import { TypeEditor } from './TypeEditor'
import { TypePicker } from './TypePicker'
import { addEntry, db, isEmptyValue, valuesForType, type EntryType, type FieldValues } from './db'
import { formatValue } from './fields'

const typeStorageKey = 'tallystick.typeId'

// Редактор типа: null — новый тип
type Editing = { type: EntryType | null } | null

export function Composer() {
  const types = useLiveQuery(() => db.types.toArray())
  const [typeId, setTypeId] = useState(() => localStorage.getItem(typeStorageKey) ?? '')
  const [text, setText] = useState('')
  const [values, setValues] = useState<FieldValues>({})
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [editing, setEditing] = useState<Editing>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)

  // Лента получает нижний отступ по высоте панели, чтобы последняя запись не пряталась под ней
  const measure = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--composer-height', `${el.offsetHeight}px`)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (!types) return null
  const sortedTypes = [...types].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  // Тип сохраняется для следующей записи; если его удалили — берём первый
  const type = types.find((t) => t.id === typeId) ?? sortedTypes[0]
  const activeField = type.fields.find((f) => f.id === activeFieldId)
  const hasValues = Object.keys(valuesForType(type, values)).length > 0
  const canSend = text.trim() !== '' || hasValues

  function selectType(id: string) {
    setTypeId(id)
    localStorage.setItem(typeStorageKey, id)
    setActiveFieldId(null)
  }

  function resize() {
    const el = textarea.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  async function send() {
    if (!canSend) return
    await addEntry(type, text.trim(), values)
    setText('')
    setValues({})
    setActiveFieldId(null)
    requestAnimationFrame(resize)
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
            value={values[activeField.id]}
            onChange={(value) => {
              const next = { ...values }
              if (value === undefined) delete next[activeField.id]
              else next[activeField.id] = value
              setValues(next)
            }}
            onClose={() => setActiveFieldId(null)}
          />
        )}

        <div className="rounded-3xl border border-stone-200 bg-white p-2 shadow-sm">
          <textarea
            ref={textarea}
            value={text}
            rows={1}
            placeholder="Что произошло?"
            className="block max-h-[200px] w-full resize-none bg-transparent px-2 py-2 font-serif text-[15px] outline-none placeholder:text-stone-400"
            onChange={(e) => {
              setText(e.target.value)
              resize()
            }}
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
                const value = values[field.id]
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
              aria-label="Отправить"
              disabled={!canSend}
              onClick={() => void send()}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-orange-600 text-white disabled:bg-stone-200"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
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
          onEdit={(t) => setEditing({ type: t })}
          onCreate={() => setEditing({ type: null })}
          onClose={() => setPicking(false)}
        />
      )}

      {editing && (
        <TypeEditor
          type={editing.type}
          types={sortedTypes}
          onSaved={(saved) => {
            if (!editing.type) {
              selectType(saved.id)
              setPicking(false)
            }
            setEditing(null)
          }}
          onDeleted={(targetTypeId) => {
            if (editing.type?.id === type.id) selectType(targetTypeId)
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
