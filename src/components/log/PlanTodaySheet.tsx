import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Check, BookmarkPlus, Minus } from 'lucide-react';
import { ExercisePicker } from './ExercisePicker';
import { useAuth } from '../../contexts/AuthContext';
import { saveTemplate } from '../../lib/supabaseData';
import type { ExerciseEntry, Set } from '../../legacy-pages/Log';
import toast from 'react-hot-toast';

interface PlannedSet {
  weight: number;
  reps: number;
}

interface PlannedExercise {
  id: string;
  name: string;
  muscleGroup: string;
  exercise_db_id?: string;
  sets: PlannedSet[];
}

interface PlanTodaySheetProps {
  onClose: () => void;
  onStartPlan: (exercises: ExerciseEntry[], title: string) => void;
}

const MUSCLE_COLORS: Record<string, string> = {
  Chest: 'var(--chest)',
  Back: 'var(--back)',
  Legs: 'var(--legs)',
  Shoulders: 'var(--shoulders)',
  Core: 'var(--core)',
  Biceps: 'var(--biceps)',
  Triceps: 'var(--triceps)',
  Cardio: 'var(--cardio)',
};
const muscleColor = (mg: string) => MUSCLE_COLORS[mg] ?? 'var(--text-muted)';

const createId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/* ── Inline stepper used in each plan-set row ── */
const Stepper: React.FC<{
  value: number;
  step?: number;
  min?: number;
  onChange: (v: number) => void;
  suffix?: string;
}> = ({ value, step = 1, min = 0, onChange, suffix = '' }) => (
  <div className="flex items-center justify-center gap-1.5">
    <button
      type="button"
      onClick={() => onChange(Math.max(min, value - step))}
      className="w-7 h-7 rounded-lg flex items-center justify-center"
      style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
    >
      <Minus className="w-3 h-3" />
    </button>
    <span className="w-10 text-center text-[13px] font-bold text-[var(--text-primary)] tabular-nums">
      {value}{suffix}
    </span>
    <button
      type="button"
      onClick={() => onChange(value + step)}
      className="w-7 h-7 rounded-lg flex items-center justify-center"
      style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
    >
      <Plus className="w-3 h-3" />
    </button>
  </div>
);

/* ── One planned set row ── */
const PlanSetRow: React.FC<{
  index: number;
  set: PlannedSet;
  onChange: (patch: Partial<PlannedSet>) => void;
  onRemove: () => void;
}> = ({ index, set, onChange, onRemove }) => (
  <div
    className="flex items-center gap-2 px-4 py-2.5 border-t"
    style={{ borderColor: 'var(--border)' }}
  >
    <span
      className="w-7 text-center text-[10px] font-bold rounded-lg py-1"
      style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
    >
      {index}
    </span>
    <div className="flex-1 flex items-center justify-center">
      <Stepper value={set.weight} step={5} min={0} onChange={(v) => onChange({ weight: v })} suffix="kg" />
    </div>
    <div className="flex-1 flex items-center justify-center">
      <Stepper value={set.reps} step={1} min={1} onChange={(v) => onChange({ reps: v })} />
    </div>
    <button
      type="button"
      onClick={onRemove}
      className="w-7 h-7 flex items-center justify-center shrink-0 rounded-lg"
      style={{ color: 'rgba(248,113,113,0.55)' }}
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  </div>
);

/* ── Exercise plan card — same header style as ExerciseBlock ── */
const PlanExerciseCard: React.FC<{
  ex: PlannedExercise;
  onChange: (updated: PlannedExercise) => void;
  onRemove: () => void;
}> = ({ ex, onChange, onRemove }) => {
  const color = muscleColor(ex.muscleGroup);

  const addSet = () => {
    const last = ex.sets[ex.sets.length - 1];
    onChange({ ...ex, sets: [...ex.sets, { weight: last?.weight ?? 0, reps: last?.reps ?? 10 }] });
  };

  const updateSet = (i: number, patch: Partial<PlannedSet>) => {
    const next = ex.sets.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    onChange({ ...ex, sets: next });
  };

  const removeSet = (i: number) => {
    if (ex.sets.length <= 1) return;
    onChange({ ...ex, sets: ex.sets.filter((_, idx) => idx !== i) });
  };

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      {/* Header — matches ExerciseBlock header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-[13px] font-bold text-[var(--text-primary)] truncate">{ex.name}</h3>
          <div className="flex items-center gap-1 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
            <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              {ex.muscleGroup}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 ml-2 shrink-0"
          style={{ color: 'rgba(248,113,113,0.55)' }}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Column headers — matches ExerciseBlock column header row */}
      <div
        className="flex items-center text-[9px] font-bold uppercase tracking-[1.5px] px-4 pt-2.5 pb-1"
        style={{ color: 'var(--text-muted)' }}
      >
        <span className="w-7 text-center">Set</span>
        <span className="flex-1 text-center">Weight</span>
        <span className="flex-1 text-center">Reps</span>
        <span className="w-7" />
      </div>

      {/* Set rows */}
      {ex.sets.map((s, i) => (
        <PlanSetRow
          key={i}
          index={i + 1}
          set={s}
          onChange={(patch) => updateSet(i, patch)}
          onRemove={() => removeSet(i)}
        />
      ))}

      {/* Add Set — matches ExerciseBlock Add Set button */}
      <button
        type="button"
        onClick={addSet}
        className="w-full py-3 border-t flex items-center justify-center gap-2 text-[10px] font-bold transition-colors"
        style={{ borderColor: 'var(--border)', color: 'rgba(200,255,0,0.6)' }}
      >
        <Plus className="w-3 h-3" /> Add Set
      </button>
    </div>
  );
};

