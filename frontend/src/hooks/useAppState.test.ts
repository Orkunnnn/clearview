import { describe, expect, it } from 'vitest'
import { initialState, reducer } from './useAppState'

const sampleImages = [
  {
    id: 'img-1',
    file: new File(['one'], 'one.png', { type: 'image/png' }),
    previewUrl: 'blob:one',
    name: 'one.png',
    size: 10,
  },
  {
    id: 'img-2',
    file: new File(['two'], 'two.png', { type: 'image/png' }),
    previewUrl: 'blob:two',
    name: 'two.png',
    size: 20,
  },
]

describe('useAppState reducer', () => {
  it('supports synthetic multi-image selection flow', () => {
    let state = reducer(initialState, {
      type: 'ADD_IMAGES',
      payload: sampleImages,
    })
    state = reducer(state, { type: 'SET_MODE', payload: 'synthetic' })
    state = reducer(state, { type: 'SET_SYNTHETIC_EFFECT', payload: 'rain' })
    state = reducer(state, { type: 'TOGGLE_IMAGE_SELECTION', payload: 'img-1' })
    state = reducer(state, { type: 'TOGGLE_IMAGE_SELECTION', payload: 'img-2' })

    expect(state.mode).toBe('synthetic')
    expect(state.syntheticEffect).toBe('rain')
    expect(state.selectedImageIds).toEqual(['img-1', 'img-2'])
  })

  it('selects and clears all synthetic targets', () => {
    let state = reducer(initialState, {
      type: 'ADD_IMAGES',
      payload: sampleImages,
    })
    state = reducer(state, { type: 'SELECT_ALL_IMAGES' })

    expect(state.selectedImageIds).toEqual(['img-1', 'img-2'])

    state = reducer(state, { type: 'CLEAR_IMAGE_SELECTION' })

    expect(state.selectedImageIds).toEqual([])
  })

  it('stores chained restore results without losing root relationship', () => {
    let state = reducer(initialState, {
      type: 'ADD_IMAGES',
      payload: sampleImages,
    })
    state = reducer(state, {
      type: 'SET_RESULT',
      payload: {
        id: 'synthetic-1',
        batchId: 'batch-s',
        imageId: 'img-1',
        rootImageId: 'img-1',
        algorithmId: 'rain',
        outputUrl: 'blob:synthetic',
        sourceImage: {
          id: 'img-1',
          url: 'blob:source-copy',
          name: 'one.png',
          size: 10,
        },
        createdAt: 1,
        source: 'synthetic',
        stage: 'synthetic',
        inputType: 'uploaded-image',
        effect: 'rain',
        intensity: 60,
        label: 'Yağmur 60%',
      },
    })
    state = reducer(state, {
      type: 'SET_RESULT',
      payload: {
        id: 'restored-1',
        batchId: 'batch-r',
        imageId: 'img-1',
        rootImageId: 'img-1',
        algorithmId: 'mprnet',
        outputUrl: 'blob:restored',
        sourceImage: {
          id: 'img-1',
          url: 'blob:source-copy',
          name: 'one.png',
          size: 10,
        },
        createdAt: 2,
        source: 'restore',
        stage: 'restored',
        inputType: 'synthetic-result',
        parentResultId: 'synthetic-1',
      },
    })

    expect(state.results['restored-1'].parentResultId).toBe('synthetic-1')
    expect(state.results['restored-1'].rootImageId).toBe('img-1')
    expect(state.results['restored-1'].stage).toBe('restored')
  })

  it('removes uploaded images without dropping result source snapshots', () => {
    let state = reducer(initialState, {
      type: 'ADD_IMAGES',
      payload: sampleImages,
    })
    state = reducer(state, {
      type: 'SET_RESULT',
      payload: {
        id: 'restored-1',
        batchId: 'batch-r',
        imageId: 'img-1',
        rootImageId: 'img-1',
        algorithmId: 'mprnet',
        outputUrl: 'blob:restored',
        sourceImage: {
          id: 'img-1',
          url: 'blob:source-copy',
          name: 'one.png',
          size: 10,
        },
        createdAt: 2,
        source: 'restore',
        stage: 'restored',
        inputType: 'uploaded-image',
      },
    })

    state = reducer(state, { type: 'SELECT_RESULT', payload: 'restored-1' })
    state = reducer(state, { type: 'REMOVE_IMAGES', payload: ['img-1'] })

    expect(state.images.map((image) => image.id)).toEqual(['img-2'])
    expect(state.selectedResultKey).toBe('restored-1')
    expect(state.results['restored-1'].sourceImage.url).toBe('blob:source-copy')
  })
})
