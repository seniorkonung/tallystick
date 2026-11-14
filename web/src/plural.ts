const rules = new Intl.PluralRules('ru-RU')

// pluralRu(5, ['запись', 'записи', 'записей']) → 'записей'
export function pluralRu(count: number, [one, few, many]: [string, string, string]) {
  switch (rules.select(count)) {
    case 'one':
      return one
    case 'few':
      return few
    default:
      return many
  }
}
