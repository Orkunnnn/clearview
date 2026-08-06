import { describe, expect, it } from 'vitest'
import { buildResultDownloadFilename } from './download'

describe('download helpers', () => {
  it('builds a clean filename for restored output downloads', () => {
    const filename = buildResultDownloadFilename(
      {
        id: 'result-1',
        batchId: 'batch-1',
        imageId: 'image-1',
        rootImageId: 'image-1',
        algorithmId: 'fast-single-image-dehazing',
        outputUrl: 'blob:result',
        sourceImage: {
          id: 'image-1',
          url: 'blob:source',
          name: 'Sisli sokak.png',
          size: 6,
        },
        createdAt: 1,
        source: 'restore',
        stage: 'restored',
      },
      'image/png',
    )

    expect(filename).toBe('sisli-sokak-hizli-tek-goruntu-sis-giderme-temiz.png')
  })
})
