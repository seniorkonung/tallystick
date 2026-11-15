import type { Tag } from './db'
import { tagColors } from './tagColors'

export function TagChip({ tag, onRemove }: { tag: Tag; onRemove?: () => void }) {
  const color = tagColors[tag.color % tagColors.length]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ background: color.bg, color: color.text }}
    >
      <span className="size-1.5 rounded-full" style={{ background: color.dot }} />
      {tag.name}
      {onRemove && (
        <button
          type="button"
          aria-label={`Убрать ${tag.name}`}
          className="-mr-1 px-1"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          ✕
        </button>
      )}
    </span>
  )
}
