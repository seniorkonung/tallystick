import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, deleteType, saveType, type EntryType, type Field, type FieldKind } from './db'
import { fieldKindLabels, newField } from './fields'

type Props = {
  // null — создание нового типа
  type: EntryType | null
  types: EntryType[]
  onSaved: (type: EntryType) => void
  onDeleted: (targetTypeId: string) => void
  onClose: () => void
}

export function TypeEditor({ type, types, onSaved, onDeleted, onClose }: Props) {
  const [draft, setDraft] = useState<EntryType>(
    () => type ?? { id: crypto.randomUUID(), name: '', createdAt: Date.now(), fields: [] },
  )
  const [addingField, setAddingField] = useState(false)

  function updateField(index: number, field: Field) {
    setDraft({ ...draft, fields: draft.fields.map((f, i) => (i === index ? field : f)) })
  }

  function moveField(index: number, delta: number) {
    const fields = [...draft.fields]
    const [field] = fields.splice(index, 1)
    fields.splice(index + delta, 0, field)
    setDraft({ ...draft, fields })
  }

  async function save() {
    const saved: EntryType = {
      ...draft,
      name: draft.name.trim(),
      fields: draft.fields.map((f) => {
        const name = f.name.trim() || 'Поле'
        return f.kind === 'single' || f.kind === 'multi'
          ? { ...f, name, options: f.options.map((o) => ({ ...o, label: o.label.trim() })).filter((o) => o.label) }
          : f.kind === 'number'
            ? { ...f, name, unit: f.unit.trim() }
            : { ...f, name }
      }),
    }
    await saveType(saved)
    onSaved(saved)
  }

  return (
    <div className="fixed inset-0 z-20 mx-auto flex max-w-xl flex-col bg-stone-50">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <button type="button" className="text-stone-500" onClick={onClose}>
          Отмена
        </button>
        <h1 className="font-semibold">{type ? 'Настройка типа' : 'Новый тип'}</h1>
        <button
          type="button"
          className="font-medium text-orange-700 disabled:text-stone-300"
          disabled={!draft.name.trim()}
          onClick={() => void save()}
        >
          Сохранить
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <label className="mb-1 block text-xs text-stone-500">Название</label>
        <input
          autoFocus={!type}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Например, Еда"
          className="mb-6 w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 outline-none"
        />

        <h2 className="mb-2 text-xs text-stone-500">Поля</h2>
        <div className="flex flex-col gap-3">
          {draft.fields.map((field, index) => (
            <FieldCard
              key={field.id}
              field={field}
              onChange={(f) => updateField(index, f)}
              onRemove={() => setDraft({ ...draft, fields: draft.fields.filter((_, i) => i !== index) })}
              onUp={index > 0 ? () => moveField(index, -1) : undefined}
              onDown={index < draft.fields.length - 1 ? () => moveField(index, 1) : undefined}
            />
          ))}
        </div>

        {addingField ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(Object.keys(fieldKindLabels) as FieldKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                className="rounded-2xl border border-stone-200 bg-white px-3 py-3 text-sm"
                onClick={() => {
                  setDraft({ ...draft, fields: [...draft.fields, newField(kind)] })
                  setAddingField(false)
                }}
              >
                {fieldKindLabels[kind]}
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            className="mt-3 w-full rounded-2xl border border-dashed border-stone-300 py-3 text-sm text-stone-600"
            onClick={() => setAddingField(true)}
          >
            Добавить поле
          </button>
        )}

        {type && <DeleteSection type={type} types={types} onDeleted={onDeleted} />}
      </div>
    </div>
  )
}

type FieldCardProps = {
  field: Field
  onChange: (field: Field) => void
  onRemove: () => void
  onUp?: () => void
  onDown?: () => void
}

function FieldCard({ field, onChange, onRemove, onUp, onDown }: FieldCardProps) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between text-xs text-stone-500">
        <span>{fieldKindLabels[field.kind]}</span>
        <div className="flex gap-1">
          <button type="button" className="px-2 py-1 disabled:opacity-30" disabled={!onUp} onClick={onUp}>
            ↑
          </button>
          <button type="button" className="px-2 py-1 disabled:opacity-30" disabled={!onDown} onClick={onDown}>
            ↓
          </button>
          <button type="button" className="px-2 py-1 text-red-600" onClick={onRemove}>
            Удалить
          </button>
        </div>
      </div>
      <input
        value={field.name}
        placeholder="Название поля"
        onChange={(e) => onChange({ ...field, name: e.target.value })}
        className="w-full rounded-xl bg-stone-100 px-3 py-2 outline-none"
      />
      {field.kind === 'number' && (
        <input
          value={field.unit}
          placeholder="Единица, например ккал"
          onChange={(e) => onChange({ ...field, unit: e.target.value })}
          className="mt-2 w-full rounded-xl bg-stone-100 px-3 py-2 text-sm outline-none"
        />
      )}
      {(field.kind === 'single' || field.kind === 'multi') && (
        <div className="mt-2 flex flex-col gap-2">
          {field.options.map((option, i) => (
            <div key={option.id} className="flex gap-2">
              <input
                value={option.label}
                placeholder="Вариант"
                onChange={(e) =>
                  onChange({
                    ...field,
                    options: field.options.map((o, j) => (j === i ? { ...o, label: e.target.value } : o)),
                  })
                }
                className="flex-1 rounded-xl bg-stone-100 px-3 py-2 text-sm outline-none"
              />
              <button
                type="button"
                className="px-2 text-sm text-stone-400"
                onClick={() => onChange({ ...field, options: field.options.filter((_, j) => j !== i) })}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="self-start px-1 text-sm text-orange-700"
            onClick={() => onChange({ ...field, options: [...field.options, { id: crypto.randomUUID(), label: '' }] })}
          >
            + Вариант
          </button>
        </div>
      )}
    </div>
  )
}

function DeleteSection({ type, types, onDeleted }: { type: EntryType; types: EntryType[]; onDeleted: (targetTypeId: string) => void }) {
  const others = types.filter((t) => t.id !== type.id)
  const [targetId, setTargetId] = useState(others[0]?.id ?? '')
  const count = useLiveQuery(() => db.entries.where('typeId').equals(type.id).count(), [type.id])

  if (others.length === 0) {
    return <p className="mt-10 text-sm text-stone-400">Это единственный тип, его нельзя удалить.</p>
  }

  async function remove() {
    const target = others.find((t) => t.id === targetId)
    if (!target) return
    const message = count
      ? `Удалить тип «${type.name}»? ${entriesMove(count)} в тип «${target.name}», значения их полей пропадут.`
      : `Удалить тип «${type.name}»?`
    if (!window.confirm(message)) return
    await deleteType(type.id, target.id)
    onDeleted(target.id)
  }

  return (
    <div className="mt-10 rounded-2xl border border-red-200 bg-white p-3">
      <h2 className="mb-2 text-sm font-medium text-red-700">Удалить тип</h2>
      {!!count && (
        <label className="mb-3 block text-sm text-stone-600">
          Записи этого типа ({count}) перейдут в тип
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="mt-1 block w-full rounded-xl bg-stone-100 px-3 py-2"
          >
            {others.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <button type="button" className="w-full rounded-xl bg-red-600 py-2 text-white" onClick={() => void remove()}>
        Удалить
      </button>
    </div>
  )
}

const plural = new Intl.PluralRules('ru-RU')

function entriesMove(count: number) {
  switch (plural.select(count)) {
    case 'one':
      return `${count} запись перейдёт`
    case 'few':
      return `${count} записи перейдут`
    default:
      return `${count} записей перейдут`
  }
}
