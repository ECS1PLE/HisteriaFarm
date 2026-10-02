import { Modal as AntModal } from 'antd'
import type { ModalProps } from 'antd'
export default function Modal(props: ModalProps) {
  return <AntModal cancelText="Отмена" {...props} okButtonProps={{
    'aria-label': typeof props.okText === 'string' ? props.okText : undefined,
    ...props.okButtonProps,
  }} />
}
