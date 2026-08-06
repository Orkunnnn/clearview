import type { ProcessedResult } from '#/types/app'
import { getResultLabel } from '#/types/app'

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/png':
    default:
      return 'png'
  }
}

function stripExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.')
  return dotIndex > 0 ? filename.slice(0, dotIndex) : filename
}

function sanitizeFilenamePart(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()

  return normalized.slice(0, 64) || 'gorsel'
}

export function buildResultDownloadFilename(
  result: ProcessedResult,
  mimeType: string,
): string {
  const sourceName = stripExtension(result.sourceImage.name)
  const imagePart = sanitizeFilenamePart(sourceName)
  const resultPart = sanitizeFilenamePart(getResultLabel(result))
  const extension = extensionForMimeType(mimeType)

  return `${imagePart}-${resultPart}-temiz.${extension}`
}

export async function downloadProcessedResult(
  result: ProcessedResult,
): Promise<void> {
  const response = await fetch(result.outputUrl)
  if (!response.ok) {
    throw new Error('Görsel indirilemedi.')
  }

  const blob = await response.blob()
  const downloadUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = downloadUrl
  anchor.download = buildResultDownloadFilename(
    result,
    blob.type || 'image/png',
  )
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()

  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0)
}
