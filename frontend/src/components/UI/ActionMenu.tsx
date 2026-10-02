import { Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import { EllipsisOutlined } from '@ant-design/icons'
import IconButton from './IconButton'
export default function ActionMenu({
  label,
  items,
}: {
  label: string
  items: MenuProps['items']
}) {
  return (
    <Dropdown trigger={['click']} menu={{ items }}>
      <IconButton
        type="text"
        label={label}
        icon={<EllipsisOutlined aria-hidden="true" />}
      />
    </Dropdown>
  )
}
