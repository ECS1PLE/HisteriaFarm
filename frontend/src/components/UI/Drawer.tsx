import { Drawer as AntDrawer } from 'antd'
import type { DrawerProps } from 'antd'
export default function Drawer(props: DrawerProps) {
  return <AntDrawer size={420} {...props} />
}
