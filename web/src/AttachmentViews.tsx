import { formatSize, isImage, isVideo, useBlobRef } from './attachments'
import type { PreparedFile } from './db'

type TileProps = {
  file: PreparedFile
  onOpen?: () => void
  onRemove?: () => void
}

// Фото и видео — квадратная миниатюра, прочие файлы — плашка с именем и размером
export function AttachmentTile({ file, onOpen, onRemove }: TileProps) {
  const thumbRef = useBlobRef<HTMLImageElement>(file.thumb)
  const visual = isImage(file.mime) || isVideo(file.mime)

  const remove = onRemove && (
    <button
      type="button"
      aria-label={`Убрать ${file.name}`}
      className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-stone-900 text-[10px] text-white"
      onClick={(e) => {
        e.stopPropagation()
        onRemove()
      }}
    >
      ✕
    </button>
  )

  if (visual) {
    return (
      <div className="relative shrink-0">
        <button
          type="button"
          aria-label={file.name}
          className="relative block size-20 overflow-hidden rounded-xl bg-stone-200"
          onClick={(e) => {
            e.stopPropagation()
            onOpen?.()
          }}
        >
          {file.thumb && <img ref={thumbRef} alt="" className="size-full object-cover" />}
          {isVideo(file.mime) && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex size-7 items-center justify-center rounded-full bg-black/50 text-white">
                <svg viewBox="0 0 24 24" className="ml-0.5 size-3.5" fill="currentColor">
                  <path d="M7 4.5v15l12-7.5z" />
                </svg>
              </span>
            </span>
          )}
        </button>
        {remove}
      </div>
    )
  }

  return (
    <div className="relative max-w-full shrink-0">
      <button
        type="button"
        className="flex max-w-60 items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 text-left"
        onClick={(e) => {
          e.stopPropagation()
          onOpen?.()
        }}
      >
        <span className="text-lg">📄</span>
        <span className="min-w-0">
          <span className="block truncate text-sm text-stone-800">{file.name}</span>
          <span className="block text-xs text-stone-500">{formatSize(file.size)}</span>
        </span>
      </button>
      {remove}
    </div>
  )
}

// Просмотр вложения во весь экран
type ViewerProps = {
  file: PreparedFile
  onClose: () => void
  // Есть, когда просмотр открыт не из самой записи
  onGoToEntry?: () => void
}

export function AttachmentViewer({ file, onClose, onGoToEntry }: ViewerProps) {
  const imageRef = useBlobRef<HTMLImageElement>(file.blob)
  const videoRef = useBlobRef<HTMLVideoElement>(file.blob)
  const linkRef = useBlobRef<HTMLAnchorElement>(file.blob)

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-black" onClick={onClose}>
      <div className="flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-white">
        <span className="min-w-0 truncate text-sm">{file.name}</span>
        <div className="flex shrink-0 gap-4 text-sm">
          {onGoToEntry && (
            <button
              type="button"
              className="text-white/80"
              onClick={(e) => {
                e.stopPropagation()
                onGoToEntry()
              }}
            >
              К записи
            </button>
          )}
          <a ref={linkRef} download={file.name} className="text-white/80" onClick={(e) => e.stopPropagation()}>
            Скачать
          </a>
          <button type="button" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-2">
        {isImage(file.mime) ? (
          <img ref={imageRef} alt={file.name} className="max-h-full max-w-full object-contain" />
        ) : isVideo(file.mime) ? (
          <video ref={videoRef} controls autoPlay playsInline className="max-h-full max-w-full" onClick={(e) => e.stopPropagation()} />
        ) : (
          <div className="text-center text-white/80">
            <p className="mb-1 text-4xl">📄</p>
            <p className="text-sm">{formatSize(file.size)}</p>
          </div>
        )}
      </div>
    </div>
  )
}
