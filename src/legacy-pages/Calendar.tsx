import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
  isToday as dateFnsIsToday,
} from 'date-fns';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Dumbbell,
  LayoutGrid,
  Plus,
  Trash2,
  Zap,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { deleteWorkout, getWorkouts } from '../lib/supabaseData';
import { convertWeight, isWeightUnit, type WeightUnit } from '../lib/units';
import { muscleColor } from '../lib/muscleColors';

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode = 'week' | 'month';

const MUSCLE_FILTERS = ['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio'] as const;

// ── Pure helpers ──────────────────────────────────────────────────────────────

const parseStoredDate = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value !== 'string') return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const parsed = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const fb = new Date(value);
  if (Number.isNaN(fb.getTime())) return null;
  return new Date(fb.getFullYear(), fb.getMonth(), fb.getDate());
};

const getExerciseCount = (workout: any): number => {
  const fromRows = new Set((workout.exercises || []).map((e: any) => e.name).filter(Boolean)).size;
  if (fromRows > 0) return fromRows;
  if (Array.isArray(workout.muscle_groups) && workout.muscle_groups.length > 0) return 1;
  if (Number(workout.duration_minutes || 0) > 0) return 1;
  return 0;
};

const getVolume = (workout: any, unit: WeightUnit = 'kg'): number =>
  (workout.exercises || []).reduce(
    (sum: number, ex: any) =>
      sum +
      (ex.unit && !isWeightUnit(ex.unit)
        ? 0
        : convertWeight(Number(ex.weight || 0), isWeightUnit(ex.unit) ? ex.unit : unit, unit, 0.1) *
          Number(ex.reps || 0) *
          Number(ex.sets || 0)),
    0,
  );

const getAccent = (workout: any): string => muscleColor((workout.muscle_groups || [])[0]);

const getExerciseNames = (workout: any): string[] =>
  Array.from(new Set((workout.exercises || []).map((e: any) => e.name as string).filter(Boolean)));

const isGenericTitle = (title?: string | null) => {
  if (!title) return true;
  const t = title.trim().toLowerCase();
  return ['workout', 'morning workout', 'afternoon workout', 'evening workout'].includes(t);
};

const getDisplayTitle = (workout: any): string => {
  const names = getExerciseNames(workout);
  if (names.length > 0 && isGenericTitle(workout.title)) return names[0];
  return workout.title || names[0] || 'Workout';
};

const matchesFilter = (workout: any, filter: string | null): boolean => {
  if (!filter || filter === 'All') return true;
  const g = Array.isArray(workout.muscle_groups) ? workout.muscle_groups : [];
  if (filter === 'Arms') return g.includes('Arms') || g.includes('Biceps') || g.includes('Triceps');
  return g.includes(filter);
};

const getDaySummary = (workouts: any[], unit: WeightUnit) => ({
  count: workouts.length,
  duration: workouts.reduce((s, w) => s + Number(w.duration_minutes || 0), 0),
  exercises: workouts.reduce((s, w) => s + getExerciseCount(w), 0),
  volume: workouts.reduce((s, w) => s + getVolume(w, unit), 0),
});

const getWeekDays = (anchor: Date): Date[] =>
  eachDayOfInterval({ start: startOfWeek(anchor, { weekStartsOn: 1 }), end: endOfWeek(anchor, { weekStartsOn: 1 }) });

// ── Sub-components ────────────────────────────────────────────────────────────

const ExerciseChip: React.FC<{ name: string; color: string }> = ({ name, color }) => (
  <div
    className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 shrink-0"
    style={{
      background: `color-mix(in srgb, ${color} 18%, var(--bg-elevated))`,
      borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
      color,
    }}
  >
    {name.charAt(0).toUpperCase()}
  </div>
);

// ── Main ──────────────────────────────────────────────────────────────────────

