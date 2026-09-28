import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { ImageRecord, ReadingZone, ViewerTool } from '../core/types'
import {
  clamp,
  markHitsFinding,
  markRadiusNorm,
  nearestFindingBoxCenter,
  ratio,
  zonesAt,
  type Point,
} from '../core/geometry'
import { findingShort } from '../data/terminology'
import { assetUrl } from '../core/images'
import { FilmCornerBadge } from './FilmInfoPanel'
import {
  WINDOW_PRESETS,
  WHEEL_ZOOM_FACTOR,
  annotatedSlices,
  applyPanKey,
  availablePresets,
  constrainView,
  filterFindingAnnotations,
  filterSliceAnnotations,
  goToSlice,
  hasMultiSliceStack,
  initialPresetForImage,
  initialSliceIndex,
  isCtStack,
  mapFilmKey,
  markAnnounceText,
  measureLen,
  moveMarkByKey,
  resetView,
  stackFrames,
  toImage,
  viewCenterImagePoint,
  windowSettingForPreset,
  zoomView,
  type PointerTool,
  type WindowSetting,
} from './film-core'

/** Film görüntüleyici (Ausculta PatientStage karşılığı).
 *  İlke: imleç/sürükleme hareketinde React ağacı yeniden çizilmez — dönüşüm ref üzerinden DOM'a yazılır.
 *  Tüm katmanlar (bölgeler, uzman kutuları, işaret, ölçüm) görüntüyle aynı dönüşümü paylaşan
 *  normalize (0–1) SVG içinde çizilir; böylece yakınlaştırmada hizalama bozulmaz.
 *  Port (E2 §8 S12): saf hesaplar `film-core`'dan; pencere/belge erişimi `FilmEnv` ile enjekte edilir
 *  (S7/S9 deseni); `Date.now()` yoktur. */

/** Sahne boyutu gözlemi için minimal yüzey (kaynak: `HTMLElement.clientWidth/Height`). */
export interface FilmStageRoot {
  readonly clientWidth: number
  readonly clientHeight: number
}

/** FilmViewer pencere/belge sınırı: dwell zamanlayıcısı, görünürlük, ResizeObserver.
 *  Üretimde kabuk gerçek vekilini enjekte eder; testler/SSR no-op kullanır. */
export interface FilmEnv {
  readonly visibilityState: 'hidden' | 'visible'
  setInterval(handler: () => void, ms: number): number
  clearInterval(handle: number): void
  observeStage(target: FilmStageRoot, onResize: () => void): () => void
}

export function createNoopFilmEnv(): FilmEnv {
  return {
    visibilityState: 'visible',
    setInterval: () => 0,
    clearInterval: () => undefined,
    observeStage: () => () => undefined,
  }
}

const NOOP_FILM_ENV: FilmEnv = createNoopFilmEnv()

interface BoundingRect {
  left: number
  top: number
  width: number
  height: number
}

interface LayerElement {
  style: { transform: string }
  getBoundingClientRect(): BoundingRect
}

interface StageElement extends FilmStageRoot {
  getBoundingClientRect(): BoundingRect
  addEventListener(type: 'wheel', handler: (event: WheelLike) => void, options?: { passive: boolean }): void
  removeEventListener(type: 'wheel', handler: (event: WheelLike) => void): void
}

interface WheelLike {
  preventDefault(): void
  deltaY: number
  clientX: number
  clientY: number
}

interface PointerTarget {
  setPointerCapture?(pointerId: number): void
}

interface ValueTarget {
  value: string
}

function asStage(el: unknown): StageElement | null {
  if (!el || typeof el !== 'object') return null
  const node = el as Partial<StageElement>
  if (typeof node.clientWidth !== 'number' || typeof node.clientHeight !== 'number') return null
  if (typeof node.getBoundingClientRect !== 'function') return null
  if (typeof node.addEventListener !== 'function' || typeof node.removeEventListener !== 'function') return null
  return node as StageElement
}

