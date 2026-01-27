import { useId, useRef, useLayoutEffect, useState } from 'react';
import './App.css'

interface TextPathObject {
  text: string;
  textEng?: string; // 英語テキスト（オプショナル）
  charCoords: Array<{ x: number; y: number }>; // 各文字に対応する座標
}

// Catmull-Romスプライン補完を使用して座標の配列から滑らかなSVGパス文字列を生成する関数
function coordsToSmoothPath(coords: Array<{ x: number; y: number }>): string {
  if (coords.length === 0) return '';
  if (coords.length === 1) return `M ${coords[0].x},${coords[0].y}`;
  if (coords.length === 2) {
    return `M ${coords[0].x},${coords[0].y} L ${coords[1].x},${coords[1].y}`;
  }

  // 最初の点を移動先として設定
  let path = `M ${coords[0].x},${coords[0].y}`;

  // Catmull-Romスプライン補完を使用
  // 各セグメント（P1からP2）に対して、P0, P1, P2, P3の4点を使用
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = i > 0 ? coords[i - 1] : {
      x: coords[i].x - (coords[i + 1].x - coords[i].x),
      y: coords[i].y - (coords[i + 1].y - coords[i].y)
    };
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = i < coords.length - 2 ? coords[i + 2] : {
      x: coords[i + 1].x + (coords[i + 1].x - coords[i].x),
      y: coords[i + 1].y + (coords[i + 1].y - coords[i].y)
    };

    // Catmull-Romスプラインからベジェ曲線への変換
    // CP1 = P1 + (P2 - P0) / 6
    // CP2 = P2 - (P3 - P1) / 6
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }

  return path;
}

// パス上の位置と角度を計算する関数
function getPathPointAtLength(path: SVGPathElement, length: number): { x: number; y: number; angle: number } {
  const point = path.getPointAtLength(length);
  const nextPoint = path.getPointAtLength(Math.min(length + 1, path.getTotalLength()));
  const angle = Math.atan2(nextPoint.y - point.y, nextPoint.x - point.x) * (180 / Math.PI);
  return { x: point.x, y: point.y, angle };
}

// TextPathObjectを受け取って表示するコンポーネント
function TextPathDisplay({
  textPathObject,
  displayText,
  followPath
}: {
  textPathObject: TextPathObject;
  displayText: string;
  followPath: boolean;
}) {
  const pathId = useId();
  const internalPathRef = useRef<SVGPathElement>(null);
  const [charPositions, setCharPositions] = useState<Array<{ x: number; y: number; angle: number }>>([]);

  const pathData = coordsToSmoothPath(textPathObject.charCoords);

  useLayoutEffect(() => {
    const path = internalPathRef.current;
    if (!path) return;
    const length = path.getTotalLength();

    // 各文字の位置と角度を計算
    const chars = displayText.split('');
    const positions: Array<{ x: number; y: number; angle: number }> = [];

    if (chars.length > 0 && length > 0) {
      const charWidth = length / chars.length;
      for (let i = 0; i < chars.length; i++) {
        const charLength = (i + 0.5) * charWidth;
        const pathPoint = getPathPointAtLength(path, charLength);
        // followPathがtrueの場合はパスの角度、falseの場合は0（回転なし）
        const rotation = followPath ? pathPoint.angle : 0;
        positions.push({
          x: pathPoint.x,
          y: pathPoint.y,
          angle: rotation
        });
      }
    }

    setCharPositions(positions);
  }, [pathData, displayText, followPath]);

  return (
    <>
      <defs>
        <path id={pathId} d={pathData} />
      </defs>
      {/* パスの長さを取得するための非表示パス */}
      <path
        ref={internalPathRef}
        d={pathData}
        fill="none"
        stroke="none"
        style={{ visibility: 'hidden', position: 'absolute' }}
      />
      {/* パスに沿った滑らかな背景 */}
      <path
        d={pathData}
        fill="none"
        stroke="rgba(255, 255, 255, 0.4)"
        strokeWidth="32"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 各文字を個別に表示 */}
      {displayText.split('').map((char, index) => {
        const pos = charPositions[index];
        if (!pos) return null;
        return (
          <text
            key={index}
            x={pos.x}
            y={pos.y}
            fontSize="24"
            fill="red"
            fontFamily="sans-serif"
            dominantBaseline="middle"
            textAnchor="middle"
            transform={`rotate(${pos.angle}, ${pos.x}, ${pos.y})`}
            style={{
              userSelect: 'none',
              WebkitUserSelect: 'none',
              MozUserSelect: 'none',
              msUserSelect: 'none',
              pointerEvents: 'none'
            }}
          >
            {char}
          </text>
        );
      })}
    </>
  );
}

