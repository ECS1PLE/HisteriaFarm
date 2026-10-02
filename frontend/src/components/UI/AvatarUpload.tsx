import { useRef } from 'react'
import { PictureOutlined } from '@ant-design/icons'
import Avatar from './Avatar'
import Button from './Button'
interface Props {
  src?: string | null
  name: string
  disabled?: boolean
  onChange: (file: File, preview: string) => void
  onError: (message: string) => void
}
export default function AvatarUpload({
  src,
  name,
  disabled,
  onChange,
  onError,
}: Props) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="avatar-upload">
      <Avatar size={76} src={src || undefined} name={name} color="#91b99a" />
      <div>
        <Button
          icon={<PictureOutlined aria-hidden="true" />}
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          Загрузить фото
        </Button>
        <p className="field-help">PNG, JPEG или WebP · до 5 МБ</p>
      </div>
      <input
        ref={input}
        aria-label="Файл аватарки"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          if (
            !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
            file.size > 5 * 1024 * 1024
          ) {
            onError('Нужна PNG, JPEG или WebP до 5 МБ.')
            return
          }
          const reader = new FileReader()
          reader.onload = () => onChange(file, String(reader.result))
          reader.onerror = () => onError('Не удалось прочитать изображение.')
          reader.readAsDataURL(file)
        }}
      />
    </div>
  )
}
