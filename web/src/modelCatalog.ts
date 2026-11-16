import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Reasoning } from './db'

// Что известно о модели из открытого каталога models.dev
export type ModelInfo = {
  name: string
  // Окно контекста в токенах
  context: number | null
  // Поддерживаемые уровни размышлений; null — неизвестно, доступны все
  reasoning: Reasoning[] | null
}

// Сведения о моделях из списков провайдеров; info: null — модели в каталоге не нашлось
export type ModelCatalog = Record<string, { info: ModelInfo | null; checkedAt: number }>

const catalogUrl = 'https://models.dev/api.json'
// Модели, которой нет в каталоге, он может пополниться позже
const recheckMissingAfter = 7 * 24 * 60 * 60 * 1000
const efforts: Reasoning[] = ['low', 'medium', 'high', 'xhigh', 'max']

type RawModel = {
  name?: string
  reasoning?: boolean
  limit?: { context?: number }
  reasoning_options?: { type: string; values?: string[] }[]
}

// Модель ищется по названию без вендора: у своего совместимого API адрес ничего не говорит о модели
export function catalogKey(modelId: string) {
  return modelId.split('/').at(-1)!.toLowerCase()
}

function reasoningOf(m: RawModel): Reasoning[] | null {
  if (!m.reasoning) return ['provider-default']
  const effort = m.reasoning_options?.find((o) => o.type === 'effort')
  // Без списка уровней (только бюджет или ничего) AI SDK сам подберёт настройку — доступны все
  if (!effort?.values) return null
  const canDisable = m.reasoning_options!.some((o) => o.type === 'toggle') || effort.values.includes('none')
  return ['provider-default', ...(canDisable ? (['none'] as Reasoning[]) : []), ...efforts.filter((e) => effort.values!.includes(e))]
}

// Значение большинства: одна модель есть у многих хостов, и редкий хост может урезать окно или дописать своё имя
function majority<T>(values: T[]): T {
  const counts = new Map<string, { value: T; count: number }>()
  for (const value of values) {
    const key = JSON.stringify(value)
    const entry = counts.get(key) ?? { value, count: 0 }
    entry.count++
    counts.set(key, entry)
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)[0].value
}

async function lookUp(keys: string[]): Promise<ModelCatalog> {
  const response = await fetch(catalogUrl)
  if (!response.ok) throw new Error(`models.dev: ${response.status}`)
  const providers: Record<string, { models: Record<string, RawModel> }> = await response.json()
  const found = new Map<string, RawModel[]>(keys.map((key) => [key, []]))
  for (const provider of Object.values(providers)) {
    for (const [id, model] of Object.entries(provider.models)) found.get(catalogKey(id))?.push(model)
  }
  const checkedAt = Date.now()
  return Object.fromEntries(
    [...found].map(([key, list]) => [
      key,
      {
        checkedAt,
        info: list.length
          ? {
              name: majority(list.map((m) => m.name ?? key)),
              context: majority(list.map((m) => m.limit?.context ?? null)),
              reasoning: majority(list.map(reasoningOf)),
            }
          : null,
      },
    ]),
  )
}

async function savedCatalog(): Promise<ModelCatalog> {
  const saved = await db.settings.get('modelCatalog')
  return saved?.id === 'modelCatalog' ? saved.value : {}
}

async function lookUpAndSave(keys: string[]) {
  const found = await lookUp(keys)
  // Пока шла загрузка, могли сохраниться сведения о других моделях
  await db.settings.put({ id: 'modelCatalog', value: { ...(await savedCatalog()), ...found } })
}

// Сведения о модели не меняются: каталог в мегабайты скачивается, только когда о какой-то модели их ещё нет
export async function ensureModelInfo(modelIds: string[]) {
  const catalog = await savedCatalog()
  const missing = [...new Set(modelIds.map(catalogKey))].filter((key) => {
    const entry = catalog[key]
    return !entry || (!entry.info && Date.now() - entry.checkedAt > recheckMissingAfter)
  })
  if (!missing.length) return
  try {
    await lookUpAndSave(missing)
  } catch (error) {
    // Без каталога видны идентификаторы моделей и только занятые токены; попробуем при следующем открытии чата
    console.warn('Каталог моделей не загрузился', error)
  }
}

// Обновление по просьбе пользователя: сведения о всех моделях скачиваются заново; ошибку покажет вызывающий
export async function refreshModelInfo(modelIds: string[]) {
  await lookUpAndSave([...new Set(modelIds.map(catalogKey))])
}

export function useModelCatalog() {
  return useLiveQuery(async () => {
    const saved = await db.settings.get('modelCatalog')
    return saved?.id === 'modelCatalog' ? saved.value : {}
  })
}

export function modelInfo(catalog: ModelCatalog | undefined, modelId: string): ModelInfo | undefined {
  return catalog?.[catalogKey(modelId)]?.info ?? undefined
}
