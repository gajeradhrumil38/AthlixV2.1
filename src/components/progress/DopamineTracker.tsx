import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, subDays, parseISO, differenceInDays, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, addMonths, getMonth, getYear } from 'date-fns';
import {
  ShieldAlert, CheckCircle2, XCircle, X, Flame, Wind, Droplets, Zap, Target,
  TrendingUp, Brain, Heart, Timer, Trash2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getDopamineEntries, upsertDopamineEntry, deleteDopamineEntry } from '../../lib/supabaseData';
import type { DopamineEntry } from '../../lib/supabaseData';

// ─── Constants ────────────────────────────────────────────────────────────────

const SUCCESS_COLORS = ['', '#C8FF00', '#96CC00', '#6A9900', '#4A6B00', '#2E4200'];
const RELAPSE_COLOR  = '#f87171';
const EMPTY_COLOR    = 'rgba(255,255,255,0.05)';
const TODAY_BORDER   = '#FAC775';

const TRIGGER_OPTIONS = ['Stress', 'Boredom', 'Loneliness', 'Fatigue', 'Social media', 'Physical urge', 'Emotional pain', 'Idle time'];
const HELPED_OPTIONS  = ['Exercise', 'Cold shower', 'Deep breathing', 'Meditation', 'Journaling', 'Called someone', 'Left the space', 'Distraction'];
const URGE_LABELS     = ['', 'Very Low', 'Low', 'Medium', 'High', 'Very High'];

const SOS_TIPS = [
  { icon: Wind,     label: 'Box Breathing',    desc: 'Inhale 4s · Hold 4s · Exhale 4s · Hold 4s. Repeat 4×. This activates the parasympathetic system and breaks the urge cycle.' },
  { icon: Droplets, label: 'Cold Water',        desc: 'Splash cold water on your face or take a 2-min cold shower. Resets the nervous system and kills the urge fast.' },
  { icon: Zap,      label: 'Move Your Body',    desc: '20 push-ups or a 10-minute brisk walk. Physical movement redirects dopamine to the prefrontal cortex — your rational brain.' },
  { icon: Target,   label: 'Remember Your Why', desc: 'Every urge is just a wave — it peaks in 15–20 minutes and then passes. You don\'t have to act on it.' },
];

