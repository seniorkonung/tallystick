import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, type Preset } from './db'
import { isFiltered, normalizeFilters, sameFilters, useFilters } from './filterStore'

type Props = {
  onOpenGallery: () => void
  onOpenSettings: () => void
  onClose: () => void
}

// Пресеты — быстрое применение фильтров к единственной ленте, а не отдельные ленты
export function Sidebar({ onOpenGallery, onOpenSettings, onClose }: Props) {
  const presets = useLiveQuery(() => db.presets.orderBy('order').toArray())
  const { filters, set, reset } = useFilters()
  const [editing, setEditing] = useState(false)
  if (!presets) return null

  async function savePreset() {
    const name = window.prompt('Название пресета')?.trim()
    if (!name) return
    const order = (presets?.at(-1)?.order ?? 0) + 1
    await db.presets.add({ id: crypto.randomUUID(), name, createdAt: Date.now(), order, filters: structuredClone(filters) })
  }

  // Соседние пресеты меняются местами
  async function move(index: number, delta: number) {
    const a = presets![index]
    const b = presets![index + delta]
    await db.transaction('rw', db.presets, async () => {
      await db.presets.update(a.id, { order: b.order })
      await db.presets.update(b.id, { order: a.order })
    })
  }

  async function updateFilters(preset: Preset) {
    if (!window.confirm(`Заменить фильтры пресета «${preset.name}» текущими фильтрами ленты?`)) return
    await db.presets.update(preset.id, { filters: structuredClone(filters) })
  }

  const itemClass = (active: boolean) =>
    `flex w-full items-center rounded-2xl px-3 py-2.5 text-left ${active ? 'bg-stone-900 text-white' : 'text-stone-800 hover:bg-stone-100'}`
  const actionClass = 'rounded-lg px-2 py-1 text-xs text-stone-600 disabled:opacity-30'

  return (
    <div className="fixed inset-0 z-20 bg-black/30" onClick={onClose}>
      <nav
        className="flex h-full w-72 max-w-[85vw] flex-col bg-white pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end px-3 pb-1">
          <button
            type="button"
            aria-label="Настройки"
            className="flex size-10 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100"
            onClick={() => {
              onOpenSettings()
              onClose()
            }}
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col gap-1 px-3">
          <button
            type="button"
            className={itemClass(!isFiltered(filters))}
            onClick={() => {
              reset()
              onClose()
            }}
          >
            Вся лента
          </button>
          <button
            type="button"
            className={itemClass(false)}
            onClick={() => {
              onOpenGallery()
              onClose()
            }}
          >
            Вложения
          </button>
        </div>

        <div className="mt-5 flex items-center justify-between px-6 pb-1">
          <h2 className="text-xs text-stone-500">Пресеты</h2>
          {presets.length > 0 && (
            <button type="button" className="text-xs text-stone-500" onClick={() => setEditing(!editing)}>
              {editing ? 'Готово' : 'Изменить'}
            </button>
          )}
        </div>

        <ul className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
          {presets.map((preset, index) =>
            editing ? (
              <li key={preset.id} className="rounded-2xl bg-stone-50 px-3 py-2">
                <p className="truncate text-stone-800">{preset.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <button type="button" aria-label="Выше" className={actionClass} disabled={index === 0} onClick={() => void move(index, -1)}>
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Ниже"
                    className={actionClass}
                    disabled={index === presets.length - 1}
                    onClick={() => void move(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={actionClass}
                    disabled={!isFiltered(filters) || sameFilters(filters, preset.filters)}
                    onClick={() => void updateFilters(preset)}
                  >
                    Обновить
                  </button>
                  <button
                    type="button"
                    className={actionClass}
                    onClick={async () => {
                      const name = window.prompt('Название пресета', preset.name)?.trim()
                      if (name) await db.presets.update(preset.id, { name })
                    }}
                  >
                    Имя
                  </button>
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-xs text-red-600"
                    onClick={async () => {
                      if (window.confirm(`Удалить пресет «${preset.name}»? Записи не пострадают.`)) await db.presets.delete(preset.id)
                    }}
                  >
                    Удалить
                  </button>
                </div>
              </li>
            ) : (
              <li key={preset.id}>
                <button
                  type="button"
                  className={itemClass(sameFilters(filters, preset.filters))}
                  onClick={() => {
                    set(normalizeFilters(structuredClone(preset.filters)))
                    onClose()
                  }}
                >
                  <span className="truncate">{preset.name}</span>
                </button>
              </li>
            ),
          )}
          {presets.length === 0 && (
            <li className="px-3 py-2 text-sm text-stone-400">Настройте фильтры ленты и сохраните их сюда</li>
          )}
        </ul>

        {editing ? (
          <p className="px-6 pt-2 text-xs text-stone-400">
            «Обновить» заменяет фильтры пресета текущими фильтрами ленты: примените пресет, поправьте фильтры и обновите его.
          </p>
        ) : (
          <div className="px-3 pt-2">
            <button
              type="button"
              disabled={!isFiltered(filters)}
              className="w-full rounded-2xl border border-dashed border-stone-300 py-2.5 text-sm text-stone-700 disabled:text-stone-300"
              onClick={() => void savePreset()}
            >
              Сохранить текущие фильтры
            </button>
          </div>
        )}
      </nav>
    </div>
  )
}
