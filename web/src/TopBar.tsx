import { useState } from 'react'
import { FilterSheet } from './FilterSheet'
import { Gallery } from './Gallery'
import { Sidebar } from './Sidebar'
import { FilterChips } from './FilterChips'
import { useFilterChips } from './useFilterChips'
import { isFiltered, useFilters } from './filterStore'
import { useThread } from './threadStore'
import { useMeasuredHeight } from './useMeasuredHeight'

// Плавающая панель над лентой: поиск, фильтры и чипы активных фильтров
export function TopBar() {
  const { filters, set } = useFilters()
  const [searching, setSearching] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  // Лента получает верхний отступ по высоте панели
  const measure = useMeasuredHeight('--topbar-height')
  const inThread = useThread((s) => s.stack.length > 0)
  const back = useThread((s) => s.back)

  const chips = useFilterChips({ withText: !searching })

  const iconButton = 'pointer-events-auto flex size-10 items-center justify-center rounded-full border border-stone-200 bg-white shadow-sm'

  // На экране ответов фильтры не действуют — вместо них «назад»
  if (inThread) {
    return (
      <div
        ref={measure}
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] flex items-center gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2"
      >
        <button type="button" aria-label="Назад" className={iconButton} onClick={back}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <span className="pointer-events-auto rounded-full bg-white/90 px-3 py-1.5 text-sm font-medium shadow-sm">Ответы</span>
      </div>
    )
  }

  return (
    <>
      <div
        ref={measure}
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] flex flex-col gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2"
      >
        <div className="flex items-center justify-end gap-2">
          {!searching && (
            <button type="button" aria-label="Меню" className={`${iconButton} mr-auto`} onClick={() => setSidebarOpen(true)}>
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
          )}
          {searching ? (
            <div className="pointer-events-auto flex flex-1 items-center gap-2 rounded-full border border-stone-200 bg-white py-1 pr-1 pl-4 shadow-sm">
              <input
                autoFocus
                value={filters.text}
                placeholder="Текст содержит…"
                onChange={(e) => set({ text: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && setSearching(false)}
                className="min-w-0 flex-1 py-1.5 outline-none"
              />
              <button
                type="button"
                aria-label="Закрыть поиск"
                className="flex size-8 items-center justify-center rounded-full text-stone-400"
                onClick={() => setSearching(false)}
              >
                ✕
              </button>
            </div>
          ) : (
            <button type="button" aria-label="Поиск" className={iconButton} onClick={() => setSearching(true)}>
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>
          )}
          <button type="button" aria-label="Фильтры" className={`${iconButton} relative`} onClick={() => setSheetOpen(true)}>
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            {isFiltered(filters) && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-orange-600" />}
          </button>
        </div>

        <FilterChips chips={chips} />
      </div>

      {sheetOpen && <FilterSheet onClose={() => setSheetOpen(false)} />}
      {sidebarOpen && <Sidebar onOpenGallery={() => setGalleryOpen(true)} onClose={() => setSidebarOpen(false)} />}
      {galleryOpen && <Gallery onClose={() => setGalleryOpen(false)} />}
    </>
  )
}
