import { useId, useRef, useLayoutEffect, useState } from 'react';

interface TextPathObject {
  text: string;
  textEng?: string;
  charCoords: Array<{ x: number; y: number }>;
}

// Catmull-Romスプライン補完を使用して座標の配列から滑らかなSVGパス文字列を生成する関数
function coordsToSmoothPath(coords: Array<{ x: number; y: number }>): string {
  if (coords.length === 0) return '';
  if (coords.length === 1) return `M ${coords[0].x},${coords[0].y}`;
  if (coords.length === 2) {
    return `M ${coords[0].x},${coords[0].y} L ${coords[1].x},${coords[1].y}`;
  }

  let path = `M ${coords[0].x},${coords[0].y}`;

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

interface TextPathDisplayProps {
  textPathObject: TextPathObject;
  displayText: string;
  followPath: boolean;
}

export function TextPathDisplay({
  textPathObject,
  displayText,
  followPath
}: TextPathDisplayProps) {
  const pathId = useId();
  const internalPathRef = useRef<SVGPathElement>(null);
  const [charPositions, setCharPositions] = useState<Array<{ x: number; y: number; angle: number }>>([]);

  const pathData = coordsToSmoothPath(textPathObject.charCoords);

  useLayoutEffect(() => {
    const path = internalPathRef.current;
    if (!path) return;
    const length = path.getTotalLength();

    const chars = displayText.split('');
    const positions: Array<{ x: number; y: number; angle: number }> = [];

    if (chars.length > 0 && length > 0) {
      const charWidth = length / chars.length;
      for (let i = 0; i < chars.length; i++) {
        const charLength = (i + 0.5) * charWidth;
        const pathPoint = getPathPointAtLength(path, charLength);
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
      <path
        ref={internalPathRef}
        d={pathData}
        fill="none"
        stroke="none"
        style={{ visibility: 'hidden', position: 'absolute' }}
      />
      <path
        d={pathData}
        fill="none"
        stroke="rgba(255, 255, 255, 0.4)"
        strokeWidth="32"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
