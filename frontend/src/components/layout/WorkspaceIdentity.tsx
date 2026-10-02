import { AppstoreOutlined } from '@ant-design/icons'
export default function WorkspaceIdentity() {
  return (
    <div className="workspace">
      <span className="workspace-symbol">
        <AppstoreOutlined aria-hidden="true" />
      </span>
      <div>
        Моя ферма<small>Личное пространство</small>
      </div>
      <span className="workspace-chevron">⌄</span>
    </div>
  )
}
