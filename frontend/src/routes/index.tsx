import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useState, useEffect } from 'react'
import { useAppState } from '#/hooks/useAppState'
import {
  fetchCapabilities,
  processImage,
  resultToFile,
  synthesizeWeather,
} from '#/lib/api'
import { downloadProcessedResult } from '#/lib/download'
import { Clock } from 'lucide-react'
import AppSidebar from '#/components/app/AppSidebar'
import MainViewport from '#/components/app/MainViewport'
import { getRequiredRestoreCategory } from '#/types/app'

export const Route = createFileRoute('/')({
  component: AppPage,
})

function AppPage() {
  const { state, dispatch, allResults, addImages } = useAppState()
  const [toast, setToast] = useState<{
    message: string
    tone: 'success' | 'error'
  } | null>(null)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    let isMounted = true

    fetchCapabilities().then((capabilities) => {
      if (!isMounted) return
      dispatch({ type: 'SET_CAPABILITIES', payload: capabilities })
      if (!capabilities.fog.available && state.syntheticEffect === 'fog') {
        dispatch({ type: 'SET_SYNTHETIC_EFFECT', payload: null })
      }
    })

    return () => {
      isMounted = false
    }
  }, [dispatch, state.mode, state.syntheticEffect])

  const handleProcess = useCallback(async () => {
    const syntheticEffect = state.syntheticEffect

    if (state.mode === 'restore') {
      if (state.images.length === 0 || state.selectedAlgorithmIds.length === 0)
        return
    } else if (
      state.selectedImageIds.length === 0 ||
      syntheticEffect === null
    ) {
      return
    }

    dispatch({ type: 'SET_PROCESSING', payload: true })
    const start = performance.now()
    try {
      if (state.mode === 'restore') {
        const processedImageIds = new Set<string>()
        for (const img of state.images) {
          const batchId = crypto.randomUUID()
          for (const algoId of state.selectedAlgorithmIds) {
            const result = await processImage(img.file, algoId, img.id, batchId)
            dispatch({ type: 'SET_RESULT', payload: result })
          }
          processedImageIds.add(img.id)
        }
        dispatch({
          type: 'REMOVE_IMAGES',
          payload: Array.from(processedImageIds),
        })
      } else {
        if (syntheticEffect === null) return

        const batchId = crypto.randomUUID()
        const processedImageIds = new Set<string>()
        for (const imageId of state.selectedImageIds) {
          const image = state.images.find((item) => item.id === imageId)
          if (!image) continue
          const result = await synthesizeWeather(
            image.file,
            syntheticEffect,
            state.syntheticIntensity,
            image.id,
            batchId,
          )
          dispatch({ type: 'SET_RESULT', payload: result })
          processedImageIds.add(image.id)
        }
        dispatch({
          type: 'REMOVE_IMAGES',
          payload: Array.from(processedImageIds),
        })
      }

      const elapsed = performance.now() - start
      setToast({
        message: `İşlem tamamlandı: ${(elapsed / 1000).toFixed(2)}s`,
        tone: 'success',
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'İşlem sırasında hata oluştu.'
      setToast({ message, tone: 'error' })
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false })
    }
  }, [
    dispatch,
    state.images,
    state.mode,
    state.selectedAlgorithmIds,
    state.selectedImageIds,
    state.syntheticEffect,
    state.syntheticIntensity,
  ])

  const handleRestoreSyntheticResult = useCallback(
    async (resultId: string) => {
      const result = Object.hasOwn(state.results, resultId)
        ? state.results[resultId]
        : null
      if (result === null || result.source !== 'synthetic' || !result.effect)
        return

      const requiredCategory = getRequiredRestoreCategory(result.effect)
      if (state.category !== requiredCategory) {
        setToast({
          message:
            requiredCategory === 'dehazing'
              ? 'Bu sis sonucunu iyileştirmek için İyileştirme modunda sis giderme algoritmaları seçin.'
              : 'Bu yağmur sonucunu iyileştirmek için İyileştirme modunda yağmur giderme algoritmaları seçin.',
          tone: 'error',
        })
        return
      }

      if (state.selectedAlgorithmIds.length === 0) {
        setToast({
          message:
            requiredCategory === 'dehazing'
              ? 'Önce en az bir sis giderme algoritması seçin.'
              : 'Önce en az bir yağmur giderme algoritması seçin.',
          tone: 'error',
        })
        return
      }

      dispatch({ type: 'SET_PROCESSING', payload: true })
      const start = performance.now()

      try {
        const inputFile = await resultToFile(
          result,
          `${result.effect}-${result.id}.png`,
        )
        const batchId = crypto.randomUUID()

        for (const algorithmId of state.selectedAlgorithmIds) {
          const restored = await processImage(
            inputFile,
            algorithmId,
            result.imageId,
            batchId,
            {
              rootImageId: result.rootImageId,
              stage: 'restored',
              inputType: 'synthetic-result',
              parentResultId: result.id,
              sourceImage: result.sourceImage,
            },
          )
          dispatch({ type: 'SET_RESULT', payload: restored })
        }

        const elapsed = performance.now() - start
        setToast({
          message: `İyileştirme tamamlandı: ${(elapsed / 1000).toFixed(2)}s`,
          tone: 'success',
        })
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'İyileştirme sırasında hata oluştu.'
        setToast({ message, tone: 'error' })
      } finally {
        dispatch({ type: 'SET_PROCESSING', payload: false })
      }
    },
    [dispatch, state.category, state.results, state.selectedAlgorithmIds],
  )

  const handleDownloadResult = useCallback(
    async (resultId: string) => {
      const result = Object.hasOwn(state.results, resultId)
        ? state.results[resultId]
        : null
      if (result === null || result.stage !== 'restored') return

      try {
        await downloadProcessedResult(result)
        setToast({ message: 'Temizlenen görsel indiriliyor.', tone: 'success' })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Görsel indirilemedi.'
        setToast({ message, tone: 'error' })
      }
    },
    [state.results],
  )

  const selectedResult = state.selectedResultKey
    ? (state.results[state.selectedResultKey] ?? null)
    : null

  const selectedSyntheticResult = selectedResult
    ? selectedResult.stage === 'synthetic'
      ? selectedResult
      : selectedResult.parentResultId
        ? (state.results[selectedResult.parentResultId] ?? null)
        : null
    : null

  const pipelineResults = selectedSyntheticResult
    ? [
        selectedSyntheticResult,
        ...allResults.filter(
          (result) => result.parentResultId === selectedSyntheticResult.id,
        ),
      ]
    : []

  // Aynı batch'e ait tüm sonuçları bul (çoklu karşılaştırma için)
  const siblingResults = selectedResult
    ? allResults.filter(
        (r) =>
          r.batchId === selectedResult.batchId &&
          r.imageId === selectedResult.imageId,
      )
    : []

  const restoreDisabledReason = (() => {
    if (
      !selectedResult ||
      selectedResult.source !== 'synthetic' ||
      !selectedResult.effect
    ) {
      return null
    }
    const requiredCategory = getRequiredRestoreCategory(selectedResult.effect)
    if (state.category !== requiredCategory) {
      return requiredCategory === 'dehazing'
        ? 'İyileştirme modunda sis giderme algoritmalarını seçtiğinizde bu sonuç iyileştirilebilir.'
        : 'İyileştirme modunda yağmur giderme algoritmalarını seçtiğinizde bu sonuç iyileştirilebilir.'
    }
    if (state.selectedAlgorithmIds.length === 0) {
      return requiredCategory === 'dehazing'
        ? 'En az bir sis giderme algoritması seçin.'
        : 'En az bir yağmur giderme algoritması seçin.'
    }
    return null
  })()

  const canRestoreSelectedSynthetic = restoreDisabledReason === null

  return (
    <>
      <AppSidebar
        state={state}
        onModeChange={(mode) => dispatch({ type: 'SET_MODE', payload: mode })}
        onCategoryChange={(cat) =>
          dispatch({ type: 'SET_CATEGORY', payload: cat })
        }
        onAlgorithmToggle={(id) =>
          dispatch({ type: 'TOGGLE_ALGORITHM', payload: id })
        }
        onFilesAdded={addImages}
        onImageSelect={(id) =>
          dispatch({ type: 'SET_ACTIVE_IMAGE', payload: id })
        }
        onImageRemove={(id) => dispatch({ type: 'REMOVE_IMAGE', payload: id })}
        onToggleImageSelection={(id) =>
          dispatch({ type: 'TOGGLE_IMAGE_SELECTION', payload: id })
        }
        onSelectAllImages={() => dispatch({ type: 'SELECT_ALL_IMAGES' })}
        onClearImageSelection={() =>
          dispatch({ type: 'CLEAR_IMAGE_SELECTION' })
        }
        onSyntheticEffectChange={(effect) =>
          dispatch({ type: 'SET_SYNTHETIC_EFFECT', payload: effect })
        }
        onSyntheticIntensityChange={(value) =>
          dispatch({ type: 'SET_SYNTHETIC_INTENSITY', payload: value })
        }
        onProcess={handleProcess}
      />
      <MainViewport
        state={state}
        allResults={allResults}
        selectedResult={selectedResult}
        siblingResults={siblingResults}
        pipelineResults={pipelineResults}
        canRestoreSelectedSynthetic={canRestoreSelectedSynthetic}
        restoreDisabledReason={restoreDisabledReason}
        onRestoreSyntheticResult={handleRestoreSyntheticResult}
        onDownloadResult={handleDownloadResult}
        onSelectResult={(key) =>
          dispatch({ type: 'SELECT_RESULT', payload: key })
        }
        onBackToGrid={() => dispatch({ type: 'CLEAR_SELECTED_RESULT' })}
        onComparisonModeChange={(mode) =>
          dispatch({ type: 'SET_COMPARISON_MODE', payload: mode })
        }
      />
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 animate-[slideUp_0.3s_ease-out] rounded-xl border px-4 py-3 shadow-lg ${
            toast.tone === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-[var(--border)] bg-[var(--bg-surface)]'
          }`}
        >
          <div className="flex items-center gap-2">
            <Clock
              size={14}
              className={
                toast.tone === 'error' ? 'text-red-500' : 'text-[var(--accent)]'
              }
            />
            <span className="text-[13px]">{toast.message}</span>
          </div>
        </div>
      )}
    </>
  )
}
