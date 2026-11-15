import { useRef, type ChangeEvent, type RefObject } from 'react'

type Props = { open: boolean; onClose: () => void; onFiles: (files: File[]) => void }

// Выбор вложений нижней панелью. Поля выбора файлов остаются на странице и при закрытой панели: выбор файла приходит после её закрытия
export function AttachSheet({ open, onClose, onFiles }: Props) {
  const galleryInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  function pick(input: RefObject<HTMLInputElement | null>) {
    input.current?.click()
    onClose()
  }

  function change(e: ChangeEvent<HTMLInputElement>) {
    onFiles([...(e.target.files ?? [])])
    e.target.value = ''
  }

  return (
    <>
      <input ref={galleryInput} type="file" accept="image/*,video/*" multiple hidden onChange={change} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={change} />
      <input ref={fileInput} type="file" multiple hidden onChange={change} />
      {open && (
        <div className="fixed inset-0 z-10 mx-auto flex max-w-xl flex-col justify-end bg-black/30" onClick={onClose}>
          <div
            className="rounded-t-3xl bg-white px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            {[
              { label: 'Фото или видео', input: galleryInput },
              { label: 'Камера', input: cameraInput },
              { label: 'Файл', input: fileInput },
            ].map(({ label, input }) => (
              <button
                key={label}
                type="button"
                className="mb-2 w-full rounded-2xl bg-stone-100 px-4 py-3 text-left font-medium text-stone-900"
                onClick={() => pick(input)}
              >
                {label}
              </button>
            ))}
            <button type="button" className="w-full py-3 text-stone-500" onClick={onClose}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </>
  )
}