export const Calendar: React.FC = () => {
  const { user, profile } = useAuth();
  const unit = (profile?.unit_preference || 'kg') as WeightUnit;
  const navigate = useNavigate();

  const today = useMemo(() => new Date(), []);
  const [anchor, setAnchor] = useState<Date>(today);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
    getWorkouts(user.id, {
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(end, 'yyyy-MM-dd'),
      includeExercises: true,
    })
      .then((data) => setWorkouts(data || []))
      .catch(() => setWorkouts([]))
      .finally(() => setLoading(false));
  }, [user, anchor]);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const weekDays = useMemo(() => getWeekDays(anchor), [anchor]);

  const monthDays = useMemo(() =>
    eachDayOfInterval({
      start: startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 }),
    }),
  [anchor]);

  const getForDay = (day: Date) =>
    workouts.filter((w) => {
      const d = parseStoredDate(w.date);
      return d !== null && isSameDay(d, day) && matchesFilter(w, activeFilter);
    });

  const selectedWorkouts = useMemo(() => getForDay(selectedDate), [selectedDate, workouts, activeFilter]);
  const selectedSummary = useMemo(() => getDaySummary(selectedWorkouts, unit), [selectedWorkouts, unit]);

  // Count new workouts this week
  const weekNewCount = useMemo(() =>
    weekDays.reduce((sum, d) => sum + getForDay(d).length, 0),
  [weekDays, workouts, activeFilter]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const prevPeriod = () => {
    if (viewMode === 'week') {
      setAnchor((p) => subWeeks(p, 1));
      setSelectedDate((p) => subWeeks(p, 1));
    } else {
      setAnchor((p) => subMonths(p, 1));
    }
  };

  const nextPeriod = () => {
    if (viewMode === 'week') {
      setAnchor((p) => addWeeks(p, 1));
      setSelectedDate((p) => addWeeks(p, 1));
    } else {
      setAnchor((p) => addMonths(p, 1));
    }
  };

  const goToToday = () => {
    setAnchor(today);
    setSelectedDate(today);
  };

  const selectDay = (day: Date) => {
    setSelectedDate(day);
    if (!isSameMonth(day, anchor)) setAnchor(day);
  };

  const handleLongPressStart = (day: Date, e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    longPressTimer.current = setTimeout(() => {
      try { navigator.vibrate?.(45); } catch { /* ignore */ }
      navigate(`/log?date=${format(day, 'yyyy-MM-dd')}`);
    }, 480);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  useEffect(() => () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); }, []);

  const handleDelete = async (id: string, title: string) => {
    if (!user || !window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await deleteWorkout(user.id, id);
      setWorkouts((p) => p.filter((w) => w.id !== id));
      toast.success('Workout deleted');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete');
    }
  };

  // ── Renders ──────────────────────────────────────────────────────────────────

  const renderWorkoutCard = (workout: any) => {
    const accent = getAccent(workout);
    const names = getExerciseNames(workout);
    const title = getDisplayTitle(workout);
    const exCount = getExerciseCount(workout);
    const dur = Number(workout.duration_minutes || 0);
    const mainMuscle = (workout.muscle_groups || [])[0];
    const chipNames = names.slice(0, 4);
    const extra = names.length - chipNames.length;

    return (
      <motion.div
        key={workout.id}
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className="relative overflow-hidden rounded-2xl"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
      >
        {/* Left accent bar */}
        <div className="absolute inset-y-0 left-0 w-[3px] rounded-l-2xl" style={{ backgroundColor: accent }} />

        <div className="pl-4 pr-3 py-3.5">
          {/* Title row */}
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-bold leading-snug truncate" style={{ color: 'var(--text-primary)' }}>
                {title}
              </p>
              {mainMuscle && (
                <p className="text-[11px] font-medium mt-0.5" style={{ color: accent }}>
                  {mainMuscle}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
              <button
                onClick={() => handleDelete(workout.id, workout.title)}
                className="h-7 w-7 flex items-center justify-center rounded-lg"
                style={{ background: 'rgba(255,59,48,0.08)', color: 'rgba(255,80,65,0.85)' }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <Link
                to="/timeline"
                className="h-7 inline-flex items-center px-3 rounded-lg text-[11px] font-semibold"
                style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(200,255,0,0.15)' }}
              >
                Details
              </Link>
            </div>
          </div>

          {/* Bottom row: time + exercise chips */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
              <Clock3 className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} />
              <span>{dur > 0 ? `${dur} min` : `${exCount} exercise${exCount !== 1 ? 's' : ''}`}</span>
            </div>

            <div className="flex items-center">
              {/* Exercise initial chips — overlapping like avatars */}
              <div className="flex -space-x-2">
                {chipNames.map((name) => (
                  <ExerciseChip key={name} name={name} color={accent} />
                ))}
              </div>
              {extra > 0 && (
                <span
                  className="ml-1.5 text-[11px] font-semibold"
                  style={{ color: 'var(--text-muted)' }}
                >
                  +{extra}
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  const renderWeekStrip = () => (
    <div className="flex items-center gap-1 justify-between px-4 pb-3 pt-1">
      {weekDays.map((day) => {
        const isSelected = isSameDay(day, selectedDate);
        const isTodayDay = dateFnsIsToday(day);
        const dayWorkouts = getForDay(day);
        const hasWorkout = dayWorkouts.length > 0;
        return (
          <button
            key={day.toISOString()}
            onClick={() => selectDay(day)}
            onPointerDown={(e) => handleLongPressStart(day, e)}
            onPointerUp={handleLongPressEnd}
            onPointerLeave={handleLongPressEnd}
            className="flex flex-col items-center gap-1 flex-1 py-1 rounded-xl transition-all active:scale-95"
          >
            <span
              className="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: isSelected ? 'var(--accent)' : 'var(--text-muted)' }}
            >
              {format(day, 'EEEEE')}
            </span>
            <div
              className="h-9 w-9 flex items-center justify-center rounded-full text-[15px] font-bold transition-all"
              style={
                isTodayDay
                  ? { background: 'var(--accent)', color: '#000' }
                  : isSelected
                  ? { background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1.5px solid var(--accent)' }
                  : { color: 'var(--text-secondary)' }
              }
            >
              {format(day, 'd')}
            </div>
            {/* Workout dot */}
            <div className="h-1.5 flex items-center justify-center gap-0.5">
              {hasWorkout
                ? dayWorkouts.slice(0, 3).map((w) => (
                    <div
                      key={w.id}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: isSelected ? 'var(--accent)' : getAccent(w) }}
                    />
                  ))
                : <div className="h-1.5 w-1.5 rounded-full opacity-0" />}
            </div>
          </button>
        );
      })}
    </div>
  );

  const renderMonthGrid = () => {
    const days = monthDays;
    return (
      <div className="px-3 pb-3">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-1">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <div key={i} className="py-1 text-center text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const isSelected = isSameDay(day, selectedDate);
            const isTodayDay = dateFnsIsToday(day);
            const outside = !isSameMonth(day, anchor);
            const dayWorkouts = getForDay(day);
            const hasWorkout = dayWorkouts.length > 0;
            return (
              <button
                key={day.toISOString()}
                onClick={() => selectDay(day)}
                onPointerDown={(e) => handleLongPressStart(day, e)}
                onPointerUp={handleLongPressEnd}
                onPointerLeave={handleLongPressEnd}
                className={`flex flex-col items-center py-1.5 rounded-xl transition-all active:scale-95 ${outside ? 'opacity-30' : ''}`}
                style={isSelected ? { background: 'var(--bg-elevated)', border: '1px solid var(--accent)' } : undefined}
              >
                <div
                  className="h-8 w-8 flex items-center justify-center rounded-full text-[13px] font-semibold"
                  style={
                    isTodayDay
                      ? { background: 'var(--accent)', color: '#000' }
                      : { color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }
                  }
                >
                  {format(day, 'd')}
                </div>
                <div className="h-1 flex items-center gap-0.5 mt-0.5">
                  {hasWorkout && dayWorkouts.slice(0, 2).map((w) => (
                    <div key={w.id} className="h-1 w-1 rounded-full" style={{ backgroundColor: getAccent(w) }} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Day label for section header
  const dayLabel = isSameDay(selectedDate, today)
    ? 'Today'
    : dateFnsIsToday(addDays(selectedDate, 1))
    ? 'Yesterday'
    : format(selectedDate, 'EEEE, MMM d');

  return (
    <div className="min-h-screen pb-28" style={{ background: 'var(--bg-base)' }}>

      {/* ── Top header ────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-20 px-5 pt-3 pb-0"
        style={{
          background: 'var(--bg-base)',
          borderBottom: '1px solid transparent',
        }}
      >
        {/* Month + controls row */}
        <div className="flex items-center justify-between mb-3">
          <button
            className="flex items-center gap-1.5"
            onClick={() => setShowMonthPicker((p) => !p)}
          >
            <span className="text-[26px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {format(anchor, 'MMM')}
            </span>
            <span className="text-[18px] font-medium" style={{ color: 'var(--text-muted)' }}>
              {format(anchor, 'yyyy')}
            </span>
            <ChevronDown
              className="w-4 h-4 transition-transform"
              style={{ color: 'var(--text-muted)', transform: showMonthPicker ? 'rotate(180deg)' : 'none' }}
            />
          </button>

          <div className="flex items-center gap-2">
            {/* Nav arrows */}
            <button
              onClick={prevPeriod}
              className="h-8 w-8 flex items-center justify-center rounded-full transition-colors"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={nextPeriod}
              className="h-8 w-8 flex items-center justify-center rounded-full transition-colors"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* View toggle */}
            <button
              onClick={() => setViewMode((v) => v === 'week' ? 'month' : 'week')}
              className="h-8 w-8 flex items-center justify-center rounded-full transition-colors"
              style={{
                background: viewMode === 'month' ? 'var(--accent)' : 'var(--bg-elevated)',
                color: viewMode === 'month' ? '#000' : 'var(--text-secondary)',
              }}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>

            {/* Log workout */}
            <Link
              to={`/log?date=${format(selectedDate, 'yyyy-MM-dd')}`}
              className="h-8 w-8 flex items-center justify-center rounded-full transition-colors"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              <Plus className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Calendar strip */}
        {viewMode === 'week' ? renderWeekStrip() : renderMonthGrid()}
      </div>

      {/* ── Body ──────────────────────────────────────────────── */}
      <div className="px-4 space-y-3 pt-3">


        {/* ── Event list card ── */}
        <div
          className="rounded-3xl overflow-hidden"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          {/* Tab header: All | filter pills */}
          <div className="px-4 pt-3 pb-2 flex items-center gap-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <div
              className="flex gap-1 rounded-xl p-0.5 flex-shrink-0"
              style={{ background: 'var(--bg-elevated)' }}
            >
              <button
                onClick={() => setActiveFilter(null)}
                className="px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all"
                style={
                  activeFilter === null
                    ? { background: 'var(--bg-base)', color: 'var(--text-primary)' }
                    : { color: 'var(--text-secondary)' }
                }
              >
                All
              </button>
              {weekNewCount > 0 && (
                <button
                  disabled
                  className="px-3 py-1.5 rounded-lg text-[12px] font-bold relative"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  This week
                  <span
                    className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full"
                    style={{ background: '#f87171' }}
                  />
                </button>
              )}
            </div>

            {/* Muscle filter chips */}
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar flex-1">
              {MUSCLE_FILTERS.slice(1).map((m) => {
                const active = activeFilter === m;
                return (
                  <button
                    key={m}
                    onClick={() => setActiveFilter(active ? null : m)}
                    className="flex-shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all"
                    style={
                      active
                        ? { background: muscleColor(m), color: '#000', border: `1px solid ${muscleColor(m)}` }
                        : { background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)' }
                    }
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: active ? '#000' : muscleColor(m) }}
                    />
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Workout list */}
          <div className="px-4 pt-3 pb-4 space-y-3">
            {/* Section header */}
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                {dayLabel}
              </span>
              {selectedWorkouts.length > 0 && (
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                >
                  {selectedWorkouts.length} workout{selectedWorkouts.length !== 1 ? 's' : ''}
                  <ChevronDown className="w-3 h-3" />
                </div>
              )}
            </div>

            {/* Stats strip */}
            {selectedWorkouts.length > 0 && (
              <div
                className="flex items-center rounded-xl overflow-hidden"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
              >
                {[
                  { label: 'Min', value: selectedSummary.duration },
                  { label: 'Exercises', value: selectedSummary.exercises },
                  { label: 'Volume', value: `${Math.round(selectedSummary.volume).toLocaleString()} ${unit}` },
                ].map((s, i) => (
                  <div
                    key={s.label}
                    className="flex-1 flex flex-col items-center py-2 px-1"
                    style={i > 0 ? { borderLeft: '1px solid var(--border)' } : undefined}
                  >
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      {s.label}
                    </span>
                    <span className="text-[15px] font-bold tabular-nums mt-0.5" style={{ color: 'var(--text-primary)' }}>
                      {s.value}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Workout cards */}
            {loading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-[88px] rounded-2xl animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
                ))}
              </div>
            ) : selectedWorkouts.length > 0 ? (
              <AnimatePresence initial={false}>
                <div className="space-y-3">
                  {selectedWorkouts.map((w) => renderWorkoutCard(w))}
                </div>
              </AnimatePresence>
            ) : (
              <div
                className="rounded-2xl border border-dashed px-5 py-10 flex flex-col items-center gap-3 text-center"
                style={{ borderColor: 'rgba(200,255,0,0.15)', background: 'rgba(200,255,0,0.03)' }}
              >
                <div
                  className="h-12 w-12 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(200,255,0,0.08)', border: '1px solid rgba(200,255,0,0.15)' }}
                >
                  <Dumbbell className="h-6 w-6" style={{ color: 'var(--accent)' }} />
                </div>
                <div>
                  <p className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>
                    {isSameDay(selectedDate, today) ? 'Nothing logged today' : 'Rest day'}
                  </p>
                  <p className="text-[12px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {isSameDay(selectedDate, today)
                      ? 'Start a session and it will appear here.'
                      : 'No workouts were logged on this day.'}
                  </p>
                </div>
                {isSameDay(selectedDate, today) && (
                  <Link
                    to={`/log?date=${format(selectedDate, 'yyyy-MM-dd')}`}
                    className="mt-1 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-bold text-black"
                    style={{ background: 'var(--accent)' }}
                  >
                    <Zap className="h-4 w-4" />
                    Log Today&apos;s Workout
                  </Link>
                )}
              </div>
            )}

            {/* Go to today if not viewing today */}
            {!isSameDay(selectedDate, today) && (
              <button
                onClick={goToToday}
                className="w-full py-3 rounded-xl text-[13px] font-semibold transition-colors"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
              >
                Jump to Today
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
