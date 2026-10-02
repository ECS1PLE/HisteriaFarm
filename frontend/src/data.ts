import type { AccountStatus, Mode, TaskConfig } from './types'
export const statusLabels: Record<AccountStatus, string> = {
  ready: 'Готов к работе',
  working: 'Выполняет задачу',
  waiting: 'Ожидание',
  error: 'Ошибка',
  offline: 'Не в сети',
}
export const modeLabels: Record<Mode, string> = {
  comments: 'Комментарии',
  reactions: 'Реакции',
  subscriptions: 'Подписки',
  scenario: 'Сценарии',
}
export const groups = ['Основная', 'Резерв', 'Тестовая']
export const defaultConfig: TaskConfig = {
  mode: 'comments',
  comment: '',
  targets: [],
  reaction: '👍',
  bot: '',
  steps: ['Отправить /start', 'Открыть Mini App'],
  interval: 5,
}
