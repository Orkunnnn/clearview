import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  calculateFullReferenceMetrics,
  calculateNoReferenceMetrics,
  fetchCapabilities,
  processImage,
  resultToFile,
  synthesizeWeather,
} from './api'

afterEach(() => {
  vi.restoreAllMocks()
})

const sampleSourceImage = {
  id: 'image-1',
  url: 'blob:source',
  name: 'sample.png',
  size: 6,
}

describe('api', () => {
  it('returns processed image result from process response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['result'], { type: 'image/png' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const file = new File(['sample'], 'sample.png', { type: 'image/png' })
    const result = await processImage(
      file,
      'fast-single-image-dehazing',
      'image-1',
      'batch-1',
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.algorithmId).toBe('fast-single-image-dehazing')
    expect(result.stage).toBe('restored')
    expect(result.outputUrl).toMatch(/^blob:/)
    expect(result.sourceImage.name).toBe('sample.png')
  })

  it('sends synthetic weather request with expected form data', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['result']),
    })
    vi.stubGlobal('fetch', fetchMock)

    const file = new File(['sample'], 'sample.png', { type: 'image/png' })
    const result = await synthesizeWeather(
      file,
      'rain',
      55,
      'image-1',
      'batch-1',
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/synthesize/weather')
    expect(options.method).toBe('POST')
    const formData = options.body as FormData
    expect(formData.get('effect')).toBe('rain')
    expect(formData.get('intensity')).toBe('55')
    expect(result.source).toBe('synthetic')
    expect(result.label).toBe('Yağmur 55%')
    expect(result.sourceImage.name).toBe('sample.png')
  })

  it('falls back to disabled fog capability when backend is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const capabilities = await fetchCapabilities()

    expect(capabilities.fog.available).toBe(false)
    expect(capabilities.rain.available).toBe(true)
  })

  it('converts synthetic result output into a file for restore input', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      blob: async () => new Blob(['synthetic'], { type: 'image/png' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const file = await resultToFile({
      id: 'result-1',
      batchId: 'batch-1',
      imageId: 'image-1',
      rootImageId: 'image-1',
      algorithmId: 'rain',
      outputUrl: 'blob:synthetic',
      sourceImage: sampleSourceImage,
      createdAt: Date.now(),
      source: 'synthetic',
      stage: 'synthetic',
      inputType: 'uploaded-image',
      effect: 'rain',
      intensity: 55,
      label: 'Yağmur 55%',
    })

    expect(fetchMock).toHaveBeenCalledWith('blob:synthetic')
    expect(file.name).toBe('result-1.png')
    expect(file.type).toBe('image/png')
  })

  it('calculates no-reference metrics for a processed result', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        blob: async () => new Blob(['output'], { type: 'image/png' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entropy: 7.25,
          niqe: 4.2,
          brisque: 18.5,
          piqe: 31,
          fade: 0.7,
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const metrics = await calculateNoReferenceMetrics({
      id: 'result-1',
      batchId: 'batch-1',
      imageId: 'image-1',
      rootImageId: 'image-1',
      algorithmId: 'fast-single-image-dehazing',
      outputUrl: 'blob:output',
      sourceImage: sampleSourceImage,
      createdAt: Date.now(),
      source: 'restore',
      stage: 'restored',
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(`${fetchMock.mock.calls[1][0]}`).toContain(
      '/api/metrics/no-reference',
    )
    const formData = fetchMock.mock.calls[1][1]?.body as FormData
    expect(formData.get('include_fade')).toBe('true')
    expect(metrics.entropy).toBe(7.25)
    expect(metrics.niqe).toBe(4.2)
    expect(metrics.brisque).toBe(18.5)
    expect(metrics.piqe).toBe(31)
    expect(metrics.fade).toBe(0.7)
  })

  it('does not request FADE for deraining results', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        blob: async () => new Blob(['output'], { type: 'image/png' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entropy: 6.8,
          niqe: 5.1,
          brisque: 22,
          piqe: 35,
          fade: null,
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const metrics = await calculateNoReferenceMetrics({
      id: 'result-1',
      batchId: 'batch-1',
      imageId: 'image-1',
      rootImageId: 'image-1',
      algorithmId: 'mprnet',
      outputUrl: 'blob:output',
      sourceImage: sampleSourceImage,
      createdAt: Date.now(),
      source: 'restore',
      stage: 'restored',
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const formData = fetchMock.mock.calls[1][1]?.body as FormData
    expect(formData.get('include_fade')).toBe('false')
    expect(metrics.fade).toBeNull()
  })

  it('does not request FADE for synthetic rain results', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        blob: async () => new Blob(['output'], { type: 'image/png' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entropy: 6.8,
          niqe: 5.1,
          brisque: 22,
          piqe: 35,
          fade: null,
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    await calculateNoReferenceMetrics({
      id: 'result-1',
      batchId: 'batch-1',
      imageId: 'image-1',
      rootImageId: 'image-1',
      algorithmId: 'rain',
      outputUrl: 'blob:output',
      sourceImage: sampleSourceImage,
      createdAt: Date.now(),
      source: 'synthetic',
      stage: 'synthetic',
      effect: 'rain',
      intensity: 55,
      label: 'Yağmur 55%',
    })

    const formData = fetchMock.mock.calls[1][1]?.body as FormData
    expect(formData.get('include_fade')).toBe('false')
  })

  it('calculates full-reference metrics with a clean reference image', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        blob: async () => new Blob(['output'], { type: 'image/png' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mse: 12.5,
          psnr: 37.2,
          ssim: 0.93,
          comparedWidth: 32,
          comparedHeight: 24,
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const metrics = await calculateFullReferenceMetrics(
      {
        id: 'result-1',
        batchId: 'batch-1',
        imageId: 'image-1',
        rootImageId: 'image-1',
        algorithmId: 'fast-single-image-dehazing',
        outputUrl: 'blob:output',
        sourceImage: sampleSourceImage,
        createdAt: Date.now(),
        source: 'restore',
        stage: 'restored',
      },
      new File(['clean'], 'clean.png', { type: 'image/png' }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(`${fetchMock.mock.calls[1][0]}`).toContain(
      '/api/metrics/full-reference',
    )
    expect(metrics.psnr).toBe(37.2)
    expect(metrics.ssim).toBe(0.93)
  })
})
