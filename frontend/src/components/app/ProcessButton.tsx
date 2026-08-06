import { Play, Loader2 } from 'lucide-react'

interface Props {
  disabled: boolean
  isProcessing: boolean
  onClick: () => void
  label?: string
}

export default function ProcessButton({
  disabled,
  isProcessing,
  onClick,
  label = 'İşle',
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isProcessing}
      className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition ${
        disabled || isProcessing
          ? 'cursor-not-allowed bg-[var(--bg-surface-alt)] text-[var(--text-tertiary)]'
          : 'bg-[var(--accent)] text-white shadow-[0_1px_3px_rgba(0,0,0,0.12),0_4px_12px_var(--accent-soft)] hover:bg-[var(--accent-hover)]'
      }`}
    >
      {isProcessing ? (
        <Loader2 size={15} className="animate-spin" />
      ) : (
        <Play size={15} />
      )}
      {isProcessing ? 'İşleniyor...' : label}
    </button>
  )
}
