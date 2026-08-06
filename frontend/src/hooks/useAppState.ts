import { useReducer, useCallback } from 'react'
import type {
  AppMode,
  TaskCategory,
  ComparisonMode,
  UploadedImage,
  ProcessedResult,
  SyntheticEffect,
  WeatherCapabilities,
} from '#/types/app'

export interface AppState {
  mode: AppMode
  category: TaskCategory
  selectedAlgorithmIds: string[]
  images: UploadedImage[]
  activeImageId: string | null
  selectedImageIds: string[]
  results: Record<string, ProcessedResult>
  comparisonMode: ComparisonMode
  isProcessing: boolean
  selectedResultKey: string | null
  syntheticEffect: SyntheticEffect | null
  syntheticIntensity: number
  capabilities: WeatherCapabilities
}

export type AppAction =
  | { type: 'SET_MODE'; payload: AppMode }
  | { type: 'SET_CATEGORY'; payload: TaskCategory }
  | { type: 'TOGGLE_ALGORITHM'; payload: string }
  | { type: 'ADD_IMAGES'; payload: UploadedImage[] }
  | { type: 'REMOVE_IMAGE'; payload: string }
  | { type: 'REMOVE_IMAGES'; payload: string[] }
  | { type: 'SET_ACTIVE_IMAGE'; payload: string | null }
  | { type: 'TOGGLE_IMAGE_SELECTION'; payload: string }
  | { type: 'SELECT_ALL_IMAGES' }
  | { type: 'CLEAR_IMAGE_SELECTION' }
  | { type: 'SET_RESULT'; payload: ProcessedResult }
  | { type: 'SET_COMPARISON_MODE'; payload: ComparisonMode }
  | { type: 'SET_PROCESSING'; payload: boolean }
  | { type: 'SELECT_RESULT'; payload: string }
  | { type: 'CLEAR_SELECTED_RESULT' }
  | { type: 'SET_SYNTHETIC_EFFECT'; payload: SyntheticEffect | null }
  | { type: 'SET_SYNTHETIC_INTENSITY'; payload: number }
  | { type: 'SET_CAPABILITIES'; payload: WeatherCapabilities }

export const initialState: AppState = {
  mode: 'restore',
  category: 'dehazing',
  selectedAlgorithmIds: [],
  images: [],
  activeImageId: null,
  selectedImageIds: [],
  results: {},
  comparisonMode: 'slider',
  isProcessing: false,
  selectedResultKey: null,
  syntheticEffect: null,
  syntheticIntensity: 50,
  capabilities: {
    fog: { available: false, reason: null },
    rain: { available: true, reason: null },
  },
}

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.payload }
    case 'SET_CATEGORY':
      return {
        ...state,
        category: action.payload,
        selectedAlgorithmIds: [],
      }
    case 'TOGGLE_ALGORITHM': {
      const id = action.payload
      const ids = state.selectedAlgorithmIds
      return {
        ...state,
        selectedAlgorithmIds: ids.includes(id)
          ? ids.filter((i) => i !== id)
          : [...ids, id],
      }
    }
    case 'ADD_IMAGES': {
      const newImages = [...state.images, ...action.payload]
      return {
        ...state,
        images: newImages,
        activeImageId:
          state.activeImageId !== null
            ? state.activeImageId
            : (action.payload[0]?.id ?? null),
      }
    }
    case 'REMOVE_IMAGE':
    case 'REMOVE_IMAGES': {
      const removedIds = new Set(
        action.type === 'REMOVE_IMAGE' ? [action.payload] : action.payload,
      )
      const filtered = state.images.filter((img) => !removedIds.has(img.id))
      for (const removedImg of state.images) {
        if (removedIds.has(removedImg.id)) {
          URL.revokeObjectURL(removedImg.previewUrl)
        }
      }
      return {
        ...state,
        images: filtered,
        activeImageId:
          state.activeImageId !== null && removedIds.has(state.activeImageId)
            ? (filtered[0]?.id ?? null)
            : state.activeImageId,
        selectedImageIds: state.selectedImageIds.filter(
          (id) => !removedIds.has(id),
        ),
      }
    }
    case 'SET_ACTIVE_IMAGE':
      return { ...state, activeImageId: action.payload }
    case 'TOGGLE_IMAGE_SELECTION': {
      const id = action.payload
      const next = state.selectedImageIds.includes(id)
        ? state.selectedImageIds.filter((item) => item !== id)
        : [...state.selectedImageIds, id]
      return { ...state, selectedImageIds: next }
    }
    case 'SELECT_ALL_IMAGES':
      return {
        ...state,
        selectedImageIds: state.images.map((image) => image.id),
      }
    case 'CLEAR_IMAGE_SELECTION':
      return { ...state, selectedImageIds: [] }
    case 'SET_RESULT': {
      return {
        ...state,
        results: { ...state.results, [action.payload.id]: action.payload },
      }
    }
    case 'SET_COMPARISON_MODE':
      return { ...state, comparisonMode: action.payload }
    case 'SET_PROCESSING':
      return { ...state, isProcessing: action.payload }
    case 'SELECT_RESULT':
      return { ...state, selectedResultKey: action.payload }
    case 'CLEAR_SELECTED_RESULT':
      return { ...state, selectedResultKey: null }
    case 'SET_SYNTHETIC_EFFECT':
      return { ...state, syntheticEffect: action.payload }
    case 'SET_SYNTHETIC_INTENSITY':
      return { ...state, syntheticIntensity: action.payload }
    case 'SET_CAPABILITIES':
      return { ...state, capabilities: action.payload }
    default:
      return state
  }
}

export function useAppState() {
  const [state, dispatch] = useReducer(reducer, initialState)

  const activeImage = state.images.find((img) => img.id === state.activeImageId)

  const addImages = useCallback(
    (files: File[]) => {
      const newImages: UploadedImage[] = files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        name: file.name,
        size: file.size,
      }))
      dispatch({ type: 'ADD_IMAGES', payload: newImages })
    },
    [dispatch],
  )

  const allResults = Object.values(state.results).sort(
    (a, b) => b.createdAt - a.createdAt,
  )

  return { state, dispatch, activeImage, allResults, addImages }
}
