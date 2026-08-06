import { Check, Cloud, CloudRain } from 'lucide-react'
import type { MethodType, TaskCategory } from '#/types/app'
import { ALGORITHMS } from '#/types/app'

interface Props {
  category: TaskCategory
  selectedAlgorithmIds: string[]
  onCategoryChange: (category: TaskCategory) => void
  onAlgorithmToggle: (id: string) => void
}

const methodTypeLabels: Record<MethodType, string> = {
  classical: 'Klasik',
  'deep-learning': 'Derin Öğrenme',
}

function MethodTypeBadge({ methodType }: { methodType: MethodType }) {
  const isDeepLearning = methodType === 'deep-learning'

  return (
    <span
      className={`absolute -top-2 right-2 inline-flex h-5 items-center whitespace-nowrap rounded-full border px-2 text-[10px] font-semibold leading-none shadow-sm ${
        isDeepLearning
          ? 'border-[var(--method-deep-border)] bg-[var(--method-deep-bg)] text-[var(--method-deep-text)]'
          : 'border-[var(--method-classical-border)] bg-[var(--method-classical-bg)] text-[var(--method-classical-text)]'
      }`}
    >
      {methodTypeLabels[methodType]}
    </span>
  )
}

export default function AlgorithmSelector({
  category,
  selectedAlgorithmIds,
  onCategoryChange,
  onAlgorithmToggle,
}: Props) {
  const filtered = ALGORITHMS.filter((a) => a.category === category)

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex rounded-lg bg-[var(--bg-surface-alt)] p-1">
        <button
          type="button"
          onClick={() => onCategoryChange('dehazing')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
            category === 'dehazing'
              ? 'bg-[var(--bg-surface)] text-[var(--accent)] shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Cloud size={13} />
          Sis Giderme
        </button>
        <button
          type="button"
          onClick={() => onCategoryChange('deraining')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
            category === 'deraining'
              ? 'bg-[var(--bg-surface)] text-[var(--accent)] shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <CloudRain size={13} />
          Yağmur Giderme
        </button>
      </div>

      <div className="flex flex-col gap-3 pt-2">
        {filtered.map((algo) => {
          const isSelected = selectedAlgorithmIds.includes(algo.id)
          return (
            <button
              key={algo.id}
              type="button"
              onClick={() => onAlgorithmToggle(algo.id)}
              className={`group relative flex items-start gap-2 rounded-lg border px-3 py-2 pr-28 text-left transition ${
                isSelected
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                  : 'border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-alt)]'
              }`}
            >
              <div
                className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition ${
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                    : 'border-[var(--border-strong)] bg-transparent'
                }`}
              >
                {isSelected && <Check size={10} strokeWidth={3} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="m-0 min-w-0 text-[13px] font-semibold leading-5 text-[var(--text-primary)]">
                  {algo.name}
                </p>
              </div>
              <MethodTypeBadge methodType={algo.methodType} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
