import type { Project } from './db'
import { projectColors } from './projectColors'

export function ProjectChip({ project, onRemove }: { project: Project; onRemove?: () => void }) {
  const color = projectColors[project.color % projectColors.length]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ background: color.bg, color: color.text }}
    >
      <span className="size-1.5 rounded-full" style={{ background: color.dot }} />
      {project.name}
      {onRemove && (
        <button type="button" aria-label={`Убрать ${project.name}`} className="-mr-1 px-1" onClick={onRemove}>
          ✕
        </button>
      )}
    </span>
  )
}
