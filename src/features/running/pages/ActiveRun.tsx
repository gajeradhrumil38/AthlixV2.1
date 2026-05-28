import React, { useMemo, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Square, MapPin, AlertCircle, ChevronLeft, LocateOff, Play, Pause,
  Home, History, Target, Layers, Lock, Share2, Flame, Clock, Zap, Pencil,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useAuth } from '../../../contexts/AuthContext';
import { saveWorkout } from '../../../lib/supabaseData';
import { useRunTracking } from '../hooks/useRunTracking';
import { RunMap } from '../components/RunMap';
import { RunRouteBackground } from '../components/RunRouteBackground';
import { saveRun, getRuns, saveRunToCloud } from '../utils/storage';
import { formatDuration, formatPace } from '../utils/gpsCalculations';
import type { GpsPoint } from '../utils/gpsCalculations';

/* ── Glass pill style ───────────────────────────────────────────── */
const glassPillStyle: React.CSSProperties = {
  background: 'rgba(20,20,20,0.72)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 999,
};

const glassCardStyle: React.CSSProperties = {
  background: 'rgba(20,20,20,0.72)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 14,
};

/* ── Circle button ──────────────────────────────────────────────── */
const CircleBtn: React.FC<{ onClick: () => void; children: React.ReactNode; red?: boolean }> = ({ onClick, children, red }) => (
  <button
    onClick={onClick}
    className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition-all active:scale-95"
    style={{
      background: red ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.1)',
      border: red ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(255,255,255,0.08)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
    }}
  >
    {children}
  </button>
);

/* ── Hex-grid GPS loading overlay ──────────────────────────────── */
const HexOverlay: React.FC<{ show: boolean }> = ({ show }) => (
  <AnimatePresence>
    {show && (
      <motion.div
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.9 }}
        className="absolute inset-0 z-30 flex flex-col items-center justify-center"
        style={{ background: '#0d0f14' }}
      >
        <svg className="absolute inset-0 h-full w-full opacity-40" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="hx" x="0" y="0" width="62" height="71.6" patternUnits="userSpaceOnUse">
              <polygon points="31,3 59,18.8 59,52.8 31,68.6 3,52.8 3,18.8"
                fill="none" stroke="rgba(200,255,0,0.22)" strokeWidth="1" />
            </pattern>
            <pattern id="hx2" x="31" y="35.8" width="62" height="71.6" patternUnits="userSpaceOnUse">
              <polygon points="31,3 59,18.8 59,52.8 31,68.6 3,52.8 3,18.8"
                fill="none" stroke="rgba(200,255,0,0.22)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hx)" />
          <rect width="100%" height="100%" fill="url(#hx2)" />
        </svg>

        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="relative flex items-center justify-center">
            <span className="absolute h-20 w-20 rounded-full bg-[var(--accent)]/15 animate-ping" />
            <span className="absolute h-12 w-12 rounded-full bg-[var(--accent)]/25 animate-ping [animation-delay:0.35s]" />
            <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10">
              <MapPin className="h-6 w-6 text-[var(--accent)]" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-[17px] font-black tracking-wide text-white">Acquiring GPS</p>
            <p className="mt-0.5 text-[12px] font-semibold text-white/40">Loading nearest area…</p>
          </div>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

/* ── Animated waveform ──────────────────────────────────────────── */
const TrackingWave: React.FC = () => (
  <div className="flex items-center gap-[3px]">
    {[0.45, 0.75, 1, 0.75, 0.45].map((h, i) => (
      <div
        key={i}
        className="w-[3px] rounded-full bg-[var(--accent)]"
        style={{
          height: `${Math.round(h * 14)}px`,
          animation: `waveBar 0.75s ${i * 0.12}s ease-in-out infinite alternate`,
        }}
      />
    ))}
    <style>{`
      @keyframes waveBar {
        from { transform: scaleY(0.4); opacity: 0.5; }
        to   { transform: scaleY(1);   opacity: 1;   }
      }
    `}</style>
  </div>
);

/* ── Slide-to-action control ───────────────────────────────────── */
interface SlideControlProps {
  label: string;
  icon: React.ReactNode;
  onConfirm: () => void;
  danger?: boolean;
}

const SlideControl: React.FC<SlideControlProps> = ({ label, icon, onConfirm, danger = false }) => {
  const [offset, setOffset] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const fired = useRef(false);
  const dragging = useRef(false);

  const accent = danger ? '#ef4444' : 'var(--accent)';
  const fill   = danger ? 'rgba(239,68,68,0.12)' : 'rgba(200,255,0,0.08)';
  const iconColor = danger ? 'text-white' : 'text-black';

  const maxOffset = () => {
    if (!trackRef.current) return 200;
    return trackRef.current.offsetWidth - 56 - 8;
  };

  const onDown = useCallback((e: React.PointerEvent) => {
    if (fired.current) return;
    dragging.current = true;
    startX.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || fired.current) return;
    const max = maxOffset();
    const dx = Math.max(0, Math.min(e.clientX - startX.current, max));
    setOffset(dx);
    if (dx >= max * 0.82) {
      fired.current = true;
      dragging.current = false;
      setTimeout(() => { onConfirm(); setOffset(0); fired.current = false; }, 180);
    }
  }, [onConfirm]);

  const onUp = useCallback(() => {
    if (!fired.current) { dragging.current = false; setOffset(0); }
  }, []);

  return (
    <div
      ref={trackRef}
      className="relative h-14 w-full select-none overflow-hidden rounded-full"
      style={{ background: fill, border: `1px solid ${accent}30` }}
    >
      <div
        className="pointer-events-none absolute inset-y-0 left-0 rounded-full"
        style={{ width: offset + 56 + 8, background: `${accent}20`, transition: 'none' }}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="text-[13px] font-bold tracking-widest text-white/40 uppercase">{label}</span>
      </div>
      <div
        className={`absolute top-1 z-10 flex h-12 w-12 cursor-grab items-center justify-center rounded-full shadow-lg active:cursor-grabbing ${iconColor}`}
        style={{ left: 4 + offset, background: accent }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {icon}
      </div>
    </div>
  );
};

/* ── Goal card ──────────────────────────────────────────────────── */
type GoalType = 'open' | '5k' | '30min' | 'pace';

const GOAL_CARDS: { key: GoalType; label: string; sub: string }[] = [
  { key: 'open',  label: 'Open',  sub: 'Free run' },
  { key: '5k',    label: '5 km',  sub: 'Distance' },
  { key: '30min', label: '30',    sub: 'min / Time' },
  { key: 'pace',  label: '5:30',  sub: 'Pace' },
];

/* ── Goal option lists ──────────────────────────────────────────── */
const DIST_OPTIONS_MI = [1, 1.5, 2, 2.5, 3, 3.1, 4, 5, 6, 6.2, 8, 10, 13.1, 26.2];
const DIST_OPTIONS_KM = [1, 2, 3, 5, 6, 8, 10, 15, 21.1, 42.2];
const TIME_OPTIONS    = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 75, 90, 120];
const PACE_OPTIONS    = ['4:00','4:30','5:00','5:30','6:00','6:30','7:00','7:30','8:00','8:30','9:00','9:30','10:00','11:00','12:00'];

