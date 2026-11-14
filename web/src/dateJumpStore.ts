import { create } from 'zustand'

// Шторку прыжка по дате открывают и верхняя панель, и разделители дней в ленте
export const useDateJump = create<{ open: boolean }>(() => ({ open: false }))
