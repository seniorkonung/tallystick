import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { TagEditor } from './TagEditor'
import { TagPicker } from './TagPicker'
import { openChatWithEntries } from './chatView'
import { copyEntriesText } from './clipboard'
import { useComposer } from './composerStore'
import { db, deleteEntries, setEntriesActual, setEntriesTag } from './db'
import { pluralRu } from './plural'
import { clearSelection, useSelection } from './selectionStore'
import { useThread } from './threadStore'
import { useMeasuredHeight } from './useMeasuredHeight'

// Действия с выделенными записями; на время выделения заменяет панель ввода
export function SelectionBar() {
  const ids = useSelection((s) => s.ids)
  // Запись могла пропасть, например её удалил ассистент
  const entries = useLiveQuery(async () => (await db.entries.bulkGet(ids)).flatMap((e) => e ?? []), [ids])
  const [pickingTags, setPickingTags] = useState(false)
  // Теги меняли — после закрытия выбора выделение снимается; закрытый без изменений выбор его оставляет
  const [tagsChanged, setTagsChanged] = useState(false)
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const measure = useMeasuredHeight('--composer-height')
  if (!entries) return null

  const selectedIds = entries.map((e) => e.id)
  const allActual = entries.every((e) => e.actual)
  // Отмечены теги, которые есть у всех выделенных записей
  const commonTagIds = entries[0]?.tagIds.filter((id) => entries.every((e) => e.tagIds.includes(id))) ?? []

  async function remove() {
    const n = selectedIds.length
    const replies = await db.entries.filter((e) => !!e.replyTo && selectedIds.includes(e.replyTo) && !selectedIds.includes(e.id)).count()
    const warning = replies
      ? ` ${replies} ${pluralRu(replies, ['ответ останется', 'ответа останутся', 'ответов останутся'])} в ленте без исходной записи.`
      : ''
    if (!window.confirm(`Удалить ${n} ${pluralRu(n, ['запись', 'записи', 'записей'])} безвозвратно? Вложения тоже удалятся.${warning}`)) return
    // Панель ввода не должна держать удалённую запись
    const composer = useComposer.getState()
    if (composer.editingEntryId && selectedIds.includes(composer.editingEntryId)) composer.stopEditing()
    if (composer.replyToId && selectedIds.includes(composer.replyToId)) composer.cancelReply()
    // Удалили исходную запись открытого экрана ответов — возвращаемся уровнем выше
    const threadId = useThread.getState().stack.at(-1)
    if (threadId && selectedIds.includes(threadId)) useThread.getState().back()
    await deleteEntries(selectedIds)
    clearSelection()
  }

  const actionClass = 'flex-1 rounded-2xl bg-stone-100 px-2 py-2.5 text-sm font-medium text-stone-800 disabled:text-stone-300'

  return (
    <>
      <div ref={measure} className="absolute inset-x-0 bottom-0 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="rounded-3xl border border-stone-200 bg-white p-2 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <button type="button" aria-label="Снять выделение" className="flex size-9 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100" onClick={clearSelection}>
              ✕
            </button>
            <p className="flex-1 text-sm font-medium">
              {/* Счётчик по выделению, а не по загруженным записям: обновляется сразу после тапа */}
              Выбрано {ids.length} {pluralRu(ids.length, ['запись', 'записи', 'записей'])}
            </p>
            <button
              type="button"
              className="rounded-2xl px-3 py-2 text-sm font-medium text-orange-700 disabled:text-stone-300"
              disabled={!entries.length}
              onClick={() => {
                clearSelection()
                void openChatWithEntries(selectedIds)
              }}
            >
              В новый чат
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" className={actionClass} disabled={!entries.length} onClick={() => setPickingTags(true)}>
              Тег
            </button>
            <button type="button" className={actionClass} disabled={!entries.length} onClick={() => void setEntriesActual(selectedIds, !allActual).then(clearSelection)}>
              {allActual ? 'Неактуально' : 'Актуально'}
            </button>
            <button
              type="button"
              className={actionClass}
              disabled={!entries.some((e) => e.text)}
              onClick={() => void copyEntriesText(entries).then(clearSelection)}
            >
              Копировать
            </button>
            <button type="button" className={`${actionClass} bg-red-50 text-red-700`} disabled={!entries.length} onClick={() => void remove()}>
              Удалить
            </button>
          </div>
        </div>
      </div>

      {pickingTags && (
        <TagPicker
          selectedIds={commonTagIds}
          onToggle={(tag) => {
            setTagsChanged(true)
            void setEntriesTag(selectedIds, tag, !commonTagIds.includes(tag.id))
          }}
          onEdit={(tag) => setEditingTagId(tag.id)}
          onClose={() => {
            setPickingTags(false)
            if (tagsChanged) clearSelection()
          }}
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
    </>
  )
}
