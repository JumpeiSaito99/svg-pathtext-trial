import { useEffect, useState } from 'react';
import kyushuImage from '../assets/レリーフ4c_九州地方.png';

// JSON 08小図35-36_改行空白除去版.json の型
interface MapTextObject {
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
  layers: MapLayer[];
}

const MAP_JSON_URL = `${(import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')}/textdata.json`;

export function MapPage() {
  const [mapDoc, setMapDoc] = useState<MapDocument | null>(null);
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({});

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

  const loaded = mapDoc !== null;
  const { width, height, layers } = mapDoc ?? {
    width: 1000,
    height: 1000,
    layers: [] as MapLayer[]
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

        <div style={{ flex: 1, minWidth: 0 }}>
          {loaded && (
            <svg
              className="mainSvg"
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="xMidYMid meet"
              style={{
                width: '100%',
                maxHeight: '85vh',
                background: '#fafafa',
                border: '1px solid #e5e7eb',
                borderRadius: 8
              }}
              aria-label="08小図35-36のテキスト・オブジェクト表示"
            >
              <title>08小図35-36 JSONデータのテキスト表示</title>
              <image
                href={kyushuImage}
                x="0"
                y="0"
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
                            x={obj.x / 0.9 - 100}
                            y={obj.y / 0.9 - 1700}
                            fontSize={obj.fontSize}
                            fontFamily="sans-serif"
                            fill="#111"
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
          )}
        </div>
      </div>
    </div>
  );
}