function App() {
  // サンプルデータ：1文字ごとに座標を指定（4文字なので4つの座標）
  const initialTextPath: TextPathObject = {
    textEng: 'Hida Mountains',
    text: '飛騨山脈',
    charCoords: [
      { x: 100, y: 400 },   // 「飛」の座標
      { x: 300, y: 300 },  // 「騨」の座標
      { x: 500, y: 270 },   // 「山」の座標
      { x: 700, y: 300 }    // 「脈」の座標
    ]
  };

  const [charCoords, setCharCoords] = useState(initialTextPath.charCoords);
  const [followPath, setFollowPath] = useState(true); // パスに沿った表示かどうか
  const sampleTextPath: TextPathObject = {
    ...initialTextPath,
    charCoords
  };

  type TextMode = 'japanese' | 'english' | 'custom';
  const [textMode, setTextMode] = useState<TextMode>('japanese');
  const [customText, setCustomText] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

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

  // SVG座標系でのマウス位置を取得
  const getSVGPoint = (event: React.MouseEvent<SVGSVGElement>, svg: SVGSVGElement): { x: number; y: number } => {
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const scaleX = viewBox.width / rect.width;
    const scaleY = viewBox.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  };

  const handleMouseDown = (index: number, event: React.MouseEvent<SVGCircleElement>) => {
    if (!isEditMode) return;
    event.preventDefault();
    event.stopPropagation();
    setDraggingIndex(index);
  };

  // 編集モード中にテキスト選択を防ぐ
  useLayoutEffect(() => {
    if (!isEditMode) return;

    const preventSelect = (e: Event) => {
      e.preventDefault();
    };

    document.addEventListener('selectstart', preventSelect);
    document.addEventListener('dragstart', preventSelect);

    return () => {
      document.removeEventListener('selectstart', preventSelect);
      document.removeEventListener('dragstart', preventSelect);
    };
  }, [isEditMode]);

  const handleMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!isEditMode || draggingIndex === null) return;

    const svg = event.currentTarget;
    const point = getSVGPoint(event, svg);
    setCharCoords(prev => {
      const newCoords = [...prev];
      newCoords[draggingIndex] = { x: point.x, y: point.y };
      return newCoords;
    });
  };

  const handleMouseUp = () => {
    setDraggingIndex(null);
  };

  // ポイント削除
  const handleDeletePoint = (index: number, event: React.MouseEvent) => {
    event.stopPropagation();
    if (charCoords.length > 2) {
      setCharCoords(charCoords.filter((_, i) => i !== index));
    }
  };

  // SVG内のクリック位置にポイントを追加
  const handleSVGClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!isEditMode || draggingIndex !== null) return;
    // ポイント上をクリックした場合は追加しない
    if ((event.target as SVGElement).tagName === 'circle') return;

    const svg = event.currentTarget;
    const point = getSVGPoint(event, svg);
    setCharCoords([...charCoords, point]);
  };

  return (
    <>
      <div style={{ marginBottom: '10px' }}>
        <button
          onClick={() => setTextMode('japanese')}
          style={{
            marginRight: '10px',
            padding: '8px 16px',
            backgroundColor: textMode === 'japanese' ? '#4CAF50' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          日本語
        </button>
        {sampleTextPath.textEng && (
          <button
            onClick={() => setTextMode('english')}
            style={{
              marginRight: '10px',
              padding: '8px 16px',
              backgroundColor: textMode === 'english' ? '#4CAF50' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            English
          </button>
        )}
        <button
          onClick={() => setTextMode('custom')}
          style={{
            marginRight: '10px',
            padding: '8px 16px',
            backgroundColor: textMode === 'custom' ? '#4CAF50' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          カスタム
        </button>
        {textMode === 'custom' && (
          <input
            type="text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="テキストを入力"
            style={{
              padding: '8px 12px',
              fontSize: '14px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              marginLeft: '10px',
              minWidth: '200px'
            }}
          />
        )}
        <button
          onClick={() => setIsEditMode(!isEditMode)}
          style={{
            marginLeft: '10px',
            padding: '8px 16px',
            backgroundColor: isEditMode ? '#FF9800' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {isEditMode ? '編集終了' : 'ポイント編集'}
        </button>
        <button
          onClick={() => setFollowPath(!followPath)}
          style={{
            marginLeft: '10px',
            padding: '8px 16px',
            backgroundColor: followPath ? '#2196F3' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {followPath ? 'パス沿い' : '回転なし'}
        </button>
      </div>
      <svg
        width="800"
        height="600"
        viewBox="0 0 800 600"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleSVGClick}
        style={{
          cursor: draggingIndex !== null ? 'grabbing' : isEditMode ? 'crosshair' : 'default',
          userSelect: isEditMode ? 'none' : 'auto',
          WebkitUserSelect: isEditMode ? 'none' : 'auto',
          MozUserSelect: isEditMode ? 'none' : 'auto',
          ...(isEditMode && { msUserSelect: 'none' as const })
        } as React.CSSProperties}
      >
        {/* 背景画像を重ねて表示 */}
        <image href="/01_terrain.webp" width="800" height="600" preserveAspectRatio="xMidYMid slice" />
        <image href="/02_lake.webp" width="800" height="600" preserveAspectRatio="xMidYMid slice" />
        <image href="/03_land_rf.webp" width="800" height="600" preserveAspectRatio="xMidYMid slice" />
        <TextPathDisplay textPathObject={sampleTextPath} displayText={displayText} followPath={followPath} />
        {isEditMode && charCoords.map((coord, index) => (
          <g key={index}>
            {/* ドラッグ判定用の透明な大きな円 */}
            <circle
              cx={coord.x}
              cy={coord.y}
              r="15"
              fill="transparent"
              style={{ cursor: draggingIndex === index ? 'grabbing' : 'grab' }}
              onMouseDown={(e) => handleMouseDown(index, e)}
            />
            {/* 見た目用の小さな円 */}
            <circle
              cx={coord.x}
              cy={coord.y}
              r="6"
              fill="#2196F3"
              stroke="white"
              strokeWidth="2"
              style={{ pointerEvents: 'none' }}
            />
            {/* 削除ボタン（最小2点の場合は表示しない） */}
            {charCoords.length > 2 && (
              <g
                transform={`translate(${coord.x + 12}, ${coord.y - 12})`}
                style={{ cursor: 'pointer' }}
                onClick={(e) => handleDeletePoint(index, e)}
              >
                <circle
                  r="8"
                  fill="#f44336"
                  stroke="white"
                  strokeWidth="1.5"
                />
                <text
                  x="0"
                  y="0"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="10"
                  fill="white"
                  fontWeight="bold"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  ×
                </text>
              </g>
            )}
          </g>
        ))}
      </svg>
    </>
  )
}

export default App
