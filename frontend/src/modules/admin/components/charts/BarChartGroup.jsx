import React, { useState } from 'react';
import { formatINR } from '../../../../utils/formatters';

export const BarChartGroup = ({
  data = [],
  title = 'Monthly Comparison',
  subtitle = 'Revenue & volume trends',
  height = 200,
  isCurrency = true,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  if (!data || data.length === 0) return null;

  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 tracking-tight">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-end justify-between gap-2.5 pt-4 px-1" style={{ height: `${height}px` }}>
        {data.map((item, idx) => {
          const heightPercent = Math.max(Math.round((item.value / maxValue) * 100), 8);
          const isHovered = hoveredIdx === idx;

          return (
            <div
              key={item.label}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="flex-1 flex flex-col items-center justify-end h-full gap-2 group cursor-pointer relative"
            >
              {/* Tooltip on hover */}
              {isHovered && (
                <div className="absolute -top-9 z-20 bg-slate-900 text-white text-xs font-medium px-2 py-1 rounded-md shadow-lg whitespace-nowrap pointer-events-none tabular-nums">
                  {isCurrency ? formatINR(item.value) : item.value.toLocaleString('en-IN')}
                </div>
              )}

              {/* Bar */}
              <div
                style={{ height: `${heightPercent}%` }}
                className={`w-full max-w-[40px] rounded-t-md transition-all duration-200 ${
                  item.highlight
                    ? 'bg-brand-600'
                    : 'bg-slate-300 hover:bg-slate-400'
                } ${isHovered ? 'brightness-110' : ''}`}
              />

              {/* Label */}
              <span
                className={`text-xs font-normal transition-colors ${
                  isHovered ? 'text-slate-900 font-medium' : 'text-slate-500'
                }`}
              >
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>

  );
};
