export type AccountStatus =
  'ready' | 'working' | 'waiting' | 'error' | 'offline'
export type Mode = 'comments' | 'reactions' | 'subscriptions' | 'scenario'
export type Page = 'accounts' | 'tasks' | 'activity'
export interface Account {
  id: string
  name: string
  username: string
  phone: string
  group: string
  status: AccountStatus
  proxy: string
  country: string
  color: string
  premium: boolean
  completed: number
  lastActive: string
}
export interface TaskConfig {
  mode: Mode
  comment: string
  targets: string[]
  reaction: string
  bot: string
  steps: string[]
  interval: number
}
export interface Task {
  id: string
  name: string
  mode: Mode
  accountIds: string[]
  config: TaskConfig
  progress: number
  status: 'running' | 'paused' | 'completed' | 'cancelled'
  createdAt: string
}
export interface Activity {
  id: string
  title: string
  detail: string
  time: string
  type: 'success' | 'info' | 'warning'
}
