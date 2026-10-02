export class ApiError extends Error {
  status: number
  constructor(message: string, status = 0) {
    super(message)
    this.status = status
  }
}
let csrfToken = ''
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const form = options.body instanceof FormData
  let response: Response
  try {
    response = await fetch('/api/' + path, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      signal: options.signal,
      headers: {
        ...(form ? {} : { 'Content-Type': 'application/json' }),
        ...(csrfToken ? { 'X-CSRFToken': csrfToken } : {}),
      },
      body:
        options.body === undefined
          ? undefined
          : form
            ? (options.body as FormData)
            : JSON.stringify(options.body),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw error
    throw new ApiError('Сервер недоступен. Запусти Django backend и повтори.')
  }
  const data = await response.json().catch(() => ({
    error: 'Сервер вернул неожиданный ответ. Проверь Django backend.',
  }))
  if (!response.ok)
    throw new ApiError(
      data.error ?? 'Не удалось выполнить запрос.',
      response.status,
    )
  if (data.csrfToken) csrfToken = data.csrfToken
  return data as T
}
