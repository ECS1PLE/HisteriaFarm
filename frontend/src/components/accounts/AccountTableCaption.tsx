import { ConnectionDot } from '../UI'
export default function AccountTableCaption() {
  return (
    <div className="table-caption">
      <span>
        <ConnectionDot /> Статусы обновляются в демо-режиме
      </span>
      <span>Выбор доступен для готовых аккаунтов</span>
    </div>
  )
}
