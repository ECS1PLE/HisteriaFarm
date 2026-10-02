import { Button, Drawer, Notice, SettingRow } from '../UI'
import TelegramSettingsForm from './TelegramSettingsForm'
import type { Preferences, SessionStatus } from '../../types'
interface Props {
  open: boolean
  preferences: Preferences
  session: SessionStatus | null
  onClose: () => void
  onChange: (patch: Partial<Preferences>) => void
  onConnected: () => Promise<void>
  onLogout: () => void
}
export default function SettingsDrawer({
  open,
  preferences,
  session,
  onClose,
  onChange,
  onConnected,
  onLogout,
}: Props) {
  return (
    <Drawer
      title="Настройки пространства"
      open={open}
      onClose={onClose}
      destroyOnHidden
    >
      <SettingRow
        label="Компактная таблица"
        description="Больше аккаунтов на одном экране"
        checked={preferences.compact}
        onChange={(compact) => onChange({ compact })}
      />
      <SettingRow
        label="Последние события"
        description="Показывать журнал под таблицей"
        checked={preferences.showActivity}
        onChange={(showActivity) => onChange({ showActivity })}
      />
      <TelegramSettingsForm
        configured={session?.telegramConfigured ?? false}
        onSaved={onConnected}
      />
      <Notice
        className="mt-6"
        title="Серверное пространство"
        description="Аккаунты и журнал хранятся в Django. Настройки внешнего вида и черновик режима — в браузере."
      />
      <div className="settings-info">
        <span>Пользователь</span>
        <strong>{session?.username}</strong>
      </div>
      <Button block onClick={onLogout}>
        Выйти из панели
      </Button>
    </Drawer>
  )
}
