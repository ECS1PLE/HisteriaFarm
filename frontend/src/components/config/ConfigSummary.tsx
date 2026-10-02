import { ConnectionDot } from '../UI'
import { modeLabels } from '../../data'
import type { Mode } from '../../types'
export default function ConfigSummary({ mode }: { mode: Mode }) {
  return (
    <div className="config-summary">
      <ConnectionDot /> Текущий режим: {modeLabels[mode]}
    </div>
  )
}
