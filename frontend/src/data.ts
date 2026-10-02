import type {
  Account,
  AccountStatus,
  Activity,
  Mode,
  TaskConfig,
} from './types'
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
const people = [
  ['Александр Волков', 'alex_volkov', '#88b7a8'],
  ['Мария Соколова', 'maria.sokol', '#c49b8b'],
  ['Дмитрий Козлов', 'dmitry.k', '#95a4cb'],
  ['Анна Морозова', 'anna_moroz', '#b39fca'],
  ['Максим Лебедев', 'max.lebedev', '#91b99a'],
  ['Екатерина Орлова', 'katya.orlova', '#c7a375'],
  ['Артём Попов', 'artem.popov', '#94afc4'],
  ['Полина Смирнова', 'polina.sm', '#c19db6'],
  ['Иван Петров', 'ivan.petrov', '#bbb889'],
  ['София Белова', 'sofia.bel', '#95b9b9'],
  ['Никита Васильев', 'nikita.v', '#a998ca'],
  ['Дарья Павлова', 'dasha.pav', '#c9a58b'],
  ['Михаил Новиков', 'misha.nov', '#96b897'],
  ['Алиса Фёдорова', 'alice.fed', '#b698ad'],
  ['Кирилл Крылов', 'kirill.k', '#93b5ca'],
  ['Виктория Зайцева', 'vika.z', '#c4b785'],
] as const
export const initialAccounts: Account[] = people.map(
  ([name, username, color], i) => ({
    id: `acc-${i + 1}`,
    name,
    username,
    color,
    phone: `+7 (9${i % 2 ? '16' : '99'}) ${245 + i * 31}-${10 + i}-${42 + i * 3}`,
    group: i > 11 ? 'Тестовая' : i > 8 ? 'Резерв' : 'Основная',
    status:
      i === 5 || i === 13
        ? 'waiting'
        : i === 7
          ? 'error'
          : i === 10
            ? 'offline'
            : 'ready',
    proxy: `185.24.${42 + i}.108:${8000 + i}`,
    country: i > 11 ? 'DE' : 'RU',
    premium: [0, 2, 4, 8].includes(i),
    completed: 24 + i * 13,
    lastActive:
      i === 10
        ? '2 часа назад'
        : i === 7
          ? '18 минут назад'
          : `${i + 1} мин. назад`,
  }),
)
export const defaultConfig: TaskConfig = {
  mode: 'comments',
  comment: 'Спасибо за полезный пост! Интересно узнать больше об этом проекте.',
  targets: [
    'https://t.me/histeria_demo/128',
    'https://t.me/histeria_test_chat',
  ],
  reaction: '👍',
  bot: '@histeria_demo_bot',
  steps: ['Отправить /start', 'Открыть Mini App', 'Выполнить действие'],
  interval: 5,
}
export const initialActivity: Activity[] = [
  {
    id: 'event-1',
    title: 'Панель готова к работе',
    detail: 'Загружены 16 демонстрационных аккаунтов',
    time: 'При открытии',
    type: 'success',
  },
  {
    id: 'event-2',
    title: 'Требуется внимание',
    detail: 'Полина Смирнова · ошибка подключения прокси',
    time: 'Демо',
    type: 'warning',
  },
  {
    id: 'event-3',
    title: 'Конфигурация сохранена',
    detail: 'Комментарии · 2 тестовые площадки',
    time: 'Демо',
    type: 'info',
  },
]