/* ── Drum-roll scroll picker ────────────────────────────────────── */
const ITEM_H = 50;
const VISIBLE = 5;

const ScrollPicker: React.FC<{
  options: string[];
  index: number;
  onChange: (i: number) => void;
  unit?: string;
}> = ({ options, index, onChange, unit }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const settling = React.useRef(false);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    settling.current = true;
    el.scrollTop = index * ITEM_H;
    settling.current = false;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScroll = React.useCallback(() => {
    if (settling.current) return;
    const el = containerRef.current;
    if (!el) return;
    const raw = Math.round(el.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(options.length - 1, raw));
    if (clamped !== index) onChange(clamped);
  }, [index, onChange, options.length]);

  return (
    <div style={{ position: 'relative', height: ITEM_H * VISIBLE, overflow: 'hidden', borderRadius: 14 }}>
      {/* Center highlight band */}
      <div style={{
        position: 'absolute', top: ITEM_H * 2, left: 8, right: 8, height: ITEM_H,
        background: 'rgba(200,255,0,0.07)',
        border: '1px solid rgba(200,255,0,0.22)',
        borderRadius: 10, pointerEvents: 'none', zIndex: 1,
      }} />
      {/* Top + bottom fade */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
        background: 'linear-gradient(to bottom, #161a22 0%, transparent 38%, transparent 62%, #161a22 100%)' }} />
      {/* Scrollable list */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          height: '100%', overflowY: 'scroll', overflowX: 'hidden',
          scrollSnapType: 'y mandatory', scrollbarWidth: 'none',
          paddingTop: ITEM_H * 2, paddingBottom: ITEM_H * 2,
          boxSizing: 'content-box',
        }}
      >
        {options.map((opt, i) => {
          const active = i === index;
          return (
            <div
              key={i}
              onClick={() => {
                onChange(i);
                settling.current = true;
                containerRef.current?.scrollTo({ top: i * ITEM_H, behavior: 'smooth' });
                setTimeout(() => { settling.current = false; }, 400);
              }}
              style={{
                height: ITEM_H, scrollSnapAlign: 'start',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 5, cursor: 'pointer', userSelect: 'none',
              }}
            >
              <span style={{
                fontFamily: "'Victory Striker Sans', 'DM Sans', sans-serif",
                fontSize: active ? 28 : 18, fontWeight: 900, letterSpacing: '0.02em',
                color: active ? '#ffffff' : 'rgba(255,255,255,0.2)',
                transition: 'font-size 0.12s ease, color 0.12s ease',
              }}>
                {opt}
              </span>
              {active && unit && (
                <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(200,255,0,0.75)', marginTop: 2 }}>
                  {unit}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ── Effort bars ────────────────────────────────────────────────── */
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

/* ── Main component ────────────────────────────────────────────── */
export const ActiveRun: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    isRunning, isPaused, path, currentPosition,
    totalDistance, elapsedTime, pace, error, errorCode,
    startRun, pauseRun, resumeRun, stopRun,
  } = useRunTracking();

  const [distanceUnit] = useState<'km' | 'mi'>(() => {
    try { const s = localStorage.getItem('athlix_distance_unit'); return s === 'km' ? 'km' : 'mi'; }
    catch { return 'mi'; }
  });

  const distOpts = distanceUnit === 'mi' ? DIST_OPTIONS_MI : DIST_OPTIONS_KM;
  const [goalDistIdx,  setGoalDistIdx]  = useState(() => distanceUnit === 'mi' ? 5 : 3); // 3.1 mi / 5 km
  const [goalTimeIdx,  setGoalTimeIdx]  = useState(4); // 30 min
  const [goalPaceIdx,  setGoalPaceIdx]  = useState(7); // 7:30
  const [editingGoal,  setEditingGoal]  = useState<GoalType | null>(null);

  const displayDistance = useMemo(
    () => (distanceUnit === 'mi' ? totalDistance * 0.621371 : totalDistance),
    [distanceUnit, totalDistance],
  );
  const displayPace = distanceUnit === 'mi' ? pace * 1.609344 : pace;

  const [activeGoal, setActiveGoal] = useState<GoalType>('5k');
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const [showStartConfirm, setShowStartConfirm] = useState(false);

  // Last run stats computed once from storage
  const [lastRun] = useState(() => {
    const runs = getRuns();
    return runs.length > 0 ? runs[runs.length - 1] : null;
  });
  const [weekStats] = useState(() => {
    const runs = getRuns();
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const weekRuns = runs.filter((r) => r.timestamp >= now - weekMs);
    const weekKm = weekRuns.reduce((s, r) => s + r.distance, 0);
    return { count: weekRuns.length, km: weekKm };
  });
  const [streak] = useState(() => {
    const runs = getRuns();
    if (runs.length === 0) return 0;
    const dayMs = 24 * 60 * 60 * 1000;
    const today = Math.floor(Date.now() / dayMs);
    const days = new Set(runs.map((r) => Math.floor(r.timestamp / dayMs)));
    let s = 0;
    for (let d = today; days.has(d); d--) s++;
    return s;
  });

  const [finished, setFinished] = useState<{
    distance: number;
    duration: number;
    pace: number;
    unit: 'km' | 'mi';
    path: GpsPoint[];
    splits: { km: number; pace: number }[];
    timestamp: number;
  } | null>(null);

  const needsInternet = typeof navigator !== 'undefined' && !navigator.onLine;
  const isPermDenied = errorCode === 1;
  const isAcquiring = isRunning && !currentPosition;

  const goalDistKm = distanceUnit === 'mi'
    ? distOpts[goalDistIdx] / 0.621371
    : distOpts[goalDistIdx];
  const goalMinutes = TIME_OPTIONS[goalTimeIdx];

  const goalProgress = useMemo(() => {
    if (activeGoal === '5k') return Math.min(1, totalDistance / goalDistKm);
    if (activeGoal === '30min') return Math.min(1, elapsedTime / (goalMinutes * 60 * 1000));
    return 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGoal, totalDistance, elapsedTime, goalDistKm, goalMinutes]);

  const goalDistDisplay = `${distOpts[goalDistIdx]} ${distanceUnit.toUpperCase()}`;
  const goalLabel = activeGoal === '5k' ? `${goalDistDisplay} GOAL`
    : activeGoal === '30min' ? `${goalMinutes} MIN GOAL`
    : activeGoal === 'pace' ? `PACE GOAL`
    : 'OPEN RUN';

  const goalProgressText = activeGoal === '5k'
    ? `${displayDistance.toFixed(2)} / ${distOpts[goalDistIdx]} ${distanceUnit.toUpperCase()}`
    : activeGoal === '30min'
    ? `${formatDuration(elapsedTime)} / ${goalMinutes}:00`
    : '';

  const handleStop = async () => {
    const summary = stopRun();
    const displayDist = distanceUnit === 'mi' ? summary.distance * 0.621371 : summary.distance;
    const displayPaceVal = distanceUnit === 'mi' ? summary.pace * 1.609344 : summary.pace;
    const saved = saveRun(summary);
    if (user) {
      void saveRunToCloud(user.id, saved);
    }
    if (user) {
      const durationMinutes = Math.max(1, Math.round(summary.duration / 60000));
      const roundedDist = Math.max(0, Number(displayDist.toFixed(2)));
      try {
        await saveWorkout(user.id, {
          title: 'Outdoor Run',
          date: format(new Date(summary.timestamp), 'yyyy-MM-dd'),
          duration_minutes: durationMinutes,
          notes: `Live run tracking – ${roundedDist.toFixed(2)} ${distanceUnit}`,
          exercises: [{
            name: 'Running', muscle_group: 'Cardio',
            completed_sets: [{ reps: durationMinutes, weight: roundedDist, unit: distanceUnit }],
          }],
        });
        toast.success('Run synced to workout history');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Run saved locally, sync failed.';
        toast.error(msg);
      }
    }
    setFinished({
      distance: displayDist,
      duration: summary.duration,
      pace: displayPaceVal,
      unit: distanceUnit,
      path: summary.path,
      splits: summary.splits,
      timestamp: summary.timestamp,
    });
  };

  /* ── Permission denied ─────────────────────────────────────── */
  if (isPermDenied && !isRunning) {
    return (
      <div className="flex min-h-screen flex-col" style={{ background: '#0d0f14', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center gap-3 px-4 pb-3" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
          <button
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 active:scale-95 transition-all"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-[15px] font-black text-white">Run</span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <LocateOff className="h-7 w-7 text-red-400" />
          </div>
          <div>
            <p className="text-[18px] font-black text-white">Location access denied</p>
            <p className="mt-1 text-[13px] font-semibold text-white/50">Re-enable in Chrome to track your run:</p>
          </div>
          <div className="w-full space-y-2 text-left">
            {[
              { n: 1, text: 'Tap the 🔒 lock icon in the Chrome address bar' },
              { n: 2, text: 'Tap "Site settings" → set Location to Allow' },
              { n: 3, text: 'Reload this page and tap Start Run again' },
            ].map(({ n, text }) => (
              <div key={n} className="flex items-start gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-black" style={{ background: 'var(--accent)', marginTop: 1 }}>{n}</span>
                <span className="text-[12px] font-semibold leading-relaxed text-white/60">{text}</span>
              </div>
            ))}
          </div>
          <div className="flex w-full flex-col gap-2">
            <button
              onClick={() => window.location.reload()}
              className="h-12 w-full rounded-full text-[14px] font-black text-black transition-all active:scale-[0.98]"
              style={{ background: 'var(--accent)' }}
            >
              Reload &amp; Try Again
            </button>
            <button
              onClick={() => navigate('/')}
              className="h-11 w-full rounded-full text-[13px] font-bold text-white/60 transition-all active:scale-[0.98]"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              Back to App
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Run complete ───────────────────────────────────────────── */
  if (finished) {
    const cal = Math.round(finished.distance * (finished.unit === 'mi' ? 1.609344 : 1) * 65);
    const effort = finished.pace <= 0 ? 3
      : finished.pace < 4 ? 5
      : finished.pace < 5 ? 4
      : finished.pace < 6 ? 3
      : finished.pace < 7 ? 2
      : 1;

    // Check if this is a PR (best pace among all saved runs)
    const allRuns = getRuns();
    const isPR = allRuns.length > 0 && finished.pace > 0 &&
      finished.pace <= Math.min(...allRuns.map((r) => r.pace).filter((p) => p > 0));

    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden" style={{ background: '#0d0f14' }}>
        <RunRouteBackground path={finished.path} />

        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(13,15,20,0.55) 0%, rgba(13,15,20,0.7) 40%, rgba(13,15,20,0.96) 70%, #0d0f14 85%)' }}
        />

        {/* Top bar */}
        <div
          className="absolute left-0 right-0 top-0 flex items-center justify-between px-4 z-20"
          style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}
        >
          <CircleBtn onClick={() => navigate('/')}>
            <ChevronLeft className="h-5 w-5" />
          </CircleBtn>

          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[11px] font-black uppercase tracking-[0.24em]" style={{ color: 'var(--accent)' }}>
              {format(new Date(finished.timestamp), 'EEE, MMM d').toUpperCase()}
            </span>
            <span className="text-[10px] font-semibold text-white/35">
              {format(new Date(finished.timestamp), 'h:mm a')}
            </span>
          </div>

          <CircleBtn onClick={() => {
            if (navigator.share) {
              navigator.share({ title: 'My Run', text: `I ran ${finished.distance.toFixed(2)} ${finished.unit}!` }).catch(() => {});
            } else {
              toast('Share not supported on this device');
            }
          }}>
            <Share2 className="h-4 w-4" />
          </CircleBtn>
        </div>

        {/* PR badge */}
        {isPR && (
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
            <span className="text-[10px] font-black tracking-[0.14em] text-black">PR</span>
          </motion.div>
        )}

        {/* Content */}
        <div
          className="relative z-10 flex flex-1 flex-col items-center justify-end gap-4 px-5"
          style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}
        >
          {/* Hero distance */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 220, damping: 20 }}
            className="flex items-baseline gap-2"
          >
            <span className="font-victory text-[88px] font-black leading-none tabular-nums text-white" style={{ letterSpacing: '-0.02em' }}>
              {finished.distance.toFixed(2)}
            </span>
            <span className="font-victory text-[28px] font-black" style={{ color: 'var(--accent)' }}>{finished.unit.toUpperCase()}</span>
          </motion.div>

          {/* 4-stat grid card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            className="w-full rounded-2xl p-4"
            style={glassCardStyle}
          >
            <div className="grid grid-cols-2 gap-3">
              {/* TIME */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3 text-white/30" />
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">Time</span>
                </div>
                <span className="font-victory text-[26px] font-black tabular-nums leading-none text-white">
                  {formatDuration(finished.duration)}
                </span>
              </div>

              {/* AVG PACE */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3 w-3 text-white/30" />
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">Avg Pace</span>
                </div>
                <span className="font-victory text-[26px] font-black tabular-nums leading-none text-white">
                  {finished.pace > 0 ? formatPace(finished.pace) : '--:--'}
                </span>
                <span className="text-[10px] font-bold text-white/25">/{finished.unit}</span>
              </div>

              {/* CAL */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <Flame className="h-3 w-3 text-white/30" />
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">Cal</span>
                </div>
                <span className="font-victory text-[26px] font-black tabular-nums leading-none text-white">{cal}</span>
              </div>

              {/* EFFORT */}
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">Effort</span>
                <div className="flex items-center gap-2 mt-1">
                  <EffortBars effort={effort} />
                  <span className="text-[13px] font-black text-white/50">{effort}/5</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Splits list */}
          {finished.splits && finished.splits.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
              className="w-full rounded-2xl p-4"
              style={glassCardStyle}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-[0.22em] text-white/40">SPLITS · /{finished.unit}</span>
              </div>
              <div className="flex flex-col gap-2">
                {(() => {
                  const paces = finished.splits!.map((s) => s.pace);
                  const bestPace = Math.min(...paces);
                  return finished.splits!.map((split, idx) => {
                    const barPct = bestPace > 0 ? Math.min(1, bestPace / split.pace) : 0.5;
                    const isBest = split.pace === bestPace;
                    return (
                      <div key={idx} className="flex items-center gap-3">
                        <span className="w-6 text-right text-[11px] font-black text-white/30">{idx + 1}</span>
                        <div className="flex-1 h-[6px] rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${barPct * 100}%`,
                              background: isBest ? 'var(--accent)' : 'rgba(200,255,0,0.45)',
                              boxShadow: isBest ? '0 0 8px rgba(200,255,0,0.5)' : 'none',
                            }}
                          />
                        </div>
                        <span className="text-[12px] font-black tabular-nums text-white">
                          {formatPace(distanceUnit === 'mi' ? split.pace * 1.609344 : split.pace)}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
            </motion.div>
          )}

          {/* DONE button */}
          <motion.button
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
            onClick={() => navigate('/')}
            className="h-14 w-full rounded-full font-victory text-[16px] font-black tracking-[0.2em] text-black transition-all active:scale-[0.97]"
            style={{ background: 'var(--accent)' }}
          >
            DONE
          </motion.button>

          <p className="text-[10px] font-semibold text-white/20">
            © {new Date().getFullYear()} Athlix · Map © OpenStreetMap &amp; CARTO
          </p>
        </div>
      </div>
    );
  }

  /* ── Main run screen ─────────────────────────────────────────── */
  return (
    <div className="relative h-screen w-full overflow-hidden" style={{ background: '#0d0f14' }}>

      {/* Full-bleed map */}
      <div className="absolute inset-0" style={{ isolation: 'isolate', zIndex: 0 }}>
        <RunMap path={path} currentPosition={currentPosition} />
      </div>

      {/* Gradient overlay */}
      {!isRunning && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 1,
            background: 'linear-gradient(to bottom, transparent 0%, transparent 35%, rgba(13,15,20,0.65) 55%, #0d0f14 75%)',
          }}
        />
      )}

      {/* Hex loading overlay */}
      <HexOverlay show={isAcquiring} />

      {/* ── Top bar ── */}
      <div
        className="absolute left-0 right-0 top-0 flex items-center justify-between px-4"
        style={{
          zIndex: 50,
          paddingTop: 'max(14px, env(safe-area-inset-top))',
          paddingBottom: 12,
          background: isRunning && !isPaused
            ? 'linear-gradient(to bottom, rgba(13,15,20,0.75) 0%, transparent 100%)'
            : undefined,
        }}
      >
        <CircleBtn onClick={() => navigate(-1)}>
          <ChevronLeft className="h-5 w-5" />
        </CircleBtn>

        {/* Center status */}
        {!isRunning && (
          <div className="flex flex-col items-center gap-1">
            <span className="font-victory text-[15px] font-black tracking-[0.25em] text-white">READY</span>
            <div
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
              style={glassPillStyle}
            >
              <MapPin className="h-2.5 w-2.5" style={{ color: 'var(--accent)' }} />
              <span className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--accent)' }}>GPS LOCKED</span>
            </div>
          </div>
        )}

        {isRunning && !isPaused && (
          <div className="flex flex-col items-center gap-1.5">
            {/* Recording pill */}
            <div
              className="flex items-center gap-2 rounded-full px-3 py-1.5"
              style={glassPillStyle}
            >
              <span
                className="h-2 w-2 rounded-full bg-red-500"
                style={{ animation: 'recBlink 1.1s step-end infinite' }}
              />
              <style>{`@keyframes recBlink { 0%,100%{opacity:1} 50%{opacity:0.2} }`}</style>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">
                RECORDING · {activeGoal === '5k' ? '5K' : activeGoal === '30min' ? '30M' : activeGoal === 'pace' ? 'PACE' : 'FREE'} · KM {Math.ceil(totalDistance)}
              </span>
            </div>
          </div>
        )}

        {isRunning && isPaused && (
          <span className="font-victory text-[13px] font-black tracking-wide" style={{ color: 'var(--accent)' }}>PAUSED</span>
        )}

        <div className="flex items-center gap-2">
          {isRunning && !isPaused ? (
            <>
              <CircleBtn onClick={() => {}}>
                <Layers className="h-4 w-4" />
              </CircleBtn>
              <CircleBtn onClick={() => {}}>
                <Lock className="h-4 w-4" />
              </CircleBtn>
            </>
          ) : (
            <CircleBtn onClick={() => navigate('/')}>
              <Home className="h-4 w-4" />
            </CircleBtn>
          )}
        </div>
      </div>

      {/* ── Goal progress bar — shown when running ── */}
      {isRunning && !isPaused && (activeGoal === '5k' || activeGoal === '30min') && (
        <div
          className="absolute left-4 right-4"
          style={{
            zIndex: 48,
            top: 'calc(max(14px, env(safe-area-inset-top)) + 68px)',
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-3"
            style={glassCardStyle}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-[0.22em] text-white/40">{goalLabel}</span>
              <span className="text-[11px] font-black tabular-nums text-white/60">{goalProgressText}</span>
            </div>
            <div className="h-[5px] w-full rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <motion.div
                className="h-full rounded-full"
                animate={{ width: `${goalProgress * 100}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                style={{
                  background: 'var(--accent)',
                  boxShadow: '0 0 10px rgba(200,255,0,0.6)',
                }}
              />
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Bottom panel ── */}
      <div
        className="absolute bottom-0 left-0 right-0 flex flex-col px-4 pt-4"
        style={{
          zIndex: 50,
          paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
          background: 'linear-gradient(to top, #0d0f14 0%, #0d0f14 42%, rgba(13,15,20,0.80) 65%, transparent 100%)',
        }}
      >
        <AnimatePresence mode="wait">

          {/* ─────────── IDLE / NOT STARTED ─────────── */}
          {!isRunning && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="flex flex-col gap-3"
            >
              {/* Goal row — borderless, tap to change */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Target className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
                  <span className="text-[9px] font-black uppercase tracking-[0.18em] text-white/30">Goal</span>
                  <div className="h-3 w-px bg-white/10" />
                  <span className="font-victory text-[20px] font-black leading-none text-white">
                    {activeGoal === '5k'    ? `${distOpts[goalDistIdx]} ${distanceUnit.toUpperCase()}`
                   : activeGoal === '30min' ? `${TIME_OPTIONS[goalTimeIdx]} MIN`
                   : activeGoal === 'pace'  ? PACE_OPTIONS[goalPaceIdx]
                   : 'OPEN'}
                  </span>
                  <span className="text-[11px] font-medium text-white/30">
                    {activeGoal === '5k'    ? 'Distance'
                   : activeGoal === '30min' ? 'Time'
                   : activeGoal === 'pace'  ? `/${distanceUnit}`
                   : 'Free run'}
                  </span>
                </div>
                <button
                  onClick={() => setShowGoalPicker(true)}
                  className="text-[11px] font-black tracking-[0.1em] transition-opacity active:opacity-60"
                  style={{ color: 'var(--accent)' }}
                >
                  Change ›
                </button>
              </div>

              {/* Quick stats — no box, just spaced columns */}
              <div className="grid grid-cols-3 px-1">
                {/* Last run */}
                <div className="flex flex-col items-center gap-1 py-2">
                  <span className="text-[8px] font-bold uppercase tracking-[0.18em] text-white/25">Last Run</span>
                  {lastRun ? (
                    <>
                      <span className="font-victory text-[22px] font-black leading-none text-white">
                        {(distanceUnit === 'mi' ? lastRun.distance * 0.621371 : lastRun.distance).toFixed(1)}
                      </span>
                      <span className="text-[9px] font-semibold text-white/30">{distanceUnit}</span>
                      <span className="text-[8px] text-white/20">
                        {Math.floor((Date.now() - lastRun.timestamp) / (24 * 60 * 60 * 1000))}d ago
                      </span>
                    </>
                  ) : (
                    <span className="text-[15px] font-black text-white/15">--</span>
                  )}
                </div>

                {/* This week — center, highlighted */}
                <div className="flex flex-col items-center gap-1 py-2" style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                  <span className="text-[8px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--accent)', opacity: 0.7 }}>This Week</span>
                  <span className="font-victory text-[22px] font-black leading-none" style={{ color: 'var(--accent)' }}>
                    {(distanceUnit === 'mi' ? weekStats.km * 0.621371 : weekStats.km).toFixed(1)}
                  </span>
                  <span className="text-[9px] font-semibold text-white/30">{distanceUnit}</span>
                  <span className="text-[8px] text-white/20">{weekStats.count} runs</span>
                </div>

                {/* Streak */}
                <div className="flex flex-col items-center gap-1 py-2">
                  <span className="text-[8px] font-bold uppercase tracking-[0.18em] text-white/25">Streak</span>
                  <span className="font-victory text-[22px] font-black leading-none" style={{ color: streak > 0 ? 'var(--accent)' : 'rgba(255,255,255,0.15)' }}>
                    {streak}
                  </span>
                  <span className="text-[9px] font-semibold text-white/30">{streak === 1 ? 'day' : 'days'}</span>
                  {streak > 0 && <span className="text-[10px]">🔥</span>}
                </div>
              </div>

              {/* Start run button */}
              <button
                onClick={() => setShowStartConfirm(true)}
                className="w-full h-14 rounded-full font-victory text-[16px] font-black tracking-[0.22em] text-black transition-all active:scale-[0.97] flex items-center justify-center gap-2.5"
                style={{ background: 'var(--accent)', boxShadow: '0 0 24px rgba(200,255,0,0.3)' }}
              >
                <Play className="h-5 w-5 fill-black" />
                START RUN
              </button>

              {/* View history */}
              <button
                onClick={() => navigate('/run/history')}
                className="btn-glow btn-glow-accent w-full py-3 flex items-center justify-center gap-2 text-[12px] font-bold tracking-[0.12em] text-[var(--text-secondary)]"
              >
                <History className="h-3.5 w-3.5" />
                VIEW RUN HISTORY ›
              </button>
            </motion.div>
          )}

          {/* ─────────── RUNNING ─────────── */}
          {isRunning && !isPaused && (
            <motion.div
              key="running"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-2"
            >
              {/* Hero number */}
              <div className="flex items-baseline justify-center gap-2">
                <span className="font-victory leading-none tabular-nums text-white" style={{ fontSize: 96 }}>
                  {displayDistance.toFixed(2)}
                </span>
                <span className="font-victory text-[28px] font-black text-white/30" style={{ fontSize: 28 }}>
                  {distanceUnit}
                </span>
              </div>

              {/* Divider */}
              <div className="h-px w-full" style={{ background: 'rgba(255,255,255,0.07)' }} />

              {/* 3-col stats */}
              <div className="grid grid-cols-3">
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[8px] font-black uppercase tracking-[0.18em] text-white/30">TIME</span>
                  <span className="font-victory text-[24px] font-black tabular-nums leading-none text-white">
                    {formatDuration(elapsedTime)}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[8px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--accent)' }}>PACE</span>
                  <span className="font-victory text-[24px] font-black tabular-nums leading-none" style={{ color: 'var(--accent)' }}>
                    {displayPace > 0 ? formatPace(displayPace) : '--:--'}
                  </span>
                  <span className="text-[9px] font-bold text-white/25">/{distanceUnit}</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[8px] font-black uppercase tracking-[0.18em] text-white/30">BPM</span>
                  <span className="font-victory text-[24px] font-black tabular-nums leading-none text-white">--</span>
                  <span className="text-[9px] font-bold text-white/25">BPM</span>
                </div>
              </div>

              {/* Alerts */}
              {needsInternet && (
                <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold text-amber-200" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Map tiles need internet — GPS tracking continues offline.
                </div>
              )}

              {/* Controls row */}
              <div className="flex items-center gap-3">
                {/* PAUSE pill */}
                <button
                  onClick={pauseRun}
                  className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full transition-all active:scale-[0.95]"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.18)' }}
                >
                  <Pause className="h-[18px] w-[18px] fill-white text-white" />
                  <span className="font-victory text-[15px] font-black tracking-[0.18em] text-white uppercase">PAUSE</span>
                </button>

                {/* Stop circle */}
                <button
                  onClick={() => setShowStopConfirm(true)}
                  className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full transition-all active:scale-95"
                  style={{
                    background: 'rgba(239,68,68,0.85)',
                    boxShadow: '0 0 20px rgba(239,68,68,0.4)',
                  }}
                >
                  <Square className="h-6 w-6 fill-white text-white" />
                </button>
              </div>

            </motion.div>
          )}

          {/* ─────────── PAUSED ─────────── */}
          {isRunning && isPaused && (
            <motion.div
              key="paused"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-3"
            >
              <div className="grid grid-cols-3">
                {[
                  { label: 'DISTANCE', value: displayDistance.toFixed(2), unit: distanceUnit },
                  { label: 'TIME', value: formatDuration(elapsedTime), unit: '' },
                  { label: 'PACE', value: displayPace > 0 ? formatPace(displayPace) : '--:--', unit: `/${distanceUnit}` },
                ].map(({ label, value, unit }, i) => (
                  <div key={i} className="flex flex-col items-center gap-0.5">
                    <span className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: 'rgba(200,255,0,0.7)' }}>{label}</span>
                    <span className="font-victory text-[28px] font-black tabular-nums leading-none text-white">{value}</span>
                    {unit ? <span className="text-[10px] font-bold text-white/30">{unit}</span> : <span className="h-[16px]" />}
                  </div>
                ))}
              </div>

              <div className="flex gap-2.5">
                <button
                  onClick={resumeRun}
                  className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full text-black transition-all active:scale-[0.97]"
                  style={{ background: 'var(--accent)' }}
                >
                  <Play className="h-5 w-5 fill-black" />
                  <span className="font-victory text-[16px] font-black tracking-[0.18em] uppercase">Resume</span>
                </button>
                <button
                  onClick={() => { void handleStop(); }}
                  className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full text-white transition-all active:scale-[0.97]"
                  style={{ background: 'rgba(239,68,68,0.85)' }}
                >
                  <Square className="h-4 w-4 fill-white" />
                  <span className="font-victory text-[16px] font-black tracking-[0.18em] uppercase">Finish</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Start confirm popup ── */}
      <AnimatePresence>
        {showStartConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] flex items-end justify-center px-4 pb-6"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
            onClick={() => setShowStartConfirm(false)}
          >
            <motion.div
              initial={{ y: 48, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 48, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl p-5 flex flex-col gap-4"
              style={{ background: '#161a22', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              {/* Handle */}
              <div className="mx-auto h-1 w-10 rounded-full bg-white/15" />

              <div className="text-center">
                <p className="text-[18px] font-black text-white">Ready to run?</p>
                <p className="mt-1.5 text-[13px] font-semibold text-white/40">
                  Goal: <span style={{ color: 'var(--accent)' }}>{goalLabel}</span>
                </p>
                <p className="mt-1 text-[12px] text-white/25">
                  Make sure GPS is locked before you start
                </p>
              </div>

              {/* GPS status pill */}
              <div
                className="flex items-center justify-center gap-2 rounded-2xl py-3"
                style={{ background: 'rgba(200,255,0,0.06)', border: '1px solid rgba(200,255,0,0.14)' }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent)' }} />
                <span className="text-[12px] font-bold tracking-[0.1em]" style={{ color: 'var(--accent)' }}>
                  GPS READY · HIGH ACCURACY
                </span>
              </div>

              <div className="flex gap-2.5">
                <button
                  onClick={() => setShowStartConfirm(false)}
                  className="flex-1 h-12 rounded-full text-[13px] font-black tracking-[0.1em] text-white/60 transition-all active:scale-[0.97]"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  CANCEL
                </button>
                <button
                  onClick={() => { setShowStartConfirm(false); startRun(); }}
                  className="flex-1 h-12 rounded-full text-[14px] font-black tracking-[0.12em] text-black transition-all active:scale-[0.97] flex items-center justify-center gap-2"
                  style={{ background: 'var(--accent)' }}
                >
                  <Play className="h-4 w-4 fill-black" />
                  LET'S GO
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Stop confirm dialog ── */}
      <AnimatePresence>
        {showStopConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] flex items-end justify-center px-4 pb-8"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
            onClick={() => setShowStopConfirm(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl p-5 flex flex-col gap-4"
              style={{ background: '#161a22', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <div className="text-center">
                <p className="text-[16px] font-black text-white">Stop this run?</p>
                <p className="mt-1 text-[12px] font-semibold text-white/40">
                  {displayDistance.toFixed(2)} {distanceUnit} · {formatDuration(elapsedTime)}
                </p>
              </div>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setShowStopConfirm(false)}
                  className="flex-1 h-12 rounded-full text-[13px] font-black tracking-[0.1em] text-white/70 transition-all active:scale-[0.97]"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  KEEP GOING
                </button>
                <button
                  onClick={() => { setShowStopConfirm(false); void handleStop(); }}
                  className="flex-1 h-12 rounded-full text-[13px] font-black tracking-[0.1em] text-white transition-all active:scale-[0.97]"
                  style={{ background: 'rgba(239,68,68,0.82)', border: '1px solid rgba(239,68,68,0.3)' }}
                >
                  STOP RUN
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Goal picker bottom sheet ── */}
      <AnimatePresence>
        {showGoalPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[60] flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
            onClick={() => setShowGoalPicker(false)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-t-3xl p-5 flex flex-col gap-4"
              style={{
                background: '#161a22',
                border: '1px solid rgba(255,255,255,0.08)',
                paddingBottom: 'max(28px, env(safe-area-inset-bottom))',
              }}
            >
              {/* Handle */}
              <div className="mx-auto h-1 w-10 rounded-full bg-white/15" />

              <div className="flex items-center gap-2 mb-1">
                <Target className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                <span className="text-[13px] font-black uppercase tracking-[0.18em] text-white">Choose Goal</span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {GOAL_CARDS.map(({ key }) => {
                  const active = activeGoal === key;
                  const canEdit = key !== 'open';
                  const dynLabel = key === '5k'    ? `${distOpts[goalDistIdx]}`
                                 : key === '30min' ? `${TIME_OPTIONS[goalTimeIdx]}`
                                 : key === 'pace'  ? PACE_OPTIONS[goalPaceIdx]
                                 : 'Open';
                  const dynSub   = key === '5k'    ? distanceUnit.toUpperCase()
                                 : key === '30min' ? 'min'
                                 : key === 'pace'  ? `/${distanceUnit}`
                                 : 'Free run';
                  return (
                    <div
                      key={key}
                      className="relative rounded-2xl overflow-hidden"
                      style={{
                        background: active ? 'rgba(200,255,0,0.09)' : 'rgba(255,255,255,0.04)',
                        border: active ? '1.5px solid var(--accent)' : '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      <button
                        onClick={() => { setActiveGoal(key); setShowGoalPicker(false); }}
                        className="w-full flex flex-col items-center pt-4 pb-3 px-2 transition-all active:scale-95"
                      >
                        <span
                          className="font-victory text-[26px] font-black leading-none"
                          style={{ color: active ? 'var(--accent)' : 'white' }}
                        >
                          {dynLabel}
                        </span>
                        <span className="mt-0.5 text-[11px] font-semibold text-white/35">{dynSub}</span>
                        {active && (
                          <span
                            className="mt-2 rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-black"
                            style={{ background: 'var(--accent)' }}
                          >
                            SELECTED
                          </span>
                        )}
                      </button>
                      {canEdit && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingGoal(key); }}
                          className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full transition-all active:scale-90"
                          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
                        >
                          <Pencil className="h-3 w-3 text-white/40" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Goal edit dial sheet ── */}
      <AnimatePresence>
        {editingGoal && (() => {
          const titles: Record<GoalType, string> = { '5k': 'Distance Goal', '30min': 'Time Goal', 'pace': 'Pace Goal', open: '' };
          const isDistance = editingGoal === '5k';
          const isTime     = editingGoal === '30min';
          const isPace     = editingGoal === 'pace';

          const opts    = isDistance ? distOpts.map(String)
                        : isTime     ? TIME_OPTIONS.map(String)
                        : PACE_OPTIONS;
          const curIdx  = isDistance ? goalDistIdx : isTime ? goalTimeIdx : goalPaceIdx;
          const setIdx  = isDistance ? setGoalDistIdx : isTime ? setGoalTimeIdx : setGoalPaceIdx;
          const pickerUnit = isDistance ? distanceUnit.toUpperCase()
                           : isTime     ? 'min'
                           : `/${distanceUnit}`;

          return (
            <motion.div
              key="editDial"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-[70] flex items-end justify-center"
              style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
              onClick={() => setEditingGoal(null)}
            >
              <motion.div
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 80, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 340, damping: 30 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-t-3xl p-5 flex flex-col gap-4"
                style={{
                  background: '#161a22',
                  border: '1px solid rgba(255,255,255,0.08)',
                  paddingBottom: 'max(28px, env(safe-area-inset-bottom))',
                }}
              >
                <div className="mx-auto h-1 w-10 rounded-full bg-white/15" />

                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-black uppercase tracking-[0.18em] text-white">
                    {titles[editingGoal]}
                  </span>
                  <span className="text-[11px] font-semibold text-white/30">
                    {isDistance && `${distOpts[curIdx]} ${distanceUnit}`}
                    {isTime && `${TIME_OPTIONS[curIdx]} min`}
                    {isPace && PACE_OPTIONS[curIdx]}
                  </span>
                </div>

                <ScrollPicker
                  options={opts}
                  index={curIdx}
                  onChange={setIdx}
                  unit={pickerUnit}
                />

                <button
                  onClick={() => setEditingGoal(null)}
                  className="h-13 w-full rounded-full font-victory text-[15px] font-black tracking-[0.18em] text-black transition-all active:scale-[0.97]"
                  style={{ background: 'var(--accent)', height: 52 }}
                >
                  DONE
                </button>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ── GPS / network errors ── */}
      <AnimatePresence>
        {error && !isPermDenied && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute left-4 right-4 flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold text-red-300"
            style={{
              zIndex: 55,
              top: 'calc(max(14px, env(safe-area-inset-top)) + 64px)',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.2)',
            }}
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