function asLayer(el: unknown): LayerElement | null {
  if (!el || typeof el !== 'object') return null
  const node = el as Partial<LayerElement>
  if (!node.style || typeof node.getBoundingClientRect !== 'function') return null
  return node as LayerElement
}

export interface FilmViewerHandle {
  focusZone: (zoneId: string) => void
  reset: () => void
}

export interface FilmViewerProps {
  image: ImageRecord | undefined
  zones: ReadingZone[]
  /** okuma bölgesi katmanı görünür mü (değerlendirmede hep kapalı) */
  showZones: boolean
  /** uzman kutuları görünür mü; `annotationFinding` verilirse yalnız o bulgu */
  showAnnotations: boolean
  annotationFinding?: string | null
  /** değerlendirme: bölge katmanı, uzman kutuları ve etiketler kilitli */
  strict?: boolean
  /** işaretleme etkin (lokalizasyon sorusu yanıtlanıyor) */
  markEnabled?: boolean
  mark?: Point | null
  onMark?: (p: Point) => void
  onZoneEnter?: (zoneIds: string[]) => void
  onZoneDwell?: (zoneIds: string[], dwellMs: number) => void
  /** imlecin şu an üzerinde olduğu bölgeler (yalnız değişimde çağrılır) */
  onActiveZones?: (zoneIds: string[]) => void
  onTool?: (tool: ViewerTool) => void
  onToggleZones?: () => void
  /** kilitli (vaka geçişi / özet kartı) */
  inert?: boolean
  label?: string
  /** film bilgisi öğretim overlay'i (sentetik taraf işareti rozeti) — yalnız öğrenme modunda açılır */
  showInfoOverlay?: boolean
  /** T207: sahne kalan yüksekliğe gerilmez; kendi en-boy oranında çizilir (öğrenme düzeni).
   *  Verilmezse eski davranış korunur (uygulama/değerlendirme ekranları değişmez). */
  fitContent?: boolean
  /** Kesit yığınında son kesite ulaşıldığında (görüntü başına bir kez) — oyunlaştırma "BT Kaşifi" için. */
  onStackEnd?: () => void
  /** T218: görüntü dosyası gerçekten yüklendiğinde (görüntü başına bir kez) — öğrenme
   *  kütüphanesinde öğenin "açıldı" sayılması için; yalnız seçmek yetmez. */
  onImageReady?: () => void
  /** Pencere/belge sınırı; verilmezse güvenli no-op kullanılır. */
  env?: FilmEnv
}

const DWELL_TICK_MS = 250

