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

const SPOKES = [
  { key: 'Chest',     hex: '#F09595', group: 'push'  },
  { key: 'Shoulders', hex: '#AFA9EC', group: 'push'  },
  { key: 'Back',      hex: '#5DCAA5', group: 'pull'  },
  { key: 'Biceps',    hex: '#85B7EB', group: 'pull'  },
  { key: 'Legs',      hex: '#EF9F27', group: 'lower' },
  { key: 'Glutes',    hex: '#F4B96A', group: 'lower' },
  { key: 'Core',      hex: '#ff7a59', group: 'core'  },
  { key: 'Triceps',   hex: '#AFA9EC', group: 'push'  },
];

const MAX_SETS = 15;
const TARGET_SETS = 10; // weekly goal per muscle — ghost overlay

const normalize = (sets: number) => Math.min(sets / MAX_SETS, 1);

export const MuscleRadar: React.FC<MuscleRadarProps> = ({ muscleData }) => {
  const N = SPOKES.length;
  const SIZE = 220;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const R = 76;
  const LABEL_R = R + 20;

  const angleOf = (i: number) => -Math.PI / 2 + (2 * Math.PI / N) * i;

  const spoke = SPOKES.map((m, i) => {
    const angle = angleOf(i);
    const sets = muscleData[m.key]?.sets || 0;
    const load = normalize(sets);
    return {
      ...m,
      angle,
      load,
      sets,
      px: cx + R * load * Math.cos(angle),
      py: cy + R * load * Math.sin(angle),
      lx: cx + LABEL_R * Math.cos(angle),
      ly: cy + LABEL_R * Math.sin(angle),
      axisx: cx + R * Math.cos(angle),
      axisy: cy + R * Math.sin(angle),
    };
  });

  // Filled polygon of actual load
  const polygon = spoke
    .map((s, i) => `${i === 0 ? 'M' : 'L'}${s.px.toFixed(2)},${s.py.toFixed(2)}`)
    .join(' ') + ' Z';

  // Ghost target polygon — dashed ring showing ideal training volume
  const targetLoad = Math.min(TARGET_SETS / MAX_SETS, 1);
  const ghostPolygon = spoke
    .map((s, i) => {
      const a = angleOf(i);
      return `${i === 0 ? 'M' : 'L'}${(cx + R * targetLoad * Math.cos(a)).toFixed(2)},${(cy + R * targetLoad * Math.sin(a)).toFixed(2)}`;
    })
    .join(' ') + ' Z';

  // 5-ring grid at 20/40/60/80/100%
  const rings = [0.2, 0.4, 0.6, 0.8, 1.0];

  // Push / Pull balance
  const pushSets = SPOKES
    .filter(m => m.group === 'push')
    .reduce((s, m) => s + (muscleData[m.key]?.sets || 0), 0);
  const pullSets = SPOKES
    .filter(m => m.group === 'pull')
    .reduce((s, m) => s + (muscleData[m.key]?.sets || 0), 0);
  const lowerSets = SPOKES
    .filter(m => m.group === 'lower')
    .reduce((s, m) => s + (muscleData[m.key]?.sets || 0), 0);
  const upperSets = pushSets + pullSets;
  const totalSets = SPOKES.reduce((s, m) => s + (muscleData[m.key]?.sets || 0), 0);
  const pushPullTotal = pushSets + pullSets;
  const pushRatio = pushPullTotal > 0 ? pushSets / pushPullTotal : 0.5;

  const balanceLabel =
    pushPullTotal === 0
      ? null
      : pushRatio > 0.62
        ? 'Push heavy'
        : pushRatio < 0.38
          ? 'Pull heavy'
          : 'Balanced';
  const balanceColor =
    pushPullTotal === 0
      ? 'rgba(255,255,255,0.3)'
      : Math.abs(pushRatio - 0.5) < 0.12
        ? '#5DCAA5'
        : '#EF9F27';

  // Top 4 muscles by sets
  const topMuscles = SPOKES
    .map(m => ({ ...m, sets: muscleData[m.key]?.sets || 0 }))
    .filter(m => m.sets > 0)
    .sort((a, b) => b.sets - a.sets)
    .slice(0, 4);

  const hasData = topMuscles.length > 0;
  const dominant = topMuscles[0];

  const anchor = (lx: number) => {
    if (lx < cx - 6) return 'end';
    if (lx > cx + 6) return 'start';
    return 'middle';
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] uppercase tracking-[0.8px] text-[var(--text-secondary)] font-semibold">
          MUSCLE LOAD
        </h3>
        {dominant && (
          <span
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{
              background: `${dominant.hex}15`,
              color: dominant.hex,
              border: `1px solid ${dominant.hex}28`,
            }}
          >
            {dominant.key} dominant
          </span>
        )}
      </div>

      {/* Push / Pull balance bar */}
      {pushPullTotal > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[8px] text-[var(--text-muted)] shrink-0">Push</span>
          <div className="flex-1 h-[3px] bg-[var(--bg-elevated)] rounded-full overflow-hidden relative">
            <div className="absolute inset-0 flex">
              <div
                className="h-full transition-all duration-700"
                style={{ width: `${pushRatio * 100}%`, background: '#AFA9EC' }}
              />
              <div
                className="h-full"
                style={{ width: `${(1 - pushRatio) * 100}%`, background: '#5DCAA5' }}
              />
            </div>
            {/* 50% center tick */}
            <div className="absolute left-1/2 top-0 h-full w-px bg-[var(--bg-base)] opacity-70" />
          </div>
          <span className="text-[8px] text-[var(--text-muted)] shrink-0">Pull</span>
          {balanceLabel && (
            <span className="text-[8px] font-semibold shrink-0" style={{ color: balanceColor }}>
              {balanceLabel}
            </span>
          )}
        </div>
      )}

      {/* Radar SVG */}
      <div className="relative w-full" style={{ aspectRatio: '1/1', maxHeight: 210 }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" height="100%">
          <defs>
            <radialGradient id="chartBg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.025)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
            <radialGradient id="radarFill2" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#C8FF00" stopOpacity="0.09" />
              <stop offset="100%" stopColor="#C8FF00" stopOpacity="0.02" />
            </radialGradient>
          </defs>

          {/* Subtle background disc */}
          <circle cx={cx} cy={cy} r={R + 1} fill="url(#chartBg)" />

          {/* Ring grid */}
          {rings.map((r, ri) => {
            const pts =
              spoke
                .map((_, i) => {
                  const a = angleOf(i);
                  return `${i === 0 ? 'M' : 'L'}${(cx + R * r * Math.cos(a)).toFixed(2)},${(cy + R * r * Math.sin(a)).toFixed(2)}`;
                })
                .join(' ') + ' Z';
            return (
              <path
                key={ri}
                d={pts}
                fill="none"
                stroke={
                  r === 1.0
                    ? 'rgba(255,255,255,0.09)'
                    : r === 0.6
                      ? 'rgba(255,255,255,0.07)'
                      : 'rgba(255,255,255,0.04)'
                }
                strokeWidth={r === 1.0 ? 0.8 : 0.5}
                strokeDasharray={r === 0.6 ? '2,3' : undefined}
              />
            );
          })}

          {/* % labels at 40% and 80% */}
          {[0.4, 0.8].map(r => (
            <text
              key={r}
              x={cx + 2.5}
              y={cy - R * r + 3.5}
              fontSize="5"
              fill="rgba(255,255,255,0.14)"
              textAnchor="start"
            >
              {r * 100}%
            </text>
          ))}

          {/* Axis spokes */}
          {spoke.map((s, i) => (
            <line
              key={i}
              x1={cx} y1={cy}
              x2={s.axisx} y2={s.axisy}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="0.6"
            />
          ))}

          {/* Ghost target polygon — dashed */}
          <path
            d={ghostPolygon}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="0.7"
            strokeDasharray="2,2.5"
          />

          {/* Load fill polygon */}
          {hasData && (
            <path
              d={polygon}
              fill="url(#radarFill2)"
              stroke="rgba(200,255,0,0.52)"
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
          )}

          {/* Animated pulse rings + colored dots */}
          {hasData &&
            spoke.map((s, i) =>
              s.load > 0 ? (
                <g key={i}>
                  {/* Pulse ring — SVG animate, staggered */}
                  <circle cx={s.px} cy={s.py} r="2.5" fill={s.hex} opacity="0">
                    <animate
                      attributeName="r"
                      values="2.5;7;2.5"
                      dur="3s"
                      repeatCount="indefinite"
                      begin={`${i * 0.38}s`}
                    />
                    <animate
                      attributeName="opacity"
                      values="0.28;0;0.28"
                      dur="3s"
                      repeatCount="indefinite"
                      begin={`${i * 0.38}s`}
                    />
                  </circle>
                  {/* Solid dot */}
                  <circle cx={s.px} cy={s.py} r="2.5" fill={s.hex} />
                  {/* Inner highlight */}
                  <circle cx={s.px} cy={s.py} r="0.9" fill="rgba(255,255,255,0.65)" />
                </g>
              ) : null,
            )}

          {/* Center dot */}
          <circle cx={cx} cy={cy} r="2" fill="rgba(200,255,0,0.25)" />

          {/* Axis labels */}
          {spoke.map((s, i) => {
            const isActive = s.load > 0;
            return (
              <text
                key={i}
                x={s.lx}
                y={s.ly}
                textAnchor={anchor(s.lx)}
                dominantBaseline="middle"
                fontSize="7.5"
                fontWeight="600"
                fill={isActive ? s.hex : 'rgba(255,255,255,0.17)'}
                letterSpacing="0.4"
              >
                {s.key.toUpperCase()}
              </text>
            );
          })}
        </svg>

        {/* Ghost legend — bottom-right of chart area */}
        {hasData && (
          <div className="absolute bottom-2 right-1 flex items-center gap-1 opacity-60">
            <svg width="14" height="6">
              <line x1="0" y1="3" x2="14" y2="3" stroke="rgba(255,255,255,0.4)" strokeWidth="0.7" strokeDasharray="2,2" />
            </svg>
            <span className="text-[7px] text-[var(--text-muted)]">Goal ({TARGET_SETS} sets)</span>
          </div>
        )}
      </div>

      {/* Bottom: top muscles with set counts */}
      {topMuscles.length > 0 ? (
        <div className="flex gap-1.5 mt-0.5">
          {topMuscles.map(m => (
            <div
              key={m.key}
              className="flex-1 rounded-lg px-2 py-1.5 text-center"
              style={{ background: `${m.hex}0D`, border: `1px solid ${m.hex}20` }}
            >
              <p
                className="text-[7.5px] font-semibold uppercase tracking-wide mb-0.5 truncate"
                style={{ color: m.hex }}
              >
                {m.key}
              </p>
              <p
                className="text-[13px] font-black tabular-nums leading-none"
                style={{ color: 'rgba(255,255,255,0.85)' }}
              >
                {m.sets}
              </p>
              <p className="text-[7px] text-[var(--text-muted)] leading-none mt-0.5">sets</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-[var(--text-secondary)] text-center py-1">
          No data yet — log a workout
        </p>
      )}

      {/* Footer stats */}
      {totalSets > 0 && (
        <div className="flex justify-between items-center mt-1.5 px-0.5">
          <span className="text-[8px] text-[var(--text-muted)]">{totalSets} sets this week</span>
          {lowerSets > 0 && upperSets > 0 && (
            <span className="text-[8px] text-[var(--text-muted)]">
              Upper {upperSets} · Lower {lowerSets}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
