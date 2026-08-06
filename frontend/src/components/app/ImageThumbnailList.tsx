import { X, ImageIcon } from 'lucide-react'
import type { UploadedImage } from '#/types/app'

interface Props {
  images: UploadedImage[]
  activeImageId: string | null
  selectedImageIds: string[]
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onToggleSelection: (id: string) => void
  selectionEnabled?: boolean
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ImageThumbnailList({
  images,
  activeImageId,
  selectedImageIds,
  onSelect,
  onRemove,
  onToggleSelection,
  selectionEnabled = false,
}: Props) {
  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 py-3 text-center">
        <ImageIcon
          size={20}
          className="text-[var(--text-tertiary)] opacity-40"
        />
        <p className="m-0 text-[11px] text-[var(--text-tertiary)]">
          Henüz resim yüklenmedi
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0.5 overflow-y-auto">
      {images.map((img) => {
        const isActive = img.id === activeImageId
        const isSelected = selectedImageIds.includes(img.id)
        return (
          <div
            key={img.id}
            className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition ${
              isActive
                ? 'bg-[var(--accent-soft)]'
                : 'hover:bg-[var(--bg-surface-alt)]'
            }`}
            onClick={() => onSelect(img.id)}
          >
            {selectionEnabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleSelection(img.id)
                }}
                className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-[10px] font-bold transition ${
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                    : 'border-[var(--border-strong)] text-transparent'
                }`}
                aria-label={`${img.name} seçimi`}
              >
                ✓
              </button>
            )}
            <img
              src={img.previewUrl}
              alt={img.name}
              className="h-9 w-9 flex-shrink-0 rounded-md object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-[12px] font-medium text-[var(--text-primary)]">
                {img.name}
              </p>
              <p className="m-0 text-[10px] text-[var(--text-tertiary)]">
                {formatSize(img.size)}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onRemove(img.id)
              }}
              className="flex-shrink-0 rounded p-0.5 text-[var(--text-tertiary)] opacity-0 transition hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
            >
              <X size={13} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
