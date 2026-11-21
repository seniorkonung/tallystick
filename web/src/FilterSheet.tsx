import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { ConditionEditor } from './ConditionEditor'
import { TagChip } from './TagChip'
import { formatCondition, type Condition } from './conditions'
import { db } from './db'
import { copyText } from './clipboard'
import { filterHref } from './filterLinks'
import { emptyFilters, isFiltered, matchEntry, useFilters, type Actuality, type Filters } from './filterStore'
import { useFilterChips } from './useFilterChips'
import { pluralRu } from './plural'
import { AmountUnit } from './AmountUnit'
import { lastStart, momentText } from './periods'

const actualityLabels: Record<Actuality, string> = { all: 'Все', actual: 'Актуальные', inactual: 'Неактуальные' }

// Черновик фильтров применяется кнопкой «Показать»; счётчик считает его вживую
export function FilterSheet({ onClose }: { onClose: () => void }) {
  const applied = useFilters((s) => s.filters)
  const apply = useFilters((s) => s.set)
  const [draft, setDraft] = useState<Filters>(applied)
  const [tagQuery, setTagQuery] = useState('')
  // Условие в редакторе: null — новое, undefined — редактор закрыт
  const [editingCondition, setEditingCondition] = useState<Condition | null | undefined>(undefined)
  const entries = useLiveQuery(() => db.entries.toArray())
  const types = useLiveQuery(() => db.types.toArray())
  const tags = useLiveQuery(() => db.tags.toArray())
  const chips = useFilterChips({ withText: true, filters: draft })
  const [copied, setCopied] = useState(false)
  if (!entries || !types || !tags) return null

  const typesById = new Map(types.map((t) => [t.id, t]))
  const count = entries.filter((e) => matchEntry(draft, e, typesById)).length
  const q = tagQuery.trim().toLowerCase()
  // Тегов в архиве может быть много: они видны только через поиск или если уже выбраны
  const shownTags = tags
    .filter((p) => (q ? p.name.toLowerCase().includes(q) : p.status === 'active' || draft.tagIds.includes(p.id)))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  // Ссылку вставляют в запись или в чат; подпись из чипов фильтров можно переписать
  async function copyLink() {
    const label = chips
      .map((c) => c.label)
      .join(' · ')
      .replace(/[[\]\n]/g, '')
    const short = label.length > 60 ? `${label.slice(0, 60).trimEnd()}…` : label
    if (!(await copyText(`[${short}](${filterHref(draft)})`))) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  const chipClass = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm ${active ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`

  return (
    <div className="fixed inset-0 z-10 mx-auto flex max-w-xl flex-col justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex max-h-[90dvh] flex-col rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="font-semibold">Фильтры</h2>
          {editingCondition === undefined && (
            <div className="flex gap-4">
              <button type="button" className="text-sm text-stone-500 disabled:text-stone-300" disabled={!isFiltered(draft)} onClick={() => void copyLink()}>
                {copied ? 'Скопировано' : 'Скопировать ссылку'}
              </button>
              <button type="button" className="text-sm text-stone-500" onClick={() => setDraft({ ...emptyFilters, text: draft.text })}>
                Сбросить
              </button>
            </div>
          )}
        </div>

        {editingCondition !== undefined ? (
          <div className="flex-1 overflow-y-auto px-5 pb-4">
            <ConditionEditor
              types={types}
              entries={entries}
              initial={editingCondition}
              onCancel={() => setEditingCondition(undefined)}
              onDone={(c) => {
                const exists = draft.conditions.some((x) => x.id === c.id)
                setDraft({
                  ...draft,
                  conditions: exists ? draft.conditions.map((x) => (x.id === c.id ? c : x)) : [...draft.conditions, c],
                })
                setEditingCondition(undefined)
              }}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 pb-3">
            <h3 className="mt-2 mb-2 text-xs text-stone-500">Актуальность</h3>
            <div className="flex gap-2">
              {(Object.keys(actualityLabels) as Actuality[]).map((a) => (
                <button key={a} type="button" className={chipClass(draft.actuality === a)} onClick={() => setDraft({ ...draft, actuality: a })}>
                  {actualityLabels[a]}
                </button>
              ))}
            </div>

            <h3 className="mt-5 mb-2 text-xs text-stone-500">Ответы и чаты</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={chipClass(draft.hideReplies)}
                onClick={() => setDraft({ ...draft, hideReplies: !draft.hideReplies })}
              >
                Скрыть ответы
              </button>
              <button type="button" className={chipClass(draft.fromChats)} onClick={() => setDraft({ ...draft, fromChats: !draft.fromChats })}>
                Только из чатов
              </button>
            </div>

            <h3 className="mt-5 mb-2 text-xs text-stone-500">Период</h3>
            <div className="mb-2 flex gap-2">
              <button type="button" className={chipClass(!draft.last)} onClick={() => setDraft({ ...draft, last: null })}>
                Точные даты
              </button>
              <button
                type="button"
                className={chipClass(!!draft.last)}
                onClick={() => draft.last || setDraft({ ...draft, from: '', to: '', last: { amount: 7, unit: 'day' } })}
              >
                Последние
              </button>
            </div>
            {draft.last ? (
              <>
                <AmountUnit
                  amount={draft.last.amount}
                  unit={draft.last.unit}
                  signed={false}
                  min={1}
                  onChange={(amount, unit) => setDraft({ ...draft, last: { amount, unit } })}
                />
                <p className="mt-1.5 text-xs text-stone-400">
                  Сейчас — с {momentText(lastStart(draft.last), draft.last.unit === 'hour')}. Дни, недели, месяцы и годы считаются целыми, включая текущий.
                </p>
              </>
            ) : (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={draft.from}
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
                className="flex-1 rounded-xl bg-stone-100 px-3 py-2 text-sm"
              />
              <span className="text-stone-400">—</span>
              <input
                type="date"
                value={draft.to}
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                className="flex-1 rounded-xl bg-stone-100 px-3 py-2 text-sm"
              />
            </div>
            )}

            <h3 className="mt-5 mb-2 text-xs text-stone-500">Типы</h3>
            <div className="flex flex-wrap gap-2">
              {[...types]
                .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={chipClass(draft.typeIds.includes(t.id))}
                    onClick={() => setDraft({ ...draft, typeIds: toggle(draft.typeIds, t.id) })}
                  >
                    {t.name}
                  </button>
                ))}
            </div>

            <h3 className="mt-5 mb-2 text-xs text-stone-500">Теги</h3>
            <input
              value={tagQuery}
              placeholder="Найти тег, в том числе в архиве"
              onChange={(e) => setTagQuery(e.target.value)}
              className="mb-2 w-full rounded-xl bg-stone-100 px-3 py-2 text-sm outline-none"
            />
            <div className="flex flex-wrap gap-2">
              {!q && (
                <button
                  type="button"
                  className={`rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600 ${draft.untagged ? 'ring-2 ring-stone-900 ring-offset-1' : 'opacity-70'}`}
                  onClick={() => setDraft({ ...draft, untagged: !draft.untagged })}
                >
                  Без тегов
                </button>
              )}
              {shownTags.map((p) => {
                const active = draft.tagIds.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`rounded-full ${active ? 'ring-2 ring-stone-900 ring-offset-1' : 'opacity-70'}`}
                    onClick={() => setDraft({ ...draft, tagIds: toggle(draft.tagIds, p.id) })}
                  >
                    <TagChip tag={p} />
                  </button>
                )
              })}
              {shownTags.length === 0 && q && <p className="text-sm text-stone-400">Тегов нет</p>}
            </div>

            <h3 className="mt-5 mb-2 text-xs text-stone-500">Поля</h3>
            {draft.conditions.length > 1 && (
              <div className="mb-2 flex gap-2">
                {(['all', 'any'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={chipClass(draft.conditionMode === mode)}
                    onClick={() => setDraft({ ...draft, conditionMode: mode })}
                  >
                    {mode === 'all' ? 'Все условия' : 'Любое из условий'}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-2">
              {draft.conditions.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-2xl bg-stone-100 pr-1">
                  <button type="button" className="flex-1 px-3 py-2 text-left text-sm" onClick={() => setEditingCondition(c)}>
                    {formatCondition(c)}
                  </button>
                  <button
                    type="button"
                    aria-label="Убрать условие"
                    className="px-2 text-stone-400"
                    onClick={() => setDraft({ ...draft, conditions: draft.conditions.filter((x) => x.id !== c.id) })}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="rounded-2xl border border-dashed border-stone-300 py-2.5 text-sm text-stone-600"
                onClick={() => setEditingCondition(null)}
              >
                Добавить условие
              </button>
            </div>
          </div>
        )}

        {editingCondition === undefined && (
          <div className="border-t border-stone-100 p-3">
            <button
              type="button"
              className="w-full rounded-2xl bg-stone-900 py-3 font-medium text-white"
              onClick={() => {
                apply(draft)
                onClose()
              }}
            >
              Показать {count} {pluralRu(count, ['запись', 'записи', 'записей'])}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
