import { useCallback, useEffect, useRef, useState } from 'react';
import kyushuImage from '../assets/bg1.png';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.15;
const WHEEL_ZOOM_STEP = 1.08;
const WHEEL_SETTLE_MS = 140;

/** 慣性パン: 速度サンプル数・減衰・しきい値（地図座標系 px/s 相当） */
const PAN_HISTORY_MAX = 10;
const PAN_INERTIA_VELOCITY_BOOST = 1.2;
const PAN_INERTIA_MIN_SPEED = 90;
const PAN_INERTIA_MAX_SPEED = 9000;
const PAN_INERTIA_STOP_SPEED = 12;
/** 1 秒あたりの減速率（指数）。大きいほど早く止まる */
const PAN_INERTIA_DECAY_PER_SEC = 2.4;

/** 虫眼鏡レンズ半径（コンテナ CSS px）・UI アクセント */
const MAGNIFIER_LENS_RADIUS_PX = 64;
const MAGNIFIER_UI_ACCENT = '#16a34a';

interface MapTextObject {
  fillColor: string | undefined;
  type: 'text';
  content: string;
  /** 日本語ラベル（あれば UI 言語 ja で優先） */
  contentJa?: string;
  /** 英語ラベル（あれば UI 言語 en で優先） */
  contentEn?: string;
  /** このオブジェクトが属する言語（指定時は一致する場合のみ描画） */
  lang?: 'ja' | 'en';
  x: number;
  y: number;
  fontSize: number;
  fontWeight?: string | number;
  fontFamily?: string;
}

interface MapLayer {
  name: string;
  objects: MapTextObject[];
}

interface MapDocument {
  document: string;
  width: number;
  height: number;
  bgoffsetx?: number;
  bgoffsety?: number;
  layers: MapLayer[];
}

const MAP_JSON_URL = `${(import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')}/textdata.json`;
const MAP_JSON_EN_URL = `${(import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')}/textdata_en.json`;

type Camera = { panX: number; panY: number; zoom: number };

function clampCamera(cam: Camera, mapW: number, mapH: number): Camera {
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.zoom));
  const viewW = mapW / z;
  const viewH = mapH / z;
  const maxPanX = Math.max(0, mapW - viewW);
  const maxPanY = Math.max(0, mapH - viewH);
  return {
    zoom: z,
    panX: Math.max(0, Math.min(maxPanX, cam.panX)),
    panY: Math.max(0, Math.min(maxPanY, cam.panY))
  };
}

/** コンテナと地図ドキュメントから、meet 表示の S / オフセット / ビュー矩形を求める */
function computeViewportLayout(Wc: number, Hc: number, doc: MapDocument, cam: Camera) {
  const c = clampCamera(cam, doc.width, doc.height);
  const viewW = doc.width / c.zoom;
  const viewH = doc.height / c.zoom;
  const S = Math.min(Wc / viewW, Hc / viewH);
  const ox = (Wc - viewW * S) / 2;
  const oy = (Hc - viewH * S) / 2;
  return { cam: c, S, ox, oy, viewW, viewH };
}

function getLabelForLang(obj: MapTextObject, uiLang: 'ja' | 'en'): string | null {
  if (obj.contentJa != null || obj.contentEn != null) {
    if (uiLang === 'ja') return obj.contentJa ?? obj.content;
    return obj.contentEn ?? obj.content;
  }
  if (obj.lang != null && obj.lang !== uiLang) return null;
  return obj.content;
}

function viewportNeedsLabel(
  x: number,
  y: number,
  fontSize: number,
  panX: number,
  panY: number,
  viewW: number,
  viewH: number
): boolean {
  const pad = Math.max(8, fontSize * 1.5);
  return (
    x >= panX - pad &&
    x <= panX + viewW + pad &&
    y >= panY - pad &&
    y <= panY + viewH + pad
  );
}

/** 高解像度レイヤー用: 地図座標の表示矩形に対応する元画像サブ領域を描画 */
function drawViewportBackgroundImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  mapW: number,
  mapH: number,
  panX: number,
  panY: number,
  viewW: number,
  viewH: number
) {
  if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
  const sx = (panX / mapW) * img.naturalWidth;
  const sy = (panY / mapH) * img.naturalHeight;
  const sw = (viewW / mapW) * img.naturalWidth;
  const sh = (viewH / mapH) * img.naturalHeight;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, panX, panY, viewW, viewH);
}

