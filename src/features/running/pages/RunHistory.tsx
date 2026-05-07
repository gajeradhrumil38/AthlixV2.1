import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Footprints, Trash2, Calendar, Clock, Zap, Flame, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { format, startOfDay } from 'date-fns';
import { getRuns, deleteRun } from '../utils/storage';
import type { SavedRun } from '../utils/storage';
import { RunRouteBackground } from '../components/RunRouteBackground';
import { formatDuration, formatPace } from '../utils/gpsCalculations';

// ── Demo runs — Cedar Rapids, Iowa sidewalk routes ───────────────────────────
const DEMO_PATH_5MI = [
  { lat: 42.0080, lng: -91.6430 }, { lat: 42.0073, lng: -91.6441 },
  { lat: 42.0065, lng: -91.6449 }, { lat: 42.0057, lng: -91.6456 },
  { lat: 42.0048, lng: -91.6462 }, { lat: 42.0039, lng: -91.6466 },
  { lat: 42.0029, lng: -91.6469 }, { lat: 42.0019, lng: -91.6471 },
  { lat: 42.0009, lng: -91.6472 }, { lat: 41.9999, lng: -91.6472 },
  { lat: 41.9989, lng: -91.6470 }, { lat: 41.9979, lng: -91.6468 },
  { lat: 41.9970, lng: -91.6464 }, { lat: 41.9962, lng: -91.6458 },
  { lat: 41.9955, lng: -91.6450 }, { lat: 41.9949, lng: -91.6441 },
  { lat: 41.9944, lng: -91.6431 }, { lat: 41.9941, lng: -91.6420 },
  { lat: 41.9940, lng: -91.6408 }, { lat: 41.9941, lng: -91.6396 },
  { lat: 41.9944, lng: -91.6386 }, { lat: 41.9949, lng: -91.6377 },
  { lat: 41.9956, lng: -91.6370 }, { lat: 41.9964, lng: -91.6366 },
  { lat: 41.9973, lng: -91.6366 }, { lat: 41.9981, lng: -91.6370 },
  { lat: 41.9989, lng: -91.6376 }, { lat: 41.9996, lng: -91.6383 },
  { lat: 42.0003, lng: -91.6392 }, { lat: 42.0010, lng: -91.6400 },
  { lat: 42.0017, lng: -91.6408 }, { lat: 42.0024, lng: -91.6415 },
  { lat: 42.0031, lng: -91.6420 }, { lat: 42.0039, lng: -91.6424 },
  { lat: 42.0048, lng: -91.6426 }, { lat: 42.0057, lng: -91.6428 },
  { lat: 42.0066, lng: -91.6429 }, { lat: 42.0073, lng: -91.6429 },
  { lat: 42.0080, lng: -91.6430 },
];

const DEMO_PATH_3MI = [
  { lat: 41.9628, lng: -91.6350 }, { lat: 41.9624, lng: -91.6334 },
  { lat: 41.9621, lng: -91.6318 }, { lat: 41.9619, lng: -91.6302 },
  { lat: 41.9619, lng: -91.6286 }, { lat: 41.9622, lng: -91.6272 },
  { lat: 41.9628, lng: -91.6260 }, { lat: 41.9636, lng: -91.6251 },
  { lat: 41.9645, lng: -91.6246 }, { lat: 41.9654, lng: -91.6245 },
  { lat: 41.9663, lng: -91.6248 }, { lat: 41.9670, lng: -91.6254 },
  { lat: 41.9676, lng: -91.6263 }, { lat: 41.9680, lng: -91.6275 },
  { lat: 41.9681, lng: -91.6289 }, { lat: 41.9679, lng: -91.6304 },
  { lat: 41.9675, lng: -91.6317 }, { lat: 41.9669, lng: -91.6328 },
  { lat: 41.9661, lng: -91.6337 }, { lat: 41.9652, lng: -91.6344 },
  { lat: 41.9642, lng: -91.6348 }, { lat: 41.9635, lng: -91.6350 },
  { lat: 41.9628, lng: -91.6350 },
];

