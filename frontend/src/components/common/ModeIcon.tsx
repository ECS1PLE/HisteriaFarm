import {
  CommentOutlined,
  HeartOutlined,
  RobotOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import type { Mode } from '../../types'
const icons = {
  comments: CommentOutlined,
  reactions: HeartOutlined,
  subscriptions: UserAddOutlined,
  scenario: RobotOutlined,
}
export default function ModeIcon({ mode }: { mode: Mode }) {
  const Icon = icons[mode]
  return <Icon aria-hidden="true" />
}
