import { CloudFog, CloudRain, Check } from 'lucide-react'
import type { SyntheticEffect, WeatherCapabilities } from '#/types/app'

interface Props {
  effect: SyntheticEffect | null
  intensity: number
  capabilities: WeatherCapabilities
  onEffectChange: (effect: SyntheticEffect) => void
  onIntensityChange: (value: number) => void
}

export default function SyntheticWeatherControls({
  effect,
  intensity,
  capabilities,
  onEffectChange,
  onIntensityChange,
}: Props) {
  const options = [
    {
      id: 'fog' as const,
      title: 'Sis',
      icon: CloudFog,
      disabled: !capabilities.fog.available,
    },
    {
      id: 'rain' as const,
      title: 'Yağmur',
      icon: CloudRain,
      disabled: !capabilities.rain.available,
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        {options.map((option) => {
          const isSelected = effect === option.id
          const Icon = option.icon
          return (
            <button
              key={option.id}
              type="button"
              disabled={option.disabled}
              onClick={() => onEffectChange(option.id)}
              className={`group relative flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${
                option.disabled
                  ? 'cursor-not-allowed border-[var(--border)] bg-[var(--bg-surface-alt)] opacity-60'
                  : isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-alt)]'
              }`}
            >
              <div
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                  option.disabled
                    ? 'bg-[var(--bg-surface)] text-[var(--text-tertiary)]'
                    : 'bg-[var(--bg-surface)] text-[var(--accent)]'
                }`}
              >
                <Icon size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[13px] font-semibold text-[var(--text-primary)]">
                  {option.title}
                </p>
              </div>
              <div
                className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                    : 'border-[var(--border-strong)]'
                }`}
              >
                {isSelected && <Check size={10} strokeWidth={3} />}
              </div>
            </button>
          )
        })}
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="m-0 text-[12px] font-semibold text-[var(--text-primary)]">
              Yoğunluk
            </p>
            <p className="m-0 mt-0.5 text-[11px] text-[var(--text-tertiary)]">
              Sentetik hava şiddetini ayarla
            </p>
          </div>
          <span className="rounded-md bg-[var(--bg-surface)] px-2 py-1 text-[11px] font-semibold text-[var(--accent)]">
            {Math.round(intensity)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={intensity}
          onChange={(event) => onIntensityChange(Number(event.target.value))}
          className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-[var(--border)] accent-[var(--accent)]"
        />
      </div>
    </div>
  )
}
