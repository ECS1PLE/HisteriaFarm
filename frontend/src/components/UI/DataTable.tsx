import { Table } from 'antd'
import type { TableProps } from 'antd'
export default function DataTable<Row extends object>(props: TableProps<Row>) {
  return <Table<Row> {...props} />
}
