import type { ProfileFields } from '../types'
const names = [
  ['Алексей', 'alex'],
  ['Арина', 'arina'],
  ['Марк', 'mark'],
  ['Вера', 'vera'],
  ['Егор', 'egor'],
  ['Алиса', 'alisa'],
  ['Лев', 'lev'],
  ['Ника', 'nika'],
] as const
const bios = [
  'Коллекционирую идеи и хорошие моменты.',
  'Музыка, прогулки и немного вдохновения.',
  'Люблю узнавать новое каждый день.',
  'Маленькие шаги к большим планам.',
  'Книги, кофе и интересные разговоры.',
  'В поиске новых впечатлений.',
]
const colors = [
  '#98d877',
  '#8fb3ed',
  '#cc93d8',
  '#eda987',
  '#87d6cf',
  '#e5cf83',
]
function random(max: number) {
  return crypto.getRandomValues(new Uint32Array(1))[0] % max
}
export function randomName() {
  return names[random(names.length)][0]
}
export function randomBio() {
  return bios[random(bios.length)]
}
export function randomUsername() {
  const prefix = names[random(names.length)][1]
  return (
    prefix +
    '_' +
    Array.from(crypto.getRandomValues(new Uint8Array(5)), (n) =>
      n.toString(16).padStart(2, '0'),
    ).join('')
  )
}
export function randomFields(): ProfileFields {
  return {
    firstName: randomName(),
    lastName: '',
    username: randomUsername(),
    bio: randomBio(),
  }
}
export async function randomAvatar(): Promise<{ file: File; preview: string }> {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 640
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Браузер не поддерживает генерацию изображений.')
  const hue = random(360)
  const gradient = ctx.createLinearGradient(0, 0, 640, 640)
  gradient.addColorStop(0, `hsl(${hue} 35% 18%)`)
  gradient.addColorStop(1, `hsl(${(hue + 60) % 360} 35% 35%)`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 640, 640)
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = colors[random(colors.length)]
    ctx.globalAlpha = 0.3 + random(60) / 100
    ctx.save()
    ctx.translate(70 + random(500), 70 + random(500))
    ctx.rotate(random(314) / 100)
    if (random(2)) {
      ctx.beginPath()
      ctx.arc(0, 0, 35 + random(100), 0, Math.PI * 2)
      ctx.fill()
    } else ctx.fillRect(-60, -60, 65 + random(150), 65 + random(150))
    ctx.restore()
  }
  ctx.globalAlpha = 1
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error('Не удалось создать аватарку.')),
      'image/jpeg',
      0.9,
    ),
  )
  return {
    file: new File([blob], 'avatar.jpg', { type: 'image/jpeg' }),
    preview: canvas.toDataURL('image/jpeg', 0.9),
  }
}
