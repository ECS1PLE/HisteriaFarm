import { Alert } from 'antd'
import type { AlertProps } from 'antd'
export default function Notice(props: AlertProps) {
  return <Alert type="info" showIcon {...props} />
}
