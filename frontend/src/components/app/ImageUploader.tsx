import { useState, useRef, useCallback } from 'react'
import { Upload } from 'lucide-react'

interface Props {
  onFilesAdded: (files: File[]) => void
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp']
const MAX_SIZE = 20 * 1024 * 1024

export default function ImageUploader({ onFilesAdded }: Props) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const validateAndAdd = useCallback(
    (fileList: FileList | File[]) => {
      const files = Array.from(fileList)
      const valid: File[] = []
      for (const file of files) {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          setError(`Desteklenmeyen biçim: ${file.name}`)
          return
        }
        if (file.size > MAX_SIZE) {
          setError(`Dosya çok büyük (maks 20MB): ${file.name}`)
          return
        }
        valid.push(file)
      }
      setError(null)
      if (valid.length > 0) onFilesAdded(valid)
    },
    [onFilesAdded],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      if (e.dataTransfer.files.length > 0) validateAndAdd(e.dataTransfer.files)
    },
    [validateAndAdd],
  )

  return (
    <div className="flex flex-col gap-1.5">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-5 text-center transition ${
          isDragOver
            ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
            : 'border-[var(--border-strong)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]'
        }`}
      >
        <Upload
          size={20}
          className={`transition ${isDragOver ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'}`}
        />
        <div>
          <p className="m-0 text-[13px] font-medium text-[var(--text-primary)]">
            Resimleri sürükleyin
          </p>
          <p className="m-0 mt-0.5 text-[11px] text-[var(--text-tertiary)]">
            veya tıklayarak seçin
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/bmp"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              validateAndAdd(e.target.files)
              e.target.value = ''
            }
          }}
        />
      </div>
      {error && <p className="m-0 text-[11px] text-red-500">{error}</p>}
    </div>
  )
}
