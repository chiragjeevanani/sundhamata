import React, { useState } from 'react';

export const DonutPieChart = ({
  data = [],
  title = 'Sales by Category',
  subtitle = 'Revenue distribution across product lines',
  totalLabel = 'Total Sales',
  totalValue = '₹18.4L',
  size = 180,
  strokeWidth = 26,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const total = data.reduce((sum, item) => sum + (item.value || 0), 0) || 1;
  const center = size / 2;
  const radius = center - strokeWidth / 2 - 4;
  const circumference = 2 * Math.PI * radius;

  let currentOffset = 0;
  const slices = data.map((item, idx) => {
    const percentage = (item.value / total) * 100;
    const strokeDasharray = `${(percentage / 100) * circumference} ${circumference}`;
    const strokeDashoffset = -currentOffset;
    currentOffset += (percentage / 100) * circumference;

    return {
      ...item,
      percentage: Math.round(percentage),
      strokeDasharray,
      strokeDashoffset,
      idx,
    };
  });

  const activeItem = hoveredIdx !== null ? slices[hoveredIdx] : null;

  return (
    <div className="w-full">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-stone-900 tracking-tight">{title}</h3>
        {subtitle && <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-5 pt-1">
        {/* Donut SVG */}
        <div className="relative shrink-0 select-none" style={{ width: size, height: size }}>
          <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90 transform">
            {/* Background Ring */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke="#F5F5F4"
              strokeWidth={strokeWidth}
            />

            {/* Segments */}
            {slices.map((slice) => (
              <circle
                key={slice.label}
                cx={center}
                cy={center}
                r={radius}
                fill="transparent"
                stroke={slice.color || 'var(--color-brand-500)'}
                strokeWidth={hoveredIdx === slice.idx ? strokeWidth + 4 : strokeWidth}
                strokeDasharray={slice.strokeDasharray}
                strokeDashoffset={slice.strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-200 cursor-pointer"
                onMouseEnter={() => setHoveredIdx(slice.idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            ))}
          </svg>

          {/* Center Callout */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-2">
            <span className="text-[11px] font-medium text-stone-400">
              {activeItem ? activeItem.label : totalLabel}
            </span>
            <span className="text-base font-semibold text-stone-900 tabular-nums tracking-tight leading-none mt-1">
              {activeItem ? activeItem.formattedValue || `${activeItem.percentage}%` : totalValue}
            </span>
            {activeItem && (
              <span className="text-xs font-medium text-brand-600 tabular-nums mt-0.5">
                {activeItem.percentage}% share
              </span>
            )}
          </div>
        </div>

        {/* Legend List */}
        <div className="flex-1 w-full space-y-2.5 text-xs">
          {slices.map((item) => (
            <div
              key={item.label}
              onMouseEnter={() => setHoveredIdx(item.idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className={`p-2 rounded-xl transition-all cursor-pointer border ${
                hoveredIdx === item.idx
                  ? 'bg-stone-50 border-stone-300 shadow-2xs'
                  : 'border-transparent hover:bg-stone-50/60'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: item.color || 'var(--color-brand-500)' }}
                  />
                  <span className="font-bold text-stone-800 truncate">{item.label}</span>
                </div>
                <div className="flex items-center gap-2 font-mono shrink-0">
                  <span className="font-black text-ink-900">
                    {item.formattedValue || item.value}
                  </span>
                  <span className="text-[10.5px] font-bold text-stone-400">
                    ({item.percentage}%)
                  </span>
                </div>
              </div>

              {/* Progress bar line */}
              <div className="w-full h-1.5 rounded-full bg-stone-100 mt-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${item.percentage}%`,
                    backgroundColor: item.color || 'var(--color-brand-500)',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
