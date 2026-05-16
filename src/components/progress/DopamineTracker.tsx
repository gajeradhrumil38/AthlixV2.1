import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, subDays, parseISO, differenceInDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { ShieldAlert, CheckCircle2, XCircle, X, Flame, Wind, Droplets, Zap, Target } from 'lucide-react';

const STORAGE_KEY = 'athlix_dopamine_log';

interface DopamineEntry {
  date: string;       // YYYY-MM-DD
  status: 'success' | 'relapse';
  urge: number;       // 1-5
  note?: string;
}

// Urge 1 = easiest (brightest green), 5 = hardest day (still won, dim green)
const SUCCESS_COLORS = ['', '#C8FF00', '#96CC00', '#6A9900', '#4A6B00', '#2E4200'];
const RELAPSE_COLOR  = '#f87171';
const EMPTY_COLOR    = 'rgba(255,255,255,0.05)';
const TODAY_BORDER   = '#FAC775';

const getEntryColor = (entry: DopamineEntry | undefined): string => {
  if (!entry) return EMPTY_COLOR;
  if (entry.status === 'relapse') return RELAPSE_COLOR;
  return SUCCESS_COLORS[Math.max(1, Math.min(5, entry.urge))] ?? '#C8FF00';
};

const URGE_LABELS = ['', 'Very Low', 'Low', 'Medium', 'High', 'Very High'];

const SOS_TIPS = [
  { icon: Wind, label: 'Box Breathing', desc: 'Inhale 4s · Hold 4s · Exhale 4s · Hold 4s. Repeat 4×.' },
  { icon: Droplets, label: 'Cold Water', desc: 'Splash cold water on your face or take a cold shower. Resets your nervous system instantly.' },
  { icon: Zap, label: 'Move Now', desc: '20 push-ups or a 10-minute walk. Physical movement redirects dopamine naturally.' },
  { icon: Target, label: 'Remember Your Why', desc: 'You started this for a reason. Every urge passes within 15–20 minutes.' },
];

const computeStats = (entries: DopamineEntry[]) => {
  const entryMap = new Map(entries.map((e) => [e.date, e]));

  // Current streak — go backwards from yesterday (today may not be logged yet)
  let current = 0;
  for (let i = 0; i <= 365; i++) {
    const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
    const e = entryMap.get(d);
    if (i === 0 && !e) continue; // today not logged yet — still running
    if (!e || e.status === 'relapse') break;
    current++;
  }

  // Best streak
  let best = 0, run = 0, prevDate: string | null = null;
  for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
    if (e.status === 'relapse') { run = 0; prevDate = null; continue; }
    if (prevDate && differenceInDays(parseISO(e.date), parseISO(prevDate)) === 1) run++;
    else run = 1;
    if (run > best) best = run;
    prevDate = e.date;
  }

  // Last-30 metrics
  const cutoff = format(subDays(new Date(), 29), 'yyyy-MM-dd');
  const last30 = entries.filter((e) => e.date >= cutoff);
  const successes = last30.filter((e) => e.status === 'success');
  const successRate = last30.length > 0 ? Math.round((successes.length / last30.length) * 100) : null;
  const avgUrge = successes.length > 0
    ? (successes.reduce((s, e) => s + e.urge, 0) / successes.length).toFixed(1)
    : null;

  return { current, best, successRate, avgUrge };
};

const getMilestone = (streak: number) => {
  if (streak >= 90) return { days: 90, text: 'Restored. Dopamine baseline reset. Authentic confidence unlocked.' };
  if (streak >= 60) return { days: 60, text: 'Brain rewiring complete. The fog is gone permanently.' };
  if (streak >= 30) return { days: 30, text: 'True transformation begins here. You\'ve proven you can do this.' };
  if (streak >= 14) return { days: 14, text: 'Mental clarity returning. Social presence sharpening.' };
  if (streak >= 7)  return { days: 7,  text: 'Dopamine receptors starting to heal. Energy surge incoming.' };
  return null;
};

const getMotivation = (streak: number) => {
  if (streak === 0) return 'Log your first day. Every journey starts somewhere.';
  if (streak === 1) return 'Day 1 done. The hardest step is always the first.';
  if (streak < 7)  return `${streak} days strong. Keep the chain unbroken.`;
  if (streak < 14) return `${streak} days. One week in — the hardest part is behind you.`;
  if (streak < 30) return `${streak} days of clarity. You\'re building a new identity.`;
  return `${streak} days. You are proof it\'s possible.`;
};