/* ── Main sheet ── */
export const PlanTodaySheet: React.FC<PlanTodaySheetProps> = ({ onClose, onStartPlan }) => {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [exercises, setExercises] = useState<PlannedExercise[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const defaultTitle = `Plan — ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;

  const handleAddExercise = (ex: { name: string; muscleGroup: string; exercise_db_id?: string }) => {
    setExercises((prev) => [
      ...prev,
      {
        id: createId(),
        name: ex.name,
        muscleGroup: ex.muscleGroup,
        exercise_db_id: ex.exercise_db_id,
        sets: [{ weight: 0, reps: 10 }, { weight: 0, reps: 10 }, { weight: 0, reps: 10 }],
      },
    ]);
    setShowPicker(false);
  };

  const handleStart = async () => {
    if (!exercises.length) {
      toast.error('Add at least one exercise to your plan');
      return;
    }

    const planTitle = title.trim() || defaultTitle;

    setSaving(true);
    try {
      if (user) {
        await saveTemplate(user.id, {
          title: planTitle,
          exercises: exercises.map((ex, i) => {
            const avgWeight = Math.round(ex.sets.reduce((s, r) => s + r.weight, 0) / ex.sets.length);
            const avgReps = Math.round(ex.sets.reduce((s, r) => s + r.reps, 0) / ex.sets.length);
            return {
              name: ex.name,
              muscle_group: ex.muscleGroup,
              default_sets: ex.sets.length,
              default_reps: avgReps,
              default_weight: avgWeight,
              exercise_db_id: ex.exercise_db_id ?? null,
              order_index: i,
            };
          }),
        });
      }
    } catch {
      // Non-fatal — still start the workout
    } finally {
      setSaving(false);
    }

    const workoutExercises: ExerciseEntry[] = exercises.map((ex) => ({
      id: createId(),
      name: ex.name,
      muscleGroup: ex.muscleGroup,
      exercise_db_id: ex.exercise_db_id,
      sets: ex.sets.map((s) => ({
        id: createId(),
        weight: s.weight || null,
        reps: s.reps || null,
        done: false,
        planned_weight: s.weight || null,
        planned_reps: s.reps || null,
      })) as Set[],
    }));

    onStartPlan(workoutExercises, planTitle);
  };

  return (
    <>
      {/* Sheet backdrop + panel */}
      <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 backdrop-blur-sm">
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 26, stiffness: 220 }}
          className="w-full max-w-[480px] flex flex-col rounded-t-[24px] border-t"
          style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', height: '92%' }}
        >
          {/* Handle + header */}
          <div
            className="shrink-0 px-5 pt-3 pb-4 border-b"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="w-10 h-1 bg-[var(--text-muted)] rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[16px] font-bold text-[var(--text-primary)]">Plan Today's Workout</h2>
              <button
                onClick={onClose}
                className="p-1.5 text-[var(--text-muted)] rounded-lg"
                style={{ background: 'var(--bg-elevated)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={defaultTitle}
              className="w-full px-3 py-2.5 rounded-xl text-[13px] text-[var(--text-primary)] focus:outline-none transition-colors"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
              }}
            />
          </div>

          {/* Exercise cards */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            <AnimatePresence initial={false}>
              {exercises.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center h-48 gap-3 text-center"
                >
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                  >
                    <BookmarkPlus className="w-5 h-5 text-[var(--text-muted)]" />
                  </div>
                  <p className="text-[13px] text-[var(--text-muted)]">
                    Add exercises to build your plan
                  </p>
                </motion.div>
              ) : (
                exercises.map((ex) => (
                  <motion.div
                    key={ex.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.18 }}
                  >
                    <PlanExerciseCard
                      ex={ex}
                      onChange={(updated) =>
                        setExercises((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
                      }
                      onRemove={() => setExercises((prev) => prev.filter((e) => e.id !== ex.id))}
                    />
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>

          {/* Bottom actions */}
          <div
            className="shrink-0 px-4 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] border-t space-y-2"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="btn-glow btn-glow-subtle w-full py-3 flex items-center justify-center gap-2 text-[13px] font-semibold text-[var(--text-primary)]"
            >
              <Plus className="w-4 h-4 text-[var(--accent)]" />
              Add Exercise
            </button>
            <button
              type="button"
              onClick={handleStart}
              disabled={saving || exercises.length === 0}
              className="w-full py-3.5 rounded-xl text-[14px] font-bold text-black flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
              style={{ background: 'var(--accent)' }}
            >
              {saving ? 'Saving…' : (
                <>
                  <Check className="w-4 h-4" />
                  Start Workout with Plan
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>

      {/* ExercisePicker at z-[120] so it sits above this sheet (z-110) */}
      {showPicker && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120 }}>
          <ExercisePicker
            onSelect={handleAddExercise}
            onClose={() => setShowPicker(false)}
            recentExercises={[]}
          />
        </div>
      )}
    </>
  );
};
