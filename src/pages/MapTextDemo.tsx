import { useEffect, useRef, useLayoutEffect, useState } from 'react';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { TextPathDisplay } from '../components/TextPathDisplay';
import terrainImage from '/01_terrain.webp';
import lakeImage from '/02_lake.webp';
import landImage from '/03_land_rf.webp';

interface TextPathObject {
  text: string;
  textEng?: string;
  charCoords: Array<{ x: number; y: number }>;
}

export function MapTextDemo() {
  const initialTextPath: TextPathObject = {
    textEng: 'Hida Mountains',
    text: '飛騨山脈',
    charCoords: [
      { x: 100, y: 400 },
      { x: 300, y: 300 },
      { x: 500, y: 270 },
      { x: 700, y: 300 }
    ]
  };

  const [charCoords, setCharCoords] = useState(initialTextPath.charCoords);
  const [followPath, setFollowPath] = useState(true);
  const sampleTextPath: TextPathObject = {
    ...initialTextPath,
    charCoords
  };

  type TextMode = 'japanese' | 'english' | 'custom';
  const [textMode, setTextMode] = useState<TextMode>('japanese');
  const [customText, setCustomText] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [draggingPointerId, setDraggingPointerId] = useState<number | null>(null);
  const suppressAddOnPointerUpRef = useRef<number | null>(null);
  const [isMapHintOpen, setIsMapHintOpen] = useState(() => {
    try {
      return localStorage.getItem('mapHintDismissed') !== '1';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('mapHintDismissed', isMapHintOpen ? '0' : '1');
    } catch {
      // ignore
    }
  }, [isMapHintOpen]);

  const displayText = (() => {
    switch (textMode) {
      case 'english':
        return sampleTextPath.textEng || sampleTextPath.text;
      case 'custom':
        return customText || sampleTextPath.text;
      default:
        return sampleTextPath.text;
    }
  })();

  const getSVGPoint = (
    event: { clientX: number; clientY: number },
    svg: SVGSVGElement
  ): { x: number; y: number } => {
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const scaleX = viewBox.width / rect.width;
    const scaleY = viewBox.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  };

  const handlePointPointerDown = (index: number, event: React.PointerEvent<SVGRectElement>) => {
    if (!isEditMode) return;
    event.preventDefault();
    event.stopPropagation();
    setDraggingIndex(index);
    setDraggingPointerId(event.pointerId);
    suppressAddOnPointerUpRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  useLayoutEffect(() => {
    if (!isEditMode) return;
    const preventSelect = (e: Event) => e.preventDefault();
    document.addEventListener('selectstart', preventSelect);
    document.addEventListener('dragstart', preventSelect);
    return () => {
      document.removeEventListener('selectstart', preventSelect);
      document.removeEventListener('dragstart', preventSelect);
    };
  }, [isEditMode]);

  const handleSVGPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!isEditMode || draggingIndex === null) return;
    if (draggingPointerId !== null && event.pointerId !== draggingPointerId) return;
    event.preventDefault();

    const svg = event.currentTarget;
    const point = getSVGPoint(event, svg);
    setCharCoords(prev => {
      const newCoords = [...prev];
      newCoords[draggingIndex] = { x: point.x, y: point.y };
      return newCoords;
    });
  };

  const handleEndDrag = () => {
    setDraggingIndex(null);
    setDraggingPointerId(null);
    suppressAddOnPointerUpRef.current = null;
  };

  const handleDeletePoint = (index: number, event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    suppressAddOnPointerUpRef.current = event.pointerId;
    setCharCoords(prev => (prev.length > 2 ? prev.filter((_, i) => i !== index) : prev));
  };

  const handleSVGPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!isEditMode) return;
    if (draggingIndex !== null) {
      event.preventDefault();
      handleEndDrag();
      return;
    }
    if (suppressAddOnPointerUpRef.current === event.pointerId) {
      suppressAddOnPointerUpRef.current = null;
      return;
    }
    const target = event.target as Element | null;
    if (target?.closest?.('[data-noadd="true"]')) return;

    const svg = event.currentTarget;
    const point = getSVGPoint(event, svg);
    setCharCoords(prev => [...prev, point]);
  };

  return (
    <div className="app">
      <div className="headerBar">
        <div className="headerRow">
          <div className="headerLeft">
            <button
              onClick={() => setTextMode('japanese')}
              className={`modeButton ${textMode === 'japanese' ? 'isActive' : ''}`}
            >
              日本語
            </button>
            {sampleTextPath.textEng && (
              <button
                onClick={() => setTextMode('english')}
                className={`modeButton ${textMode === 'english' ? 'isActive' : ''}`}
              >
                English
              </button>
            )}
            <button
              onClick={() => setTextMode('custom')}
              className={`modeButton ${textMode === 'custom' ? 'isActive' : ''}`}
            >
              カスタム
            </button>
            <div className="customInputSlot">
              <input
                type="text"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="テキストを入力"
                disabled={textMode !== 'custom'}
                aria-hidden={textMode !== 'custom'}
                tabIndex={textMode === 'custom' ? 0 : -1}
                className={`customInput ${textMode === 'custom' ? 'isActive' : ''}`}
              />
            </div>
          </div>
          <div className="headerRight">
            <ToggleSwitch checked={isEditMode} onChange={setIsEditMode} label="パス編集" onColor="#F59E0B" />
            <ToggleSwitch checked={followPath} onChange={setFollowPath} label="文字の回転" onColor="#3B82F6" />
          </div>
        </div>
      </div>
      <div className="mapWrap">
        {isEditMode && isMapHintOpen && (
          <div className="mapHint" role="note" aria-label="編集のヒント">
            <div className="mapHint__text">空いている場所をタップ／クリックすると点を追加できます</div>
            <button
              type="button"
              className="mapHint__close"
              aria-label="ヒントを閉じる"
              onClick={() => setIsMapHintOpen(false)}
            >
              ×
            </button>
          </div>
        )}
        <svg
          className="mainSvg"
          viewBox="0 0 800 600"
          onPointerMove={handleSVGPointerMove}
          onPointerUp={handleSVGPointerUp}
          onPointerCancel={handleEndDrag}
          onPointerLeave={handleEndDrag}
          style={{
            cursor: draggingIndex !== null ? 'grabbing' : isEditMode ? 'crosshair' : 'default',
            userSelect: isEditMode ? 'none' : 'auto',
            WebkitUserSelect: isEditMode ? 'none' : 'auto',
            MozUserSelect: isEditMode ? 'none' : 'auto',
            touchAction: isEditMode ? 'none' : 'pan-x pan-y',
            ...(isEditMode && { msUserSelect: 'none' as const })
          } as React.CSSProperties}
        >
          <image href={terrainImage} width="800" height="600" preserveAspectRatio="xMidYMid slice" />
          <image href={lakeImage} width="800" height="600" preserveAspectRatio="xMidYMid slice" />
          <image href={landImage} width="800" height="600" preserveAspectRatio="xMidYMid slice" />
          <TextPathDisplay textPathObject={sampleTextPath} displayText={displayText} followPath={followPath} />
          {isEditMode && charCoords.map((coord, index) => (
            <g key={index}>
              <rect
                x={coord.x - 22}
                y={coord.y - 22}
                width="44"
                height="44"
                fill="transparent"
                data-noadd="true"
                style={{ cursor: draggingIndex === index ? 'grabbing' : 'grab' }}
                onPointerDown={(e) => handlePointPointerDown(index, e)}
              />
              <circle
                cx={coord.x}
                cy={coord.y}
                r="22"
                fill="rgba(33, 150, 243, 0.18)"
                stroke="#2196F3"
                strokeWidth="2"
                style={{ pointerEvents: 'none' }}
              />
              <circle
                cx={coord.x}
                cy={coord.y}
                r="4"
                fill="#2196F3"
                stroke="white"
                strokeWidth="2"
                style={{ pointerEvents: 'none' }}
              />
              {charCoords.length > 2 && (
                <g
                  transform={`translate(${coord.x + 40}, ${coord.y - 40})`}
                  style={{ cursor: 'pointer' }}
                  data-noadd="true"
                >
                  <rect
                    x={-22}
                    y={-22}
                    width="44"
                    height="44"
                    fill="transparent"
                    onPointerDown={(e) => handleDeletePoint(index, e)}
                  />
                  <text
                    x="0"
                    y="0"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="44"
                    fill="#ef4444"
                    fontWeight="900"
                    stroke="#ef4444"
                    strokeWidth="0.75"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    ×
                  </text>
                </g>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
