import React from 'react';

interface MuscleEntry {
  sets: number;
  load: number;
  relativeLoad: number;
  sessions: number;
}

interface MuscleRadarProps {
  muscleData: Record<string, MuscleEntry>;
}

// Fixed 8-spoke wheel — most meaningful muscle groups for overview
const SPOKES = [
  { key: 'Chest',     hex: '#F09595', cssVar: 'var(--chest)'     },
  { key: 'Shoulders', hex: '#AFA9EC', cssVar: 'var(--shoulders)' },
  { key: 'Back',      hex: '#5DCAA5', cssVar: 'var(--back)'      },
  { key: 'Biceps',    hex: '#85B7EB', cssVar: 'var(--biceps)'    },
  { key: 'Legs',      hex: '#EF9F27', cssVar: 'var(--legs)'      },
  { key: 'Glutes',    hex: '#F4B96A', cssVar: '#F4B96A'          },
  { key: 'Core',      hex: '#ff7a59', cssVar: 'var(--core)'      },
  { key: 'Triceps',   hex: '#AFA9EC', cssVar: 'var(--triceps)'   },
];

// Normalize sets → 0-1 (cap at 15 sets = 100%)
const normalize = (sets: number) => Math.min(sets / 15, 1);

export const MuscleRadar: React.FC<MuscleRadarProps> = ({ muscleData }) => {
  const N = SPOKES.length;
  const SIZE = 220;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const R = 76;   // outer ring radius
  const LABEL_R = R + 22; // label distance from center

  const angleOf = (i: number) => -Math.PI / 2 + (2 * Math.PI / N) * i;

  const spoke = SPOKES.map((m, i) => {
    const angle = angleOf(i);
    const load = normalize(muscleData[m.key]?.sets || 0);
    return {
      ...m,
      angle,
      load,
      px: cx + R * load * Math.cos(angle),
      py: cy + R * load * Math.sin(angle),
      // label position — push labels a bit more outside on diagonal axes
      lx: cx + LABEL_R * Math.cos(angle),
      ly: cy + LABEL_R * Math.sin(angle),
      axisx: cx + R * Math.cos(angle),
      axisy: cy + R * Math.sin(angle),
    };
  });

  // Filled polygon of actual load
  const polygon = spoke.map((s, i) => `${i === 0 ? 'M' : 'L'}${s.px.toFixed(2)},${s.py.toFixed(2)}`).join(' ') + ' Z';

  // Max ring polygon (outer boundary)
  const maxRing = spoke.map((s, i) => `${i === 0 ? 'M' : 'L'}${s.axisx.toFixed(2)},${s.axisy.toFixed(2)}`).join(' ') + ' Z';

  // Ring grid at 25, 50, 75, 100%
  const rings = [0.25, 0.5, 0.75, 1.0];

  // Top 3 muscles by sets for the bottom summary
  const topMuscles = SPOKES
    .map((m) => ({ ...m, sets: muscleData[m.key]?.sets || 0 }))
    .filter((m) => m.sets > 0)
    .sort((a, b) => b.sets - a.sets)
    .slice(0, 4);

  const hasData = topMuscles.length > 0;

  // Dominant muscle
  const dominant = topMuscles[0];

  // Label anchor based on angle position
  const anchor = (lx: number) => {
    if (lx < cx - 6) return 'end';
    if (lx > cx + 6) return 'start';
    return 'middle';
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[10px] uppercase tracking-[0.8px] text-[var(--text-secondary)] font-semibold">
          MUSCLE LOAD
        </h3>
        {dominant && (
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: `${dominant.hex}22`, color: dominant.hex, border: `1px solid ${dominant.hex}44` }}
          >
            {dominant.key} dominant
          </span>
        )}
      </div>

      {/* Radar SVG */}
      <div className="relative w-full" style={{ aspectRatio: '1/1', maxHeight: 220 }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" height="100%">
          <defs>
            <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#C8FF00" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#C8FF00" stopOpacity="0.06" />
            </radialGradient>
          </defs>

          {/* Ring grid lines */}
          {rings.map((r, ri) => {
            const pts = spoke.map((s, i) => {
              const a = angleOf(i);
              return `${i === 0 ? 'M' : 'L'}${(cx + R * r * Math.cos(a)).toFixed(2)},${(cy + R * r * Math.sin(a)).toFixed(2)}`;
            }).join(' ') + ' Z';
            return (
              <path
                key={ri}
                d={pts}
                fill="none"
                stroke={r === 1 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}
                strokeWidth={r === 1 ? 0.8 : 0.5}
              />
            );
          })}

          {/* Ring % labels */}
          {[0.5, 1.0].map((r) => (
            <text
              key={r}
              x={cx + 3}
              y={cy - R * r + 4}
              fontSize="6"
              fill="rgba(255,255,255,0.2)"
              textAnchor="start"
            >
              {r * 100}%
            </text>
          ))}

          {/* Axis spokes */}
          {spoke.map((s, i) => (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={s.axisx}
              y2={s.axisy}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="0.6"
            />
          ))}

          {/* Load fill polygon */}
          {hasData && (
            <path d={polygon} fill="url(#radarFill)" stroke="#C8FF00" strokeWidth="1.5" strokeLinejoin="round" />
          )}

          {/* Colored dot at each muscle's load point */}
          {hasData && spoke.map((s, i) => s.load > 0 && (
            <g key={i}>
              <circle cx={s.px} cy={s.py} r="4" fill={s.hex} opacity="0.9" />
              <circle cx={s.px} cy={s.py} r="2" fill="#fff" opacity="0.8" />
            </g>
          ))}

          {/* Center circle */}
          <circle cx={cx} cy={cy} r="3" fill="rgba(200,255,0,0.4)" />

          {/* Labels */}
          {spoke.map((s, i) => {
            const isActive = s.load > 0;
            return (
              <text
                key={i}
                x={s.lx}
                y={s.ly}
                textAnchor={anchor(s.lx)}
                dominantBaseline="middle"
                fontSize="8.5"
                fontWeight="700"
                fill={isActive ? s.hex : 'rgba(255,255,255,0.22)'}
                letterSpacing="0.3"
              >
                {s.key.toUpperCase()}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Bottom: top muscles summary */}
      {topMuscles.length > 0 ? (
        <div className="flex gap-1.5 mt-0.5">
          {topMuscles.map((m) => {
            const pct = Math.round(normalize(m.sets) * 100);
            return (
              <div
                key={m.key}
                className="flex-1 rounded-lg px-2 py-1.5 text-center"
                style={{ background: `${m.hex}12`, border: `1px solid ${m.hex}28` }}
              >
                <p className="text-[8px] font-bold uppercase tracking-wide mb-0.5" style={{ color: m.hex }}>
                  {m.key}
                </p>
                <p className="text-[12px] font-black tabular-nums leading-none" style={{ color: 'rgba(255,255,255,0.85)' }}>
                  {pct}%
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[10px] text-[var(--text-secondary)] text-center py-1">
          No data yet — log a workout
        </p>
      )}
    </div>
  );
};
