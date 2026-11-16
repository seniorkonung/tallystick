import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, type Provider, type ProviderKind } from './db'
import { InstructionEditor, type InstructionTarget } from './InstructionEditor'
import { defaultModels, providerKindLabels } from './llm'

// Страница настроек: провайдеры моделей и инструкции ассистенту
export function Settings({ onClose }: { onClose: () => void }) {
  const providers = useLiveQuery(() => db.providers.orderBy('createdAt').toArray())
  // Провайдер в редакторе: null — новый, undefined — редактор закрыт
  const [editing, setEditing] = useState<Provider | null | undefined>(undefined)
  const instructions = useLiveQuery(() => db.instructions.orderBy('createdAt').toArray())
  const general = useLiveQuery(async () => {
    const saved = await db.settings.get('generalInstruction')
    return saved?.id === 'generalInstruction' ? saved.value : ''
  })
  const [instructionTarget, setInstructionTarget] = useState<InstructionTarget | null>(null)
  if (!providers || !instructions || general === undefined) return null
  const card = 'flex w-full flex-col rounded-2xl border border-stone-200 bg-white px-4 py-3 text-left'

  return (
    <div className="fixed inset-0 z-20 mx-auto flex max-w-xl flex-col bg-stone-50">
      <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <button
          type="button"
          aria-label="Закрыть настройки"
          className="flex size-9 items-center justify-center rounded-full hover:bg-stone-100"
          onClick={editing === undefined ? onClose : () => setEditing(undefined)}
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <h1 className="font-semibold">{editing === undefined ? 'Настройки' : editing ? editing.name : 'Новый провайдер'}</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {editing !== undefined ? (
          <ProviderForm key={editing?.id ?? 'new'} provider={editing} onDone={() => setEditing(undefined)} />
        ) : (
          <>
            <h2 className="mb-1 text-xs text-stone-500">Провайдеры моделей</h2>
            <p className="mb-3 text-xs text-stone-400">
              Чаты работают через ваш ключ. Сообщения и записи, которые читает ассистент, уходят провайдеру.
            </p>
            <ul className="flex flex-col gap-2">
              {providers.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={card}
                    onClick={() => setEditing(p)}
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-stone-500">
                      {providerKindLabels[p.kind]} · {p.models.join(', ') || 'нет моделей'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-3 w-full rounded-2xl border border-dashed border-stone-300 py-3 text-sm text-stone-600"
              onClick={() => setEditing(null)}
            >
              Добавить провайдера
            </button>

            <h2 className="mt-8 mb-1 text-xs text-stone-500">Инструкции ассистенту</h2>
            <p className="mb-3 text-xs text-stone-400">
              Общая действует во всех чатах. Стартовую выбирают в новом чате, и чат сохраняет её текст: правка инструкции начатые чаты не меняет.
            </p>
            <ul className="flex flex-col gap-2">
              <li>
                <button type="button" className={card} onClick={() => setInstructionTarget({ kind: 'general' })}>
                  <span className="font-medium">Общая инструкция</span>
                  <span className="truncate text-xs text-stone-500">{general || 'Не задана'}</span>
                </button>
              </li>
              {instructions.map((i) => (
                <li key={i.id}>
                  <button type="button" className={card} onClick={() => setInstructionTarget({ kind: 'start', instruction: i })}>
                    <span className="font-medium">{i.name}</span>
                    <span className="truncate text-xs text-stone-500">{i.text}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-3 w-full rounded-2xl border border-dashed border-stone-300 py-3 text-sm text-stone-600"
              onClick={() => setInstructionTarget({ kind: 'start', instruction: null })}
            >
              Добавить стартовую инструкцию
            </button>
          </>
        )}
      </div>
      {instructionTarget && <InstructionEditor target={instructionTarget} onClose={() => setInstructionTarget(null)} />}
    </div>
  )
}

function ProviderForm({ provider, onDone }: { provider: Provider | null; onDone: () => void }) {
  const [kind, setKind] = useState<ProviderKind>(provider?.kind ?? 'anthropic')
  const [name, setName] = useState(provider?.name ?? providerKindLabels.anthropic)
  const [baseURL, setBaseURL] = useState(provider?.baseURL ?? '')
  const [apiKey, setApiKey] = useState(provider?.apiKey ?? '')
  const [models, setModels] = useState((provider?.models ?? defaultModels.anthropic).join('\n'))
  const modelList = models.split('\n').map((m) => m.trim()).filter(Boolean)
  const valid = name.trim() !== '' && apiKey.trim() !== '' && modelList.length > 0 && (kind !== 'openai-compatible' || baseURL.trim() !== '')

  function changeKind(next: ProviderKind) {
    // Пока пользователь не правил название и модели, они следуют за видом провайдера
    if (name === providerKindLabels[kind]) setName(providerKindLabels[next])
    if (models === defaultModels[kind].join('\n')) setModels(defaultModels[next].join('\n'))
    setKind(next)
  }

  async function save() {
    await db.providers.put({
      id: provider?.id ?? crypto.randomUUID(),
      createdAt: provider?.createdAt ?? Date.now(),
      name: name.trim(),
      kind,
      baseURL: baseURL.trim(),
      apiKey: apiKey.trim(),
      models: modelList,
    })
    onDone()
  }

  async function remove() {
    if (!provider || !window.confirm(`Удалить провайдера «${provider.name}»? Чаты останутся.`)) return
    await db.providers.delete(provider.id)
    onDone()
  }

  const input = 'mb-4 w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 outline-none'
  return (
    <div>
      <label className="mb-1 block text-xs text-stone-500">Вид</label>
      <select value={kind} onChange={(e) => changeKind(e.target.value as ProviderKind)} className={input}>
        {(Object.keys(providerKindLabels) as ProviderKind[]).map((k) => (
          <option key={k} value={k}>
            {providerKindLabels[k]}
          </option>
        ))}
      </select>

      <label className="mb-1 block text-xs text-stone-500">Название</label>
      <input value={name} onChange={(e) => setName(e.target.value)} className={input} />

      <label className="mb-1 block text-xs text-stone-500">
        Адрес API{kind === 'openai-compatible' ? '' : ' — пусто, если стандартный'}
      </label>
      <input
        value={baseURL}
        placeholder={kind === 'openai-compatible' ? 'https://openrouter.ai/api/v1' : ''}
        inputMode="url"
        onChange={(e) => setBaseURL(e.target.value)}
        className={input}
      />

      <label className="mb-1 block text-xs text-stone-500">Ключ API</label>
      <input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className={input} />

      <label className="mb-1 block text-xs text-stone-500">Модели, по одной в строке</label>
      <textarea value={models} rows={4} onChange={(e) => setModels(e.target.value)} className={`${input} font-mono text-sm`} />

      <button
        type="button"
        disabled={!valid}
        className="w-full rounded-2xl bg-stone-900 py-3 font-medium text-white disabled:bg-stone-200 disabled:text-stone-400"
        onClick={() => void save()}
      >
        Сохранить
      </button>
      {provider && (
        <button type="button" className="mt-2 w-full rounded-2xl py-3 text-red-600" onClick={() => void remove()}>
          Удалить провайдера
        </button>
      )}
    </div>
  )
}