export const DopamineTracker: React.FC = () => {
  const [entries, setEntries] = useState<DopamineEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  });

  const [showCheckin, setShowCheckin] = useState(false);
  const [showSOS, setShowSOS] = useState(false);
  const [selectedDay, setSelectedDay] = useState<{ date: string; entry: DopamineEntry } | null>(null);
  const [checkinStep, setCheckinStep] = useState<'status' | 'details'>('status');
  const [pendingStatus, setPendingStatus] = useState<'success' | 'relapse' | null>(null);
  const [pendingUrge, setPendingUrge] = useState(2);
  const [pendingNote, setPendingNote] = useState('');

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayEntry = entries.find((e) => e.date === today);

  const saveEntries = useCallback((updated: DopamineEntry[]) => {
    setEntries(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, []);

  const submitCheckin = () => {
    if (!pendingStatus) return;
    const updated = entries.filter((e) => e.date !== today);
    updated.push({ date: today, status: pendingStatus, urge: pendingUrge, note: pendingNote.trim() || undefined });
    saveEntries(updated);
    setShowCheckin(false);
    setCheckinStep('status');
    setPendingStatus(null);
    setPendingUrge(2);
    setPendingNote('');
  };

  const stats = useMemo(() => computeStats(entries), [entries]);
  const milestone = getMilestone(stats.current);
  const motivation = getMotivation(stats.current);

  // Build 5-week GitHub-style grid (35 cells, Mon-start, last 35 days)
  const gridCells = useMemo(() => {
    // Align to last full week ending today
    const todayDate = new Date();
    // Start from 34 days ago
    const start = subDays(todayDate, 34);
    // Pad to Monday
    const gridStart = startOfWeek(start, { weekStartsOn: 1 });
    const gridEnd   = endOfWeek(todayDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd }).map((day) => {
      const d = format(day, 'yyyy-MM-dd');
      const entry = entries.find((e) => e.date === d);
      const isTod = d === today;
      const isFuture = d > today;
      const isInRange = d >= format(subDays(todayDate, 34), 'yyyy-MM-dd') && d <= today;
      return { date: d, entry, isToday: isTod, isFuture, isInRange };
    });
  }, [entries, today]);

  const weeks = useMemo(() => {
    const w: typeof gridCells[] = [];
    for (let i = 0; i < gridCells.length; i += 7) {
      w.push(gridCells.slice(i, i + 7));
    }
    return w;
  }, [gridCells]);

  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const openCheckin = () => {
    if (todayEntry) {
      // Pre-fill with existing
      setPendingStatus(todayEntry.status);
      setPendingUrge(todayEntry.urge);
      setPendingNote(todayEntry.note || '');
      setCheckinStep('details');
    } else {
      setCheckinStep('status');
    }
    setShowCheckin(true);
  };

  return (
    <div className="space-y-4">

      {/* ── Streak hero card ── */}
      <div
        className="rounded-2xl p-5 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0f1a00 0%, #111419 60%)', border: '1px solid rgba(200,255,0,0.12)' }}
      >
        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 20% 50%, rgba(200,255,0,0.06) 0%, transparent 60%)' }} />

        <div className="flex items-start justify-between mb-5 relative">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1" style={{ color: 'rgba(200,255,0,0.5)' }}>Dopamine</p>
            <div className="flex items-baseline gap-2">
              <span className="text-[48px] font-black leading-none tabular-nums" style={{ color: '#C8FF00' }}>{stats.current}</span>
              <span className="text-[16px] font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>day streak</span>
            </div>
            {milestone && (
              <div
                className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
                style={{ background: 'rgba(200,255,0,0.15)', border: '1px solid rgba(200,255,0,0.3)', color: '#C8FF00' }}
              >
                <Flame className="w-3 h-3" />
                {milestone.days}-day milestone!
              </div>
            )}
          </div>

          {/* SOS button */}
          <button
            onClick={() => setShowSOS(true)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-[12px] font-bold transition-all active:scale-95"
            style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171' }}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            SOS
          </button>
        </div>

        {/* Motivation */}
        <p className="text-[13px] leading-relaxed mb-5 relative" style={{ color: 'rgba(255,255,255,0.55)' }}>
          {milestone ? milestone.text : motivation}
        </p>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {[
            { label: 'Best', value: `${stats.best}d`, sub: 'streak' },
            { label: 'Rate', value: stats.successRate != null ? `${stats.successRate}%` : '—', sub: '30-day' },
            { label: 'Avg Urge', value: stats.avgUrge ?? '—', sub: '/ 5 scale' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{s.label}</p>
              <p className="text-[20px] font-black tabular-nums leading-none" style={{ color: 'rgba(255,255,255,0.9)' }}>{s.value}</p>
              <p className="text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Daily check-in button */}
        <button
          onClick={openCheckin}
          className="w-full py-3.5 rounded-xl text-[14px] font-bold text-black flex items-center justify-center gap-2 active:scale-[0.98] transition-all relative"
          style={{ background: '#C8FF00' }}
        >
          {todayEntry ? (
            todayEntry.status === 'success'
              ? <><CheckCircle2 className="w-4 h-4" /> Today: Success — Edit</>
              : <><XCircle className="w-4 h-4" /> Today: Relapse — Edit</>
          ) : (
            <><Target className="w-4 h-4" /> Log Today</>
          )}
        </button>
      </div>

      {/* ── Heatmap ── */}
      <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(160deg,#16191F 0%,#111419 100%)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'rgba(255,255,255,0.35)' }}>35-Day Activity</p>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            <span>Less</span>
            {[EMPTY_COLOR, SUCCESS_COLORS[5], SUCCESS_COLORS[3], SUCCESS_COLORS[2], SUCCESS_COLORS[1]].map((c, i) => (
              <div key={i} className="w-3 h-3 rounded-[3px]" style={{ background: c, border: i === 0 ? '1px solid rgba(255,255,255,0.1)' : 'none' }} />
            ))}
            <div className="w-3 h-3 rounded-[3px]" style={{ background: RELAPSE_COLOR }} />
            <span>Relapse</span>
          </div>
        </div>

        {/* Grid */}
        <div className="flex gap-1.5">
          {/* Day labels */}
          <div className="flex flex-col gap-1.5 pt-0">
            {DAY_LABELS.map((d, i) => (
              <div key={i} className="h-[28px] flex items-center text-[9px] font-semibold w-3" style={{ color: 'rgba(255,255,255,0.25)' }}>
                {i % 2 === 0 ? d : ''}
              </div>
            ))}
          </div>

          {/* Weeks */}
          <div className="flex gap-1.5 flex-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1.5 flex-1">
                {week.map((cell, di) => {
                  const bg = cell.isFuture || !cell.isInRange
                    ? 'transparent'
                    : getEntryColor(cell.entry);
                  const borderStyle = cell.isToday
                    ? `2px solid ${TODAY_BORDER}`
                    : cell.isFuture || !cell.isInRange
                    ? 'none'
                    : '1px solid rgba(255,255,255,0.04)';

                  const hasEntry = !!cell.entry && !cell.isFuture && cell.isInRange;

                  return (
                    <div
                      key={di}
                      onClick={() => hasEntry && setSelectedDay({ date: cell.date, entry: cell.entry! })}
                      className="rounded-[5px] transition-all"
                      style={{
                        height: 28,
                        background: bg,
                        border: borderStyle,
                        opacity: cell.isFuture ? 0 : 1,
                        cursor: hasEntry ? 'pointer' : 'default',
                        transform: 'scale(1)',
                      }}
                      onMouseEnter={(e) => { if (hasEntry) (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.15)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)'; }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend date range */}
        <div className="flex justify-between mt-3 text-[9px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
          <span>{format(subDays(new Date(), 34), 'MMM d')}</span>
          <span>Today {format(new Date(), 'MMM d')}</span>
        </div>
      </div>

      {/* ── Recent log ── */}
      {entries.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(160deg,#16191F 0%,#111419 100%)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="px-5 pt-4 pb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'rgba(255,255,255,0.35)' }}>Recent Log</p>
          </div>
          {[...entries]
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 7)
            .map((e, i) => (
              <div
                key={e.date}
                className="flex items-center gap-3 px-5 py-3"
                style={{ borderTop: i === 0 ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(255,255,255,0.04)' }}
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: e.status === 'success' ? (SUCCESS_COLORS[e.urge] ?? '#C8FF00') : RELAPSE_COLOR }}
                />
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {format(parseISO(e.date), 'EEE, MMM d')}
                  </span>
                  {e.note && (
                    <p className="text-[11px] truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{e.note}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                    style={e.status === 'success'
                      ? { background: 'rgba(200,255,0,0.1)', color: '#C8FF00', border: '1px solid rgba(200,255,0,0.2)' }
                      : { background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}
                  >
                    {e.status === 'success' ? '✓ Strong' : '✗ Relapse'}
                  </span>
                  <span className="text-[11px] tabular-nums" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    U{e.urge}
                  </span>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* ── Day detail popup ── */}
      <AnimatePresence>
        {selectedDay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center px-5"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
            onClick={() => setSelectedDay(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              className="w-full max-w-[340px] rounded-2xl p-5"
              style={{ background: '#111419', border: '1px solid rgba(255,255,255,0.1)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] mb-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {format(parseISO(selectedDay.date), 'EEEE')}
                  </p>
                  <p className="text-[18px] font-bold" style={{ color: '#fff' }}>
                    {format(parseISO(selectedDay.date), 'MMM d, yyyy')}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedDay(null)}
                  className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(255,255,255,0.08)' }}
                >
                  <X className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.5)' }} />
                </button>
              </div>

              {/* Status badge */}
              <div
                className="flex items-center gap-2.5 rounded-xl px-4 py-3 mb-4"
                style={selectedDay.entry.status === 'success'
                  ? { background: 'rgba(200,255,0,0.08)', border: '1px solid rgba(200,255,0,0.2)' }
                  : { background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}
              >
                {selectedDay.entry.status === 'success'
                  ? <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: '#C8FF00' }} />
                  : <XCircle className="w-5 h-5 shrink-0" style={{ color: '#f87171' }} />}
                <span className="text-[14px] font-bold" style={{ color: selectedDay.entry.status === 'success' ? '#C8FF00' : '#f87171' }}>
                  {selectedDay.entry.status === 'success' ? 'Stayed Strong' : 'Relapsed'}
                </span>
              </div>

              {/* Urge level (only for successes) */}
              {selectedDay.entry.status === 'success' && (
                <div className="mb-4">
                  <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>Urge Level</p>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((u) => (
                      <div
                        key={u}
                        className="flex-1 h-7 rounded-lg flex items-center justify-center text-[12px] font-bold"
                        style={u <= selectedDay.entry.urge
                          ? { background: SUCCESS_COLORS[u] ?? '#C8FF00', color: '#000' }
                          : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.2)' }}
                      >
                        {u}
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] mt-1.5 text-center" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {URGE_LABELS[selectedDay.entry.urge]} urge
                  </p>
                </div>
              )}

              {/* Note */}
              {selectedDay.entry.note ? (
                <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Note</p>
                  <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    {selectedDay.entry.note}
                  </p>
                </div>
              ) : (
                <p className="text-[12px] text-center" style={{ color: 'rgba(255,255,255,0.2)' }}>No note added</p>
              )}

              <button
                onClick={() => setSelectedDay(null)}
                className="w-full mt-5 py-3 rounded-xl text-[13px] font-semibold active:scale-[0.98] transition-all"
                style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)' }}
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Check-in modal ── */}
      <AnimatePresence>
        {showCheckin && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
          >
            <motion.div
              initial={{ y: 80 }}
              animate={{ y: 0 }}
              exit={{ y: 80 }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="w-full max-w-[480px] rounded-t-[24px] pb-[max(28px,env(safe-area-inset-bottom))]"
              style={{ background: '#111419', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <div className="w-9 h-1 rounded-full mx-auto mt-4 mb-5 opacity-30" style={{ background: '#fff' }} />
              <div className="flex items-center justify-between px-5 mb-5">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] mb-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Daily Check-in</p>
                  <p className="text-[17px] font-bold" style={{ color: '#fff' }}>{format(new Date(), 'EEEE, MMM d')}</p>
                </div>
                <button
                  onClick={() => setShowCheckin(false)}
                  className="h-8 w-8 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.08)' }}
                >
                  <X className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.5)' }} />
                </button>
              </div>

              {checkinStep === 'status' ? (
                <div className="px-5 space-y-3">
                  <p className="text-[13px] font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>How was today?</p>
                  <button
                    onClick={() => { setPendingStatus('success'); setCheckinStep('details'); }}
                    className="w-full py-4 rounded-2xl text-[16px] font-bold flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
                    style={{ background: 'rgba(200,255,0,0.12)', border: '2px solid rgba(200,255,0,0.3)', color: '#C8FF00' }}
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    I stayed strong
                  </button>
                  <button
                    onClick={() => { setPendingStatus('relapse'); setPendingUrge(5); setCheckinStep('details'); }}
                    className="w-full py-4 rounded-2xl text-[16px] font-bold flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
                    style={{ background: 'rgba(248,113,113,0.1)', border: '2px solid rgba(248,113,113,0.25)', color: '#f87171' }}
                  >
                    <XCircle className="w-5 h-5" />
                    I relapsed
                  </button>
                </div>
              ) : (
                <div className="px-5 space-y-5">
                  {/* Status indicator */}
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-xl"
                    style={pendingStatus === 'success'
                      ? { background: 'rgba(200,255,0,0.08)', border: '1px solid rgba(200,255,0,0.2)' }
                      : { background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}
                  >
                    {pendingStatus === 'success'
                      ? <CheckCircle2 className="w-4 h-4" style={{ color: '#C8FF00' }} />
                      : <XCircle className="w-4 h-4" style={{ color: '#f87171' }} />}
                    <span className="text-[13px] font-semibold" style={{ color: pendingStatus === 'success' ? '#C8FF00' : '#f87171' }}>
                      {pendingStatus === 'success' ? 'Stayed strong today' : 'Relapse logged'}
                    </span>
                    <button
                      onClick={() => setCheckinStep('status')}
                      className="ml-auto text-[11px]"
                      style={{ color: 'rgba(255,255,255,0.35)' }}
                    >
                      Change
                    </button>
                  </div>

                  {/* Urge level */}
                  {pendingStatus === 'success' && (
                    <div>
                      <p className="text-[12px] font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        Urge level today — <span style={{ color: '#C8FF00' }}>{URGE_LABELS[pendingUrge]}</span>
                      </p>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((u) => (
                          <button
                            key={u}
                            onClick={() => setPendingUrge(u)}
                            className="flex-1 py-3 rounded-xl text-[14px] font-black transition-all active:scale-95"
                            style={pendingUrge === u
                              ? { background: SUCCESS_COLORS[u], color: '#000', border: 'none' }
                              : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}
                          >
                            {u}
                          </button>
                        ))}
                      </div>
                      <div className="flex justify-between mt-1 text-[9px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                        <span>Easy</span><span>Hard</span>
                      </div>
                    </div>
                  )}

                  {/* Note */}
                  <div>
                    <p className="text-[12px] font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>Note (optional)</p>
                    <textarea
                      value={pendingNote}
                      onChange={(e) => setPendingNote(e.target.value)}
                      placeholder="What helped? What triggered it? Any reflection..."
                      rows={2}
                      className="w-full rounded-xl px-3 py-2.5 text-[13px] resize-none focus:outline-none"
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.8)',
                        caretColor: '#C8FF00',
                      }}
                    />
                  </div>

                  <button
                    onClick={submitCheckin}
                    className="w-full py-3.5 rounded-xl text-[14px] font-bold text-black active:scale-[0.98] transition-all"
                    style={{ background: pendingStatus === 'success' ? '#C8FF00' : '#f87171' }}
                  >
                    Save Entry
                  </button>
                </div>
              )}

              <div className="h-4" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── SOS Modal ── */}
      <AnimatePresence>
        {showSOS && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}
          >
            <motion.div
              initial={{ y: 80 }}
              animate={{ y: 0 }}
              exit={{ y: 80 }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="w-full max-w-[480px] rounded-t-[24px] pb-[max(28px,env(safe-area-inset-bottom))]"
              style={{ background: '#0f1118', border: '1px solid rgba(248,113,113,0.2)' }}
            >
              <div className="w-9 h-1 rounded-full mx-auto mt-4 mb-4 opacity-30" style={{ background: '#f87171' }} />

              <div className="px-5 mb-5">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5" style={{ color: '#f87171' }} />
                    <p className="text-[16px] font-bold" style={{ color: '#fff' }}>Emergency Support</p>
                  </div>
                  <button
                    onClick={() => setShowSOS(false)}
                    className="h-7 w-7 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.08)' }}
                  >
                    <X className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.5)' }} />
                  </button>
                </div>
                <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Urges pass. You are stronger than this moment.</p>
              </div>

              {/* Current streak reminder */}
              <div
                className="mx-5 mb-5 rounded-xl p-4 flex items-center gap-3"
                style={{ background: 'rgba(200,255,0,0.06)', border: '1px solid rgba(200,255,0,0.15)' }}
              >
                <Flame className="w-6 h-6 shrink-0" style={{ color: '#C8FF00' }} />
                <div>
                  <p className="text-[11px] uppercase tracking-wider mb-0.5" style={{ color: 'rgba(200,255,0,0.5)' }}>Your streak</p>
                  <p className="text-[22px] font-black leading-none" style={{ color: '#C8FF00' }}>
                    {stats.current} day{stats.current !== 1 ? 's' : ''}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    Don't lose what you've built.
                  </p>
                </div>
              </div>

              {/* Tips */}
              <div className="px-5 space-y-2 mb-5">
                {SOS_TIPS.map(({ icon: Icon, label, desc }) => (
                  <div
                    key={label}
                    className="rounded-xl p-3.5 flex items-start gap-3"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: 'rgba(255,255,255,0.07)' }}
                    >
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
                  onClick={() => setShowSOS(false)}
                  className="w-full py-3.5 rounded-xl text-[14px] font-bold active:scale-[0.98] transition-all"
                  style={{ background: 'rgba(200,255,0,0.1)', border: '1px solid rgba(200,255,0,0.2)', color: '#C8FF00' }}
                >
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
