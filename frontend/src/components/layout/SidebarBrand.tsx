import { ThunderboltFilled } from '@ant-design/icons'
export default function SidebarBrand({ onClick }: { onClick: () => void }) {
  return (
    <a
      className="brand"
      href="#"
      onClick={(e) => {
        e.preventDefault()
        onClick()
      }}
    >
      <span className="brand-icon">
        <ThunderboltFilled aria-hidden="true" />
      </span>
      <span>
        histeria<span className="brand-dot">.</span>
        <small>ACCOUNT WORKSPACE</small>
      </span>
    </a>
  )
}
