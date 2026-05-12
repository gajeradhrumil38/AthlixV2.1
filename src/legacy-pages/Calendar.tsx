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
  Plus,
  Trash2,
  Zap,
  CalendarDays,
  LayoutGrid,
  Sun,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { deleteWorkout, getWorkouts } from '../lib/supabaseData';
import { convertWeight, isWeightUnit, type WeightUnit } from '../lib/units';
import { muscleColor } from '../lib/muscleColors';

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode = 'today' | 'week' | 'month';

const MUSCLE_FILTERS = ['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio'] as const;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Helpers ───────────────────────────────────────────────────────────────────

const parseStoredDate = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  if (typeof value !== 'string') return null;
  // date-only string — parse as local date to avoid UTC shift
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
};

const getExerciseCount = (w: any) =>
  new Set((w.exercises || []).map((e: any) => e.name).filter(Boolean)).size ||
  (Array.isArray(w.muscle_groups) && w.muscle_groups.length > 0 ? 1 : 0) ||
  (Number(w.duration_minutes) > 0 ? 1 : 0);

const getVolume = (w: any, unit: WeightUnit): number =>
  (w.exercises || []).reduce((s: number, ex: any) => {
    if (ex.unit && !isWeightUnit(ex.unit)) return s;
    return s + convertWeight(
      Number(ex.weight || 0),
      isWeightUnit(ex.unit) ? ex.unit : unit,
      unit, 0.1,
    ) * Number(ex.reps || 0) * Number(ex.sets || 0);
  }, 0);

const getAccent = (w: any) => muscleColor((w.muscle_groups || [])[0]);

const getExerciseNames = (w: any): string[] =>
  Array.from(new Set((w.exercises || []).map((e: any) => e.name as string).filter(Boolean)));

const isGenericTitle = (t?: string | null) => {
  if (!t) return true;
  return ['workout','morning workout','afternoon workout','evening workout'].includes(t.trim().toLowerCase());
};

const getDisplayTitle = (w: any) => {
  const names = getExerciseNames(w);
  if (names.length > 0 && isGenericTitle(w.title)) return names[0];
  return w.title || names[0] || 'Workout';
};

const matchesFilter = (w: any, f: string | null) => {
  if (!f || f === 'All') return true;
  const g = Array.isArray(w.muscle_groups) ? w.muscle_groups : [];
  if (f === 'Arms') return g.includes('Arms') || g.includes('Biceps') || g.includes('Triceps');
  return g.includes(f);
};

const weekStart = (d: Date) => startOfWeek(d, { weekStartsOn: 1 });
const weekEnd   = (d: Date) => endOfWeek(d,   { weekStartsOn: 1 });
const weekDaysOf = (d: Date): Date[] =>
  eachDayOfInterval({ start: weekStart(d), end: weekEnd(d) });

// ── Sub-components ────────────────────────────────────────────────────────────

