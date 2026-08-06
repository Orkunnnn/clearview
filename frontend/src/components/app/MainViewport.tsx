import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CircleHelp,
  Download,
  ImageIcon,
  Loader2,
  Sparkles,
  Upload,
  Wand2,
  X,
} from 'lucide-react'
import type { AppState } from '#/hooks/useAppState'
import type {
  ComparisonMode,
  FullReferenceMetrics,
  NoReferenceMetrics,
  ProcessedResult,
} from '#/types/app'
import { ALGORITHMS, getResultLabel, isFadeMetricApplicable } from '#/types/app'
import {
  calculateFullReferenceMetrics,
  calculateNoReferenceMetrics,
} from '#/lib/api'
import ThemeToggle from '../ThemeToggle'
import ComparisonModeToggle from './ComparisonModeToggle'
import SliderComparison from './SliderComparison'
import ZoomLens from './ZoomLens'
import MultiZoomComparison from './MultiZoomComparison'

interface Props {
  state: AppState
  allResults: ProcessedResult[]
  selectedResult: ProcessedResult | null
  siblingResults: ProcessedResult[]
  pipelineResults: ProcessedResult[]
  canRestoreSelectedSynthetic: boolean
  restoreDisabledReason: string | null
  onRestoreSyntheticResult: (resultId: string) => void
  onDownloadResult: (resultId: string) => void
  onSelectResult: (key: string) => void
  onBackToGrid: () => void
  onComparisonModeChange: (mode: ComparisonMode) => void
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type MetricLoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string }