/** 背景用: JSON 全レイヤー・全テキスト（ビューポートに関係なく一度だけ描画） */
function drawAllMapText(ctx: CanvasRenderingContext2D, doc: MapDocument, uiLang: 'ja' | 'en') {
  for (const layer of doc.layers) {
    for (const obj of layer.objects) {
      if (obj.type !== 'text') continue;
      const label = getLabelForLang(obj, uiLang);
      if (label == null || label === '') continue;
      const family = obj.fontFamily ?? 'sans-serif';
      const weight = obj.fontWeight ?? 'normal';
      ctx.font = `${weight} ${obj.fontSize}px ${family}`;
      ctx.fillStyle = obj.fillColor ?? '#000000';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(label, obj.x, obj.y);
    }
  }
}

export function MapPage() {
  const [mapDoc, setMapDoc] = useState<MapDocument | null>(null);
  const [mapDocEn, setMapDocEn] = useState<MapDocument | null>(null);
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({});
  const [displayLang, setDisplayLang] = useState<'ja' | 'en'>('ja');
  const [isDragging, setIsDragging] = useState(false);
  const [zoomUi, setZoomUi] = useState(1);

  const containerRef = useRef<HTMLDivElement>(null);
  const layerWrapRef = useRef<HTMLDivElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const textMountRef = useRef<HTMLDivElement>(null);
  const enTextMountRef = useRef<HTMLDivElement>(null);
  const enMagnifierClipWrapRef = useRef<HTMLDivElement>(null);

  const cameraRef = useRef<Camera>({ panX: 0, panY: 0, zoom: 1 });
  const dragStartRef = useRef<{ px: number; py: number; panX: number; panY: number } | null>(null);
  const transformRafRef = useRef<number | null>(null);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bgDrawnKeyRef = useRef<string>('');
  const bgLoadGenRef = useRef(0);
  /** 高解像度オーバーレイでビューポート背景を描くための元画像 */
  const mapImageRef = useRef<HTMLImageElement | null>(null);

  const mapDocRef = useRef<MapDocument | null>(null);
  mapDocRef.current = mapDoc;

  const applyTransformRef = useRef((): void => {});
  const commitHighResTextRef = useRef((): void => {});

  const panMoveHistoryRef = useRef<Array<{ t: number; panX: number; panY: number }>>([]);
  const inertiaRafRef = useRef<number | null>(null);
  const inertiaLastTRef = useRef(0);

  const stopInertiaPan = useCallback(() => {
    if (inertiaRafRef.current != null) {
      cancelAnimationFrame(inertiaRafRef.current);
      inertiaRafRef.current = null;
    }
  }, []);

  const [magnifierOn, setMagnifierOn] = useState(false);
  const [lensCenter, setLensCenter] = useState({ x: 160, y: 160 });
  const magnifierOnRef = useRef(false);
  magnifierOnRef.current = magnifierOn;
  const lensCenterRef = useRef(lensCenter);
  lensCenterRef.current = lensCenter;
  const layerVisibilityRef = useRef(layerVisibility);
  layerVisibilityRef.current = layerVisibility;
  const syncEnMagnifierClipRef = useRef<(() => void) | null>(null);
  const lensDragRef = useRef<{ grabDx: number; grabDy: number } | null>(null);

  const syncEnMagnifierClip = useCallback(() => {
    const wrap = enMagnifierClipWrapRef.current;
    const container = containerRef.current;
    const doc = mapDocRef.current;
    if (!wrap || !container || !doc) return;
    if (!magnifierOnRef.current) {
      wrap.style.visibility = 'hidden';
      wrap.style.clipPath = 'none';
      return;
    }
    const rect = container.getBoundingClientRect();
    const Wc = rect.width;
    const Hc = rect.height;
    if (Wc <= 0 || Hc <= 0) return;
    const lc = lensCenterRef.current;
    const R = MAGNIFIER_LENS_RADIUS_PX;
    const lay = computeViewportLayout(Wc, Hc, doc, cameraRef.current);
    const { cam, S, ox, oy } = lay;
    const mx = cam.panX + (lc.x - ox) / S;
    const my = cam.panY + (lc.y - oy) / S;
    const rMap = R / S;
    wrap.style.visibility = 'visible';
    wrap.style.clipPath = `circle(${rMap}px at ${mx}px ${my}px)`;
  }, []);

  syncEnMagnifierClipRef.current = syncEnMagnifierClip;

  const applyTransform = useCallback(() => {
    const container = containerRef.current;
    const wrap = layerWrapRef.current;
    const doc = mapDoc;
    if (!container || !wrap || !doc) return;

    const rect = container.getBoundingClientRect();
    const Wc = rect.width;
    const Hc = rect.height;
    if (Wc <= 0 || Hc <= 0) return;

    const lay = computeViewportLayout(Wc, Hc, doc, cameraRef.current);
    cameraRef.current = lay.cam;

    wrap.style.transform = `translate(${lay.ox}px, ${lay.oy}px) scale(${lay.S}) translate(${-lay.cam.panX}px, ${-lay.cam.panY}px)`;
    syncEnMagnifierClipRef.current?.();
  }, [mapDoc]);

  const scheduleApplyTransform = useCallback(() => {
    if (transformRafRef.current != null) return;
    transformRafRef.current = requestAnimationFrame(() => {
      transformRafRef.current = null;
      applyTransform();
    });
  }, [applyTransform]);

  /** textdata_en.json 用。日本語地図座標系に合わせてスケールし、表示ロジックはメイン高解像度と同様 */
  const commitHighResEnOverlay = useCallback(() => {
    const mount = enTextMountRef.current;
    const docJa = mapDoc;
    const docEn = mapDocEn;
    if (!mount || !docJa || !docEn) return;

    const cam = clampCamera(cameraRef.current, docJa.width, docJa.height);
    cameraRef.current = cam;

    const baseDpr = Math.min(2.5, window.devicePixelRatio || 1);
    const dpr = Math.min(4, baseDpr * Math.sqrt(Math.max(1, cam.zoom)));
    const mapW = docJa.width;
    const mapH = docJa.height;
    const viewW = mapW / cam.zoom;
    const viewH = mapH / cam.zoom;

    const scaleX = mapW / docEn.width;
    const scaleY = mapH / docEn.height;
    const fsScale = Math.min(scaleX, scaleY);

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(mapW * dpr);
    canvas.height = Math.round(mapH * dpr);
    canvas.style.cssText = `display:block;width:${mapW}px;height:${mapH}px;pointer-events:none`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, mapW, mapH);

    const bgImg = mapImageRef.current;
    if (bgImg?.complete && bgImg.naturalWidth > 0) {
      drawViewportBackgroundImage(ctx, bgImg, mapW, mapH, cam.panX, cam.panY, viewW, viewH);
    }

    for (const layer of docEn.layers) {
      if (layerVisibility[layer.name] === false) continue;
      for (const obj of layer.objects) {
        if (obj.type !== 'text') continue;
        const label = getLabelForLang(obj, 'en');
        if (label == null || label === '') continue;
        const mx = obj.x * scaleX;
        const my = obj.y * scaleY;
        const fs = obj.fontSize * fsScale;
        if (!viewportNeedsLabel(mx, my, fs, cam.panX, cam.panY, viewW, viewH)) continue;

        const family = obj.fontFamily ?? 'sans-serif';
        const weight = obj.fontWeight ?? 'normal';
        ctx.font = `${weight} ${fs}px ${family}`;
        ctx.fillStyle = obj.fillColor ?? '#000000';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(label, mx, my);
      }
    }

    mount.replaceChildren(canvas);
    syncEnMagnifierClipRef.current?.();
  }, [mapDoc, mapDocEn, layerVisibility]);

  const commitHighResText = useCallback(() => {
    const mount = textMountRef.current;
    const doc = mapDoc;
    if (!mount || !doc) return;

    const cam = clampCamera(cameraRef.current, doc.width, doc.height);
    cameraRef.current = cam;

    const baseDpr = Math.min(2.5, window.devicePixelRatio || 1);
    /** 拡大時は表示領域のラベルをより高密度にラスタライズ */
    const dpr = Math.min(4, baseDpr * Math.sqrt(Math.max(1, cam.zoom)));
    const mapW = doc.width;
    const mapH = doc.height;
    const viewW = mapW / cam.zoom;
    const viewH = mapH / cam.zoom;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(mapW * dpr);
    canvas.height = Math.round(mapH * dpr);
    canvas.style.cssText = `display:block;width:${mapW}px;height:${mapH}px;pointer-events:none`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, mapW, mapH);

    const bgImg = mapImageRef.current;
    if (bgImg?.complete && bgImg.naturalWidth > 0) {
      drawViewportBackgroundImage(ctx, bgImg, mapW, mapH, cam.panX, cam.panY, viewW, viewH);
    }

    for (const layer of doc.layers) {
      if (layerVisibility[layer.name] === false) continue;
      for (const obj of layer.objects) {
        if (obj.type !== 'text') continue;
        const label = getLabelForLang(obj, displayLang);
        if (label == null || label === '') continue;
        if (!viewportNeedsLabel(obj.x, obj.y, obj.fontSize, cam.panX, cam.panY, viewW, viewH)) continue;

        const family = obj.fontFamily ?? 'sans-serif';
        const weight = obj.fontWeight ?? 'normal';
        ctx.font = `${weight} ${obj.fontSize}px ${family}`;
        ctx.fillStyle = obj.fillColor ?? '#000000';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(label, obj.x, obj.y);
      }
    }

    mount.replaceChildren(canvas);
    commitHighResEnOverlay();
  }, [mapDoc, layerVisibility, displayLang, commitHighResEnOverlay]);

  applyTransformRef.current = applyTransform;
  commitHighResTextRef.current = commitHighResText;

  const startInertiaPan = useCallback(
    (vx: number, vy: number) => {
      const doc = mapDocRef.current;
      if (!doc) {
        commitHighResTextRef.current();
        return;
      }
      stopInertiaPan();
      let velX = vx * PAN_INERTIA_VELOCITY_BOOST;
      let velY = vy * PAN_INERTIA_VELOCITY_BOOST;
      const mag = Math.hypot(velX, velY);
      if (mag > PAN_INERTIA_MAX_SPEED) {
        const s = PAN_INERTIA_MAX_SPEED / mag;
        velX *= s;
        velY *= s;
      }
      if (mag < PAN_INERTIA_MIN_SPEED) {
        commitHighResTextRef.current();
        return;
      }

      inertiaLastTRef.current = performance.now();

      const tick = (now: number) => {
        const d = mapDocRef.current;
        if (!d) {
          inertiaRafRef.current = null;
          return;
        }

        const dt = Math.min(48, now - inertiaLastTRef.current) / 1000;
        inertiaLastTRef.current = now;
        if (dt <= 0) {
          inertiaRafRef.current = requestAnimationFrame(tick);
          return;
        }

        const cam = cameraRef.current;
        const unclampedPanX = cam.panX + velX * dt;
        const unclampedPanY = cam.panY + velY * dt;
        const next = clampCamera(
          { ...cam, panX: unclampedPanX, panY: unclampedPanY },
          d.width,
          d.height
        );
        if (next.panX !== unclampedPanX) velX = 0;
        if (next.panY !== unclampedPanY) velY = 0;
        cameraRef.current = next;
        applyTransformRef.current();

        const decay = Math.exp(-PAN_INERTIA_DECAY_PER_SEC * dt);
        velX *= decay;
        velY *= decay;

        const speed = Math.hypot(velX, velY);
        if (speed < PAN_INERTIA_STOP_SPEED) {
          inertiaRafRef.current = null;
          commitHighResTextRef.current();
          return;
        }

        inertiaRafRef.current = requestAnimationFrame(tick);
      };

      inertiaRafRef.current = requestAnimationFrame(tick);
    },
    [stopInertiaPan]
  );

  useEffect(() => {
    return () => stopInertiaPan();
  }, [stopInertiaPan]);

  const scheduleWheelCommit = useCallback(() => {
    if (wheelTimerRef.current != null) clearTimeout(wheelTimerRef.current);
    wheelTimerRef.current = setTimeout(() => {
      wheelTimerRef.current = null;
      commitHighResText();
      setZoomUi(cameraRef.current.zoom);
    }, WHEEL_SETTLE_MS);
  }, [commitHighResText]);

  useEffect(() => {
    fetch(MAP_JSON_URL)
      .then((res) => {
        if (!res.ok) throw new Error('JSONの読み込みに失敗しました');
        return res.json();
      })
      .then((data: MapDocument) => {
        setMapDoc(data);
        const initial: Record<string, boolean> = {};
        data.layers.forEach((layer) => {
          initial[layer.name] = layer.objects.length > 0;
        });
        setLayerVisibility(initial);
      })
      .catch((err) => {
        console.error(err);
        setMapDoc(null);
      });
  }, []);

  useEffect(() => {
    fetch(MAP_JSON_EN_URL)
      .then((res) => {
        if (!res.ok) throw new Error('textdata_en.json の読み込みに失敗しました');
        return res.json();
      })
      .then((data: MapDocument) => setMapDocEn(data))
      .catch((err) => {
        console.error(err);
        setMapDocEn(null);
      });
  }, []);

  /**
   * 固定背景レイヤー: 画像 + JSON 全テキストを一度描画（パン・ズームでは再描画しない）。
   * 表示言語が変わったときだけ画像＋全文を描き直す。
   */
  useEffect(() => {
    if (!mapDoc) return;
    const canvas = bgCanvasRef.current;
    if (!canvas) return;

    const key = `${mapDoc.width}|${mapDoc.height}|${kyushuImage}|${displayLang}`;
    if (bgDrawnKeyRef.current === key) return;

    bgLoadGenRef.current += 1;
    const gen = bgLoadGenRef.current;

    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (gen !== bgLoadGenRef.current) return;
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      const w = mapDoc.width;
      const h = mapDoc.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      drawAllMapText(ctx, mapDoc, displayLang);
      mapImageRef.current = img;
      bgDrawnKeyRef.current = key;
      applyTransform();
      commitHighResText();
    };
    img.src = kyushuImage;
  }, [mapDoc, displayLang, applyTransform, commitHighResText]);

  /** レイヤー可視の変更時は高解像度オーバーレイのみ更新（背景の全文はそのまま） */
  useEffect(() => {
    if (!mapDoc || bgDrawnKeyRef.current === '') return;
    commitHighResText();
  }, [mapDoc, layerVisibility, commitHighResText]);

  /** 英語 JSON が後から到着したとき虫眼鏡用レイヤーを構築 */
  useEffect(() => {
    if (!mapDoc || !mapDocEn || bgDrawnKeyRef.current === '') return;
    commitHighResEnOverlay();
  }, [mapDoc, mapDocEn, commitHighResEnOverlay]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !mapDoc) return;

    const ro = new ResizeObserver(() => {
      applyTransform();
      commitHighResText();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mapDoc, applyTransform, commitHighResText]);

  const toggleLayer = (name: string) => {
    setLayerVisibility((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const zoomByFactor = (factor: number) => {
    if (!mapDoc) return;
    stopInertiaPan();
    const cam = clampCamera(cameraRef.current, mapDoc.width, mapDoc.height);
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.zoom * factor));
    cameraRef.current = clampCamera({ ...cam, zoom: nextZoom }, mapDoc.width, mapDoc.height);
    setZoomUi(cameraRef.current.zoom);
    applyTransform();
    commitHighResText();
  };

  const zoomIn = () => zoomByFactor(ZOOM_STEP);
  const zoomOut = () => zoomByFactor(1 / ZOOM_STEP);

  useEffect(() => {
    if (!magnifierOn) return;
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = MAGNIFIER_LENS_RADIUS_PX;
    if (r.width <= 2 * pad || r.height <= 2 * pad) return;
    setLensCenter({
      x: Math.min(Math.max(pad, r.width / 2), r.width - pad),
      y: Math.min(Math.max(pad, r.height / 2), r.height - pad)
    });
  }, [magnifierOn]);

  useEffect(() => {
    if (!magnifierOn) {
      syncEnMagnifierClipRef.current?.();
      return;
    }
    const id = requestAnimationFrame(() => syncEnMagnifierClipRef.current?.());
    return () => cancelAnimationFrame(id);
  }, [magnifierOn, lensCenter]);

  useEffect(() => {
    if (!magnifierOn || !mapDoc) return;
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const pad = MAGNIFIER_LENS_RADIUS_PX;
      setLensCenter((prev) => ({
        x: Math.min(Math.max(pad, prev.x), Math.max(pad, r.width - pad)),
        y: Math.min(Math.max(pad, prev.y), Math.max(pad, r.height - pad))
      }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [magnifierOn, mapDoc]);

  const handleLensPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    lensDragRef.current = {
      grabDx: cx - lensCenterRef.current.x,
      grabDy: cy - lensCenterRef.current.y
    };
  };

  const handleLensPointerMove = (e: React.PointerEvent) => {
    if (lensDragRef.current == null) return;
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const pad = MAGNIFIER_LENS_RADIUS_PX;
    const nx = Math.min(Math.max(pad, cx - lensDragRef.current.grabDx), rect.width - pad);
    const ny = Math.min(Math.max(pad, cy - lensDragRef.current.grabDy), rect.height - pad);
    setLensCenter({ x: nx, y: ny });
  };

  const handleLensPointerUp = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    lensDragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    e.stopPropagation();
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !mapDoc) return;
    stopInertiaPan();
    panMoveHistoryRef.current = [];
    e.currentTarget.setPointerCapture(e.pointerId);
    const cam = clampCamera(cameraRef.current, mapDoc.width, mapDoc.height);
    cameraRef.current = cam;
    dragStartRef.current = {
      px: e.clientX,
      py: e.clientY,
      panX: cam.panX,
      panY: cam.panY
    };
    const t = performance.now();
    panMoveHistoryRef.current.push({ t, panX: cam.panX, panY: cam.panY });
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const start = dragStartRef.current;
    const doc = mapDoc;
    const container = containerRef.current;
    if (!start || !doc || !container) return;

    const rect = container.getBoundingClientRect();
    const Wc = rect.width;
    const Hc = rect.height;
    if (Wc <= 0 || Hc <= 0) return;

    const cam = clampCamera(cameraRef.current, doc.width, doc.height);
    const viewW = doc.width / cam.zoom;
    const viewH = doc.height / cam.zoom;
    const S = Math.min(Wc / viewW, Hc / viewH);

    let dx = (start.px - e.clientX) / S;
    let dy = (start.py - e.clientY) / S;
    cameraRef.current = clampCamera(
      { ...cam, panX: start.panX + dx, panY: start.panY + dy },
      doc.width,
      doc.height
    );
    const hist = panMoveHistoryRef.current;
    const now = performance.now();
    hist.push({ t: now, panX: cameraRef.current.panX, panY: cameraRef.current.panY });
    if (hist.length > PAN_HISTORY_MAX) hist.shift();
    scheduleApplyTransform();
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    dragStartRef.current = null;
    setIsDragging(false);

    const doc = mapDocRef.current;
    const hist = panMoveHistoryRef.current;
    panMoveHistoryRef.current = [];
    if (doc && hist.length >= 2) {
      const oldest = hist[0];
      const newest = hist[hist.length - 1];
      const dtSec = (newest.t - oldest.t) / 1000;
      if (dtSec >= 1 / 200) {
        const vx = (newest.panX - oldest.panX) / dtSec;
        const vy = (newest.panY - oldest.panY) / dtSec;
        startInertiaPan(vx, vy);
        return;
      }
    }
    commitHighResText();
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !mapDoc) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (inertiaRafRef.current != null) {
        cancelAnimationFrame(inertiaRafRef.current);
        inertiaRafRef.current = null;
        commitHighResTextRef.current();
      }
      const rect = el.getBoundingClientRect();
      const Wc = rect.width;
      const Hc = rect.height;
      if (Wc <= 0 || Hc <= 0) return;

      let cam = clampCamera(cameraRef.current, mapDoc.width, mapDoc.height);
      const viewW = mapDoc.width / cam.zoom;
      const viewH = mapDoc.height / cam.zoom;
      const S = Math.min(Wc / viewW, Hc / viewH);
      const ox = (Wc - viewW * S) / 2;
      const oy = (Hc - viewH * S) / 2;

      const mx = (e.clientX - rect.left - ox) / S + cam.panX;
      const my = (e.clientY - rect.top - oy) / S + cam.panY;

      const direction = e.deltaY > 0 ? -1 : 1;
      const factor = direction > 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.zoom * factor));
      const newViewW = mapDoc.width / newZoom;
      const newViewH = mapDoc.height / newZoom;
      const newS = Math.min(Wc / newViewW, Hc / newViewH);
      const newOx = (Wc - newViewW * newS) / 2;
      const newOy = (Hc - newViewH * newS) / 2;

      const newPanX = mx - (e.clientX - rect.left - newOx) / newS;
      const newPanY = my - (e.clientY - rect.top - newOy) / newS;

      cam = clampCamera({ panX: newPanX, panY: newPanY, zoom: newZoom }, mapDoc.width, mapDoc.height);
      cameraRef.current = cam;
      scheduleApplyTransform();
      scheduleWheelCommit();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [mapDoc, scheduleApplyTransform, scheduleWheelCommit]);

  useEffect(() => {
    return () => {
      if (wheelTimerRef.current != null) clearTimeout(wheelTimerRef.current);
    };
  }, []);

  const loaded = mapDoc !== null;
  const layers = mapDoc?.layers ?? [];

  return (
    <div className="app">
      {!loaded && (
        <div style={{ padding: '8px 12px', background: '#FEF3C7', color: '#92400E', fontSize: '0.9rem' }}>
          JSONを読み込んでいます…（public に <code>textdata.json</code> を配置してください）
        </div>
      )}
      <div className="headerBar">
        <div className="headerRow">
          <div className="headerLeft">
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>九州地方マップ</h2>
            {loaded && mapDoc && (
              <span style={{ marginLeft: 8, fontSize: '0.85rem', color: '#666' }}>
                {mapDoc.document}
              </span>
            )}
          </div>
          <div className="headerRight" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {loaded && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                <span style={{ color: '#666' }}>表示言語</span>
                <select
                  value={displayLang}
                  onChange={(ev) => setDisplayLang(ev.target.value as 'ja' | 'en')}
                  style={{ fontSize: '0.85rem', padding: '2px 6px' }}
                  aria-label="ラベル言語"
                >
                  <option value="ja">日本語 (ja)</option>
                  <option value="en">英語 (en)</option>
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mapWrap" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {loaded && (
          <div className="layerPanel" style={{ flex: '0 0 220px', maxHeight: '80vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '0.95rem' }}>レイヤー</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {layers.map((layer, layerIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: layer.name が重複するデータのため
                <li key={`layer-${layerIndex}`} style={{ marginBottom: 4 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input
                      type="checkbox"
                      checked={layerVisibility[layer.name] !== false}
                      onChange={() => toggleLayer(layer.name)}
                    />
                    <span title={layer.name}>
                      {layer.name.length > 18 ? layer.name.slice(0, 18) + '…' : layer.name}
                    </span>
                    <span style={{ color: '#888', fontSize: '0.75rem' }}>({layer.objects.length})</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          {loaded && (
            <>
              <div
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  zIndex: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                  borderRadius: 6,
                  overflow: 'hidden',
                  border: '1px solid #e5e7eb',
                  background: '#fff',
                }}
              >
                <button
                  type="button"
                  onClick={zoomIn}
                  disabled={zoomUi >= MAX_ZOOM}
                  title="拡大"
                  style={{
                    width: 36,
                    height: 32,
                    padding: 0,
                    margin: 0,
                    border: 'none',
                    borderBottom: '1px solid #e5e7eb',
                    background: '#fff',
                    fontSize: '1.25rem',
                    fontWeight: 'bold',
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: zoomUi >= MAX_ZOOM ? 'not-allowed' : 'pointer',
                    color: zoomUi >= MAX_ZOOM ? '#9ca3af' : '#374151',
                    boxSizing: 'border-box',
                    caretColor: 'transparent',
                  }}
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={zoomOut}
                  disabled={zoomUi <= MIN_ZOOM}
                  title="縮小"
                  style={{
                    width: 36,
                    height: 32,
                    padding: 0,
                    margin: 0,
                    border: 'none',
                    background: '#fff',
                    fontSize: '1.25rem',
                    fontWeight: 'bold',
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: zoomUi <= MIN_ZOOM ? 'not-allowed' : 'pointer',
                    color: zoomUi <= MIN_ZOOM ? '#9ca3af' : '#374151',
                    boxSizing: 'border-box',
                    caretColor: 'transparent',
                  }}
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={() => setMagnifierOn((v) => !v)}
                  aria-pressed={magnifierOn}
                  title={magnifierOn ? '虫眼鏡をオフ' : '虫眼鏡（ドラッグで移動）'}
                  style={{
                    width: 36,
                    height: 32,
                    padding: 0,
                    margin: 0,
                    border: 'none',
                    borderTop: '1px solid #e5e7eb',
                    background: magnifierOn ? '#dcfce7' : '#fff',
                    fontSize: '1rem',
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: magnifierOn ? MAGNIFIER_UI_ACCENT : '#374151',
                    boxSizing: 'border-box',
                    caretColor: 'transparent',
                  }}
                >
                  🔍
                </button>
              </div>

              <div
                ref={containerRef}
                className="mainSvg"
                role="img"
                aria-label="08小図35-36のテキスト・オブジェクト表示（Canvas）"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={(e) => {
                  if (dragStartRef.current == null) return;
                  handlePointerUp(e);
                }}
                style={{
                  position: 'relative',
                  width: '100%',
                  maxHeight: '85vh',
                  aspectRatio: mapDoc ? `${mapDoc.width} / ${mapDoc.height}` : '1',
                  background: '#fafafa',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  cursor: isDragging ? 'grabbing' : 'grab',
                  userSelect: 'none',
                  touchAction: 'none',
                  overflow: 'hidden',
                }}
              >
                <div
                  ref={layerWrapRef}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    transformOrigin: '0 0',
                    willChange: 'transform',
                  }}
                >
                  <canvas
                    ref={bgCanvasRef}
                    style={{ display: 'block', pointerEvents: 'none' }}
                  />
                  <div
                    ref={textMountRef}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      right: 0,
                      bottom: 0,
                      pointerEvents: 'none',
                    }}
                  />
                  <div
                    ref={enMagnifierClipWrapRef}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      right: 0,
                      bottom: 0,
                      pointerEvents: 'none',
                      zIndex: 2,
                      visibility: 'hidden',
                      clipPath: 'none',
                    }}
                  >
                    <div
                      ref={enTextMountRef}
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        right: 0,
                        bottom: 0,
                        pointerEvents: 'none',
                      }}
                    />
                  </div>
                </div>
                {magnifierOn && (
                  <div
                    data-magnifier-lens="1"
                    onPointerDown={handleLensPointerDown}
                    onPointerMove={handleLensPointerMove}
                    onPointerUp={handleLensPointerUp}
                    onPointerCancel={handleLensPointerUp}
                    style={{
                      position: 'absolute',
                      left: lensCenter.x - MAGNIFIER_LENS_RADIUS_PX,
                      top: lensCenter.y - MAGNIFIER_LENS_RADIUS_PX,
                      width: MAGNIFIER_LENS_RADIUS_PX * 2,
                      height: MAGNIFIER_LENS_RADIUS_PX * 2,
                      borderRadius: '50%',
                      border: `3px solid ${MAGNIFIER_UI_ACCENT}`,
                      boxShadow:
                        'inset 0 0 0 1px rgba(255,255,255,0.35), 0 2px 12px rgba(0,0,0,0.18)',
                      background: 'rgba(22,163,74,0.06)',
                      cursor: 'grab',
                      touchAction: 'none',
                      zIndex: 4,
                      boxSizing: 'border-box',
                    }}
                    aria-label="虫眼鏡レンズ。ドラッグで位置を移動"
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
