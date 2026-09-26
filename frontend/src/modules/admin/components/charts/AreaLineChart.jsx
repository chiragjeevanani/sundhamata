import React, { useState } from 'react';
import { formatINR } from '../../../../utils/formatters';

export const AreaLineChart = ({
  data = [],
  title = 'Revenue Trend',
  subtitle = 'Monthly store sales performance',
  isCurrency = true,
  height = 240,
  accentColor = '#D77F3F',
  timeframes = ['30 Days', '6 Months', '1 Year'],
  activeTimeframe = '6 Months',
  onTimeframeChange,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-xs text-slate-400 font-medium">
        No chart data available
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const range = maxValue - minValue || 1;

  const width = 680;
  const paddingX = 42;
  const paddingTop = 25;
  const paddingBottom = 35;
  const plotWidth = width - paddingX * 2;
  const plotHeight = height - paddingTop - paddingBottom;

  const points = data.map((d, i) => {
    const x = paddingX + (i / (data.length - 1 || 1)) * plotWidth;
    const y = paddingTop + plotHeight - ((d.value - minValue) / range) * plotHeight;
    return { x, y, ...d };
  });

  // Create smooth SVG cubic bezier path
  const pathData = points.reduce((acc, point, i, arr) => {
    if (i === 0) return `M ${point.x},${point.y}`;
    const prev = arr[i - 1];
    const cp1x = prev.x + (point.x - prev.x) / 2;
    const cp1y = prev.y;
    const cp2x = prev.x + (point.x - prev.x) / 2;
    const cp2y = point.y;
    return `${acc} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${point.x},${point.y}`;
  }, '');

  const areaPathData = `${pathData} L ${points[points.length - 1].x},${paddingTop + plotHeight} L ${points[0].x},${paddingTop + plotHeight} Z`;

  const hoveredPoint = hoveredIndex !== null ? points[hoveredIndex] : null;

  return (
    <div className="w-full">
      {/* Chart Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 tracking-tight">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>

        {timeframes && timeframes.length > 0 && (
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-start sm:self-auto">
            {timeframes.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => onTimeframeChange && onTimeframeChange(tf)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                  activeTimeframe === tf
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        )}
      </div>


      {/* SVG Canvas Container */}
      <div className="relative w-full select-none" style={{ height: `${height}px` }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accentColor} stopOpacity="0.30" />
              <stop offset="65%" stopColor={accentColor} stopOpacity="0.05" />
              <stop offset="100%" stopColor={accentColor} stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#B55B1F" />
              <stop offset="50%" stopColor="#D77F3F" />
              <stop offset="100%" stopColor="#E2955A" />
            </linearGradient>
          </defs>

          {/* Horizontal Gridlines & Y-Axis values */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
            const y = paddingTop + plotHeight * (1 - ratio);
            const val = minValue + range * ratio;
            const formattedVal = isCurrency
              ? val >= 100000
                ? `₹${(val / 100000).toFixed(1)}L`
                : formatINR(val)
              : Math.round(val).toLocaleString('en-IN');

            return (
              <g key={idx}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={width - paddingX}
                  y2={y}
                  stroke="#E2E8F0"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <text
                  x={paddingX - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize="9.5"
                  fill="#94A3B8"
                  fontFamily="monospace"
                  fontWeight="600"
                >
                  {formattedVal}
                </text>
              </g>
            );
          })}

          {/* Area Fill */}
          <path d={areaPathData} fill="url(#areaGradient)" />

          {/* Spline Line */}
          <path
            d={pathData}
            fill="none"
            stroke="url(#lineGradient)"
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* X-Axis labels & Interactive Hover Hotspots */}
          {points.map((p, i) => (
            <g key={i}>
              <text
                x={p.x}
                y={height - 10}
                textAnchor="middle"
                fontSize="10"
                fill={hoveredIndex === i ? '#0F2042' : '#64748B'}
                fontWeight={hoveredIndex === i ? '700' : '600'}
                fontFamily="sans-serif"
              >
                {p.label}
              </text>

              {/* Hover vertical guideline */}
              {hoveredIndex === i && (
                <line
                  x1={p.x}
                  y1={paddingTop}
                  x2={p.x}
                  y2={paddingTop + plotHeight}
                  stroke="#E2955A"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
              )}

              {/* Data points */}
              <circle
                cx={p.x}
                cy={p.y}
                r={hoveredIndex === i ? 6 : 4}
                fill="#FFFFFF"
                stroke={accentColor}
                strokeWidth={hoveredIndex === i ? 3 : 2}
                className="transition-all duration-150"
              />

              {/* Invisible mouse hotspot */}
              <rect
                x={p.x - plotWidth / (points.length * 2)}
                y={0}
                width={plotWidth / points.length}
                height={height}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            </g>
          ))}
        </svg>

        {/* Hover Tooltip Card */}
        {hoveredPoint && (
          <div
            className="absolute pointer-events-none z-20 bg-[#0F2042] text-white px-3 py-2 rounded-xl shadow-xl border border-slate-700 text-xs transform -translate-x-1/2 -translate-y-full transition-all duration-100"
            style={{
              left: `${(hoveredPoint.x / width) * 100}%`,
              top: `${Math.max(hoveredPoint.y - 10, 30)}px`,
            }}
          >
            <div className="font-bold text-slate-300 text-[10px] uppercase tracking-wider">
              {hoveredPoint.label} {hoveredPoint.sublabel ? `• ${hoveredPoint.sublabel}` : ''}
            </div>
            <div className="text-sm font-black text-amber-400 font-mono mt-0.5">
              {isCurrency ? formatINR(hoveredPoint.value) : hoveredPoint.value.toLocaleString('en-IN')}
            </div>
            {hoveredPoint.secondary && (
              <div className="text-[10px] text-slate-300 font-medium">
                {hoveredPoint.secondary}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
