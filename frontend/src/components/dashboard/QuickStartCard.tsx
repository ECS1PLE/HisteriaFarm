import { ArrowRightOutlined } from '@ant-design/icons'
import { Button, Panel } from '../UI'
import OrbitIllustration from './OrbitIllustration'
export default function QuickStartCard({ onCreate }: { onCreate: () => void }) {
  return (
    <Panel className="quick-start">
      <div className="quick-start-copy">
        <span className="eyebrow">СЛЕДУЮЩИЙ ШАГ</span>
        <h2>От идеи — к действию</h2>
        <p>
          Выбери аккаунты и настрой режим.
          <br />
          Остальное — в одной задаче.
        </p>
        <Button type="text" onClick={onCreate}>
          Создать первую задачу <ArrowRightOutlined aria-hidden="true" />
        </Button>
      </div>
      <OrbitIllustration />
    </Panel>
  )
}
