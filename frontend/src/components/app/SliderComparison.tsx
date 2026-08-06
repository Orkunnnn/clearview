import { useState, useRef, useCallback, useEffect } from 'react'
import { GripVertical } from 'lucide-react'

interface Props {
  originalUrl: string
  processedUrl: string
}

interface Size {
  width: number
  height: number
}

export function calculateContainedFrameSize(
  naturalSize: Size,
  availableSize: Size,
): Size | null {
  if (
    naturalSize.width <= 0 ||
    naturalSize.height <= 0 ||
    availableSize.width <= 0 ||
    availableSize.height <= 0
  ) {
    return null
  }

  const scale = Math.min(
    availableSize.width / naturalSize.width,
    availableSize.height / naturalSize.height,
  )

  return {
    width: Math.max(1, Math.round(naturalSize.width * scale)),
    height: Math.max(1, Math.round(naturalSize.height * scale)),
  }
}

export default function SliderComparison({ originalUrl, processedUrl }: Props) {
  const [sliderPercent, setSliderPercent] = useState(50)
  const [naturalSize, setNaturalSize] = useState<Size | null>(null)
  const [frameSize, setFrameSize] = useState<Size | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  useEffect(() => {
    setNaturalSize(null)
    setFrameSize(null)
  }, [processedUrl])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !naturalSize) return

    const updateFrameSize = () => {
      const availableWidth = viewport.clientWidth
      const availableHeight = viewport.clientHeight
      const containedSize = calculateContainedFrameSize(naturalSize, {
        width: availableWidth,
        height: availableHeight,
      })

      if (containedSize) setFrameSize(containedSize)
    }

    updateFrameSize()

    const observer = new ResizeObserver(updateFrameSize)
    observer.observe(viewport)

    return () => observer.disconnect()
  }, [naturalSize])

  const handleProcessedLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth, naturalHeight } = e.currentTarget
      if (naturalWidth <= 0 || naturalHeight <= 0) return

      setNaturalSize({
        width: naturalWidth,
        height: naturalHeight,
      })
    },
    [],
  )

  const updateSlider = useCallback((clientX: number) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const x = clientX - rect.left
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100))
    setSliderPercent(percent)
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      isDragging.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
      updateSlider(e.clientX)
    },
    [updateSlider],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return
      updateSlider(e.clientX)
    },
    [updateSlider],
  )

  const handlePointerUp = useCallback(() => {
    isDragging.current = false
  }, [])

  return (
    <div
      ref={viewportRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
    >
      <img
        src={processedUrl}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        draggable={false}
        onLoad={handleProcessedLoad}
      />

      {frameSize && (
        <div
          ref={containerRef}
          className="relative cursor-col-resize touch-none select-none overflow-hidden rounded-lg"
          style={{
            width: `${frameSize.width}px`,
            height: `${frameSize.height}px`,
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Processed (bottom) */}
          <img
            src={processedUrl}
            alt="İşlenmiş"
            className="absolute inset-0 h-full w-full object-fill"
            draggable={false}
          />

          {/* Original (top, clipped) */}
          <img
            src={originalUrl}
            alt="Orijinal"
            className="absolute inset-0 h-full w-full object-fill"
            style={{
              clipPath: `inset(0 ${100 - sliderPercent}% 0 0)`,
              willChange: 'clip-path',
            }}
            draggable={false}
          />

          {/* Slider handle */}
          <div
            className="absolute top-0 bottom-0 z-10 w-[2px] bg-[var(--accent)]"
            style={{ left: `${sliderPercent}%`, transform: 'translateX(-50%)' }}
          >
            <div className="absolute left-1/2 top-1/2 flex h-8 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--accent)] bg-[var(--bg-surface)] shadow-md">
              <GripVertical size={12} className="text-[var(--accent)]" />
            </div>
          </div>

          {/* Labels */}
          <div className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            Orijinal
          </div>
          <div className="pointer-events-none absolute right-2 top-2 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            İşlenmiş
          </div>
        </div>
      )}
    </div>
  )
}
