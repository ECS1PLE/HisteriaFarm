import { ClockCircleOutlined } from '@ant-design/icons'
import { Badge } from '../UI'
export default function PageFooter() {
  return (
    <footer className="page-footer">
      <span>
        histeria<span> workspace</span> <Badge variant="version">v0.2</Badge>
      </span>
      <span>
        <ClockCircleOutlined aria-hidden="true" /> Серверное пространство
      </span>
    </footer>
  )
}
