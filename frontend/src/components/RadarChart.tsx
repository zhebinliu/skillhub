/**
 * SVG 雷达图,无依赖。
 * 支持 N 个轴(默认 5),每轴 0-1 比例,绘制填充多边形 + 节点 + 轴标签。
 */
import React from 'react';

export interface RadarAxis {
  key: string;
  label: string;       // 短标签(显示在轴端)
  value: number;       // 0..max
}

interface Props {
  axes: RadarAxis[];
  max?: number;        // 每轴的满分(默认 20)
  size?: number;       // SVG 边长,默认 280
  rings?: number;      // 同心圈数,默认 4
  fillColor?: string;
  strokeColor?: string;
}

export default function RadarChart({
  axes,
  max = 20,
  size = 280,
  rings = 4,
  fillColor = 'rgba(124, 92, 255, 0.18)',
  strokeColor = '#9d7bff',
}: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.35;
  const n = axes.length;

  // 轴 i 的极坐标 → 笛卡尔(从顶部 12 点钟开始,顺时针)
  const point = (i: number, r: number) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as const;
  };

  // 数据多边形
  const dataPath = axes
    .map((a, i) => {
      const ratio = Math.max(0, Math.min(1, a.value / max));
      const [x, y] = point(i, R * ratio);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ') + ' Z';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* 同心圈(多边形,不是圆,跟轴一致) */}
      {Array.from({ length: rings }).map((_, ringIdx) => {
        const r = (R * (ringIdx + 1)) / rings;
        const poly = axes
          .map((_, i) => {
            const [x, y] = point(i, r);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(' ');
        return (
          <polygon
            key={ringIdx}
            points={poly}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
        );
      })}

      {/* 轴线 */}
      {axes.map((_, i) => {
        const [x, y] = point(i, R);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
        );
      })}

      {/* 数据多边形 */}
      <path d={dataPath} fill={fillColor} stroke={strokeColor} strokeWidth={1.5} />

      {/* 数据点 */}
      {axes.map((a, i) => {
        const ratio = Math.max(0, Math.min(1, a.value / max));
        const [x, y] = point(i, R * ratio);
        return (
          <circle
            key={`pt-${i}`}
            cx={x}
            cy={y}
            r={3.5}
            fill={strokeColor}
          />
        );
      })}

      {/* 轴标签 */}
      {axes.map((a, i) => {
        const [x, y] = point(i, R * 1.18);
        const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
        const cosA = Math.cos(angle);
        const anchor = Math.abs(cosA) < 0.15 ? 'middle' : cosA > 0 ? 'start' : 'end';
        return (
          <text
            key={`lbl-${i}`}
            x={x}
            y={y}
            fontSize={11}
            fontFamily="JetBrains Mono, ui-monospace, monospace"
            fill="rgba(231,229,238,0.78)"
            textAnchor={anchor}
            dominantBaseline="middle"
          >
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}
