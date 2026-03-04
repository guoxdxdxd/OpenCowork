import type { ProviderConfig } from './types'

export interface Base64ImageInput {
  dataUrl: string
  mediaType?: string
}

interface OpenAiImageResponseItem {
  b64_json?: string
  url?: string
  revised_prompt?: string
}

export interface GeneratedImage {
  sourceType: 'base64' | 'url'
  data: string
  mediaType: string
}

function getBaseUrl(config: ProviderConfig): string {
  return (config.baseUrl || 'https://api.openai.com/v1').trim().replace(/\/+$/, '')
}

function ensureApiKey(config: ProviderConfig): void {
  if (!config.apiKey) {
    throw new Error('Missing API key for OpenAI image request')
  }
}

function dataUrlToBlob(input: Base64ImageInput): Blob {
  const [header, data] = input.dataUrl.split(',')
  if (!data) {
    throw new Error('Invalid data URL for image attachment')
  }
  const mimeMatch = /data:(.*?);base64/.exec(header)
  const mediaType = input.mediaType || mimeMatch?.[1] || 'application/octet-stream'
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mediaType })
}

function normalizeImageResults(items: OpenAiImageResponseItem[]): GeneratedImage[] {
  return items
    .map((item) => {
      if (item.b64_json) {
        // Detect media type from base64 data (first few bytes)
        let mediaType = 'image/png'
        try {
          const header = item.b64_json.substring(0, 20)
          const binary = atob(header)
          // PNG signature: 89 50 4E 47
          if (binary.charCodeAt(0) === 0x89 && binary.charCodeAt(1) === 0x50) {
            mediaType = 'image/png'
          }
          // JPEG signature: FF D8 FF
          else if (binary.charCodeAt(0) === 0xFF && binary.charCodeAt(1) === 0xD8) {
            mediaType = 'image/jpeg'
          }
          // WebP signature: RIFF....WEBP
          else if (binary.substring(0, 4) === 'RIFF' && binary.substring(8, 12) === 'WEBP') {
            mediaType = 'image/webp'
          }
        } catch (e) {
          console.warn('[OpenAI Images] Failed to detect image type, defaulting to PNG:', e)
        }
        return { sourceType: 'base64', data: item.b64_json, mediaType }
      }
      if (item.url) {
        return { sourceType: 'url', data: item.url, mediaType: 'url' }
      }
      return null
    })
    .filter((item): item is GeneratedImage => Boolean(item))
}

export async function generateImagesFromText(params: {
  config: ProviderConfig
  prompt: string
  size?: string
  quality?: 'standard' | 'hd'
  signal?: AbortSignal
}): Promise<GeneratedImage[]> {
  const { config, prompt, signal } = params
  ensureApiKey(config)
  const url = `${getBaseUrl(config)}/images/generations`
  const body: Record<string, unknown> = {
    model: config.model,
    prompt,
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      ...(config.organization ? { 'OpenAI-Organization': config.organization } : {}),
      ...(config.project ? { 'OpenAI-Project': config.project } : {}),
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    let errorMessage = `Image generation failed: ${response.status}`
    try {
      const errorData = await response.json()
      if (errorData.error?.message) {
        errorMessage = errorData.error.message
      } else if (errorData.message) {
        errorMessage = errorData.message
      } else {
        errorMessage = JSON.stringify(errorData)
      }
    } catch {
      const errorText = await response.text().catch(() => 'Unknown error')
      errorMessage = errorText
    }
    console.error('[OpenAI Images] Generation failed:', errorMessage)
    throw new Error(errorMessage)
  }

  const data = (await response.json()) as { data?: OpenAiImageResponseItem[] }
  const items = data.data ?? []
  if (items.length === 0) {
    throw new Error('Image generation returned no results')
  }

  console.log('[OpenAI Images] Generation response:', items)
  return normalizeImageResults(items)
}

export async function editImageWithPrompt(params: {
  config: ProviderConfig
  prompt: string
  image: Base64ImageInput
  size?: string
  signal?: AbortSignal
}): Promise<GeneratedImage[]> {
  const { config, prompt, image, signal } = params
  ensureApiKey(config)
  const url = `${getBaseUrl(config)}/images/edits`

  const formData = new FormData()
  formData.append('model', config.model)
  formData.append('prompt', prompt)
  formData.append('image', dataUrlToBlob(image), 'image.png')

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      ...(config.organization ? { 'OpenAI-Organization': config.organization } : {}),
      ...(config.project ? { 'OpenAI-Project': config.project } : {}),
    },
    body: formData,
    signal,
  })

  if (!response.ok) {
    let errorMessage = `Image edit failed: ${response.status}`
    try {
      const errorData = await response.json()
      if (errorData.error?.message) {
        errorMessage = errorData.error.message
      } else if (errorData.message) {
        errorMessage = errorData.message
      } else {
        errorMessage = JSON.stringify(errorData)
      }
    } catch {
      const errorText = await response.text().catch(() => 'Unknown error')
      errorMessage = errorText
    }
    console.error('[OpenAI Images] Edit failed:', errorMessage)
    throw new Error(errorMessage)
  }

  const data = (await response.json()) as { data?: OpenAiImageResponseItem[] }
  const items = data.data ?? []
  if (items.length === 0) {
    throw new Error('Image edit returned no results')
  }

  console.log('[OpenAI Images] Edit response:', items)
  return normalizeImageResults(items)
}
