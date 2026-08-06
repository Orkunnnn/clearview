import { useState, useRef, useCallback } from 'react'
import { Download } from 'lucide-react'
import type { ProcessedResult } from '#/types/app'
import { getResultLabel } from '#/types/app'

interface Props {
  originalUrl: string
  results: ProcessedResult[]
  onDownloadResult?: (resultId: string) => void
}

const DEFAULT_ZOOM = 2
const MIN_ZOOM = 1
const MAX_ZOOM = 8
const LENS_SIZE = 200

export default function MultiZoomComparison({
  originalUrl,
  results,
  onDownloadResult,
}: Props) {
  const [cursor, setCursor] = useState<{
    imgX: number
    imgY: number
    renderedW: number
    renderedH: number
    visible: boolean
  }>({ imgX: 0, imgY: 0, renderedW: 1, renderedH: 1, visible: false })
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const imgRefs = useRef<Map<string, HTMLImageElement>>(new Map())

  const computeNormalized = useCallback(
    (e: React.MouseEvent, img: HTMLImageElement) => {
      const rect = img.getBoundingClientRect()
      const naturalW = img.naturalWidth
      const naturalH = img.naturalHeight
      const elemW = rect.width
      const elemH = rect.height
      const imgAspect = naturalW / naturalH
      const elemAspect = elemW / elemH

      let renderedW: number, renderedH: number, offsetX: number, offsetY: number
      if (imgAspect > elemAspect) {
        renderedW = elemW
        renderedH = elemW / imgAspect
        offsetX = 0
        offsetY = (elemH - renderedH) / 2
      } else {
        renderedH = elemH
        renderedW = elemH * imgAspect
        offsetX = (elemW - renderedW) / 2
        offsetY = 0
      }

      const relX = (e.clientX - rect.left - offsetX) / renderedW
      const relY = (e.clientY - rect.top - offsetY) / renderedH

      return { relX, relY, renderedW, renderedH }
    },
    [],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent, img: HTMLImageElement) => {
      const { relX, relY, renderedW, renderedH } = computeNormalized(e, img)
      if (relX < 0 || relX > 1 || relY < 0 || relY > 1) {
        setCursor((prev) => ({ ...prev, visible: false }))
        return
      }
      setCursor({ imgX: relX, imgY: relY, renderedW, renderedH, visible: true })
    },
    [computeNormalized],
  )

  const handleMouseLeave = useCallback(() => {
    setCursor((prev) => ({ ...prev, visible: false }))
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom((prev) =>
      Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, prev + (e.deltaY > 0 ? -0.5 : 0.5)),
      ),
    )
  }, [])

  // Tüm paneller: orijinal + sonuçlar
  const panels = [
    { key: 'original', label: 'Orijinal', url: originalUrl, resultId: null },
    ...results.map((result) => ({
      key: result.id,
      label: getResultLabel(result),
      url: result.outputUrl,
      resultId: result.stage === 'restored' ? result.id : null,
    })),
  ]

  const colCount = panels.length
  // Dinamik grid: max 4 sütun, fazlası alt satıra
  const gridCols =
    colCount <= 2
      ? 'grid-cols-2'
      : colCount <= 3
        ? 'grid-cols-3'
        : 'grid-cols-4'

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className={`grid ${gridCols} h-full w-full gap-1`}>
        {panels.map((panel) => (
          <div
            key={panel.key}
            className="relative flex flex-col overflow-hidden"
          >
            {/* Etiket */}
            <div className="flex h-8 items-center justify-center gap-1 bg-[var(--bg-surface)] px-2 py-1.5">
              <span
                className={`min-w-0 truncate text-[11px] font-semibold ${
                  panel.key === 'original'
                    ? 'text-[var(--text-secondary)]'
                    : 'text-[var(--accent)]'
                }`}
              >
                {panel.label}
              </span>
              {panel.resultId && onDownloadResult && (
                <button
                  type="button"
                  onClick={() => {
                    if (panel.resultId) onDownloadResult(panel.resultId)
                  }}
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-alt)] hover:text-[var(--text-primary)]"
                  aria-label={`${panel.label} sonucunu indir`}
                  title="Temizlenen görseli indir"
                >
                  <Download size={12} />
                </button>
              )}
            </div>
            {/* Görsel */}
            <div className="relative flex-1 overflow-hidden bg-[var(--bg-base)]">
              <img
                ref={(el) => {
                  if (el) imgRefs.current.set(panel.key, el)
                }}
                src={panel.url}
                alt={panel.label}
                className="h-full w-full object-contain"
                onMouseMove={(e) => {
                  const img = imgRefs.current.get(panel.key)
                  if (img) handleMouseMove(e, img)
                }}
                onMouseLeave={handleMouseLeave}
                onWheel={handleWheel}
                draggable={false}
              />
              {/* Zoom lens overlay - absolute, layout'u etkilemez */}
              {cursor.visible && (
                <div className="pointer-events-none absolute top-2 left-1/2 z-10 -translate-x-1/2">
                  <ZoomOverlay
                    url={panel.url}
                    imgX={cursor.imgX}
                    imgY={cursor.imgY}
                    zoom={zoom}
                    renderedW={cursor.renderedW}
                    renderedH={cursor.renderedH}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {/* Zoom seviyesi ve bilgi */}
      <div className="flex items-center justify-center gap-3 bg-[var(--bg-surface)] px-3 py-1.5">
        <span className="rounded bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-bold text-white">
          {zoom.toFixed(1)}x
        </span>
        <span className="text-[10px] text-[var(--text-tertiary)]">
          Fare tekerleğiyle yakınlaştırın
        </span>
      </div>
    </div>
  )
}

function ZoomOverlay({
  url,
  imgX,
  imgY,
  zoom,
  renderedW,
  renderedH,
}: {
  url: string
  imgX: number
  imgY: number
  zoom: number
  renderedW: number
  renderedH: number
}) {
  const bgSizeX = renderedW * zoom
  const bgSizeY = renderedH * zoom
  const halfLens = LENS_SIZE / 2
  const bgPosX = -(imgX * renderedW * zoom - halfLens)
  const bgPosY = -(imgY * renderedH * zoom - halfLens)

  return (
    <div
      className="overflow-hidden rounded-lg border-2 border-[var(--accent)] shadow-lg"
      style={{
        width: LENS_SIZE,
        height: LENS_SIZE,
        backgroundImage: `url(${url})`,
        backgroundSize: `${bgSizeX}px ${bgSizeY}px`,
        backgroundPosition: `${bgPosX}px ${bgPosY}px`,
        backgroundRepeat: 'no-repeat',
      }}
    />
  )
}
