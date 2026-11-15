import { useState, type ReactNode } from 'react'
import { reasoningLabels } from './assistant'
import { permissionLabels } from './assistantTools'
import type { Permission, Provider, Reasoning } from './db'

type Props = {
  providers: Provider[]
  // Выбранная модель: `${providerId}|${model}`
  model: string
  reasoning: Reasoning
  permission: Permission
  onModel: (value: string) => void
  onReasoning: (reasoning: Reasoning) => void
  onPermission: (permission: Permission) => void
  onClose: () => void
}

type Section = 'model' | 'reasoning' | 'permission'

// Настройки ассистента в нижней панели: строка раскрывает свои варианты
export function ChatSettingsSheet({ providers, model, reasoning, permission, onModel, onReasoning, onPermission, onClose }: Props) {
  const [open, setOpen] = useState<Section | null>(null)
  const [providerId, modelId] = model.split('|')
  const provider = providers.find((p) => p.id === providerId)
  const toggle = (section: Section) => setOpen(open === section ? null : section)

  return (
    <div className="fixed inset-0 z-10 mx-auto flex max-w-xl flex-col justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex max-h-[85dvh] flex-col gap-2 overflow-y-auto rounded-t-3xl bg-white px-3 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-2 pb-1">
          <h2 className="font-semibold">Ассистент</h2>
          <button type="button" className="text-sm font-medium text-orange-700" onClick={onClose}>
            Готово
          </button>
        </div>

        <Row label="Модель" value={providers.length > 1 && provider ? `${modelId} · ${provider.name}` : modelId} open={open === 'model'} onToggle={() => toggle('model')}>
          {providers.map((p) => (
            <div key={p.id}>
              {/* Провайдер выбирается вместе с моделью: модели сгруппированы по провайдерам */}
              <p className="px-3 pt-2 pb-1 text-xs text-stone-500">{p.name}</p>
              {p.models.map((m) => (
                <Option key={m} selected={`${p.id}|${m}` === model} onClick={() => onModel(`${p.id}|${m}`)}>
                  {m}
                </Option>
              ))}
            </div>
          ))}
        </Row>

        <Row label="Размышления" value={reasoningLabels[reasoning]} open={open === 'reasoning'} onToggle={() => toggle('reasoning')}>
          {(Object.keys(reasoningLabels) as Reasoning[]).map((r) => (
            <Option key={r} selected={r === reasoning} onClick={() => onReasoning(r)}>
              {reasoningLabels[r]}
            </Option>
          ))}
        </Row>

        <Row label="Права" value={permissionLabels[permission]} open={open === 'permission'} onToggle={() => toggle('permission')}>
          {(Object.keys(permissionLabels) as Permission[]).map((p) => (
            <Option key={p} selected={p === permission} onClick={() => onPermission(p)}>
              {permissionLabels[p]}
            </Option>
          ))}
        </Row>
      </div>
    </div>
  )
}

function Row({ label, value, open, onToggle, children }: { label: string; value: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-stone-100">
      <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={onToggle}>
        <span className="font-medium text-stone-900">{label}</span>
        <span className="ml-auto truncate text-stone-500">{value}</span>
        <svg viewBox="0 0 24 24" className={`size-4 shrink-0 text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && <div className="px-1 pb-2">{children}</div>}
    </div>
  )
}

function Option({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left ${selected ? 'bg-white font-medium text-stone-900' : 'text-stone-700'}`}
      onClick={onClick}
    >
      {children}
      {selected && <span className="text-orange-600">✓</span>}
    </button>
  )
}
