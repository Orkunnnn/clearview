import type { AppState } from '#/hooks/useAppState'
import type { AppMode, SyntheticEffect, TaskCategory } from '#/types/app'
import AlgorithmSelector from './AlgorithmSelector'
import ImageUploader from './ImageUploader'
import ImageThumbnailList from './ImageThumbnailList'
import ProcessButton from './ProcessButton'
import SyntheticWeatherControls from './SyntheticWeatherControls'

interface Props {
  state: AppState
  onModeChange: (mode: AppMode) => void
  onCategoryChange: (category: TaskCategory) => void
  onAlgorithmToggle: (id: string) => void
  onFilesAdded: (files: File[]) => void
  onImageSelect: (id: string) => void
  onImageRemove: (id: string) => void
  onToggleImageSelection: (id: string) => void
  onSelectAllImages: () => void
  onClearImageSelection: () => void
  onSyntheticEffectChange: (effect: SyntheticEffect) => void
  onSyntheticIntensityChange: (value: number) => void
  onProcess: () => void
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 px-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
      {children}
    </p>
  )
}

export default function AppSidebar({
  state,
  onModeChange,
  onCategoryChange,
  onAlgorithmToggle,
  onFilesAdded,
  onImageSelect,
  onImageRemove,
  onToggleImageSelection,
  onSelectAllImages,
  onClearImageSelection,
  onSyntheticEffectChange,
  onSyntheticIntensityChange,
  onProcess,
}: Props) {
  const canProcessRestore =
    state.images.length > 0 &&
    state.selectedAlgorithmIds.length > 0 &&
    !state.isProcessing
  const canProcessSynthetic =
    state.selectedImageIds.length > 0 &&
    state.syntheticEffect !== null &&
    !state.isProcessing
  const canProcess =
    state.mode === 'restore' ? canProcessRestore : canProcessSynthetic
  const buttonLabel =
    state.mode === 'restore'
      ? 'İşle'
      : state.syntheticEffect === 'fog'
        ? 'Sis Üret'
        : state.syntheticEffect === 'rain'
          ? 'Yağmur Üret'
          : 'Efekt Seç'

  return (
    <aside className="flex w-72 flex-shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-surface)]">
      {/* Header */}
      <div className="flex h-10 items-center border-b border-[var(--border)] px-3">
        <div className="inline-flex items-center gap-2 text-[13px] font-bold text-[var(--text-primary)]">
          NetGör
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-3">
        <SectionLabel>Mod</SectionLabel>
        <div className="flex rounded-xl bg-[var(--bg-surface-alt)] p-1">
          <button
            type="button"
            onClick={() => onModeChange('restore')}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
              state.mode === 'restore'
                ? 'bg-[var(--bg-surface)] text-[var(--accent)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            İyileştirme
          </button>
          <button
            type="button"
            onClick={() => onModeChange('synthetic')}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
              state.mode === 'synthetic'
                ? 'bg-[var(--bg-surface)] text-[var(--accent)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Sentetik Hava
          </button>
        </div>

        <SectionLabel>
          {state.mode === 'restore' ? 'Algoritma' : 'Hava'}
        </SectionLabel>
        {state.mode === 'restore' ? (
          <AlgorithmSelector
            category={state.category}
            selectedAlgorithmIds={state.selectedAlgorithmIds}
            onCategoryChange={onCategoryChange}
            onAlgorithmToggle={onAlgorithmToggle}
          />
        ) : (
          <SyntheticWeatherControls
            effect={state.syntheticEffect}
            intensity={state.syntheticIntensity}
            capabilities={state.capabilities}
            onEffectChange={onSyntheticEffectChange}
            onIntensityChange={onSyntheticIntensityChange}
          />
        )}

        <SectionLabel>Görseller</SectionLabel>
        <ImageUploader onFilesAdded={onFilesAdded} />
        {state.mode === 'synthetic' && state.images.length > 0 && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-2 py-2">
            <span className="text-[11px] text-[var(--text-secondary)]">
              {state.selectedImageIds.length} seçili
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onSelectAllImages}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--bg-surface)]"
              >
                Tümünü Seç
              </button>
              <button
                type="button"
                onClick={onClearImageSelection}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]"
              >
                Seçimi Temizle
              </button>
            </div>
          </div>
        )}
        <ImageThumbnailList
          images={state.images}
          activeImageId={state.activeImageId}
          selectedImageIds={state.selectedImageIds}
          onSelect={onImageSelect}
          onRemove={onImageRemove}
          onToggleSelection={onToggleImageSelection}
          selectionEnabled={state.mode === 'synthetic'}
        />
      </div>

      {/* Footer: Process button */}
      <div className="border-t border-[var(--border)] px-3 py-3">
        <ProcessButton
          disabled={!canProcess}
          isProcessing={state.isProcessing}
          onClick={onProcess}
          label={buttonLabel}
        />
      </div>
    </aside>
  )
}
