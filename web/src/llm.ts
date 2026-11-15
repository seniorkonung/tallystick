import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import type { Provider, ProviderKind } from './db'

export const providerKindLabels: Record<ProviderKind, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  'openai-compatible': 'Совместимый с OpenAI',
}

// Подсказка при создании провайдера; список моделей пользователь правит сам
export const defaultModels: Record<ProviderKind, string[]> = {
  anthropic: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'],
  openai: [],
  'openai-compatible': [],
}

// Запросы идут из браузера прямо к провайдеру, без своего сервера
export function languageModel(provider: Provider, modelId: string): LanguageModel {
  const baseURL = provider.baseURL.trim() || undefined
  switch (provider.kind) {
    case 'anthropic':
      return createAnthropic({
        apiKey: provider.apiKey,
        baseURL,
        // Без этого заголовка Anthropic отклоняет запросы из браузера
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      })(modelId)
    case 'openai':
      return createOpenAI({ apiKey: provider.apiKey, baseURL })(modelId)
    case 'openai-compatible':
      return createOpenAICompatible({ name: provider.name, apiKey: provider.apiKey, baseURL: provider.baseURL.trim() })(modelId)
  }
}
