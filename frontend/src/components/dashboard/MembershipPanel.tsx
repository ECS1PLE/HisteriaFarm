import { Tag } from 'antd'
import { Notice, Panel } from '../UI'
import type { Membership } from '../../types'

export default function MembershipPanel({ membership }: { membership: Membership }) {
  const premium = membership.plan === 'Premium'
  return <Panel className="membership-panel">
    <div className="membership-heading"><strong>Твой тариф <Tag color={premium ? 'gold' : 'green'}>{membership.plan}</Tag></strong>
      <span>Premium · {membership.priceRub} ₽ / 30 дней</span></div>
    <p className="muted-text">{premium
      ? `Доступны все сессии панели и добавление своих. Premium действует до ${new Date(membership.premiumUntil!).toLocaleString('ru-RU')}.`
      : 'Все функции доступны на своих аккаунтах. Premium открывает доступ ко всем сессиям панели.'}</p>
    {!premium && <Notice title="Активация Premium" description="Для подключения обратись к администратору сервиса. Premium активируется после подтверждения оплаты 100 ₽." />}
    <p className="field-help">Добавленные сессии доступны пользователям Premium. Удалить сессию из панели может её владелец.</p>
  </Panel>
}
