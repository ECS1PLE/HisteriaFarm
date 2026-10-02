import { ClockCircleOutlined } from '@ant-design/icons'
import { Badge } from '../UI'
export default function PageFooter() {
  return (
    <footer className="page-footer">
      <span>
        histeria<span> workspace</span> <Badge variant="version">v0.1</Badge>
      </span>
      <span>
        <ClockCircleOutlined aria-hidden="true" /> Локальное пространство ·
        Демо-данные
      </span>
    </footer>
  )
}