export const FilmViewer = forwardRef<FilmViewerHandle, FilmViewerProps>(function FilmViewer(
  {
    image,
    zones,
    showZones,
    showAnnotations,
    annotationFinding,
    strict = false,
    markEnabled = false,
    mark,
    onMark,
    onZoneEnter,
    onZoneDwell,
    onActiveZones,
    onTool,
    onToggleZones,
    inert = false,
    label,
    showInfoOverlay = false,
    fitContent = false,
    onStackEnd,
    onImageReady,
    env = NOOP_FILM_ENV,
  },
  ref,
) {
  const stageRef = useRef<unknown>(null)
  const layerRef = useRef<unknown>(null)
  const view = useRef({ scale: 1, tx: 0, ty: 0 })
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null)
  const pointerZones = useRef<string[]>([])
  const pointerInside = useRef(false)
  const [base, setBase] = useState({ w: 0, h: 0 })
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [tool, setTool] = useState<PointerTool>('pan')
  const standardPreset = WINDOW_PRESETS[0]?.w ?? { brightness: 1, contrast: 1 }
  const [win, setWin] = useState<WindowSetting>(standardPreset)
  const [preset, setPreset] = useState('standard')
  const [invert, setInvert] = useState(false)
  const [zoomPct, setZoomPct] = useState(100)
  const [measures, setMeasures] = useState<[Point, Point][]>([])
  const [pending, setPending] = useState<Point | null>(null)
  const [activeZoneLabel, setActiveZoneLabel] = useState<string | null>(null)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [markAnnounce, setMarkAnnounce] = useState('')
  const [sliceIndex, setSliceIndex] = useState(0)

  const aspect = image && image.width > 0 && image.height > 0 ? image.width / image.height : 1

  const stackFramesList = stackFrames(image, preset)
  const multiSlice = hasMultiSliceStack(stackFramesList)
  const clampedSlice = Math.min(sliceIndex, Math.max(0, stackFramesList.length - 1))
  const stackEndFired = useRef<string | null>(null)

  useEffect(() => {
    if (!onStackEnd || !image || stackFramesList.length < 2 || clampedSlice !== stackFramesList.length - 1) return
    if (stackEndFired.current === image.id) return
    stackEndFired.current = image.id
    onStackEnd()
  }, [clampedSlice, stackFramesList.length, image, onStackEnd])

  // T218: görüntü dosyası GERÇEKTEN yüklendiğinde bir kez bildir (öğrenme kaydı "açıldı"
  // tetikleyicisi). `loaded` önceki görüntüden bayat kalabildiği için (konu değişince
  // sıfırlama etkisi bu etkiden SONRA koşar) hangi görüntünün yüklendiği kimlikle izlenir;
  // yalnız seçmek ya da yüklenmemiş görüntü kaydı büyütmez.
  const imageReadyFired = useRef<string | null>(null)
  const loadedImage = useRef<string | null>(null)
  useEffect(() => {
    if (!onImageReady || !image || loadedImage.current !== image.id || imageReadyFired.current === image.id) return
    imageReadyFired.current = image.id
    onImageReady()
  }, [image, loaded, onImageReady])

  const frameSrc = assetUrl(stackFramesList[clampedSlice] ?? image?.runtimeUrl)
  const goSlice = (next: number) => setSliceIndex(goToSlice(next, stackFramesList.length))

  useEffect(() => {
    setLoaded(false)
    setFailed(false)
    setMeasures([])
    setPending(null)
    setTool('pan')
    setWin(standardPreset)
    setPreset(initialPresetForImage(image))
    setInvert(false)
    setSliceIndex(initialSliceIndex(image))
    view.current = { scale: 1, tx: 0, ty: 0 }
    applyTransform()
  }, [image?.id, standardPreset])

  useEffect(() => {
    if (markEnabled) setTool('mark')
    else setTool((t) => (t === 'mark' ? 'pan' : t))
  }, [markEnabled])

  useLayoutEffect(() => {
    const el = asStage(stageRef.current)
    if (!el) return
    const fit = () => {
      const cw = el.clientWidth
      const ch = el.clientHeight
      if (!cw || !ch) return
      const w = Math.min(cw, ch * aspect)
      setBase({ w, h: w / aspect })
    }
    fit()
    return env.observeStage(el, fit)
  }, [aspect, env])

  const applyTransform = useCallback(() => {
    const { scale, tx, ty } = view.current
    const layer = asLayer(layerRef.current)
    if (layer) layer.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`
  }, [])

  const zoomBy = (factor: number, origin?: { x: number; y: number }) => {
    const stageRect = asStage(stageRef.current)?.getBoundingClientRect()
    const zoomOrigin =
      origin && stageRect
        ? {
            clientX: origin.x,
            clientY: origin.y,
            stageRect: {
              left: stageRect.left,
              top: stageRect.top,
              width: stageRect.width,
              height: stageRect.height,
            },
          }
        : undefined
    const result = zoomView(view.current, base, factor, zoomOrigin)
    if (!result.changed) return
    view.current = result.view
    applyTransform()
    setZoomPct(result.zoomPct)
    onTool?.('zoom')
  }

  const reset = () => {
    const r = resetView()
    view.current = r.view
    applyTransform()
    setZoomPct(r.zoomPct)
  }

  const toImagePoint = (clientX: number, clientY: number): Point | null => {
    const layer = asLayer(layerRef.current)
    if (!layer) return null
    const r = layer.getBoundingClientRect()
    return toImage(clientX, clientY, { left: r.left, top: r.top, width: r.width, height: r.height })
  }

  const updateZones = (p: Point | null) => {
    const ids = p ? zonesAt(p, zones) : []
    const prev = pointerZones.current
    const entered = ids.filter((id) => !prev.includes(id))
    const changed = ids.length !== prev.length || entered.length > 0
    pointerZones.current = ids
    if (entered.length) onZoneEnter?.(entered)
    if (changed) onActiveZones?.(ids)
    if (!strict) {
      const top = ids.length ? zones.find((z) => z.id === ids[ids.length - 1]) : null
      setActiveZoneLabel((cur) => (cur === (top?.fullLabel ?? null) ? cur : top?.fullLabel ?? null))
    }
  }

  useEffect(() => {
    if (inert || !loaded) return
    const handle = env.setInterval(() => {
      if (!pointerInside.current || env.visibilityState !== 'visible') return
      if (pointerZones.current.length) onZoneDwell?.(pointerZones.current, DWELL_TICK_MS)
    }, DWELL_TICK_MS)
    return () => env.clearInterval(handle)
  }, [inert, loaded, onZoneDwell, env])

  useImperativeHandle(ref, () => ({
    focusZone: (zoneId: string) => {
      const z = zones.find((zz) => zz.id === zoneId)
      if (!z || !base.w) return
      const r = z.rects[0]
      if (!r) return
      const cx = r.x + r.w / 2
      const cy = r.y + r.h / 2
      const scale = clamp(Math.min(1 / r.w, 1 / r.h) * 0.8, 1.2, 3)
      view.current = constrainView(
        { scale, tx: -(cx - 0.5) * base.w * scale, ty: -(cy - 0.5) * base.h * scale },
        base,
      )
      applyTransform()
      setZoomPct(Math.round(scale * 100))
      pointerInside.current = true
      updateZones({ x: cx, y: cy })
      onTool?.('zoom')
    },
    reset,
  }))

  const onPointerDown = (e: React.PointerEvent) => {
    if (inert || e.button !== 0) return
    ;(e.currentTarget as PointerTarget).setPointerCapture?.(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, tx: view.current.tx, ty: view.current.ty, moved: false }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    pointerInside.current = true
    updateZones(toImagePoint(e.clientX, e.clientY))
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
    if (d.moved && tool === 'mark' && markEnabled) {
      const p = toImagePoint(e.clientX, e.clientY)
      if (p) onMark?.(p)
    } else if (d.moved && (tool === 'pan' || view.current.scale > 1)) {
      view.current = constrainView({ ...view.current, tx: d.tx + dx, ty: d.ty + dy }, base)
      applyTransform()
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d || inert) return
    if (tool === 'mark' && markEnabled) {
      const p = toImagePoint(e.clientX, e.clientY)
      if (p) onMark?.(p)
      return
    }
    if (d.moved) return
    const p = toImagePoint(e.clientX, e.clientY)
    if (!p) return
    if (tool === 'measure') {
      if (!pending) setPending(p)
      else {
        setMeasures((m) => [...m.slice(-1), [pending, p]])
        setPending(null)
        onTool?.('measure')
      }
    }
  }

  const onPointerLeave = () => {
    pointerInside.current = false
    updateZones(null)
  }

  useEffect(() => {
    const el = asStage(stageRef.current)
    if (!el) return
    const onWheel = (e: WheelLike) => {
      if (inert) return
      e.preventDefault()
      if (multiSlice) {
        setSliceIndex((i) => goToSlice(i + (e.deltaY > 0 ? 1 : -1), stackFramesList.length))
        return
      }
      zoomBy(e.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR, { x: e.clientX, y: e.clientY })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [inert, base.w, base.h, multiSlice, stackFramesList.length])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const action = mapFilmKey(e.key, { inert, markEnabled, tool, hasMultiSliceStack: multiSlice })
    if (!action) return
    e.preventDefault()
    switch (action.type) {
      case 'markMove': {
        const next = moveMarkByKey(mark ?? null, view.current, base, action.dx, action.dy)
        onMark?.(next)
        setMarkAnnounce(markAnnounceText(next))
        break
      }
      case 'slice':
        goSlice(clampedSlice + action.delta)
        break
      case 'zoom':
        zoomBy(action.factor)
        break
      case 'reset':
        reset()
        break
      case 'markCenter': {
        const p = viewCenterImagePoint(view.current, base)
        onMark?.(p)
        setMarkAnnounce(markAnnounceText(p))
        break
      }
      case 'pan': {
        view.current = applyPanKey(view.current, base, action.dx, action.dy)
        applyTransform()
        const cx = clamp(0.5 - view.current.tx / (base.w * view.current.scale), 0, 1)
        const cy = clamp(0.5 - view.current.ty / (base.h * view.current.scale), 0, 1)
        pointerInside.current = true
        updateZones({ x: cx, y: cy })
        break
      }
    }
  }

  const ctStack = isCtStack(image)
  const presetOptions = availablePresets(ctStack)
  const choosePreset = (id: string) => {
    const nextWin = windowSettingForPreset(id, ctStack)
    if (!nextWin) return
    setPreset(id)
    setWin(nextWin)
    onTool?.('window')
  }

  const firstMeasure = measures[0]
  const secondMeasure = measures[1]
  const measureRatio =
    firstMeasure && secondMeasure ? ratio(measureLen(firstMeasure, image), measureLen(secondMeasure, image)) : null

  const findingAnnotations = filterFindingAnnotations(image?.annotations ?? [], annotationFinding)
  const sliceAnnotations = filterSliceAnnotations(findingAnnotations, multiSlice, clampedSlice)
  const annotatedSliceList = annotatedSlices(findingAnnotations, multiSlice)

  const filterStyle = `brightness(${win.brightness}) contrast(${win.contrast})${invert ? ' invert(1)' : ''}`
  const cursor = inert ? 'default' : tool === 'mark' && markEnabled ? 'crosshair' : tool === 'measure' ? 'copy' : 'grab'

  const markRadius = markRadiusNorm(image)
  const markMissTarget =
    showAnnotations && !strict && mark && annotationFinding && !markHitsFinding(mark, image, annotationFinding)
      ? nearestFindingBoxCenter(mark, image, annotationFinding)
      : null

  return (
    <div className={`film-viewer ${strict ? 'is-strict' : ''} ${inert ? 'is-inert' : ''}`}>
      <div
        ref={(el) => {
          stageRef.current = el
        }}
        className="film-stage"
        tabIndex={inert ? -1 : 0}
        role="application"
        aria-label={
          label ??
          (multiSlice
            ? 'Toraks BT görüntüleyici. Fare tekerleği veya yukarı/aşağı ok tuşlarıyla kesit gezinin, artı/eksi ile yakınlaştırın, 0 ile sıfırlayın.'
            : 'Akciğer grafisi görüntüleyici. Artı/eksi ile yakınlaştırın, ok tuşlarıyla kaydırın, 0 ile sıfırlayın.')
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        onPointerLeave={onPointerLeave}
        onDoubleClick={reset}
        onKeyDown={onKeyDown}
        style={fitContent ? { cursor, aspectRatio: String(aspect) } : { cursor }}
      >
        {!image && <div className="film-empty">Bu vaka için görüntü kaydı bulunamadı.</div>}
        {image && failed && (
          <div className="film-empty">
            Görüntü dosyası yüklenemedi. Veri seti henüz içe aktarılmamış olabilir: <code>npm run import:sample</code>
          </div>
        )}
        {image && (
          <div
            ref={(el) => {
              layerRef.current = el
            }}
            className="film-layer"
            style={{ width: base.w, height: base.h }}
          >
            <img
              key={image.id}
              src={frameSrc}
              alt={multiSlice ? `Toraks BT — kesit ${clampedSlice + 1}/${stackFramesList.length}` : 'Akciğer grafisi'}
              draggable={false}
              onLoad={() => {
                loadedImage.current = image.id
                setLoaded(true)
              }}
              onError={() => setFailed(true)}
              style={{ filter: filterStyle }}
              className={loaded ? 'is-loaded' : ''}
            />
            <svg className="film-overlay" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
              {showZones &&
                !strict &&
                zones.map((z) =>
                  z.rects.map((r, i) => (
                    <rect key={`${z.id}-${i}`} className={`zone-rect step-${z.step}`} x={r.x} y={r.y} width={r.w} height={r.h} />
                  )),
                )}
              {showAnnotations &&
                !strict &&
                sliceAnnotations.map((a, i) =>
                  a.polygon?.length ? (
                    <polygon key={`an-${i}`} className="anno-poly" points={a.polygon.map(([x, y]) => `${x},${y}`).join(' ')} />
                  ) : (
                    <rect key={`an-${i}`} className="anno-rect" x={a.x} y={a.y} width={a.w} height={a.h} />
                  ),
                )}
              {measures.map((m, i) => (
                <line key={`m-${i}`} className={`measure-line m${i}`} x1={m[0].x} y1={m[0].y} x2={m[1].x} y2={m[1].y} />
              ))}
              {pending && <circle className="measure-dot" cx={pending.x} cy={pending.y} r={0.006} />}
              {markMissTarget && mark && (
                <line
                  className="mark-miss-line"
                  x1={mark.x}
                  y1={mark.y}
                  x2={markMissTarget.x}
                  y2={markMissTarget.y}
                  markerEnd="url(#mark-miss-arrow)"
                />
              )}
              {markMissTarget && (
                <defs>
                  <marker id="mark-miss-arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" className="mark-miss-arrowhead" />
                  </marker>
                </defs>
              )}
            </svg>
            {mark && (
              <>
                <span
                  className={`film-mark-circle ${markMissTarget ? 'is-miss' : ''}`}
                  style={{
                    left: `${mark.x * 100}%`,
                    top: `${mark.y * 100}%`,
                    width: `${markRadius.rx * 2 * 100}%`,
                    height: `${markRadius.ry * 2 * 100}%`,
                  }}
                  aria-hidden="true"
                />
                <span className="film-mark" style={{ left: `${mark.x * 100}%`, top: `${mark.y * 100}%` }} aria-hidden="true" />
              </>
            )}
            {showAnnotations &&
              !strict &&
              sliceAnnotations.map((a, i) => (
                <span key={`al-${i}`} className="anno-label" style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%` }}>
                  {findingShort(a.finding)}
                </span>
              ))}
          </div>
        )}
        {image && loaded && <div className="film-scan" aria-hidden="true" key={`scan-${image.id}`} />}
        {showInfoOverlay && image && loaded && !strict && <FilmCornerBadge image={image} />}
        <div className="film-hud" aria-hidden="true">
          <span>{zoomPct}%</span>
          {multiSlice && <span className="film-hud-slice">Kesit {clampedSlice + 1}/{stackFramesList.length}</span>}
          {multiSlice && showAnnotations && !strict && annotatedSliceList.length > 0 && sliceAnnotations.length === 0 && (
            <span className="film-hud-zone">
              İşaret: kesit {annotatedSliceList[0]! + 1}–{annotatedSliceList[annotatedSliceList.length - 1]! + 1}
            </span>
          )}
          {!strict && activeZoneLabel && <span className="film-hud-zone">{activeZoneLabel}</span>}
        </div>
        {markEnabled && !inert && <div className="film-mark-hint">Bulguyu görüntü üzerinde işaretleyin</div>}
        {markEnabled && !inert && (
          <div className="sr-only" role="status" aria-live="polite">
            {markAnnounce}
          </div>
        )}
      </div>

      <div className="film-tools" role="toolbar" aria-label="Görüntüleyici araçları">
        <div className="seg" role="group" aria-label="İmleç aracı">
          <button type="button" className={tool === 'pan' ? 'active' : ''} aria-pressed={tool === 'pan'} onClick={() => setTool('pan')}>
            Kaydır
          </button>
          <button
            type="button"
            className={tool === 'mark' ? 'active' : ''}
            aria-pressed={tool === 'mark'}
            disabled={!markEnabled}
            onClick={() => setTool('mark')}
            title={markEnabled ? 'Bulguyu işaretle' : 'İşaretleme yalnız lokalizasyon sorusunda açılır'}
          >
            İşaretle
          </button>
          <button
            type="button"
            className={tool === 'measure' ? 'active' : ''}
            aria-pressed={tool === 'measure'}
            onClick={() => {
              setTool('measure')
              setPending(null)
            }}
          >
            Ölç
          </button>
        </div>
        <div className="seg" role="group" aria-label="Yakınlaştırma">
          <button type="button" onClick={() => zoomBy(1 / 1.25)} aria-label="Uzaklaştır">
            −
          </button>
          <button type="button" onClick={() => zoomBy(1.25)} aria-label="Yakınlaştır">
            +
          </button>
          <button type="button" onClick={reset}>
            Sığdır
          </button>
        </div>
        {multiSlice && (
          <label className="film-select film-slice-slider">
            <span>
              Kesit {clampedSlice + 1}/{stackFramesList.length}
            </span>
            <input
              type="range"
              min={0}
              max={stackFramesList.length - 1}
              value={clampedSlice}
              onChange={(e) => goSlice(Number((e.target as ValueTarget).value))}
              aria-label="BT kesiti"
            />
          </label>
        )}
        <label className="film-select">
          <span>Pencere</span>
          <select value={preset} onChange={(e) => choosePreset((e.target as ValueTarget).value)}>
            {presetOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            {preset === 'custom' && <option value="custom">Özel</option>}
          </select>
        </label>
        <div className="popover-wrap">
          <button type="button" className="tool-btn" aria-expanded={adjustOpen} onClick={() => setAdjustOpen((o) => !o)}>
            Parlaklık / kontrast
          </button>
          {adjustOpen && (
            <div className="popover film-adjust" role="group" aria-label="Parlaklık ve kontrast">
              <label>
                Parlaklık <b>{Math.round(win.brightness * 100)}%</b>
                <input
                  type="range"
                  min={50}
                  max={180}
                  value={Math.round(win.brightness * 100)}
                  onChange={(e) => {
                    setWin((w) => ({ ...w, brightness: Number((e.target as ValueTarget).value) / 100 }))
                    setPreset('custom')
                    onTool?.('window')
                  }}
                />
              </label>
              <label>
                Kontrast <b>{Math.round(win.contrast * 100)}%</b>
                <input
                  type="range"
                  min={50}
                  max={250}
                  value={Math.round(win.contrast * 100)}
                  onChange={(e) => {
                    setWin((w) => ({ ...w, contrast: Number((e.target as ValueTarget).value) / 100 }))
                    setPreset('custom')
                    onTool?.('window')
                  }}
                />
              </label>
            </div>
          )}
        </div>
        <button
          type="button"
          className={`tool-btn ${invert ? 'active' : ''}`}
          aria-pressed={invert}
          onClick={() => {
            setInvert((v) => !v)
            onTool?.('invert')
          }}
        >
          Negatif
        </button>
        {!strict && onToggleZones && !ctStack && (
          <button
            type="button"
            className={`tool-btn ${showZones ? 'active' : ''}`}
            aria-pressed={showZones}
            onClick={() => {
              onToggleZones()
              onTool?.('overlay')
            }}
          >
            Okuma bölgeleri
          </button>
        )}
        {(measures.length > 0 || pending) && (
          <span className="film-measure-out" role="status">
            {measures.length === 2 && measureRatio != null
              ? `Oran (1. / 2. ölçüm): ${measureRatio.toFixed(2).replace('.', ',')}`
              : measures.length === 1
                ? '1. ölçüm tamam — ikinci ölçümü çizin'
                : 'Ölçüm: ikinci noktayı seçin'}
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setMeasures([])
                setPending(null)
              }}
            >
              Temizle
            </button>
          </span>
        )}
      </div>
    </div>
  )
})