const NOW = Date.now();
const DEMO_RUNS: SavedRun[] = [
  {
    id: -1,
    path: DEMO_PATH_5MI,
    distance: 8.047,
    duration: 2970000,
    pace: 6.21,
    timestamp: NOW - 2 * 24 * 60 * 60 * 1000 - 7.25 * 60 * 60 * 1000,
    splits: [
      { km: 1, pace: 6.4 }, { km: 2, pace: 6.3 }, { km: 3, pace: 6.2 },
      { km: 4, pace: 6.1 }, { km: 5, pace: 6.0 }, { km: 6, pace: 6.2 },
      { km: 7, pace: 6.3 }, { km: 8, pace: 6.1 },
    ],
  },
  {
    id: -2,
    path: DEMO_PATH_3MI,
    distance: 4.828,
    duration: 1728000,
    pace: 5.98,
    timestamp: NOW - 4 * 24 * 60 * 60 * 1000 - 6.75 * 60 * 60 * 1000,
    splits: [
      { km: 1, pace: 6.1 }, { km: 2, pace: 5.9 }, { km: 3, pace: 5.8 },
      { km: 4, pace: 6.0 },
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

const useDistanceUnit = (): 'km' | 'mi' => {
  try { const s = localStorage.getItem('athlix_distance_unit'); return s === 'mi' ? 'mi' : 'km'; }
  catch { return 'km'; }
};

// ── Sparkline SVG ─────────────────────────────────────────────────────────────
const PaceSparkline: React.FC<{ splits: { km: number; pace: number }[] }> = ({ splits }) => {
  if (splits.length < 2) return null;
  const W = 80; const H = 36;
  const paces = splits.map((s) => s.pace);
  const minP = Math.min(...paces);
  const maxP = Math.max(...paces);
  const range = maxP - minP || 1;

  const pts = paces.map((p, i) => {
    const x = (i / (paces.length - 1)) * (W - 4) + 2;
    const y = H - 4 - ((maxP - p) / range) * (H - 8);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <polyline
        points={pts}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
      {paces.map((p, i) => {
        const x = (i / (paces.length - 1)) * (W - 4) + 2;
        const y = H - 4 - ((maxP - p) / range) * (H - 8);
        return (
          <circle key={i} cx={x} cy={y} r={2} fill="var(--accent)" opacity="0.8" />
        );
      })}
    </svg>
  );
};

// ── Effort bars ───────────────────────────────────────────────────────────────
const EffortBars: React.FC<{ effort: number }> = ({ effort }) => (
  <div className="flex items-end gap-[3px]">
    {[1, 2, 3, 4, 5].map((i) => (
      <div
        key={i}
        style={{
          width: 5,
          height: 4 + i * 3,
          borderRadius: 2,
          background: i <= effort ? 'var(--accent)' : 'rgba(255,255,255,0.12)',
        }}
      />
    ))}
  </div>
);

// ── Weekly mini bar chart ─────────────────────────────────────────────────────
const WeekBarChart: React.FC<{ dayKms: number[] }> = ({ dayKms }) => {
  const maxKm = Math.max(...dayKms, 0.1);
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const today = (new Date().getDay() + 6) % 7; // 0=Mon

  return (
    <div className="flex items-end gap-1">
      {dayKms.map((km, i) => {
        const barH = Math.max(2, Math.round((km / maxKm) * 28));
        const isToday = i === today;
        const hasRun = km > 0;
        return (
          <div key={i} className="flex flex-col items-center gap-1">
            <div
              style={{
                width: 16,
                height: barH,
                borderRadius: 3,
                background: hasRun
                  ? isToday
                    ? 'var(--accent)'
                    : 'rgba(200,255,0,0.45)'
                  : 'rgba(255,255,255,0.1)',
              }}
            />
            <span style={{ fontSize: 8, fontWeight: 700, color: isToday ? 'var(--accent)' : 'rgba(255,255,255,0.3)' }}>
              {days[i]}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ── Glass card style ──────────────────────────────────────────────────────────
const glassCardStyle: React.CSSProperties = {
  background: 'rgba(20,20,20,0.72)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
};

// ── Component ────────────────────────────────────────────────────────────────

type RunTab = 'all' | 'outdoor' | 'treadmill';

export const RunHistory: React.FC = () => {
  const navigate = useNavigate();
  const [realRuns, setRealRuns] = useState<SavedRun[]>(() => getRuns().slice().reverse());
  const [selected, setSelected] = useState<SavedRun | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SavedRun | null>(null);
  const [runTab, setRunTab] = useState<RunTab>('all');
  const distanceUnit = useDistanceUnit();

  const allRuns = useMemo(() => [...realRuns, ...DEMO_RUNS], [realRuns]);
  const isDemo = (run: SavedRun) => run.id < 0;

  // PR detection: run with best (lowest) pace among all runs
  const bestPace = useMemo(() => {
    const validPaces = allRuns.map((r) => r.pace).filter((p) => p > 0);
    return validPaces.length > 0 ? Math.min(...validPaces) : null;
  }, [allRuns]);
  const isPR = (run: SavedRun) => bestPace !== null && run.pace > 0 && run.pace === bestPace;

  const dist = (km: number) => (distanceUnit === 'mi' ? km * 0.621371 : km);
  const paceDisplay = (paceKm: number) => (distanceUnit === 'mi' ? paceKm * 1.609344 : paceKm);

  // Tab filtering — all real runs and demo runs treated as outdoor
  const filteredRuns = useMemo(() => {
    if (runTab === 'treadmill') return [];
    return allRuns; // outdoor = all
  }, [allRuns, runTab]);

  // Weekly stats
  const weeklyStats = useMemo(() => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const weekMs = 7 * dayMs;

    const weekRuns = allRuns.filter((r) => r.timestamp >= now - weekMs);
    const prevWeekRuns = allRuns.filter((r) => r.timestamp >= now - 2 * weekMs && r.timestamp < now - weekMs);

    const weekKm = weekRuns.reduce((s, r) => s + r.distance, 0);
    const prevWeekKm = prevWeekRuns.reduce((s, r) => s + r.distance, 0);
    const weekTime = weekRuns.reduce((s, r) => s + r.duration, 0);
    const weekChange = weekKm - prevWeekKm;

    // Day bars Mon-Sun (0=Mon … 6=Sun)
    const todayStart = startOfDay(new Date()).getTime();
    const dayKms = Array.from({ length: 7 }, (_, i) => {
      const dayStart = todayStart - ((((new Date().getDay() + 6) % 7) - i) * dayMs);
      const dayEnd = dayStart + dayMs;
      return weekRuns
        .filter((r) => r.timestamp >= dayStart && r.timestamp < dayEnd)
        .reduce((s, r) => s + r.distance, 0);
    });

    return { weekKm, prevWeekKm, weekChange, weekTime, weekCount: weekRuns.length, dayKms };
  }, [allRuns]);

  const handleDelete = (run: SavedRun) => {
    if (isDemo(run)) {
      toast('Demo runs are for preview only', { icon: '👟' });
      setConfirmDelete(null);
      return;
    }
    deleteRun(run.id);
    setRealRuns((prev) => prev.filter((r) => r.id !== run.id));
    if (selected?.id === run.id) setSelected(null);
    setConfirmDelete(null);
  };

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: '#0d0f14', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* ── Top bar ── */}
      <div
        className="flex items-center gap-3 px-4 pb-3"
        style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}
      >
        <button
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition-all active:scale-95"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex flex-col gap-0">
          <span className="font-victory text-[22px] font-black tracking-[0.18em] text-white uppercase leading-tight">
            RUN HISTORY
          </span>
          <span className="text-[11px] font-semibold text-white/30">
            {allRuns.length} {allRuns.length === 1 ? 'run' : 'runs'} · last 7 days
          </span>
        </div>
        <div className="ml-auto">
          <button
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/50 transition-all active:scale-95"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.08)' }}
            onClick={() => toast('Calendar view coming soon')}
          >
            <Calendar className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Weekly summary card ── */}
      <div className="px-4 pb-3">
        <div
          className="relative overflow-hidden rounded-2xl p-4"
          style={{
            background: 'rgba(200,255,0,0.06)',
            border: '1px solid rgba(200,255,0,0.14)',
          }}
        >
          {/* Lime grid bg pattern */}
          <svg className="absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.05, pointerEvents: 'none' }}>
            <defs>
              <pattern id="wkGrid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(200,255,0,1)" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#wkGrid)" />
          </svg>

          <div className="relative z-10">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-[0.24em]" style={{ color: 'var(--accent)' }}>THIS WEEK</span>
              <span
                className="text-[10px] font-black"
                style={{ color: weeklyStats.weekChange >= 0 ? 'var(--accent)' : 'rgba(255,100,100,0.8)' }}
              >
                {weeklyStats.weekChange >= 0 ? '+' : ''}{dist(weeklyStats.weekChange).toFixed(2)} {distanceUnit} vs last week
              </span>
            </div>

            <div className="flex items-end justify-between">
              <div>
                <div className="flex items-baseline gap-1.5 mb-3">
                  <span className="font-victory text-[40px] font-black leading-none text-white tabular-nums">
                    {dist(weeklyStats.weekKm).toFixed(2)}
                  </span>
                  <span className="font-victory text-[18px] font-black text-white/40">{distanceUnit.toUpperCase()}</span>
                </div>

                <div className="flex gap-5">
                  <div className="flex flex-col gap-0">
                    <span className="text-[8px] font-black uppercase tracking-[0.15em] text-white/30">TIME</span>
                    <span className="font-victory text-[16px] font-black text-white">
                      {formatDuration(weeklyStats.weekTime)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0">
                    <span className="text-[8px] font-black uppercase tracking-[0.15em] text-white/30">RUNS</span>
                    <span className="font-victory text-[16px] font-black text-white">
                      {weeklyStats.weekCount}
                    </span>
                  </div>
                </div>
              </div>

              <WeekBarChart dayKms={weeklyStats.dayKms} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex px-4 pb-2 gap-0 relative">
        {(['all', 'outdoor', 'treadmill'] as RunTab[]).map((tab) => {
          const active = runTab === tab;
          const labels: Record<RunTab, string> = { all: 'All', outdoor: 'Outdoor', treadmill: 'Treadmill' };
          return (
            <button
              key={tab}
              onClick={() => setRunTab(tab)}
              className="relative px-4 py-2.5 text-[12px] font-black uppercase tracking-[0.14em] transition-all"
              style={{ color: active ? 'var(--accent)' : 'rgba(255,255,255,0.3)' }}
            >
              {labels[tab]}
              {active && (
                <motion.div
                  layoutId="tabUnderline"
                  className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full"
                  style={{ background: 'var(--accent)' }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Empty state ── */}
      {filteredRuns.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: 'rgba(200,255,0,0.07)', border: '1px solid rgba(200,255,0,0.14)' }}
          >
            <Footprints className="h-7 w-7 opacity-50" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p className="text-[17px] font-black text-white">No {runTab} runs yet</p>
            <p className="mt-1 text-[12px] font-semibold text-white/40">Your completed runs will appear here</p>
          </div>
          <button
            onClick={() => navigate('/run')}
            className="mt-1 rounded-full px-8 font-victory text-[14px] font-black tracking-[0.2em] text-black transition-all active:scale-[0.97]"
            style={{ background: 'var(--accent)', height: 52 }}
          >
            START A RUN
          </button>
        </div>
      )}

      {/* ── Run list ── */}
      {filteredRuns.length > 0 && (
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <div className="flex flex-col gap-3">
            {filteredRuns.map((run, idx) => {
              const d = dist(run.distance);
              const p = paceDisplay(run.pace);
              const demo = isDemo(run);
              const pr = isPR(run);

              return (
                <motion.div
                  key={run.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: idx * 0.04 }}
                  className="rounded-2xl overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.04)', border: pr ? '1px solid rgba(200,255,0,0.25)' : '1px solid rgba(255,255,255,0.07)' }}
                >
                  <button
                    onClick={() => setSelected(run)}
                    className="w-full px-4 pt-3 pb-3 text-left transition-all active:scale-[0.98]"
                  >
                    {/* Row 1: date + badges + chevron */}
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-victory text-[16px] font-black leading-none"
                          style={{ color: pr ? 'var(--accent)' : 'white' }}
                        >
                          {format(new Date(run.timestamp), 'EEE, MMM d').toUpperCase()}
                        </span>
                        {pr && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[8px] font-black tracking-[0.1em]"
                            style={{ background: 'linear-gradient(135deg, #fac775 0%, #d99a3a 100%)', color: '#000' }}
                          >
                            PR
                          </span>
                        )}
                        {demo && (
                          <span
                            className="rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.1em]"
                            style={{ background: 'rgba(200,255,0,0.1)', color: 'rgba(200,255,0,0.5)', border: '1px solid rgba(200,255,0,0.15)' }}
                          >
                            DEMO
                          </span>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-white/20" />
                    </div>

                    {/* Sub text */}
                    <p className="mb-3 text-[10px] font-semibold text-white/25">
                      {format(new Date(run.timestamp), 'EEEE · h:mm a')} · {demo ? 'Cedar Rapids, IA' : 'Outdoor'}
                    </p>

                    {/* Row 2: stats + sparkline */}
                    <div className="flex items-center gap-0">
                      <div className="flex items-baseline gap-1 mr-3">
                        <span className="font-victory text-[28px] font-black tabular-nums leading-none text-white">
                          {d.toFixed(2)}
                        </span>
                        <span className="text-[9px] font-bold text-white/30 uppercase">{distanceUnit}</span>
                      </div>

                      <div className="h-8 w-px bg-white/[0.08] mr-3" />

                      <div className="flex items-baseline gap-1 mr-3">
                        <span className="font-victory text-[20px] font-black tabular-nums leading-none text-white">
                          {formatDuration(run.duration)}
                        </span>
                      </div>

                      <div className="h-8 w-px bg-white/[0.08] mr-3" />

                      <div className="flex flex-col">
                        <span className="font-victory text-[20px] font-black tabular-nums leading-none text-white">
                          {p > 0 ? formatPace(p) : '--:--'}
                        </span>
                        <span className="text-[8px] font-bold text-white/25">/{distanceUnit}</span>
                      </div>

                      <div className="flex-1" />

                      {/* Sparkline */}
                      {run.splits && run.splits.length >= 2 && (
                        <PaceSparkline splits={run.splits} />
                      )}
                    </div>
                  </button>

                  {/* Delete strip */}
                  <div
                    className="flex items-center justify-end px-4 pb-2"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <button
                      onClick={() => setConfirmDelete(run)}
                      className="flex items-center gap-1 py-1.5 px-2 rounded-lg transition-all active:scale-95"
                      aria-label="Delete run"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-white/15 hover:text-red-400 transition-colors" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Delete confirm dialog ── */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] flex items-center justify-center px-6"
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
            onClick={() => setConfirmDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 8 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[320px] rounded-2xl p-6 flex flex-col gap-5"
              style={{ background: '#161a22', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <div className="flex justify-center">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full"
                  style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.22)' }}
                >
                  <Trash2 className="h-5 w-5 text-red-400" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-[16px] font-black text-white">Delete Run?</p>
                <p className="mt-1.5 text-[12px] font-semibold leading-relaxed text-white/45">
                  {format(new Date(confirmDelete.timestamp), "EEE, MMM d · h:mm a")}
                  <br />
                  This run will be permanently removed.
                </p>
              </div>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 h-12 rounded-full text-[13px] font-black tracking-[0.1em] text-white/70 transition-all active:scale-[0.97]"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  CANCEL
                </button>
                <button
                  onClick={() => handleDelete(confirmDelete)}
                  className="flex-1 h-12 rounded-full text-[13px] font-black tracking-[0.1em] text-white transition-all active:scale-[0.97]"
                  style={{ background: 'rgba(239,68,68,0.82)', border: '1px solid rgba(239,68,68,0.3)' }}
                >
                  DELETE
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Detail overlay ── */}
      <AnimatePresence>
        {selected && (() => {
          const cal = Math.round(selected.distance * 1.609344 * 65);
          const effort = selected.pace <= 0 ? 3
            : selected.pace < 4 ? 5
            : selected.pace < 5 ? 4
            : selected.pace < 6 ? 3
            : selected.pace < 7 ? 2
            : 1;
          const pr = isPR(selected);
          const demo = isDemo(selected);

          return (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 z-50 overflow-hidden cursor-pointer"
              style={{ background: '#0d0f14' }}
              onClick={() => setSelected(null)}
            >
              <RunRouteBackground path={selected.path} />

              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(to bottom, rgba(13,15,20,0.08) 0%, rgba(13,15,20,0.18) 28%, rgba(13,15,20,0.72) 52%, rgba(13,15,20,0.97) 66%, #0d0f14 78%)',
                }}
              />

              {/* Top bar */}
              <div
                className="absolute left-0 right-0 top-0 flex items-center justify-between px-4"
                style={{ zIndex: 10, paddingTop: 'max(16px, env(safe-area-inset-top))' }}
              >
                <button
                  onClick={() => setSelected(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 backdrop-blur-sm transition-all active:scale-95"
                  style={{ background: 'rgba(13,15,20,0.55)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>

                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="flex flex-col items-center gap-0.5"
                >
                  <span
                    className="text-[11px] font-black uppercase tracking-[0.24em]"
                    style={{ color: 'var(--accent)' }}
                  >
                    {format(new Date(selected.timestamp), "EEE, MMM d")}
                  </span>
                  <span className="text-[10px] font-semibold text-white/35 tracking-[0.1em]">
                    {format(new Date(selected.timestamp), "h:mm a")}
                  </span>
                  {demo && (
                    <span
                      className="mt-0.5 rounded-full px-2 py-px text-[8px] font-black uppercase tracking-[0.14em]"
                      style={{ background: 'rgba(200,255,0,0.08)', color: 'rgba(200,255,0,0.5)', border: '1px solid rgba(200,255,0,0.15)' }}
                    >
                      Cedar Rapids, IA
                    </span>
                  )}
                </motion.div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (navigator.share) {
                      navigator.share({
                        title: 'My Run',
                        text: `I ran ${dist(selected.distance).toFixed(2)} ${distanceUnit} in ${formatDuration(selected.duration)}!`,
                      }).catch(() => {});
                    } else {
                      toast('Share not supported on this device');
                    }
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 backdrop-blur-sm transition-all active:scale-95"
                  style={{ background: 'rgba(13,15,20,0.55)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <Share2 className="h-4 w-4" />
                </button>
              </div>

              {/* PR badge */}
              {pr && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3, type: 'spring', stiffness: 280 }}
                  className="absolute right-5 z-20 flex items-center gap-1 rounded-full px-3 py-1.5"
                  style={{
                    top: 'calc(max(16px, env(safe-area-inset-top)) + 52px)',
                    background: 'linear-gradient(135deg, #fac775 0%, #d99a3a 100%)',
                  }}
                >
                  <span className="text-[10px] font-black tracking-[0.14em] text-black">PERSONAL BEST</span>
                </motion.div>
              )}

              {/* Stats — pinned to bottom */}
              <div
                className="absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center gap-3 px-5 cursor-default"
                style={{ paddingBottom: 'max(28px, env(safe-area-inset-bottom))' }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Hero distance */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.14, type: 'spring', stiffness: 240, damping: 22 }}
                  className="flex items-baseline gap-2"
                >
                  <span
                    className="font-victory font-black leading-none tabular-nums text-white"
                    style={{ fontSize: 80, letterSpacing: '-0.01em' }}
                  >
                    {dist(selected.distance).toFixed(2)}
                  </span>
                  <span className="font-victory text-[26px] font-black" style={{ color: 'var(--accent)' }}>
                    {distanceUnit.toUpperCase()}
                  </span>
                </motion.div>

                {/* 4-stat grid */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.26 }}
                  className="w-full rounded-2xl p-4"
                  style={glassCardStyle}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5 text-white/25" />
                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25">Time</span>
                      </div>
                      <span className="font-victory text-[24px] font-black tabular-nums leading-none text-white">
                        {formatDuration(selected.duration)}
                      </span>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1">
                        <Zap className="h-2.5 w-2.5 text-white/25" />
                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25">Avg Pace</span>
                      </div>
                      <span className="font-victory text-[24px] font-black tabular-nums leading-none text-white">
                        {selected.pace > 0 ? formatPace(paceDisplay(selected.pace)) : '--:--'}
                      </span>
                      <span className="text-[9px] font-bold text-white/20">/{distanceUnit}</span>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1">
                        <Flame className="h-2.5 w-2.5 text-white/25" />
                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25">Cal</span>
                      </div>
                      <span className="font-victory text-[24px] font-black tabular-nums leading-none text-white">{cal}</span>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25">Effort</span>
                      <div className="flex items-center gap-2 mt-1.5">
                        <EffortBars effort={effort} />
                        <span className="text-[12px] font-black text-white/40">{effort}/5</span>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Splits list */}
                {selected.splits && selected.splits.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.36 }}
                    className="w-full rounded-2xl p-4"
                    style={glassCardStyle}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-[0.22em] text-white/35">SPLITS · /{distanceUnit}</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {(() => {
                        const paces = selected.splits!.map((s) => s.pace);
                        const bestSplitPace = Math.min(...paces);
                        return selected.splits!.map((split, sidx) => {
                          const barPct = bestSplitPace > 0 ? Math.min(1, bestSplitPace / split.pace) : 0.5;
                          const isBest = split.pace === bestSplitPace;
                          const isFast = split.pace <= bestSplitPace * 1.05;
                          return (
                            <div key={sidx} className="flex items-center gap-3">
                              <span className="w-5 text-right text-[10px] font-black text-white/30">{sidx + 1}</span>
                              <div className="flex-1 h-[5px] rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${barPct * 100}%`,
                                    background: isBest
                                      ? 'var(--accent)'
                                      : isFast
                                      ? 'rgba(200,255,0,0.55)'
                                      : 'rgba(255,255,255,0.2)',
                                    boxShadow: isBest ? '0 0 8px rgba(200,255,0,0.5)' : 'none',
                                  }}
                                />
                              </div>
                              <span className="w-12 text-right text-[11px] font-black tabular-nums text-white">
                                {formatPace(paceDisplay(split.pace))}
                              </span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </motion.div>
                )}

                <motion.p
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                  className="text-[10px] font-semibold text-white/15"
                >
                  © {new Date().getFullYear()} Athlix · Map © OpenStreetMap &amp; CARTO
                </motion.p>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
};
