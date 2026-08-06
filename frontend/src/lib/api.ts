import type {
  FullReferenceMetrics,
  NoReferenceMetrics,
  ProcessInputType,
  ProcessStage,
  ProcessedResult,
  ResultSourceImage,
  SyntheticEffect,
  WeatherCapabilities,
} from '#/types/app'
import { isFadeMetricApplicable } from '#/types/app'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

interface ProcessImageOptions {
  rootImageId?: string
  stage?: ProcessStage
  inputType?: ProcessInputType
  parentResultId?: string
  sourceImage?: ResultSourceImage
}

interface SyntheticWeatherOptions {
  sourceImage?: ResultSourceImage
}

function createSourceImage(
  file: File,
  imageId: string,
  sourceImage?: ResultSourceImage,
): ResultSourceImage {
  return (
    sourceImage ?? {
      id: imageId,
      url: URL.createObjectURL(file),
      name: file.name,
      size: file.size,
    }
  )
}

export async function processImage(
  file: File,
  algorithmId: string,
  imageId: string,
  batchId: string,
  options?: ProcessImageOptions,
): Promise<ProcessedResult> {
  try {
    const formData = new FormData()
    formData.append('image', file)
    formData.append('algorithm', algorithmId)

    const res = await fetch(`${API_BASE}/api/process`, {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) throw new Error('Sunucu hatası')

    const blob = await res.blob()
    return {
      id: crypto.randomUUID(),
      batchId,
      imageId,
      rootImageId: options?.rootImageId ?? imageId,
      algorithmId,
      outputUrl: URL.createObjectURL(blob),
      sourceImage: createSourceImage(file, imageId, options?.sourceImage),
      createdAt: Date.now(),
      source: 'restore',
      stage: options?.stage ?? 'restored',
      inputType: options?.inputType ?? 'uploaded-image',
      parentResultId: options?.parentResultId,
    }
  } catch {
    return mockProcess(file, algorithmId, imageId, batchId, options)
  }
}

async function mockProcess(
  file: File,
  algorithmId: string,
  imageId: string,
  batchId: string,
  options?: ProcessImageOptions,
): Promise<ProcessedResult> {
  await new Promise((r) => setTimeout(r, 1500))
  return {
    id: crypto.randomUUID(),
    batchId,
    imageId,
    rootImageId: options?.rootImageId ?? imageId,
    algorithmId,
    outputUrl: URL.createObjectURL(file),
    sourceImage: createSourceImage(file, imageId, options?.sourceImage),
    createdAt: Date.now(),
    source: 'restore',
    stage: options?.stage ?? 'restored',
    inputType: options?.inputType ?? 'uploaded-image',
    parentResultId: options?.parentResultId,
  }
}

export async function fetchCapabilities(): Promise<WeatherCapabilities> {
  try {
    const res = await fetch(`${API_BASE}/api/capabilities`)
    if (!res.ok) throw new Error('Sunucu hatası')
    return res.json()
  } catch {
    return {
      fog: {
        available: false,
        reason:
          'Sis özelliğinin kullanılabilirlik bilgisi alınamadı. Sunucu yeni açıldıysa sayfayı yenileyin veya Sentetik Hava sekmesine yeniden geçin.',
      },
      rain: {
        available: true,
        reason: null,
      },
    }
  }
}

export async function synthesizeWeather(
  file: File,
  effect: SyntheticEffect,
  intensity: number,
  imageId: string,
  batchId: string,
  options?: SyntheticWeatherOptions,
): Promise<ProcessedResult> {
  const formData = new FormData()
  formData.append('image', file)
  formData.append('effect', effect)
  formData.append('intensity', intensity.toString())

  const res = await fetch(`${API_BASE}/api/synthesize/weather`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const message = await res.text()
    throw new Error(message || 'Sentetik hava hizmeti hatası')
  }

  const blob = await res.blob()
  const label = `${effect === 'fog' ? 'Sis' : 'Yağmur'} ${Math.round(intensity)}%`
  return {
    id: crypto.randomUUID(),
    batchId,
    imageId,
    rootImageId: imageId,
    algorithmId: effect,
    outputUrl: URL.createObjectURL(blob),
    sourceImage: createSourceImage(file, imageId, options?.sourceImage),
    createdAt: Date.now(),
    source: 'synthetic',
    stage: 'synthetic',
    inputType: 'uploaded-image',
    effect,
    intensity,
    label,
  }
}

export async function calculateNoReferenceMetrics(
  result: ProcessedResult,
): Promise<NoReferenceMetrics> {
  const image = await resultToFile(result, `${result.id}.png`)
  const formData = new FormData()
  formData.append('image', image)
  formData.append('include_fade', String(isFadeMetricApplicable(result)))

  const res = await fetch(`${API_BASE}/api/metrics/no-reference`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const message = await res.text()
    throw new Error(message || 'Referanssız metrikler hesaplanamadı')
  }

  return res.json()
}

export async function calculateFullReferenceMetrics(
  result: ProcessedResult,
  referenceFile: File,
): Promise<FullReferenceMetrics> {
  const output = await resultToFile(result, `${result.id}.png`)
  const formData = new FormData()
  formData.append('reference', referenceFile)
  formData.append('output', output)

  const res = await fetch(`${API_BASE}/api/metrics/full-reference`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const message = await res.text()
    throw new Error(message || 'Referanslı metrikler hesaplanamadı')
  }

  return res.json()
}

export async function resultToFile(
  result: ProcessedResult,
  filename?: string,
): Promise<File> {
  const response = await fetch(result.outputUrl)
  const blob = await response.blob()
  const extension = blob.type === 'image/png' ? 'png' : 'jpg'
  return new File([blob], filename ?? `${result.id}.${extension}`, {
    type: blob.type || 'image/png',
  })
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`)
    return res.ok
  } catch {
    return false
  }
}
