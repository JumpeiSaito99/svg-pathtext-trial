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

// TextPathObjectを受け取って表示するコンポーネント
function TextPathDisplay({
  textPathObject,
  displayText
}: {
  textPathObject: TextPathObject;
  displayText: string;
}) {
  const pathId = useId();
  const pathRef = useRef<SVGPathElement>(null);
  const [pathLength, setPathLength] = useState<number>(0);

  const pathData = coordsToSmoothPath(textPathObject.charCoords);

  useLayoutEffect(() => {
    if (pathRef.current) {
      const length = pathRef.current.getTotalLength();
      setPathLength(length);
    }
  }, [pathData, displayText]);

  return (
    <>
      <defs>
        <path id={pathId} d={pathData} />
      </defs>
      {/* パスの長さを取得するための非表示パス */}
      <path
        ref={pathRef}
        d={pathData}
        fill="none"
        stroke="none"
        style={{ visibility: 'hidden', position: 'absolute' }}
      />
      {/* パスに沿った滑らかな背景 */}
      <path
        d={pathData}
        fill="none"
        stroke="rgba(255, 255, 255, 0.8)"
        strokeWidth="32"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        fontSize="24"
        fill="red"
        fontFamily="sans-serif"
        textLength={pathLength > 0 ? pathLength : undefined}
        lengthAdjust="spacing"
        dominantBaseline="middle"
      >
        <textPath href={`#${pathId}`} startOffset="0%" dy="-16">
          {displayText}
        </textPath>
      </text>
    </>
  );
}

function App() {
  // サンプルデータ：1文字ごとに座標を指定（4文字なので4つの座標）
  const sampleTextPath: TextPathObject = {
    textEng: 'Hida Mountains',
    text: '飛騨山脈',
    charCoords: [
      { x: 50, y: 200 },   // 「飛」の座標
      { x: 150, y: 150 },  // 「騨」の座標
      { x: 250, y: 135 },   // 「山」の座標
      { x: 350, y: 150 }    // 「脈」の座標
    ]
  };

  type TextMode = 'japanese' | 'english' | 'custom';
  const [textMode, setTextMode] = useState<TextMode>('japanese');
  const [customText, setCustomText] = useState('');

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
      </div>
      <svg width="400" height="300" viewBox="0 0 400 300">
        <rect width="400" height="300" fill="#F5F5DC" />
        <TextPathDisplay textPathObject={sampleTextPath} displayText={displayText} />
      </svg>
    </>
  )
}

export default App