const BENEFITS_TIMELINE = [
  { days: 3,  benefit: 'Sleep improving. Energy returning. Brain fog lifting.' },
  { days: 7,  benefit: 'Dopamine receptors begin healing. Morning motivation returning.' },
  { days: 14, benefit: 'Mental clarity sharper. Anxiety and social anxiety reducing.' },
  { days: 30, benefit: 'Real confidence emerging. Deeper focus. Better eye contact.' },
  { days: 60, benefit: 'Brain rewiring nearly complete. Authentic drive restored.' },
  { days: 90, benefit: 'Dopamine baseline reset. You are operating at full capacity.' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getEntryColor = (entry: DopamineEntry | undefined) => {
  if (!entry) return EMPTY_COLOR;
  if (entry.status === 'relapse') return RELAPSE_COLOR;
  return SUCCESS_COLORS[Math.max(1, Math.min(5, entry.urge))] ?? '#C8FF00';
};

const computeStats = (entries: DopamineEntry[]) => {
  const entryMap = new Map(entries.map((e) => [e.date, e]));

  let current = 0;
  for (let i = 0; i <= 365; i++) {
    const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
    const e = entryMap.get(d);
    if (i === 0 && !e) continue;
    if (!e || e.status === 'relapse') break;
    current++;
  }

  let best = 0, run = 0, prevDate: string | null = null;
  for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
    if (e.status === 'relapse') { run = 0; prevDate = null; continue; }
    if (prevDate && differenceInDays(parseISO(e.date), parseISO(prevDate)) === 1) run++;
    else run = 1;
    if (run > best) best = run;
    prevDate = e.date;
  }

  const cutoff = format(subDays(new Date(), 29), 'yyyy-MM-dd');
  const last30 = entries.filter((e) => e.date >= cutoff);
  const successes = last30.filter((e) => e.status === 'success');
  const successRate = last30.length > 0 ? Math.round((successes.length / last30.length) * 100) : null;
  const avgUrge = successes.length > 0
    ? (successes.reduce((s, e) => s + e.urge, 0) / successes.length).toFixed(1)
    : null;

  // Pattern: top trigger + top helper
  const allTriggers = entries.flatMap((e) => e.triggers ?? []);
  const triggerFreq: Record<string, number> = {};
  allTriggers.forEach((t) => { triggerFreq[t] = (triggerFreq[t] ?? 0) + 1; });
  const topTrigger = Object.entries(triggerFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const allHelped = entries.flatMap((e) => e.helped_by ?? []);
  const helpedFreq: Record<string, number> = {};
  allHelped.forEach((h) => { helpedFreq[h] = (helpedFreq[h] ?? 0) + 1; });
  const topHelper = Object.entries(helpedFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Day-of-week pattern (0=Sun…6=Sat) with most relapses
  const relapseDayCount: Record<number, number> = {};
  entries.filter((e) => e.status === 'relapse').forEach((e) => {
    const dow = parseISO(e.date).getDay();
    relapseDayCount[dow] = (relapseDayCount[dow] ?? 0) + 1;
  });
  const hardestDow = Object.entries(relapseDayCount).sort((a, b) => b[1] - a[1])[0];
  const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hardestDay = hardestDow ? DOW_NAMES[Number(hardestDow[0])] : null;

  return { current, best, successRate, avgUrge, topTrigger, topHelper, hardestDay };
};

const getMilestone = (streak: number) => {
  return [...BENEFITS_TIMELINE].reverse().find((b) => streak >= b.days) ?? null;
};

const getNextMilestone = (streak: number) => {
  return BENEFITS_TIMELINE.find((b) => streak < b.days) ?? null;
};

// ─── Component ────────────────────────────────────────────────────────────────

export const DopamineTracker: React.FC = () => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<DopamineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showSOS, setShowSOS] = useState(false);
  const [sosTimer, setSosTimer] = useState<number | null>(null);
  const sosIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [checkinStep, setCheckinStep] = useState<'status' | 'details'>('status');
  const [pendingStatus, setPendingStatus] = useState<'success' | 'relapse' | null>(null);
  const [pendingUrge, setPendingUrge] = useState(2);
  const [pendingNote, setPendingNote] = useState('');
  const [pendingTriggers, setPendingTriggers] = useState<string[]>([]);
  const [pendingHelped, setPendingHelped] = useState<string[]>([]);

  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [showAllLog, setShowAllLog] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayEntry = entries.find((e) => e.date === today);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    getDopamineEntries(user.id)
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);


  // SOS urge surfing timer
  const startSosTimer = () => {
    setSosTimer(15 * 60);
    sosIntervalRef.current = setInterval(() => {
      setSosTimer((t) => {
        if (t === null || t <= 1) {
          if (sosIntervalRef.current) clearInterval(sosIntervalRef.current);
          return null;
        }
        return t - 1;
      });
    }, 1000);
  };
  useEffect(() => () => { if (sosIntervalRef.current) clearInterval(sosIntervalRef.current); }, []);

  const openCheckinForDate = (dateStr: string) => {
    const existing = entries.find((e) => e.date === dateStr);
    if (existing) {
      setPendingStatus(existing.status);
      setPendingUrge(existing.urge);
      setPendingNote(existing.note || '');
      setPendingTriggers(existing.triggers ?? []);
      setPendingHelped(existing.helped_by ?? []);
      setCheckinStep('details');
    } else {
      setCheckinStep('status');
      setPendingStatus(null);
      setPendingUrge(2);
      setPendingNote('');
      setPendingTriggers([]);
      setPendingHelped([]);
    }
    setEditingDate(dateStr);
  };

  const closeCheckin = () => {
    setEditingDate(null);
    setCheckinStep('status');
    setPendingStatus(null);
    setPendingUrge(2);
    setPendingNote('');
    setPendingTriggers([]);
    setPendingHelped([]);
  };

  const toggleTag = (list: string[], setList: (v: string[]) => void, tag: string) => {
    setList(list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]);
  };

  const submitCheckin = useCallback(async () => {
    if (!pendingStatus || !editingDate || !user) return;
    setSaving(true);
    try {
      const saved = await upsertDopamineEntry(user.id, {
        date: editingDate,
        status: pendingStatus,
        urge: pendingUrge,
        note: pendingNote.trim() || undefined,
        triggers: pendingTriggers,
        helped_by: pendingHelped,
      });
      setEntries((prev) => {
        const without = prev.filter((e) => e.date !== editingDate);
        return [...without, saved].sort((a, b) => a.date.localeCompare(b.date));
      });
      closeCheckin();
    } catch {
      // keep modal open
    } finally {
      setSaving(false);
    }
  }, [pendingStatus, editingDate, user, pendingUrge, pendingNote, pendingTriggers, pendingHelped]);

  const deleteEntry = useCallback(async () => {
    if (!editingDate || !user) return;
    setDeleting(true);
    try {
      await deleteDopamineEntry(user.id, editingDate);
      setEntries((prev) => prev.filter((e) => e.date !== editingDate));
      closeCheckin();
    } catch {
      // keep modal open
    } finally {
      setDeleting(false);
    }
  }, [editingDate, user]);

  const stats = useMemo(() => computeStats(entries), [entries]);
  const milestone = getMilestone(stats.current);
  const nextMilestone = getNextMilestone(stats.current);

  const canGoNext = getMonth(viewMonth) !== getMonth(new Date()) || getYear(viewMonth) !== getYear(new Date());

  const gridCells = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
    const gridEnd   = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd }).map((day) => {
      const d = format(day, 'yyyy-MM-dd');
      const entry = entries.find((e) => e.date === d);
      const inMonth = getMonth(day) === getMonth(viewMonth) && getYear(day) === getYear(viewMonth);
      return {
        date: d, entry,
        isToday: d === today,
        isFuture: d > today,
        inMonth,
      };
    });
  }, [entries, today, viewMonth]);

  const weeks = useMemo(() => {
    const w: typeof gridCells[] = [];
    for (let i = 0; i < gridCells.length; i += 7) w.push(gridCells.slice(i, i + 7));
    return w;
  }, [gridCells]);

  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const editingEntry = editingDate ? entries.find((e) => e.date === editingDate) : undefined;
  const editingDateLabel = editingDate
    ? (editingDate === today ? 'Today' : format(parseISO(editingDate), 'EEE, MMM d'))
    : '';

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Streak hero ── */}
      <div
        className="rounded-2xl p-5 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg,#0f1a00 0%,#111419 60%)', border: '1px solid rgba(200,255,0,0.12)' }}
      >
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 20% 50%,rgba(200,255,0,0.06) 0%,transparent 60%)' }} />

        <div className="flex items-start justify-between mb-4 relative">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1" style={{ color: 'rgba(200,255,0,0.5)' }}>Dopamine Reset</p>
            <div className="flex items-baseline gap-2">
              <span className="text-[48px] font-black leading-none tabular-nums" style={{ color: '#C8FF00' }}>{stats.current}</span>
              <span className="text-[16px] font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>day streak</span>
            </div>
            {milestone && (
              <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
                style={{ background: 'rgba(200,255,0,0.15)', border: '1px solid rgba(200,255,0,0.3)', color: '#C8FF00' }}>
                <Flame className="w-3 h-3" />
                {milestone.days}-day milestone!
              </div>
            )}
          </div>
          <button onClick={() => setShowSOS(true)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-[12px] font-bold transition-all active:scale-95"
            style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171' }}>
            <ShieldAlert className="w-3.5 h-3.5" /> SOS
          </button>
        </div>

        {/* Milestone benefit or next goal */}
        {milestone && (
          <p className="text-[12px] leading-relaxed mb-4 relative" style={{ color: 'rgba(255,255,255,0.55)' }}>
            {milestone.benefit}
          </p>
        )}

        {/* Next milestone progress bar */}
        {nextMilestone && (
          <div className="mb-4 relative">
            <div className="flex justify-between mb-1">
              <span className="text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>Next milestone</span>
              <span className="text-[10px] font-bold" style={{ color: 'rgba(200,255,0,0.6)' }}>{nextMilestone.days} days — {nextMilestone.benefit.split('.')[0]}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, (stats.current / nextMilestone.days) * 100)}%`, background: '#C8FF00' }}
              />
            </div>
            <p className="text-[10px] mt-1 text-right" style={{ color: 'rgba(255,255,255,0.25)' }}>
              {nextMilestone.days - stats.current} day{nextMilestone.days - stats.current !== 1 ? 's' : ''} to go
            </p>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: 'Best', value: `${stats.best}d`, sub: 'streak' },
            { label: 'Rate', value: stats.successRate != null ? `${stats.successRate}%` : '—', sub: '30-day' },
            { label: 'Avg Urge', value: stats.avgUrge ?? '—', sub: '/ 5' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{s.label}</p>
              <p className="text-[20px] font-black tabular-nums leading-none" style={{ color: 'rgba(255,255,255,0.9)' }}>{s.value}</p>
              <p className="text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{s.sub}</p>
            </div>
          ))}
        </div>

        <button onClick={() => openCheckinForDate(today)}
          className="w-full py-3.5 rounded-xl text-[14px] font-bold text-black flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          style={{ background: '#C8FF00' }}>
          {todayEntry
            ? (todayEntry.status === 'success'
              ? <><CheckCircle2 className="w-4 h-4" /> Today: Strong — Edit</>
              : <><Heart className="w-4 h-4" /> Today logged — Edit</>)
            : <><Target className="w-4 h-4" /> Log Today</>}
        </button>
      </div>

      {/* ── Pattern Insights (show only when enough data) ── */}
      {entries.length >= 5 && (stats.topTrigger || stats.topHelper || stats.hardestDay) && (
        <div className="rounded-2xl p-4" style={{ background: '#16191F', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-4 h-4" style={{ color: '#C8FF00' }} />
            <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.4)' }}>Your Patterns</p>
          </div>
          <div className="space-y-2">
            {stats.topTrigger && (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.12)' }}>
                <XCircle className="w-3.5 h-3.5 shrink-0" style={{ color: '#f87171' }} />
                <div>
                  <p className="text-[11px] font-bold" style={{ color: '#f87171' }}>Most common trigger: {stats.topTrigger}</p>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Be extra mindful when you feel this way</p>
                </div>
              </div>
            )}
            {stats.topHelper && (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(200,255,0,0.06)', border: '1px solid rgba(200,255,0,0.12)' }}>
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: '#C8FF00' }} />
                <div>
                  <p className="text-[11px] font-bold" style={{ color: '#C8FF00' }}>What helps you most: {stats.topHelper}</p>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Your proven strategy — use it first</p>
                </div>
              </div>
            )}
            {stats.hardestDay && (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(250,199,117,0.06)', border: '1px solid rgba(250,199,117,0.12)' }}>
                <TrendingUp className="w-3.5 h-3.5 shrink-0" style={{ color: '#FAC775' }} />
                <div>
                  <p className="text-[11px] font-bold" style={{ color: '#FAC775' }}>Hardest day: {stats.hardestDay}</p>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Plan ahead — be extra prepared on {stats.hardestDay}s</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Monthly Calendar ── */}
      <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg,#16191F 0%,#111419 100%)', border: '1px solid rgba(255,255,255,0.08)' }}>

        {/* Month nav header */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setViewMonth((m) => addMonths(m, -1))}
            className="w-8 h-8 rounded-xl flex items-center justify-center active:scale-90 transition-all"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <ChevronLeft className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.6)' }} />
          </button>

          <div className="text-center">
            <p className="text-[16px] font-bold" style={{ color: '#fff' }}>{format(viewMonth, 'MMMM yyyy')}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>Tap any day to log</p>
          </div>

          <button
            onClick={() => canGoNext && setViewMonth((m) => addMonths(m, 1))}
            disabled={!canGoNext}
            className="w-8 h-8 rounded-xl flex items-center justify-center active:scale-90 transition-all disabled:opacity-20"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <ChevronRight className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.6)' }} />
          </button>
        </div>

        {/* Day-of-week column headers */}
        <div className="grid grid-cols-7 mb-1.5">
          {DAY_LABELS.map((d, i) => (
            <div key={i} className="text-center text-[10px] font-bold uppercase tracking-wider py-1"
              style={{ color: i >= 5 ? 'rgba(250,199,117,0.5)' : 'rgba(255,255,255,0.25)' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid — square rounded cells */}
        {loading ? (
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="rounded-xl animate-pulse" style={{ aspectRatio: '1', background: 'rgba(255,255,255,0.04)' }} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1.5">
                {week.map((cell, di) => {
                  const isClickable = !cell.isFuture && cell.inMonth;
                  const isWeekend = di >= 5;
                  const bg = cell.entry ? getEntryColor(cell.entry)
                    : isWeekend ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)';

                  return (
                    <motion.button
                      key={di}
                      type="button"
                      disabled={!isClickable}
                      onClick={() => isClickable && openCheckinForDate(cell.date)}
                      whileTap={isClickable ? { scale: 0.82 } : undefined}
                      whileHover={isClickable ? { scale: 1.06 } : undefined}
                      transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                      className="relative flex items-center justify-center rounded-xl"
                      style={{
                        aspectRatio: '1',
                        background: !cell.inMonth ? 'transparent' : bg,
                        border: cell.isToday
                          ? `2px solid ${TODAY_BORDER}`
                          : !cell.inMonth ? 'none'
                          : cell.entry ? '1px solid rgba(255,255,255,0.05)'
                          : '1px dashed rgba(255,255,255,0.1)',
                        opacity: !cell.inMonth ? 0.15 : cell.isFuture ? 0.3 : 1,
                        cursor: isClickable ? 'pointer' : 'default',
                      }}
                    >
                      <span
                        className="text-[12px] font-semibold leading-none select-none"
                        style={{
                          color: cell.entry
                            ? (cell.entry.status === 'success' ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.75)')
                            : cell.isToday ? TODAY_BORDER
                            : cell.inMonth ? 'rgba(255,255,255,0.4)'
                            : 'rgba(255,255,255,0.2)',
                        }}
                      >
                        {format(parseISO(cell.date), 'd')}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center justify-center gap-3 mt-4">
          {[
            { c: 'rgba(255,255,255,0.05)', border: true,  label: 'Empty' },
            { c: SUCCESS_COLORS[1], border: false, label: 'Strong' },
            { c: RELAPSE_COLOR,    border: false, label: 'Struggle' },
          ].map(({ c, border, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-[4px]" style={{ background: c, border: border ? '1px dashed rgba(255,255,255,0.15)' : 'none' }} />
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Recent log ── */}
      {entries.length > 0 && (() => {
        const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
        const visible = showAllLog ? sorted : sorted.slice(0, 3);
        return (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(160deg,#16191F 0%,#111419 100%)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'rgba(255,255,255,0.35)' }}>Recent Log</p>
              {sorted.length > 3 && (
                <button onClick={() => setShowAllLog((v) => !v)}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-all active:scale-95"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
                  {showAllLog ? 'Show less' : `··· ${sorted.length - 3} more`}
                </button>
              )}
            </div>
            {visible.map((e, i) => (
              <button
                key={e.date}
                onClick={() => openCheckinForDate(e.date)}
                className="w-full flex items-start gap-3 px-5 py-3 text-left active:bg-white/5 transition-colors"
                style={{ borderTop: i === 0 ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(255,255,255,0.04)' }}
              >
                <div className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                  style={{ background: e.status === 'success' ? (SUCCESS_COLORS[e.urge] ?? '#C8FF00') : RELAPSE_COLOR }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {format(parseISO(e.date), 'EEE, MMM d')}
                  </p>
                  {(e.triggers ?? []).length > 0 && (
                    <p className="text-[10px] mt-0.5" style={{ color: 'rgba(248,113,113,0.7)' }}>
                      Triggers: {e.triggers!.join(', ')}
                    </p>
                  )}
                  {(e.helped_by ?? []).length > 0 && (
                    <p className="text-[10px] mt-0.5" style={{ color: 'rgba(200,255,0,0.6)' }}>
                      Helped: {e.helped_by!.join(', ')}
                    </p>
                  )}
                  {e.note && <p className="text-[11px] truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{e.note}</p>}
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5"
                  style={e.status === 'success'
                    ? { background: 'rgba(200,255,0,0.1)', color: '#C8FF00', border: '1px solid rgba(200,255,0,0.2)' }
                    : { background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}>
                  {e.status === 'success' ? '✓ Strong' : '✗ Struggled'}
                </span>
              </button>
            ))}
          </div>
        );
      })()}

      {/* ── Check-in modal ── */}
      <AnimatePresence>
        {editingDate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
            <motion.div initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="w-full max-w-[480px] rounded-t-[24px] overflow-y-auto no-scrollbar pb-[max(28px,env(safe-area-inset-bottom))]"
              style={{ background: '#111419', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '90vh' }}>

              <div className="w-9 h-1 rounded-full mx-auto mt-4 mb-5 opacity-30" style={{ background: '#fff' }} />
              <div className="flex items-center justify-between px-5 mb-5">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] mb-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {editingEntry ? 'Edit Entry' : 'Add Entry'}
                  </p>
                  <p className="text-[17px] font-bold" style={{ color: '#fff' }}>{editingDateLabel}</p>
                </div>
                <button onClick={closeCheckin}
                  className="h-8 w-8 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <X className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.5)' }} />
                </button>
              </div>

              {checkinStep === 'status' ? (
                <div className="px-5 space-y-3 pb-5">
                  <p className="text-[13px] font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>How was this day?</p>
                  <button
                    onClick={() => { setPendingStatus('success'); setCheckinStep('details'); }}
                    className="w-full py-4 rounded-2xl text-[16px] font-bold flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
                    style={{ background: 'rgba(200,255,0,0.12)', border: '2px solid rgba(200,255,0,0.3)', color: '#C8FF00' }}>
                    <CheckCircle2 className="w-5 h-5" /> I stayed strong
                  </button>
                  <button
                    onClick={() => { setPendingStatus('relapse'); setPendingUrge(5); setCheckinStep('details'); }}
                    className="w-full py-4 rounded-2xl text-[15px] font-bold flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
                    style={{ background: 'rgba(248,113,113,0.08)', border: '2px solid rgba(248,113,113,0.2)', color: '#f87171' }}>
                    <Heart className="w-5 h-5" /> I struggled today
                  </button>
                  <p className="text-[11px] text-center pt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
                    Honesty is the foundation of recovery. No judgment here.
                  </p>
                </div>
              ) : (
                <div className="px-5 space-y-5 pb-5">
                  {/* Status indicator */}
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                    style={pendingStatus === 'success'
                      ? { background: 'rgba(200,255,0,0.08)', border: '1px solid rgba(200,255,0,0.2)' }
                      : { background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
                    {pendingStatus === 'success'
                      ? <CheckCircle2 className="w-4 h-4" style={{ color: '#C8FF00' }} />
                      : <Heart className="w-4 h-4" style={{ color: '#f87171' }} />}
                    <span className="text-[13px] font-semibold" style={{ color: pendingStatus === 'success' ? '#C8FF00' : '#f87171' }}>
                      {pendingStatus === 'success' ? 'Stayed strong' : 'Struggled today'}
                    </span>
                    <button onClick={() => setCheckinStep('status')} className="ml-auto text-[11px]"
                      style={{ color: 'rgba(255,255,255,0.35)' }}>Change</button>
                  </div>

                  {/* Self-compassion message on relapse */}
                  {pendingStatus === 'relapse' && (
                    <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(250,199,117,0.06)', border: '1px solid rgba(250,199,117,0.15)' }}>
                      <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(250,199,117,0.85)' }}>
                        <span className="font-bold">This is part of recovery</span> — not a failure. Research shows self-compassion (not shame) is what actually breaks the cycle. You logged it honestly. That takes courage.
                      </p>
                    </div>
                  )}

                  {/* Urge level — for success */}
                  {pendingStatus === 'success' && (
                    <div>
                      <p className="text-[12px] font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        Urge level — <span style={{ color: '#C8FF00' }}>{URGE_LABELS[pendingUrge]}</span>
                      </p>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((u) => (
                          <button key={u} onClick={() => setPendingUrge(u)}
                            className="flex-1 py-3 rounded-xl text-[14px] font-black transition-all active:scale-95"
                            style={pendingUrge === u
                              ? { background: SUCCESS_COLORS[u], color: '#000', border: 'none' }
                              : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            {u}
                          </button>
                        ))}
                      </div>
                      <div className="flex justify-between mt-1 text-[9px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                        <span>Easy day</span><span>Hard won</span>
                      </div>
                    </div>
                  )}

                  {/* Triggers */}
                  <div>
                    <p className="text-[12px] font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {pendingStatus === 'success' ? 'What triggered the urge? (optional)' : 'What triggered it?'}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {TRIGGER_OPTIONS.map((tag) => {
                        const sel = pendingTriggers.includes(tag);
                        return (
                          <button key={tag} onClick={() => toggleTag(pendingTriggers, setPendingTriggers, tag)}
                            className="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all active:scale-95"
                            style={sel
                              ? { background: 'rgba(248,113,113,0.2)', border: '1px solid rgba(248,113,113,0.4)', color: '#f87171' }
                              : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* What helped — for success */}
                  {pendingStatus === 'success' && (
                    <div>
                      <p className="text-[12px] font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>What helped you resist?</p>
                      <div className="flex flex-wrap gap-1.5">
                        {HELPED_OPTIONS.map((tag) => {
                          const sel = pendingHelped.includes(tag);
                          return (
                            <button key={tag} onClick={() => toggleTag(pendingHelped, setPendingHelped, tag)}
                              className="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all active:scale-95"
                              style={sel
                                ? { background: 'rgba(200,255,0,0.15)', border: '1px solid rgba(200,255,0,0.35)', color: '#C8FF00' }
                                : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Note */}
                  <div>
                    <p className="text-[12px] font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>Reflection (optional)</p>
                    <textarea
                      value={pendingNote}
                      onChange={(e) => setPendingNote(e.target.value)}
                      placeholder={pendingStatus === 'success'
                        ? 'What kept you going? Any thoughts to remember...'
                        : 'What happened? Be honest with yourself — no one else reads this.'}
                      rows={2}
                      className="w-full rounded-xl px-3 py-2.5 text-[13px] resize-none focus:outline-none"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)', caretColor: '#C8FF00' }}
                    />
                  </div>

                  <button onClick={submitCheckin} disabled={saving || deleting}
                    className="w-full py-3.5 rounded-xl text-[14px] font-bold text-black active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: pendingStatus === 'success' ? '#C8FF00' : '#f87171' }}>
                    {saving ? 'Saving…' : editingEntry ? 'Update Entry' : 'Save Entry'}
                  </button>

                  {/* Delete — only show when editing an existing entry */}
                  {editingEntry && (
                    <button onClick={deleteEntry} disabled={deleting || saving}
                      className="w-full py-3 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.18)', color: '#f87171' }}>
                      <Trash2 className="w-4 h-4" />
                      {deleting ? 'Removing…' : 'Remove This Entry'}
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── SOS Modal ── */}
      <AnimatePresence>
        {showSOS && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
            <motion.div initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="w-full max-w-[480px] rounded-t-[24px] overflow-y-auto no-scrollbar pb-[max(28px,env(safe-area-inset-bottom))]"
              style={{ background: '#0f1118', border: '1px solid rgba(248,113,113,0.2)', maxHeight: '90vh' }}>

              <div className="w-9 h-1 rounded-full mx-auto mt-4 mb-4 opacity-30" style={{ background: '#f87171' }} />
              <div className="px-5 mb-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5" style={{ color: '#f87171' }} />
                    <p className="text-[16px] font-bold" style={{ color: '#fff' }}>Urge is Spiking</p>
                  </div>
                  <button onClick={() => { setShowSOS(false); setSosTimer(null); if (sosIntervalRef.current) clearInterval(sosIntervalRef.current); }}
                    className="h-7 w-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <X className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.5)' }} />
                  </button>
                </div>
                <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Every urge is a wave. It will peak and pass. You just need to wait it out.</p>
              </div>

              {/* Urge surfing timer */}
              <div className="mx-5 mb-4 rounded-xl p-4" style={{ background: 'rgba(200,255,0,0.04)', border: '1px solid rgba(200,255,0,0.12)' }}>
                {sosTimer === null ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[12px] font-bold" style={{ color: '#C8FF00' }}>Urge Surfing Timer</p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Urges peak at 15 min then fade. Start the clock.</p>
                    </div>
                    <button onClick={startSosTimer}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold active:scale-95 transition-all"
                      style={{ background: 'rgba(200,255,0,0.15)', border: '1px solid rgba(200,255,0,0.3)', color: '#C8FF00' }}>
                      <Timer className="w-3.5 h-3.5" /> Start
                    </button>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-[11px] mb-1" style={{ color: 'rgba(200,255,0,0.5)' }}>Ride it out — time remaining</p>
                    <p className="text-[36px] font-black tabular-nums" style={{ color: '#C8FF00' }}>
                      {String(Math.floor(sosTimer / 60)).padStart(2, '0')}:{String(sosTimer % 60).padStart(2, '0')}
                    </p>
                    <p className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>Don't act. Just breathe and wait.</p>
                  </div>
                )}
              </div>

              {/* Streak reminder */}
              <div className="mx-5 mb-4 rounded-xl p-4 flex items-center gap-3"
                style={{ background: 'rgba(200,255,0,0.06)', border: '1px solid rgba(200,255,0,0.15)' }}>
                <Flame className="w-6 h-6 shrink-0" style={{ color: '#C8FF00' }} />
                <div>
                  <p className="text-[11px] uppercase tracking-wider mb-0.5" style={{ color: 'rgba(200,255,0,0.5)' }}>Your streak at stake</p>
                  <p className="text-[22px] font-black leading-none" style={{ color: '#C8FF00' }}>
                    {stats.current} day{stats.current !== 1 ? 's' : ''}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {stats.topHelper ? `Your best weapon: ${stats.topHelper}` : "Don't lose what you've built."}
                  </p>
                </div>
              </div>

              <div className="px-5 space-y-2 mb-4">
                {SOS_TIPS.map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="rounded-xl p-3.5 flex items-start gap-3"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(255,255,255,0.07)' }}>
                      <Icon className="w-4 h-4" style={{ color: '#C8FF00' }} />
                    </div>
                    <div>
                      <p className="text-[13px] font-bold mb-0.5" style={{ color: '#fff' }}>{label}</p>
                      <p className="text-[12px] leading-snug" style={{ color: 'rgba(255,255,255,0.45)' }}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-5">
                <button
                  onClick={() => { setShowSOS(false); setSosTimer(null); if (sosIntervalRef.current) clearInterval(sosIntervalRef.current); }}
                  className="w-full py-3.5 rounded-xl text-[14px] font-bold active:scale-[0.98] transition-all"
                  style={{ background: 'rgba(200,255,0,0.1)', border: '1px solid rgba(200,255,0,0.2)', color: '#C8FF00' }}>
                  I've got this
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
