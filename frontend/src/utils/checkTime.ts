export const checkedAt = (value: string | null) => value
  ? new Date(value).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : 'Ещё не проверено'
