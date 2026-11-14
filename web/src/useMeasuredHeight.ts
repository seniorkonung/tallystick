import { useCallback } from 'react'

// Записывает высоту элемента в CSS-переменную: лента по ней отступает от плавающих панелей
export function useMeasuredHeight(variable: string) {
  return useCallback(
    (el: HTMLElement | null) => {
      if (!el) return
      const observer = new ResizeObserver(() => {
        document.documentElement.style.setProperty(variable, `${el.offsetHeight}px`)
      })
      observer.observe(el)
      return () => {
        observer.disconnect()
        document.documentElement.style.setProperty(variable, '0px')
      }
    },
    [variable],
  )
}
