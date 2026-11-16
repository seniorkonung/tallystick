import { pluralRu } from './plural'

// Относительные даты: сдвиг на N единиц от текущей. Дни, недели, месяцы и годы календарные — граница
// приходится на начало единицы, неделя начинается с понедельника. Часы скользящие — от текущей минуты
export type Unit = 'hour' | 'day' | 'week' | 'month' | 'year'

export const units: Unit[] = ['hour', 'day', 'week', 'month', 'year']

const unitForms: Record<Unit, [string, string, string]> = {
  hour: ['час', 'часа', 'часов'],
  day: ['день', 'дня', 'дней'],
  week: ['неделя', 'недели', 'недель'],
  month: ['месяц', 'месяца', 'месяцев'],
  year: ['год', 'года', 'лет'],
}

export const unitName = (amount: number, unit: Unit) => pluralRu(Math.abs(amount), unitForms[unit])

// «Последние N единиц», включая текущую: последние 3 месяца — этот и два прошлых
export type Last = { amount: number; unit: Unit }

// Граница условия по полю-дате: сдвиг со знаком от текущей единицы; 0 — сегодня, эта неделя и т. д.
export type RelBound = { amount: number; unit: Unit }

const hour = 60 * 60 * 1000

function unitStart(unit: Unit, shift: number, now = new Date()) {
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
  switch (unit) {
    case 'hour':
      return now.getTime() + shift * hour
    case 'day':
      return new Date(y, m, d + shift).getTime()
    case 'week':
      return new Date(y, m, d - ((now.getDay() + 6) % 7) + shift * 7).getTime()
    case 'month':
      return new Date(y, m + shift, 1).getTime()
    case 'year':
      return new Date(y + shift, 0, 1).getTime()
  }
}

export function lastStart(last: Last) {
  return last.unit === 'hour' ? Date.now() - last.amount * hour : unitStart(last.unit, 1 - last.amount)
}

// Начало и конец (не включая) единицы со сдвигом; у часа это один момент
export function relStart(b: RelBound) {
  return unitStart(b.unit, b.amount)
}

export function relEnd(b: RelBound) {
  return b.unit === 'hour' ? relStart(b) : unitStart(b.unit, b.amount + 1)
}

const current: Record<Unit, string> = { hour: 'сейчас', day: 'сегодня', week: 'эта неделя', month: 'этот месяц', year: 'этот год' }

export function lastText(last: Last) {
  if (last.amount === 1) return last.unit === 'hour' ? 'Последний час' : current[last.unit][0].toUpperCase() + current[last.unit].slice(1)
  return `Последние ${last.amount} ${unitName(last.amount, last.unit)}`
}

export function relText(b: RelBound) {
  if (b.amount === 0) return current[b.unit]
  if (b.unit === 'day' && Math.abs(b.amount) === 1) return b.amount < 0 ? 'вчера' : 'завтра'
  return `${b.amount < 0 ? '−' : '+'}${Math.abs(b.amount)} ${unitName(b.amount, b.unit)}`
}

const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
const dayWithYearFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
const timeFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

// Во что граница превращается сейчас — подсказка под полями ввода
export function momentText(time: number, withTime: boolean) {
  if (withTime) return timeFormat.format(time)
  return (new Date(time).getFullYear() === new Date().getFullYear() ? dayFormat : dayWithYearFormat).format(time)
}