const ExerciseChip: React.FC<{ name: string; color: string }> = ({ name, color }) => (
  <div
    className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold border shrink-0"
    style={{
      background: `color-mix(in srgb, ${color} 15%, var(--bg-elevated))`,
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
  const [anchor, setAnchor]             = useState<Date>(today);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [viewMode, setViewMode]         = useState<ViewMode>('today');
  const [workouts, setWorkouts]         = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [pickerYear, setPickerYear]     = useState(today.getFullYear());

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data fetch ───────────────────────────────────────────────────────────────
  // Always fetch the full month + week-overflow around anchor so every view is covered.
  // When viewMode is 'week', also extend to cover the full week even if it crosses months.

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    setLoading(true);

    let start: Date;
    let end: Date;
    if (viewMode === 'week') {
      start = weekStart(anchor);
      end   = weekEnd(anchor);
    } else {
      start = weekStart(startOfMonth(anchor));
      end   = weekEnd(endOfMonth(anchor));
    }

    getWorkouts(user.id, {
      startDate: format(start, 'yyyy-MM-dd'),
      endDate:   format(end,   'yyyy-MM-dd'),
      includeExercises: true,
    })
      .then((data) => {
        // Deduplicate by id in case the query returns duplicates
        const seen = new Set<string>();
        const deduped = (data || []).filter((w: any) => {
          if (seen.has(w.id)) return false;
          seen.add(w.id);
          return true;
        });
        setWorkouts(deduped);
      })
      .catch(() => setWorkouts([]))
      .finally(() => setLoading(false));
  }, [user, anchor, viewMode]);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const weekDays  = useMemo(() => weekDaysOf(anchor), [anchor]);
  const monthDays = useMemo(() => eachDayOfInterval({
    start: weekStart(startOfMonth(anchor)),
    end:   weekEnd(endOfMonth(anchor)),
  }), [anchor]);

  const getForDay = (day: Date) =>
    workouts.filter((w) => {
      const d = parseStoredDate(w.date);
      return d !== null && isSameDay(d, day) && matchesFilter(w, activeFilter);
    });

  const selectedWorkouts = useMemo(() => getForDay(selectedDate), [selectedDate, workouts, activeFilter]);

  const selectedSummary = useMemo(() => ({
    duration:  selectedWorkouts.reduce((s, w) => s + Number(w.duration_minutes || 0), 0),
    exercises: selectedWorkouts.reduce((s, w) => s + getExerciseCount(w), 0),
    volume:    selectedWorkouts.reduce((s, w) => s + getVolume(w, unit), 0),
  }), [selectedWorkouts, unit]);

  // ── Navigation ───────────────────────────────────────────────────────────────

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

  const goToToday = () => { setAnchor(today); setSelectedDate(today); };

  const selectDay = (day: Date) => {
    setSelectedDate(day);
    if (!isSameMonth(day, anchor)) setAnchor(day);
  };

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'today') { setAnchor(today); setSelectedDate(today); }
    else setAnchor(selectedDate);
  };

  // ── Long-press to log ────────────────────────────────────────────────────────

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

  // ── Delete ───────────────────────────────────────────────────────────────────

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

  // ── Render helpers ────────────────────────────────────────────────────────────

  const renderWorkoutCard = (workout: any) => {
    const accent  = getAccent(workout);
    const names   = getExerciseNames(workout);
    const title   = getDisplayTitle(workout);
    const exCount = getExerciseCount(workout);
    const dur     = Number(workout.duration_minutes || 0);
    const muscle  = (workout.muscle_groups || [])[0];
    const chips   = names.slice(0, 4);
    const extra   = names.length - chips.length;

    return (
      <motion.div
        key={workout.id}
        layout
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className="relative overflow-hidden rounded-2xl"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
      >
        <div className="absolute inset-y-0 left-0 w-[3px] rounded-l-2xl" style={{ backgroundColor: accent }} />

        <div className="pl-4 pr-3 py-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold leading-snug truncate" style={{ color: 'var(--text-primary)' }}>
                {title}
              </p>
              {muscle && (
                <p className="text-[11px] font-medium mt-0.5" style={{ color: accent }}>
                  {muscle}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0 mt-0.5">
              <button
                onClick={() => handleDelete(workout.id, workout.title)}
                className="h-7 w-7 flex items-center justify-center rounded-lg"
                style={{ background: 'rgba(255,59,48,0.08)', color: 'rgba(255,80,65,0.85)' }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <Link
                to="/timeline"
                className="h-7 inline-flex items-center px-2.5 rounded-lg text-[11px] font-semibold"
                style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                Details
              </Link>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <Clock3 className="h-3 w-3 shrink-0" />
              <span>{dur > 0 ? `${dur} min` : `${exCount} ex`}</span>
            </div>
            <div className="flex items-center gap-0.5">
              <div className="flex -space-x-1.5">
                {chips.map((n) => <ExerciseChip key={n} name={n} color={accent} />)}
              </div>
              {extra > 0 && (
                <span className="ml-1 text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>+{extra}</span>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  // Week strip (used in Today + Month views)
  const renderWeekStrip = () => (
    <div className="flex items-center justify-between gap-1 px-1 pb-1">
      {weekDays.map((day) => {
        const isSelected = isSameDay(day, selectedDate);
        const isTodayDay = dateFnsIsToday(day);
        const dots = getForDay(day);
        return (
          <button
            key={day.toISOString()}
            onClick={() => selectDay(day)}
            onPointerDown={(e) => handleLongPressStart(day, e)}
            onPointerUp={handleLongPressEnd}
            onPointerLeave={handleLongPressEnd}
            className="flex flex-col items-center gap-0.5 flex-1 py-1 rounded-xl transition-all active:scale-95"
          >
            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: isSelected ? 'var(--accent)' : 'var(--text-muted)' }}>
              {format(day, 'EEEEE')}
            </span>
            <div
              className="h-8 w-8 flex items-center justify-center rounded-full text-[14px] font-bold"
              style={
                isTodayDay
                  ? { background: 'var(--accent)', color: '#000' }
                  : isSelected
                  ? { background: 'var(--bg-elevated)', color: 'var(--text-primary)', outline: '1.5px solid var(--accent)' }
                  : { color: 'var(--text-secondary)' }
              }
            >
              {format(day, 'd')}
            </div>
            <div className="h-1.5 flex gap-0.5">
              {dots.slice(0, 3).map((w) => (
                <div key={w.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: isSelected ? 'var(--accent)' : getAccent(w) }} />
              ))}
              {dots.length === 0 && <div className="h-1.5 w-1.5 opacity-0" />}
            </div>
          </button>
        );
      })}
    </div>
  );

  // Month grid
  const renderMonthGrid = () => (
    <div className="pb-2">
      <div className="grid grid-cols-7 mb-1">
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <div key={i} className="py-1 text-center text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {monthDays.map((day) => {
          const isSelected = isSameDay(day, selectedDate);
          const isTodayDay = dateFnsIsToday(day);
          const outside = !isSameMonth(day, anchor);
          const dots = getForDay(day);
          return (
            <button
              key={day.toISOString()}
              onClick={() => selectDay(day)}
              onPointerDown={(e) => handleLongPressStart(day, e)}
              onPointerUp={handleLongPressEnd}
              onPointerLeave={handleLongPressEnd}
              className={`flex flex-col items-center py-1 rounded-xl transition-all active:scale-95 ${outside ? 'opacity-25' : ''}`}
              style={isSelected ? { background: 'var(--bg-elevated)', outline: '1px solid var(--accent)' } : undefined}
            >
              <div
                className="h-7 w-7 flex items-center justify-center rounded-full text-[12px] font-semibold"
                style={isTodayDay ? { background: 'var(--accent)', color: '#000' } : { color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}
              >
                {format(day, 'd')}
              </div>
              <div className="flex gap-0.5 h-1.5 mt-0.5">
                {dots.slice(0, 2).map((w) => (
                  <div key={w.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: getAccent(w) }} />
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  // Week list view — all 7 days with their workouts
  const renderWeekList = () => (
    <div className="space-y-4">
      {/* Week range header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-muted)' }}>Week</p>
          <p className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>
            {format(weekDays[0], 'MMM d')} – {format(weekDays[6], isSameMonth(weekDays[0], weekDays[6]) ? 'd' : 'MMM d')}
            <span className="text-[13px] font-medium ml-1" style={{ color: 'var(--text-muted)' }}>
              {format(weekDays[0], 'yyyy')}
            </span>
          </p>
        </div>
        <div className="text-[11px] font-medium px-2.5 py-1 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
          {weekDays.reduce((sum, d) => sum + getForDay(d).length, 0)} workouts
        </div>
      </div>
      {weekDays.map((day) => {
        const dayWorkouts = getForDay(day);
        const isTodayDay  = dateFnsIsToday(day);
        const isSelected  = isSameDay(day, selectedDate);

        return (
          <div key={day.toISOString()}>
            {/* Day header */}
            <button
              className="w-full flex items-center justify-between mb-2 px-1"
              onClick={() => selectDay(day)}
            >
              <div className="flex items-center gap-2">
                <div
                  className="h-8 w-8 flex items-center justify-center rounded-full text-[13px] font-bold shrink-0"
                  style={
                    isTodayDay
                      ? { background: 'var(--accent)', color: '#000' }
                      : isSelected
                      ? { background: 'var(--bg-elevated)', color: 'var(--text-primary)', outline: '1px solid var(--accent)' }
                      : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }
                  }
                >
                  {format(day, 'd')}
                </div>
                <div className="text-left">
                  <p className="text-[12px] font-semibold" style={{ color: isTodayDay ? 'var(--accent)' : 'var(--text-primary)' }}>
                    {isTodayDay ? 'Today' : format(day, 'EEEE')}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{format(day, 'MMM d')}</p>
                </div>
              </div>
              {dayWorkouts.length > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                  {dayWorkouts.length} workout{dayWorkouts.length !== 1 ? 's' : ''}
                </span>
              )}
            </button>

            {/* Workouts or rest */}
            {loading ? (
              <div className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
            ) : dayWorkouts.length > 0 ? (
              <AnimatePresence initial={false}>
                <div className="space-y-2">
                  {dayWorkouts.map((w) => renderWorkoutCard(w))}
                </div>
              </AnimatePresence>
            ) : (
              <div
                className="h-10 rounded-xl flex items-center justify-center text-[11px] font-medium"
                style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border)', color: 'var(--text-muted)' }}
              >
                Rest
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // Day label
  const dayLabel = isSameDay(selectedDate, today)
    ? 'Today'
    : isSameDay(selectedDate, addDays(today, -1))
    ? 'Yesterday'
    : format(selectedDate, 'EEEE, MMM d');

  // ── JSX ───────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen pb-28" style={{ background: 'var(--bg-base)' }}>

      {/* ── Sticky Header ── */}
      <div
        className="sticky top-0 z-20 px-4 pt-3"
        style={{ background: 'var(--bg-base)', borderBottom: '1px solid var(--border)' }}
      >
        {/* Month row */}
        <div className="flex items-center justify-between mb-3">
          {/* Month picker trigger */}
          <div className="relative">
            <button
              className="flex items-center gap-1.5"
              onClick={() => { setShowMonthPicker((p) => !p); setPickerYear(anchor.getFullYear()); }}
            >
              <span className="text-[24px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                {format(anchor, 'MMMM')}
              </span>
              <span className="text-[16px] font-medium" style={{ color: 'var(--text-muted)' }}>
                {format(anchor, 'yyyy')}
              </span>
              <ChevronDown
                className="w-4 h-4 transition-transform"
                style={{ color: 'var(--text-muted)', transform: showMonthPicker ? 'rotate(180deg)' : 'none' }}
              />
            </button>

            {/* Month picker dropdown */}
            <AnimatePresence>
              {showMonthPicker && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="absolute top-full left-0 mt-2 w-[220px] rounded-2xl shadow-xl z-50 p-3"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
                >
                  {/* Year nav */}
                  <div className="flex items-center justify-between mb-2 px-1">
                    <button
                      onClick={() => setPickerYear((y) => y - 1)}
                      className="h-7 w-7 flex items-center justify-center rounded-lg"
                      style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>{pickerYear}</span>
                    <button
                      onClick={() => setPickerYear((y) => y + 1)}
                      className="h-7 w-7 flex items-center justify-center rounded-lg"
                      style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {/* Month grid */}
                  <div className="grid grid-cols-3 gap-1">
                    {MONTHS.map((mn, idx) => {
                      const isActive = anchor.getMonth() === idx && anchor.getFullYear() === pickerYear;
                      return (
                        <button
                          key={mn}
                          onClick={() => {
                            const next = new Date(pickerYear, idx, 1);
                            setAnchor(next);
                            setSelectedDate(next);
                            setShowMonthPicker(false);
                          }}
                          className="py-1.5 rounded-xl text-[12px] font-semibold transition-all"
                          style={
                            isActive
                              ? { background: 'var(--accent)', color: '#000' }
                              : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }
                          }
                        >
                          {mn}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right: prev/next + log */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={prevPeriod}
              className="h-8 w-8 flex items-center justify-center rounded-full"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={nextPeriod}
              className="h-8 w-8 flex items-center justify-center rounded-full"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <Link
              to={`/log?date=${format(selectedDate, 'yyyy-MM-dd')}`}
              className="h-8 w-8 flex items-center justify-center rounded-full"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              <Plus className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* View tabs */}
        <div
          className="flex gap-1 rounded-xl p-1 mb-3"
          style={{ background: 'var(--bg-elevated)' }}
        >
          {([
            { id: 'today', label: 'Today', Icon: Sun },
            { id: 'week',  label: 'Week',  Icon: CalendarDays },
            { id: 'month', label: 'Month', Icon: LayoutGrid },
          ] as const).map(({ id, label, Icon }) => {
            const active = viewMode === id;
            return (
              <button
                key={id}
                onClick={() => changeViewMode(id)}
                className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12px] font-semibold transition-all"
                style={active ? { background: 'var(--bg-surface)', color: 'var(--text-primary)' } : { color: 'var(--text-muted)' }}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            );
          })}
        </div>

        {/* Calendar (week strip or month grid) */}
        {viewMode === 'today' && renderWeekStrip()}
        {viewMode === 'month' && renderMonthGrid()}
      </div>

      {/* ── Backdrop to close month picker ── */}
      {showMonthPicker && (
        <div className="fixed inset-0 z-40" onClick={() => setShowMonthPicker(false)} />
      )}

      {/* ── Body ── */}
      <div className="px-4 pt-4 space-y-4">

        {/* Muscle filter strip */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {MUSCLE_FILTERS.map((m) => {
            const isAll    = m === 'All';
            const active   = isAll ? activeFilter === null : activeFilter === m;
            return (
              <button
                key={m}
                onClick={() => setActiveFilter(isAll ? null : active ? null : m)}
                className="flex-shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-all"
                style={
                  active
                    ? { background: isAll ? 'var(--bg-elevated)' : muscleColor(m), color: isAll ? 'var(--text-primary)' : '#000', border: `1px solid ${isAll ? 'var(--border)' : muscleColor(m)}` }
                    : { background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)' }
                }
              >
                {!isAll && (
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: active ? '#000' : muscleColor(m) }} />
                )}
                {m}
              </button>
            );
          })}
        </div>

        {/* ── Week view: all 7 days ── */}
        {viewMode === 'week' && renderWeekList()}

        {/* ── Today / Month view: selected day panel ── */}
        {(viewMode === 'today' || viewMode === 'month') && (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${viewMode}-${format(selectedDate, 'yyyy-MM-dd')}-${activeFilter || 'all'}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl overflow-hidden"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
            >
              {/* Day header */}
              <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>
                      {dayLabel}
                    </p>
                    <p className="text-[18px] font-bold" style={{ color: 'var(--text-primary)' }}>
                      {selectedWorkouts.length > 0
                        ? `${selectedWorkouts.length} workout${selectedWorkouts.length !== 1 ? 's' : ''}`
                        : isSameDay(selectedDate, today) ? 'Nothing logged yet' : 'Rest day'}
                    </p>
                  </div>
                  {!isSameDay(selectedDate, today) && (
                    <button
                      onClick={goToToday}
                      className="text-[11px] font-semibold px-3 py-1.5 rounded-full"
                      style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                    >
                      Today
                    </button>
                  )}
                </div>

                {/* Stats strip */}
                {selectedWorkouts.length > 0 && (
                  <div className="flex items-center gap-4 mt-2">
                    {[
                      { label: 'Min',       value: selectedSummary.duration },
                      { label: 'Exercises', value: selectedSummary.exercises },
                      { label: `Vol ${unit}`, value: Math.round(selectedSummary.volume).toLocaleString() },
                    ].map((s) => (
                      <div key={s.label}>
                        <span className="text-[15px] font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{s.value}</span>
                        <span className="text-[10px] ml-1" style={{ color: 'var(--text-muted)' }}>{s.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Workout list */}
              <div className="px-4 py-3 space-y-2">
                {loading ? (
                  <>
                    <div className="h-20 rounded-xl animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
                    <div className="h-20 rounded-xl animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
                  </>
                ) : selectedWorkouts.length > 0 ? (
                  <AnimatePresence initial={false}>
                    {selectedWorkouts.map((w) => renderWorkoutCard(w))}
                  </AnimatePresence>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <div
                      className="h-11 w-11 rounded-2xl flex items-center justify-center"
                      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                    >
                      <Dumbbell className="h-5 w-5" style={{ color: 'var(--text-muted)' }} />
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {isSameDay(selectedDate, today) ? 'Nothing logged today' : 'No workouts this day'}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {isSameDay(selectedDate, today)
                          ? 'Start a session and it will appear here.'
                          : 'This was a rest day.'}
                      </p>
                    </div>
                    {isSameDay(selectedDate, today) && (
                      <Link
                        to={`/log?date=${format(selectedDate, 'yyyy-MM-dd')}`}
                        className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-bold text-black"
                        style={{ background: 'var(--accent)' }}
                      >
                        <Zap className="h-3.5 w-3.5" />
                        Log Workout
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};
