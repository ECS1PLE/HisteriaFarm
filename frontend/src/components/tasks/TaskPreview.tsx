import type { TaskConfig } from '../../types'
export default function TaskPreview({ config }: { config: TaskConfig }) {
  if (config.mode === 'subscriptions') return null
  return (
    <div className="comment-preview">
      {config.mode === 'comments' && (
        <>
          <span>ТЕКСТ КОММЕНТАРИЯ</span>
          <p>{config.comment}</p>
        </>
      )}
      {config.mode === 'reactions' && (
        <>
          Реакция: <span className="preview-emoji">{config.reaction}</span>
        </>
      )}
      {config.mode === 'scenario' && (
        <>
          <span>{config.bot}</span>
          {config.steps.map((step, index) => (
            <p key={index}>
              {index + 1}. {step}
            </p>
          ))}
        </>
      )}
    </div>
  )
}
