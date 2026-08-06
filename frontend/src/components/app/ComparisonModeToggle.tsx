import { SplitSquareHorizontal, Search } from 'lucide-react'
import type { ComparisonMode } from '#/types/app'

interface Props {
  mode: ComparisonMode
  onChange: (mode: ComparisonMode) => void
}

export default function ComparisonModeToggle({ mode, onChange }: Props) {
  return (
    <div className="flex rounded-lg bg-[var(--bg-surface-alt)] p-1">
      <button
        type="button"
        onClick={() => onChange('slider')}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition ${
          mode === 'slider'
            ? 'bg-[var(--bg-surface)] text-[var(--accent)] shadow-sm'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
      >
        <SplitSquareHorizontal size={13} />
        Kaydırıcı
      </button>
      <button
        type="button"
        onClick={() => onChange('zoom')}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition ${
          mode === 'zoom'
            ? 'bg-[var(--bg-surface)] text-[var(--accent)] shadow-sm'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
      >
        <Search size={13} />
        Büyüteç
      </button>
    </div>
  )
}
