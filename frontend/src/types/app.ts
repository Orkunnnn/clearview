export type AppMode = 'restore' | 'synthetic'
export type TaskCategory = 'dehazing' | 'deraining'
export type MethodType = 'classical' | 'deep-learning'
export type SyntheticEffect = 'fog' | 'rain'
export type ResultSource = 'restore' | 'synthetic'
export type ProcessInputType = 'uploaded-image' | 'synthetic-result'
export type ProcessStage = 'synthetic' | 'restored'

export interface Algorithm {
  id: string
  name: string
  category: TaskCategory
  methodType: MethodType
  description: string
}

export interface UploadedImage {
  id: string
  file: File
  previewUrl: string
  name: string
  size: number
}

export interface ResultSourceImage {
  id: string
  url: string
  name: string
  size: number
}

export interface ProcessedResult {
  id: string
  batchId: string
  imageId: string
  rootImageId: string
  algorithmId: string
  outputUrl: string
  sourceImage: ResultSourceImage
  createdAt: number
  source: ResultSource
  stage: ProcessStage
  inputType?: ProcessInputType
  parentResultId?: string
  effect?: SyntheticEffect
  intensity?: number
  label?: string
}

export interface NoReferenceMetrics {
  entropy: number
  niqe: number | null
  brisque: number | null
  piqe: number | null
  fade: number | null
}

export interface FullReferenceMetrics {
  mse: number
  psnr: number | null
  ssim: number
  comparedWidth: number
  comparedHeight: number
}

export interface CapabilityStatus {
  available: boolean
  reason: string | null
}

export interface WeatherCapabilities {
  fog: CapabilityStatus
  rain: CapabilityStatus
}

export type ComparisonMode = 'slider' | 'zoom'

export const ALGORITHMS: Algorithm[] = [
  {
    id: 'fast-single-image-dehazing',
    name: 'Fast Single Image Dehazing',
    category: 'dehazing',
    methodType: 'classical',
    description: 'Hızlı tek görüntü sis giderme modeli',
  },
  {
    id: 'dehazeformer',
    name: 'DehazeFormer',
    category: 'dehazing',
    methodType: 'deep-learning',
    description: 'Transformer tabanlı sis giderme modeli',
  },
  {
    id: 'ugsm',
    name: 'UGSM',
    category: 'deraining',
    methodType: 'classical',
    description: 'Yönsel küresel seyrek model',
  },
  {
    id: 'mprnet',
    name: 'MPRNet',
    category: 'deraining',
    methodType: 'deep-learning',
    description: 'Çok aşamalı ilerlemeli yağmur giderme modeli',
  },
]

export function isFadeMetricApplicable(result: ProcessedResult): boolean {
  if (result.effect) return result.effect === 'fog'

  const algorithm = ALGORITHMS.find((item) => item.id === result.algorithmId)
  return algorithm?.category === 'dehazing'
}

export function getResultLabel(result: ProcessedResult): string {
  if (result.label) return result.label
  if (result.source === 'synthetic' && result.effect) {
    const effectLabel = result.effect === 'fog' ? 'Sis' : 'Yağmur'
    const intensityLabel =
      typeof result.intensity === 'number'
        ? ` ${Math.round(result.intensity)}%`
        : ''
    return `${effectLabel}${intensityLabel}`
  }
  return (
    ALGORITHMS.find((algorithm) => algorithm.id === result.algorithmId)?.name ??
    result.algorithmId
  )
}

export function getRequiredRestoreCategory(
  effect: SyntheticEffect,
): TaskCategory {
  return effect === 'fog' ? 'dehazing' : 'deraining'
}
