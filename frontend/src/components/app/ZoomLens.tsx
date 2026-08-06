import { useState, useRef, useCallback } from 'react'

interface Props {
  originalUrl: string
  processedUrl: string
}

const PANEL_SIZE = 160
const OVERLAY_GAP = 24
const DEFAULT_ZOOM = 3
const MIN_ZOOM = 2
const MAX_ZOOM = 6

export default function ZoomLens({ originalUrl, processedUrl }: Props) {
  const [cursor, setCursor] = useState<{
    x: number
    y: number
    imgX: number
    imgY: number
    visible: boolean
  }>({ x: 0, y: 0, imgX: 0, imgY: 0, visible: false })
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const img = imgRef.current
    const container = containerRef.current
    if (!img || !container) return

    const containerRect = container.getBoundingClientRect()
    const imgRect = img.getBoundingClientRect()

    // Cursor pozisyonu container'a göre
    const cx = e.clientX - containerRect.left
    const cy = e.clientY - containerRect.top

    // object-contain offset hesapla: görüntü img elementi içinde nerede render ediliyor
    const naturalW = img.naturalWidth
    const naturalH = img.naturalHeight
    const elemW = imgRect.width
    const elemH = imgRect.height

    const imgAspect = naturalW / naturalH
    const elemAspect = elemW / elemH

    let renderedW: number, renderedH: number, offsetX: number, offsetY: number
    if (imgAspect > elemAspect) {
      // Görüntü daha geniş, yanlarda boşluk yok, üst/alt boşluk var
      renderedW = elemW
      renderedH = elemW / imgAspect
      offsetX = 0
      offsetY = (elemH - renderedH) / 2
    } else {
      // Görüntü daha uzun, üst/alt boşluk yok, yanlarda boşluk var
      renderedH = elemH
      renderedW = elemH * imgAspect
      offsetX = (elemW - renderedW) / 2
      offsetY = 0
    }

    // Cursor'un gerçek görüntü üzerindeki pozisyonu (0-1 arası normalize)
    const relX = (e.clientX - imgRect.left - offsetX) / renderedW
    const relY = (e.clientY - imgRect.top - offsetY) / renderedH

    // Görüntü dışındaysa gösterme
    if (relX < 0 || relX > 1 || relY < 0 || relY > 1) {
      setCursor((prev) => ({ ...prev, visible: false }))
      return
    }

    setCursor({
      x: cx,
      y: cy,
      imgX: relX,
      imgY: relY,
      visible: true,
    })
  }, [])

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

  const img = imgRef.current
  const naturalW = img?.naturalWidth ?? 1
  const naturalH = img?.naturalHeight ?? 1

  const bgSizeX = naturalW * zoom
  const bgSizeY = naturalH * zoom

  const halfPanel = PANEL_SIZE / 2
  // imgX/imgY 0-1 normalize edilmiş, bunu piksel pozisyonuna çevir
  const bgPosX = -(cursor.imgX * naturalW * zoom - halfPanel)
  const bgPosY = -(cursor.imgY * naturalH * zoom - halfPanel)

  const overlayW = PANEL_SIZE * 2 + 12 // 2 panel + gap + padding
  const overlayH = PANEL_SIZE + 28

  const cRect = containerRef.current?.getBoundingClientRect()

  let overlayLeft = cursor.x - overlayW / 2
  let overlayTop = cursor.y - overlayH - OVERLAY_GAP

  if (overlayTop < 0) {
    overlayTop = cursor.y + OVERLAY_GAP
  }
  if (cRect) {
    if (overlayLeft < 4) overlayLeft = 4
    if (overlayLeft + overlayW > cRect.width - 4) {
      overlayLeft = cRect.width - overlayW - 4
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg"
    >
      <img
        ref={imgRef}
        src={processedUrl}
        alt="İşlenmiş"
        className="h-full w-full object-contain"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        draggable={false}
      />

      {cursor.visible && (
        <div
          className="pointer-events-none absolute z-20"
          style={{ left: overlayLeft, top: overlayTop }}
        >
          <div className="flex gap-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] p-1 shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
            {/* Orijinal */}
            <div className="flex flex-col items-center gap-1">
              <div
                className="overflow-hidden rounded-md"
                style={{
                  width: PANEL_SIZE,
                  height: PANEL_SIZE,
                  backgroundImage: `url(${originalUrl})`,
                  backgroundSize: `${bgSizeX}px ${bgSizeY}px`,
                  backgroundPosition: `${bgPosX}px ${bgPosY}px`,
                  backgroundRepeat: 'no-repeat',
                }}
              />
              <span className="text-[10px] font-semibold text-[var(--text-secondary)]">
                Orijinal
              </span>
            </div>
            {/* İşlenmiş */}
            <div className="flex flex-col items-center gap-1">
              <div
                className="overflow-hidden rounded-md"
                style={{
                  width: PANEL_SIZE,
                  height: PANEL_SIZE,
                  backgroundImage: `url(${processedUrl})`,
                  backgroundSize: `${bgSizeX}px ${bgSizeY}px`,
                  backgroundPosition: `${bgPosX}px ${bgPosY}px`,
                  backgroundRepeat: 'no-repeat',
                }}
              />
              <span className="text-[10px] font-semibold text-[var(--text-secondary)]">
                İşlenmiş
              </span>
            </div>
          </div>
          <div className="absolute -top-1 -right-1 rounded bg-[var(--accent)] px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">
            {zoom.toFixed(1)}x
          </div>
        </div>
      )}

      {/* Crosshair */}
      {cursor.visible && (
        <>
          <div
            className="pointer-events-none absolute z-10 h-5 w-px bg-[var(--accent)]"
            style={{ left: cursor.x, top: cursor.y - 10 }}
          />
          <div
            className="pointer-events-none absolute z-10 h-px w-5 bg-[var(--accent)]"
            style={{ left: cursor.x - 10, top: cursor.y }}
          />
        </>
      )}

      <div className="pointer-events-none absolute right-2 bottom-2 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-sm">
        Fare tekerleğiyle yakınlaştırın
      </div>
    </div>
  )
}
