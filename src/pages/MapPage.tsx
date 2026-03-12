import { useEffect, useRef, useState } from 'react';
import kyushuImage from '../assets/bg1.png';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.15;

// JSON 08小図35-36_改行空白除去版.json の型
interface MapTextObject {
  fillColor: string | undefined;
  type: 'text';
  content: string;
  x: number;
  y: number;
  fontSize: number;
}

interface MapLayer {
  name: string;
  objects: MapTextObject[];
}

interface MapDocument {
  document: string;
  width: number;
  height: number;
  bgoffsetx: number;
  bgoffsety: number;
  layers: MapLayer[];
}

const MAP_JSON_URL = `${(import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')}/textdata.json`;

export function MapPage() {
  const [mapDoc, setMapDoc] = useState<MapDocument | null>(null);
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({});
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

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

  const toggleLayer = (name: string) => {
    setLayerVisibility((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const zoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, z * ZOOM_STEP));
  const zoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, z / ZOOM_STEP));

  const loaded = mapDoc !== null;
  const { width, height, layers } = mapDoc ?? {
    width: 1000,
    height: 1000,
    layers: [] as MapLayer[]
  };
  const viewW = width / zoom;
  const viewH = height / zoom;
  const maxPanX = Math.max(0, width - viewW);
  const maxPanY = Math.max(0, height - viewH);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y
    };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const start = dragStartRef.current;
    if (!start) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = viewW / rect.width;
    const scaleY = viewH / rect.height;
    let dx = (start.x - e.clientX) * scaleX;
    let dy = (start.y - e.clientY) * scaleY;
    const newX = Math.max(0, Math.min(maxPanX, start.panX + dx));
    const newY = Math.max(0, Math.min(maxPanY, start.panY + dy));
    setPan({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragStartRef.current = null;
    setIsDragging(false);
  };

  const panClamped = {
    x: Math.max(0, Math.min(pan.x, maxPanX)),
    y: Math.max(0, Math.min(pan.y, maxPanY))
  };

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
          <div className="headerRight">
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
                  disabled={zoom >= MAX_ZOOM}
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
                    cursor: zoom >= MAX_ZOOM ? 'not-allowed' : 'pointer',
                    color: zoom >= MAX_ZOOM ? '#9ca3af' : '#374151',
                    boxSizing: 'border-box',
                    caretColor: 'transparent',
                  }}
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={zoomOut}
                  disabled={zoom <= MIN_ZOOM}
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
                    cursor: zoom <= MIN_ZOOM ? 'not-allowed' : 'pointer',
                    color: zoom <= MIN_ZOOM ? '#9ca3af' : '#374151',
                    boxSizing: 'border-box',
                    caretColor: 'transparent',
                  }}
                >
                  -
                </button>
              </div>
              <svg
                ref={svgRef}
                className="mainSvg"
                viewBox={`${panClamped.x} ${panClamped.y} ${viewW} ${viewH}`}
                preserveAspectRatio="xMidYMid meet"
                style={{
                  width: '100%',
                  maxHeight: '85vh',
                  background: '#fafafa',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  cursor: isDragging ? 'grabbing' : 'grab',
                  userSelect: 'none',
                }}
                aria-label="08小図35-36のテキスト・オブジェクト表示"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              >
                <title>08小図35-36 JSONデータのテキスト表示</title>
                <image
                  href={kyushuImage}
                  x={0}
                  y={0}
                  width={width}
                  height={height}
                  preserveAspectRatio="xMidYMid meet"
                />
                {layers.map((layer, layerIndex) =>
                  layerVisibility[layer.name] !== false ? (
                    // biome-ignore lint/suspicious/noArrayIndexKey: layer.name が重複するデータのため
                    <g key={`layer-${layerIndex}`} data-layer={layer.name}>
                      {layer.objects.map((obj, i) => {
                        if (obj.type === 'text') {
                          return (
                            <text
                              // biome-ignore lint/suspicious/noArrayIndexKey: 同一レイヤー内で一意のため
                              key={`layer-${layerIndex}-obj-${i}`}
                              x={obj.x}
                              y={obj.y}
                              fontSize={obj.fontSize}
                              fontFamily="sans-serif"
                              fill={obj.fillColor}
                              style={{ pointerEvents: 'none' }}
                            >
                              {obj.content}
                            </text>
                          );
                        }
                        return null;
                      })}
                    </g>
                  ) : null
                )}
              </svg>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