export default function MainViewport({
  state,
  allResults,
  selectedResult,
  siblingResults,
  pipelineResults,
  canRestoreSelectedSynthetic,
  restoreDisabledReason,
  onRestoreSyntheticResult,
  onDownloadResult,
  onSelectResult,
  onBackToGrid,
  onComparisonModeChange,
}: Props) {
  const [infoOpen, setInfoOpen] = useState(false)
  const isGridMode = !selectedResult
  const showPipeline = pipelineResults.length > 1
  const isMultiMode = siblingResults.length > 1
  const selectedSourceImage = selectedResult?.sourceImage ?? null

  // Sonuçları zincire göre grupla
  const groupedResults = (() => {
    const map = new Map<string, ProcessedResult[]>()
    for (const r of allResults) {
      const groupKey = r.parentResultId
        ? `pipeline:${r.parentResultId}`
        : `batch:${r.batchId}:${r.rootImageId}`
      const group = map.get(groupKey)
      if (group) group.push(r)
      else map.set(groupKey, [r])
    }
    return Array.from(map, ([groupKey, results]) => ({
      groupKey,
      sourceImage: results[0].sourceImage,
      results,
    }))
  })()

  const selectedAlgo =
    selectedResult?.source === 'restore'
      ? ALGORITHMS.find((a) => a.id === selectedResult.algorithmId)
      : null
  const selectedLabel = selectedResult ? getResultLabel(selectedResult) : null

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex h-10 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-surface)] px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isGridMode ? (
            <span className="text-[13px] font-medium text-[var(--text-primary)]">
              Sonuçlar
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={onBackToGrid}
                className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-alt)] hover:text-[var(--text-primary)]"
              >
                <ArrowLeft size={14} />
                Geri
              </button>
              {selectedSourceImage && (
                <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                  {selectedSourceImage.name}
                </span>
              )}
              {showPipeline ? (
                <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
                  3 aşamalı zincir
                </span>
              ) : isMultiMode ? (
                <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
                  {siblingResults.length} algoritma
                </span>
              ) : (
                (selectedAlgo || selectedLabel) && (
                  <>
                    <span className="text-[var(--text-tertiary)]">
                      &middot;
                    </span>
                    <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
                      {selectedAlgo?.name ?? selectedLabel}
                    </span>
                  </>
                )
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {selectedResult?.stage === 'restored' && (
            <button
              type="button"
              onClick={() => onDownloadResult(selectedResult.id)}
              className="flex items-center justify-center rounded-md p-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-alt)] hover:text-[var(--text-primary)]"
              aria-label="Temizlenen görseli indir"
              title="Temizlenen görseli indir"
            >
              <Download size={16} />
            </button>
          )}
          {!isGridMode && !isMultiMode && !showPipeline && (
            <button
              type="button"
              onClick={() => setInfoOpen((v) => !v)}
              className={`flex items-center justify-center rounded-md p-1.5 transition ${
                infoOpen
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-alt)] hover:text-[var(--text-primary)]'
              }`}
              aria-label="Detaylar ve metrikler"
              title="Detaylar ve metrikler"
            >
              <BarChart3 size={16} />
            </button>
          )}
          <ThemeToggle />
        </div>
      </div>

      {/* Viewport + Info sidebar */}
      <div className="relative flex flex-1 overflow-hidden">
        <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[var(--bg-base)] p-4">
          {state.isProcessing && (
            <div className="processing-sweep pointer-events-none absolute inset-0 z-30" />
          )}

          {isGridMode ? (
            allResults.length === 0 ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--bg-surface)]">
                  <ImageIcon
                    size={28}
                    className="text-[var(--text-tertiary)] opacity-50"
                  />
                </div>
                <div>
                  <p className="m-0 text-[15px] font-semibold text-[var(--text-primary)]">
                    Henüz işlenmiş görsel yok
                  </p>
                  <p className="m-0 mt-1 text-[13px] text-[var(--text-secondary)]">
                    Sol panelden görsel yükleyin, algoritma seçin ve
                    &quot;İşle&quot; butonuna basın
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-full w-full overflow-y-auto">
                <div className="flex flex-col gap-4 p-2">
                  {groupedResults.map(
                    ({ groupKey, sourceImage, results: groupResults }) => {
                      const isSingle = groupResults.length === 1

                      if (isSingle) {
                        const result = groupResults[0]
                        return (
                          <button
                            key={groupKey}
                            type="button"
                            onClick={() => onSelectResult(result.id)}
                            className="group flex max-w-md flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] text-left transition hover:border-[var(--accent)] hover:shadow-lg"
                          >
                            <div className="relative aspect-[4/3] w-full overflow-hidden">
                              <img
                                src={result.outputUrl}
                                alt={getResultLabel(result)}
                                className="h-full w-full object-cover transition group-hover:scale-105"
                              />
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pt-4 pb-1.5">
                                <span className="text-[10px] font-semibold text-white drop-shadow-sm">
                                  {getResultLabel(result)}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-2">
                              <span className="truncate text-[11px] text-[var(--text-tertiary)]">
                                {sourceImage.name}
                              </span>
                            </div>
                          </button>
                        )
                      }

                      return (
                        <button
                          key={groupKey}
                          type="button"
                          onClick={() => onSelectResult(groupResults[0].id)}
                          className="group flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] text-left transition hover:border-[var(--accent)] hover:shadow-lg"
                        >
                          <div
                            className={`grid w-full gap-0.5 bg-[var(--bg-base)] ${
                              groupResults.length === 2
                                ? 'grid-cols-2'
                                : groupResults.length === 3
                                  ? 'grid-cols-3'
                                  : 'grid-cols-4'
                            }`}
                          >
                            {groupResults.map((result) => {
                              return (
                                <div
                                  key={result.id}
                                  className="relative overflow-hidden"
                                >
                                  <div className="aspect-[4/3]">
                                    <img
                                      src={result.outputUrl}
                                      alt={getResultLabel(result)}
                                      className="h-full w-full object-cover transition group-hover:scale-105"
                                    />
                                  </div>
                                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pt-4 pb-1.5">
                                    <span className="text-[10px] font-semibold text-white drop-shadow-sm">
                                      {getResultLabel(result)}
                                    </span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                          <div className="flex items-center gap-2 px-3 py-2">
                            <span className="truncate text-[11px] text-[var(--text-tertiary)]">
                              {sourceImage.name}
                            </span>
                            <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">
                              {groupResults.length} algoritma
                            </span>
                          </div>
                        </button>
                      )
                    },
                  )}
                </div>
              </div>
            )
          ) : showPipeline && selectedSourceImage ? (
            <MultiZoomComparison
              originalUrl={selectedSourceImage.url}
              results={pipelineResults}
              onDownloadResult={onDownloadResult}
            />
          ) : isMultiMode && selectedSourceImage ? (
            <MultiZoomComparison
              originalUrl={selectedSourceImage.url}
              results={siblingResults}
              onDownloadResult={onDownloadResult}
            />
          ) : (
            <>
              {selectedSourceImage &&
                (state.comparisonMode === 'slider' ? (
                  <SliderComparison
                    originalUrl={selectedSourceImage.url}
                    processedUrl={selectedResult.outputUrl}
                  />
                ) : (
                  <ZoomLens
                    originalUrl={selectedSourceImage.url}
                    processedUrl={selectedResult.outputUrl}
                  />
                ))}
              <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
                <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-[0_4px_24px_rgba(0,0,0,0.15)] backdrop-blur-sm">
                  <ComparisonModeToggle
                    mode={state.comparisonMode}
                    onChange={onComparisonModeChange}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Info sidebar */}
        {!isGridMode && !isMultiMode && !showPipeline && (
          <div
            className={`h-full flex-shrink-0 border-l border-[var(--border)] bg-[var(--bg-surface)] transition-all duration-200 ${
              infoOpen ? 'w-80' : 'w-0 overflow-hidden border-l-0'
            }`}
          >
            <div className="flex h-full w-80 flex-col overflow-hidden">
              <div className="flex shrink-0 items-center justify-between px-4 py-3">
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                  Detaylar ve Metrikler
                </span>
                <button
                  type="button"
                  onClick={() => setInfoOpen(false)}
                  className="rounded-md p-1 text-[var(--text-tertiary)] transition hover:bg-[var(--bg-surface-alt)] hover:text-[var(--text-primary)]"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                <div className="flex flex-col gap-4">
                  {selectedSourceImage && (
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                        Görsel
                      </span>
                      <span className="text-[13px] text-[var(--text-primary)]">
                        {selectedSourceImage.name}
                      </span>
                      <span className="text-[11px] text-[var(--text-tertiary)]">
                        {formatSize(selectedSourceImage.size)}
                      </span>
                    </div>
                  )}

                  {selectedAlgo && (
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                        Algoritma
                      </span>
                      <span className="text-[13px] font-medium text-[var(--text-primary)]">
                        {selectedAlgo.name}
                      </span>
                    </div>
                  )}

                  {selectedResult.source === 'synthetic' && (
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                        Efekt
                      </span>
                      <span className="text-[13px] font-medium text-[var(--text-primary)]">
                        {getResultLabel(selectedResult)}
                      </span>
                    </div>
                  )}

                  {selectedResult.source === 'synthetic' && (
                    <div className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] p-3">
                      <div className="flex items-start gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-surface)] text-[var(--accent)]">
                          <Sparkles size={15} />
                        </div>
                        <div>
                          <p className="m-0 text-[12px] font-semibold text-[var(--text-primary)]">
                            Sentetik Sonuç
                          </p>
                          <p className="m-0 mt-0.5 text-[11px] text-[var(--text-secondary)]">
                            Bu görseli tek tıkla iyileştirme zincirine
                            gönderebilirsiniz.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!canRestoreSelectedSynthetic}
                        onClick={() =>
                          onRestoreSyntheticResult(selectedResult.id)
                        }
                        className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold transition ${
                          canRestoreSelectedSynthetic
                            ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
                            : 'cursor-not-allowed bg-[var(--bg-surface)] text-[var(--text-tertiary)]'
                        }`}
                      >
                        <Wand2 size={14} />
                        İyileştir
                      </button>
                      {restoreDisabledReason && (
                        <p className="m-0 text-[11px] text-[var(--text-secondary)]">
                          {restoreDisabledReason}
                        </p>
                      )}
                    </div>
                  )}

                  <MetricsPanel result={selectedResult} />
                </div>
              </div>
            </div>
          </div>
        )}

        {!isGridMode && showPipeline && selectedSourceImage && (
          <div className="flex h-full w-80 flex-shrink-0 flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--bg-surface)]">
            <div className="flex shrink-0 items-center justify-between px-4 py-3">
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                İşlem Zinciri
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              <div className="flex flex-col gap-3">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] p-3">
                  <p className="m-0 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                    Aşamalar
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
                    <PipelineStageCard
                      title="Orijinal"
                      subtitle={selectedSourceImage.name}
                      tone="neutral"
                    />
                    {pipelineResults.map((result) => (
                      <PipelineStageCard
                        key={result.id}
                        title={
                          result.stage === 'synthetic'
                            ? 'Sentetik'
                            : 'İyileştirilmiş'
                        }
                        subtitle={getResultLabel(result)}
                        tone={
                          result.stage === 'synthetic'
                            ? 'synthetic'
                            : 'restored'
                        }
                        onClick={() => onSelectResult(result.id)}
                        active={selectedResult.id === result.id}
                      />
                    ))}
                  </div>
                </div>

                {selectedResult.source === 'synthetic' && (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] p-3">
                    <button
                      type="button"
                      disabled={!canRestoreSelectedSynthetic}
                      onClick={() =>
                        onRestoreSyntheticResult(selectedResult.id)
                      }
                      className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold transition ${
                        canRestoreSelectedSynthetic
                          ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
                          : 'cursor-not-allowed bg-[var(--bg-surface)] text-[var(--text-tertiary)]'
                      }`}
                    >
                      <Wand2 size={14} />
                      İyileştir
                    </button>
                    {restoreDisabledReason && (
                      <p className="m-0 mt-2 text-[11px] text-[var(--text-secondary)]">
                        {restoreDisabledReason}
                      </p>
                    )}
                  </div>
                )}

                <MetricsPanel result={selectedResult} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MetricsPanel({ result }: { result: ProcessedResult }) {
  const referenceInputRef = useRef<HTMLInputElement>(null)
  const showFadeMetric = isFadeMetricApplicable(result)
  const [noReferenceState, setNoReferenceState] = useState<
    MetricLoadState<NoReferenceMetrics>
  >({ status: 'loading' })
  const [fullReferenceState, setFullReferenceState] = useState<
    MetricLoadState<FullReferenceMetrics>
  >({ status: 'idle' })
  const [referenceFileName, setReferenceFileName] = useState<string | null>(
    null,
  )

  useEffect(() => {
    let isCurrent = true
    setNoReferenceState({ status: 'loading' })
    setFullReferenceState({ status: 'idle' })
    setReferenceFileName(null)

    calculateNoReferenceMetrics(result)
      .then((data) => {
        if (isCurrent) setNoReferenceState({ status: 'success', data })
      })
      .catch((error) => {
        const message =
          error instanceof Error
            ? error.message
            : 'Referanssız metrikler hesaplanamadı.'
        if (isCurrent) setNoReferenceState({ status: 'error', message })
      })

    return () => {
      isCurrent = false
    }
  }, [result])

  const handleReferenceFile = async (file: File) => {
    setReferenceFileName(file.name)
    setFullReferenceState({ status: 'loading' })

    try {
      const data = await calculateFullReferenceMetrics(result, file)
      setFullReferenceState({ status: 'success', data })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Referanslı metrikler hesaplanamadı.'
      setFullReferenceState({ status: 'error', message })
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <BarChart3 size={14} className="text-[var(--accent)]" />
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          Metrikler
        </span>
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] p-3">
        <MetricSectionHeader
          title="Referans gerektirmeyen"
          status={noReferenceState.status}
        />

        <div className="mt-3 flex flex-col gap-2">
          <MetricValueRow
            label="Entropi"
            value={
              noReferenceState.status === 'success'
                ? noReferenceState.data.entropy
                : null
            }
            digits={2}
            suffix=" bit"
            description="Yoğunluk dağılımının bilgi içeriği"
            tooltip="Aralık: 0-8 bit (8-bit gri görüntü için). Çok düşük değer detay kaybına işaret eder; yüksek değer daha fazla dağılım/detay gösterebilir ama gürültü de artırabilir. Tek başına kalite metriği değildir."
            loading={noReferenceState.status === 'loading'}
          />

          <MetricValueRow
            label="NIQE"
            value={
              noReferenceState.status === 'success'
                ? noReferenceState.data.niqe
                : null
            }
            digits={2}
            description="Doğal görüntü istatistiklerinden uzaklık"
            tooltip="Aralık: 0 ve üzeri; sabit üst sınır yok. Daha düşük NIQE, görüntünün doğal görüntü istatistiklerine daha yakın olduğunu ve genelde daha iyi kaliteyi gösterir."
            loading={noReferenceState.status === 'loading'}
            emptyLabel="Uygun değil"
          />
          <MetricValueRow
            label="BRISQUE"
            value={
              noReferenceState.status === 'success'
                ? noReferenceState.data.brisque
                : null
            }
            digits={2}
            description="NSS/SVR tabanlı bozulma skoru"
            tooltip="Aralık: genellikle 0-100. Daha düşük BRISQUE daha az algısal bozulma ve genelde daha iyi görüntü kalitesi demektir."
            loading={noReferenceState.status === 'loading'}
            emptyLabel="Uygun değil"
          />
          <MetricValueRow
            label="PIQE"
            value={
              noReferenceState.status === 'success'
                ? noReferenceState.data.piqe
                : null
            }
            digits={2}
            description="Blok tabanlı algısal bozulma skoru"
            tooltip="Aralık: 0-100. Daha düşük PIQE daha az bozulma ve daha iyi kalite olarak yorumlanır; 0 en iyi uç değerdir."
            loading={noReferenceState.status === 'loading'}
            emptyLabel="Uygun değil"
          />
          {showFadeMetric ? (
            <MetricValueRow
              label="FADE"
              value={
                noReferenceState.status === 'success'
                  ? noReferenceState.data.fade
                  : null
              }
              digits={3}
              description="Sis yoğunluğu; düşük değer daha az sis"
              tooltip="Aralık: 0 ve üzeri; sabit üst sınır yok. Daha düşük FADE daha az sis yoğunluğu ve genelde daha iyi sis giderme sonucu anlamına gelir."
              loading={noReferenceState.status === 'loading'}
              emptyLabel="Uygun değil"
            />
          ) : null}

          {noReferenceState.status === 'error' && (
            <MetricError message={noReferenceState.message} />
          )}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] p-3">
        <MetricSectionHeader
          title="Referans gerektiren"
          status={fullReferenceState.status}
        />

        <input
          ref={referenceInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/bmp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleReferenceFile(file)
            event.target.value = ''
          }}
        />

        <button
          type="button"
          onClick={() => referenceInputRef.current?.click()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-[12px] font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
        >
          <Upload size={14} />
          Temiz referans görüntü yükleyin
        </button>

        {referenceFileName && (
          <p className="m-0 mt-2 truncate text-[11px] text-[var(--text-tertiary)]">
            {referenceFileName}
          </p>
        )}

        <div className="mt-3 flex flex-col gap-2">
          <MetricValueRow
            label="MSE"
            value={
              fullReferenceState.status === 'success'
                ? fullReferenceState.data.mse
                : null
            }
            digits={2}
            description="Piksel düzeyi ortalama karesel hata"
            tooltip="Aralık: 0-65025 (8-bit RGB karşılaştırmada). Daha düşük MSE daha az piksel hatası ve daha iyi sonuç demektir; 0 birebir aynı görüntüdür."
            loading={fullReferenceState.status === 'loading'}
          />
          <MetricValueRow
            label="PSNR"
            value={
              fullReferenceState.status === 'success'
                ? fullReferenceState.data.psnr
                : null
            }
            digits={2}
            suffix=" dB"
            description="Piksel düzeyindeki benzerlik"
            tooltip="Aralık: 0-∞ dB (8-bit görüntüde MSE 0 ise ∞). Daha yüksek PSNR daha iyi piksel düzeyi benzerlik demektir."
            loading={fullReferenceState.status === 'loading'}
            exactLabel="∞"
            showExact={fullReferenceState.status === 'success'}
          />
          <MetricValueRow
            label="SSIM"
            value={
              fullReferenceState.status === 'success'
                ? fullReferenceState.data.ssim
                : null
            }
            digits={4}
            description="Parlaklık, kontrast ve yapı benzerliği"
            tooltip="Aralık: teorik olarak -1 ile 1; pratikte çoğu görüntüde 0-1 görülür. 1'e yaklaştıkça sonuç referansa daha çok benzer; daha yüksek SSIM tercih edilir."
            loading={fullReferenceState.status === 'loading'}
          />

          {fullReferenceState.status === 'success' && (
            <p className="m-0 text-[10px] text-[var(--text-tertiary)]">
              Karşılaştırma boyutu: {fullReferenceState.data.comparedWidth}x
              {fullReferenceState.data.comparedHeight}
            </p>
          )}

          {fullReferenceState.status === 'error' && (
            <MetricError message={fullReferenceState.message} />
          )}
        </div>
      </section>
    </div>
  )
}

function MetricSectionHeader({
  title,
  status,
}: {
  title: string
  status: MetricLoadState<unknown>['status']
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12px] font-semibold text-[var(--text-primary)]">
        {title}
      </span>
      {status === 'loading' ? (
        <Loader2 size={13} className="animate-spin text-[var(--accent)]" />
      ) : null}
    </div>
  )
}

function MetricValueRow({
  label,
  value,
  digits,
  description,
  tooltip,
  loading,
  suffix = '',
  exactLabel,
  showExact = false,
  emptyLabel = 'Bekliyor',
}: {
  label: string
  value: number | null
  digits: number
  description: string
  tooltip: string
  loading: boolean
  suffix?: string
  exactLabel?: string
  showExact?: boolean
  emptyLabel?: string
}) {
  const displayValue = loading
    ? 'Hesaplanıyor'
    : value === null
      ? showExact && exactLabel
        ? exactLabel
        : emptyLabel
      : `${value.toFixed(digits)}${suffix}`

  return (
    <div className="rounded-lg bg-[var(--bg-surface)] px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
          <span className="truncate">{label}</span>
          <span
            className="group/help relative inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[var(--text-tertiary)] transition hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            tabIndex={0}
            aria-label={`${label} metriği hakkında bilgi`}
          >
            <CircleHelp size={13} strokeWidth={2} aria-hidden="true" />
            <span
              role="tooltip"
              className="pointer-events-none absolute left-0 top-5 z-50 hidden w-[min(240px,calc(100vw-48px))] rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2 text-left text-[11px] font-normal leading-relaxed text-[var(--text-primary)] shadow-lg group-hover/help:block group-focus/help:block"
            >
              {tooltip}
            </span>
          </span>
        </span>
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">
          {displayValue}
        </span>
      </div>
      <p className="m-0 mt-0.5 text-[10px] text-[var(--text-tertiary)]">
        {description}
      </p>
    </div>
  )
}

function MetricError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
      <AlertCircle size={13} className="mt-0.5 shrink-0" />
      <p className="m-0 text-[11px]">{message}</p>
    </div>
  )
}

function PipelineStageCard({
  title,
  subtitle,
  tone,
  onClick,
  active = false,
}: {
  title: string
  subtitle: string
  tone: 'neutral' | 'synthetic' | 'restored'
  onClick?: () => void
  active?: boolean
}) {
  const toneClass =
    tone === 'synthetic'
      ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
      : tone === 'restored'
        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
        : 'bg-[var(--bg-surface)] text-[var(--text-secondary)]'

  const content = (
    <div
      className={`rounded-lg border px-3 py-2 ${
        active
          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
          : 'border-[var(--border)] bg-[var(--bg-surface)]'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${toneClass}`}
        >
          {title}
        </span>
      </div>
      <p className="m-0 mt-2 text-[12px] text-[var(--text-primary)]">
        {subtitle}
      </p>
    </div>
  )

  if (!onClick) return content

  return (
    <button type="button" onClick={onClick} className="text-left">
      {content}
    </button>
  )
}
