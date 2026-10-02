import {
  ArrowUpOutlined,
  CheckCircleOutlined,
  ThunderboltFilled,
} from '@ant-design/icons'
export default function SidebarPromo() {
  return (
    <div className="demo-card">
      <span className="demo-icon">
        <ThunderboltFilled aria-hidden="true" />
      </span>
      <strong>Всё под контролем</strong>
      <p>
        Аккаунты, задачи и сценарии
        <br />в одном пространстве.
      </p>
      <span className="demo-card-label">
        <CheckCircleOutlined aria-hidden="true" /> Демо-режим
      </span>
      <ArrowUpOutlined aria-hidden="true" className="demo-decoration" />
    </div>
  )
}
