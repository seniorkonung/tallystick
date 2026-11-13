import { useRef, useState } from 'react'
import { addEntry } from './db'

export function Composer() {
  const [text, setText] = useState('')
  const textarea = useRef<HTMLTextAreaElement>(null)

  function resize() {
    const el = textarea.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  async function send() {
    const value = text.trim()
    if (!value) return
    await addEntry(value)
    setText('')
    requestAnimationFrame(resize)
  }

  return (
    <div className="px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex items-end gap-2 rounded-3xl border border-stone-200 bg-white p-2 pl-4 shadow-sm">
        <textarea
          ref={textarea}
          value={text}
          rows={1}
          placeholder="Что произошло?"
          className="max-h-[200px] flex-1 resize-none bg-transparent py-2 font-serif text-[15px] outline-none placeholder:text-stone-400"
          onChange={(e) => {
            setText(e.target.value)
            resize()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <button
          type="button"
          aria-label="Отправить"
          disabled={!text.trim()}
          onClick={() => void send()}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-orange-600 text-white disabled:bg-stone-200"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}
