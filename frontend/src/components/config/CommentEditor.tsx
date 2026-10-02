import { Field, TextArea } from '../UI'
export default function CommentEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Field
      label="Текст комментария"
      htmlFor="comment"
      help="Текст для сообщений в чатах и комментариев под постами."
    >
      <TextArea
        id="comment"
        rows={6}
        maxLength={4096}
        showCount
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Напиши текст комментария…"
      />
    </Field>
  )
}
