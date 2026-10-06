export type AccountStatus =
  'ready' | 'working' | 'waiting' | 'error' | 'offline'
export type Mode = 'comments' | 'reactions' | 'subscriptions' | 'scenario'
export type Page = 'accounts' | 'tasks' | 'activity'
export type CheckKind = 'session' | 'spam' | 'all'
export interface CheckProgress {
  done: number
  total: number
  current: string
  kind: CheckKind
  stopping: boolean
}
export interface Account {
  id: string
  name: string
  firstName?: string
  lastName?: string
  bio?: string
  avatarUrl?: string | null
  error?: string
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
  sessionStatus: 'unchecked' | 'valid' | 'invalid' | 'error'
  sessionCheckedAt: string | null
  sessionError: string
  spamStatus: 'unchecked' | 'clear' | 'restricted' | 'unknown' | 'error'
  spamCheckedAt: string | null
  spamDetail: string
  checkRetryAt: string | null
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

export interface Workspace {
  accounts: Account[]
  tasks: Task[]
  events: Activity[]
  warmups: WarmupJob[]
  warmupWorkerOnline: boolean
}
export interface WarmupJob {
  id: string
  status: 'running' | 'completed' | 'cancelled' | 'failed'
  startedAt: string
  endsAt: string
  error: string
  sent: number
  failures: number
  progress: number
  participants: {
    accountId: string
    name: string
    sent: number
    failures: number
    error: string
    nextMessageAt: string | null
  }[]
}
export interface AccountFields {
  name: string
  username: string
  phone: string
  proxy?: string
  group: string
}
export interface TaskFields {
  name: string
  accountIds: string[]
}
export interface Preferences {
  compact: boolean
  showActivity: boolean
}
export type ConfigSection = 'mode' | 'text' | 'targets'

export interface ProfileFields {
  firstName: string
  lastName: string
  username: string
  bio: string
}
export interface SessionStatus {
  authenticated: boolean
  username: string | null
  telegramConfigured: boolean
}
