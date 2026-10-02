import { ConnectionDot } from '../UI'
export default function AccountTableCaption() {
  return (
    <div className="table-caption">
      <span>
        <ConnectionDot /> Статус подтверждается проверкой Telegram
      </span>
      <span>Выбранные аккаунты можно обновить одной кнопкой</span>
    </div>
  )
}
