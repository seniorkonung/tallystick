import { useComposer } from './composerStore'
import { db, deleteEntry, setActual, type Entry } from './db'
import { plainText } from './format'
import { pluralRu } from './plural'
import { useThread } from './threadStore'

// Действия с записью по тапу на карточку
export function EntryMenu({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const startEditing = useComposer((s) => s.startEditing)
  const startReply = useComposer((s) => s.startReply)

  async function remove() {
    const replies = await db.entries.filter((e) => e.replyTo === entry.id).count()
    const warning = replies
      ? ` ${replies} ${pluralRu(replies, ['ответ останется', 'ответа останутся', 'ответов останутся'])} в ленте без исходной записи.`
      : ''
    if (!window.confirm(`Удалить запись безвозвратно? Её вложения тоже удалятся.${warning}`)) return
    // Панель ввода не должна держать удалённую запись
    const composer = useComposer.getState()
    if (composer.editingEntryId === entry.id) composer.stopEditing()
    if (composer.replyToId === entry.id) composer.cancelReply()
    // Удалили исходную запись открытого экрана ответов — возвращаемся уровнем выше
    if (useThread.getState().stack.at(-1) === entry.id) useThread.getState().back()
    await deleteEntry(entry.id)
    onClose()
  }
  return (
    <div className="fixed inset-0 z-10 mx-auto flex max-w-xl flex-col justify-end bg-black/30" onClick={onClose}>
      <div
        className="rounded-t-3xl bg-white px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        {entry.text && (
          <p className="mb-4 line-clamp-3 px-1 font-serif text-[15px] whitespace-pre-wrap text-stone-600">
            {plainText(entry.text, { hideSpoilers: true })}
          </p>
        )}
        <button
          type="button"
          className="mb-2 w-full rounded-2xl bg-stone-100 px-4 py-3 text-left font-medium text-stone-900"
          onClick={() => {
            startReply(entry.id)
            onClose()
          }}
        >
          Ответить
        </button>
        <button
          type="button"
          className="mb-2 w-full rounded-2xl bg-stone-100 px-4 py-3 text-left font-medium text-stone-900"
          onClick={async () => {
            startEditing(entry, await db.attachments.where('entryId').equals(entry.id).sortBy('createdAt'))
            onClose()
          }}
        >
          Редактировать
        </button>
        <button
          type="button"
          className="w-full rounded-2xl bg-stone-100 px-4 py-3 text-left font-medium text-stone-900"
          onClick={() => {
            void setActual(entry.id, !entry.actual)
            onClose()
          }}
        >
          {entry.actual ? 'Больше не актуально' : 'Снова актуально'}
        </button>
        <button
          type="button"
          className="mt-2 w-full rounded-2xl bg-red-50 px-4 py-3 text-left font-medium text-red-700"
          onClick={() => void remove()}
        >
          Удалить
        </button>
        <button type="button" className="mt-2 w-full py-3 text-stone-500" onClick={onClose}>
          Отмена
        </button>
      </div>
    </div>
  )
}
