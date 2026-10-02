import { Drawer, Notice, SettingRow } from '../UI'
import type { Preferences } from '../../types'
interface Props {
  open: boolean
  preferences: Preferences
  onClose: () => void
  onChange: (patch: Partial<Preferences>) => void
}
export default function SettingsDrawer({
  open,
  preferences,
  onClose,
  onChange,
}: Props) {
  return (
    <Drawer title="Настройки пространства" open={open} onClose={onClose}>
      <p className="drawer-description">
        Настрой панель под свой рабочий процесс.
      </p>
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
      <Notice
        className="mt-6"
        title="Локальное пространство"
        description="Аккаунты, конфигурация, задачи и настройки сохраняются в этом браузере. Для работы с Telegram потребуется серверная часть."
      />
      <div className="settings-info">
        <span>Версия панели</span>
        <strong>0.1.0</strong>
      </div>
    </Drawer>
  )
}
