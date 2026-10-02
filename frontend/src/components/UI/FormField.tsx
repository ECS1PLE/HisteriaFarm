import { Form } from 'antd'
import type { FormItemProps } from 'antd'
export default function FormField(props: FormItemProps) {
  return <Form.Item {...props} />
}
