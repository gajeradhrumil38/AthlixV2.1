import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Check, BookmarkPlus } from 'lucide-react';
import { ExercisePicker } from './ExercisePicker';
import { DialPicker } from './DialPicker';
import { useAuth } from '../../contexts/AuthContext';
import { saveTemplate, getLastExerciseSession } from '../../lib/supabaseData';
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

interface DialState {
  exId: string;
  setIdx: number;
  field: 'weight' | 'reps';
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

/* ── Large tappable number box ── */
const NumBox: React.FC<{
  value: number;
  suffix?: string;
  muted?: boolean;
  onTap: () => void;
}> = ({ value, suffix, muted, onTap }) => (
  <button
    type="button"
    onClick={onTap}
    className="flex-1 h-[68px] flex flex-col items-center justify-center rounded-xl active:scale-[0.96] transition-transform"
    style={{
      background: muted ? 'transparent' : 'var(--bg-elevated)',
      border: muted ? 'none' : '1px solid var(--border)',
    }}
  >
    <span
      className="font-victory text-[38px] font-black leading-none tabular-nums"
      style={{ color: muted ? 'var(--text-muted)' : 'var(--text-primary)' }}
    >
      {value}
    </span>
    {suffix && (
      <span className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: 'var(--text-muted)' }}>
        {suffix}
      </span>
    )}
  </button>
);

/* ── One set row (Strong/Hevy style) ── */
const PlanSetRow: React.FC<{
  index: number;
  set: PlannedSet;
  onOpenDial: (field: 'weight' | 'reps') => void;
  onRemove: () => void;
}> = ({ index, set, onOpenDial, onRemove }) => (
  <div className="flex items-center gap-2 px-4 py-1.5">
    {/* Set number */}
    <div
      className="w-7 shrink-0 text-center text-[13px] font-bold"
      style={{ color: 'var(--text-muted)' }}
    >
      {index}
    </div>

    {/* Previous hint — same width zone as weight+reps to keep columns aligned */}
    <div className="w-[72px] shrink-0 text-center">
      <span className="text-[11px] tabular-nums" style={{ color: 'rgba(255,255,255,0.20)' }}>
        {set.weight > 0 ? `${set.weight} × ${set.reps}` : '—'}
      </span>
    </div>

    {/* Weight box */}
    <NumBox value={set.weight} suffix="lb" onTap={() => onOpenDial('weight')} />

    {/* Reps box */}
    <NumBox value={set.reps} onTap={() => onOpenDial('reps')} />

    {/* Delete */}
    <button
      type="button"
      onClick={onRemove}
      className="w-9 h-9 flex items-center justify-center shrink-0 rounded-xl active:scale-95 transition-transform"
      style={{ color: 'rgba(248,113,113,0.45)' }}
    >
      <Trash2 className="w-4 h-4" />
    </button>
  </div>
);

/* ── Exercise block (full-bleed Strong style) ── */
const PlanExerciseCard: React.FC<{
  ex: PlannedExercise;
  onChange: (updated: PlannedExercise) => void;
  onRemove: () => void;
  onOpenDial: (setIdx: number, field: 'weight' | 'reps') => void;
}> = ({ ex, onChange, onRemove, onOpenDial }) => {
  const color = muscleColor(ex.muscleGroup);

  const addSet = () => {
    const last = ex.sets[ex.sets.length - 1];
    onChange({ ...ex, sets: [...ex.sets, { weight: last?.weight ?? 0, reps: last?.reps ?? 10 }] });
  };

  const repeatLastSet = () => {
    const last = ex.sets[ex.sets.length - 1];
    if (!last) return;
    onChange({ ...ex, sets: [...ex.sets, { weight: last.weight, reps: last.reps }] });
  };

  const removeSet = (i: number) => {
    if (ex.sets.length <= 1) return;
    onChange({ ...ex, sets: ex.sets.filter((_, idx) => idx !== i) });
  };

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      {/* Exercise header */}
      <div className="flex items-start justify-between px-4 pt-5 pb-3">
        <div>
          <h3 className="text-[18px] font-bold text-[var(--text-primary)] leading-tight">{ex.name}</h3>
          <p
            className="text-[10px] font-bold uppercase tracking-[1.6px] mt-0.5"
            style={{ color }}
          >
            {ex.muscleGroup}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="mt-1 p-1.5 rounded-lg active:scale-95 transition-transform"
          style={{ color: 'rgba(248,113,113,0.45)' }}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Column headers */}
      <div className="flex items-center px-4 pb-1" style={{ color: 'var(--text-muted)' }}>
        <span className="w-7 shrink-0 text-center text-[9px] font-bold uppercase tracking-wider">Set</span>
        <span className="w-[72px] shrink-0 text-center text-[9px] font-bold uppercase tracking-wider">Last</span>
        <span className="flex-1 text-center text-[9px] font-bold uppercase tracking-wider">Weight</span>
        <span className="flex-1 text-center text-[9px] font-bold uppercase tracking-wider">Reps</span>
        <span className="w-9 shrink-0" />
      </div>

      {/* Set rows */}
      {ex.sets.map((s, i) => (
        <PlanSetRow
          key={i}
          index={i + 1}
          set={s}
          onOpenDial={(field) => onOpenDial(i, field)}
          onRemove={() => removeSet(i)}
        />
      ))}

      {/* Footer actions */}
      <div className="flex items-center justify-between px-4 pt-2 pb-4">
        <button
          type="button"
          onClick={addSet}
          className="flex items-center gap-1.5 text-[12px] font-semibold active:opacity-70 transition-opacity"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Plus className="w-3.5 h-3.5" />
          Add set
        </button>
        <button
          type="button"
          onClick={repeatLastSet}
          className="flex items-center gap-1 text-[12px] font-semibold active:opacity-70 transition-opacity"
          style={{ color: 'var(--accent)' }}
        >
          ↓ Repeat last
        </button>
      </div>
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
  const [dialState, setDialState] = useState<DialState | null>(null);

  const defaultTitle = `Plan — ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;

  const openDial = (exId: string, setIdx: number, field: 'weight' | 'reps') => {
    setDialState({ exId, setIdx, field });
  };

  const handleDialConfirm = (value: number) => {
    if (!dialState) return;
    const { exId, setIdx, field } = dialState;
    setExercises((prev) =>
      prev.map((ex) =>
        ex.id !== exId
          ? ex
          : {
              ...ex,
              sets: ex.sets.map((s, idx) => (idx === setIdx ? { ...s, [field]: value } : s)),
            },
      ),
    );
    setDialState(null);
  };

  const handleAddExercise = async (ex: {
    name: string;
    muscleGroup: string;
    exercise_db_id?: string;
    lastSession?: { weight: number; reps: number; sets?: number; perSetData?: Array<{ weight: number; reps: number }> };
  }) => {
    setShowPicker(false);

    let sets: PlannedSet[];
    const perSetData = ex.lastSession?.perSetData;

    if (perSetData && perSetData.length > 0) {
      sets = perSetData.map((s) => ({ weight: s.weight, reps: s.reps }));
    } else if (!ex.lastSession && user) {
      try {
        const session = await getLastExerciseSession(user.id, ex.name);
        const ls = session?.lastSession as ({ perSetData?: Array<{ weight: number; reps: number }> } & { sets: number; weight: number; reps: number }) | undefined;
        if (ls?.perSetData?.length) {
          sets = ls.perSetData.map((s: { weight: number; reps: number }) => ({ weight: s.weight, reps: s.reps }));
        } else if (ls) {
          sets = Array.from({ length: ls.sets || 3 }, () => ({ weight: ls.weight, reps: ls.reps }));
        } else {
          sets = [{ weight: 0, reps: 10 }, { weight: 0, reps: 10 }, { weight: 0, reps: 10 }];
        }
      } catch {
        sets = [{ weight: 0, reps: 10 }, { weight: 0, reps: 10 }, { weight: 0, reps: 10 }];
      }
    } else {
      const w = ex.lastSession?.weight ?? 0;
      const r = ex.lastSession?.reps ?? 10;
      const n = ex.lastSession?.sets ?? 3;
      sets = Array.from({ length: n }, () => ({ weight: w, reps: r }));
    }

    setExercises((prev) => [
      ...prev,
      { id: createId(), name: ex.name, muscleGroup: ex.muscleGroup, exercise_db_id: ex.exercise_db_id, sets },
    ]);
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
      // Non-fatal
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

  /* ── Dial picker active state ── */
  const dialExercise = dialState ? exercises.find((e) => e.id === dialState.exId) : null;
  const dialSet = dialExercise ? dialExercise.sets[dialState!.setIdx] : null;

  return (
    <>
      <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 backdrop-blur-sm">
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 26, stiffness: 220 }}
          className="w-full max-w-[480px] flex flex-col rounded-t-[24px]"
          style={{ background: 'var(--bg-base)', height: '92%' }}
        >
          {/* Handle + header */}
          <div
            className="shrink-0 px-5 pt-3 pb-4 border-b"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="w-10 h-1 bg-[var(--text-muted)] rounded-full mx-auto mb-4 opacity-40" />
            <div className="flex items-center justify-between mb-3">
              <div>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={defaultTitle}
                  className="text-[18px] font-bold text-[var(--text-primary)] bg-transparent focus:outline-none w-full"
                  style={{ caretColor: 'var(--accent)' }}
                />
                <p className="text-[11px] font-medium mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {exercises.length === 0
                    ? 'No exercises yet'
                    : `${exercises.length} exercise${exercises.length > 1 ? 's' : ''} · ${exercises.reduce((t, e) => t + e.sets.length, 0)} sets`}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl shrink-0 active:scale-95 transition-transform"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Exercise list */}
          <div className="flex-1 overflow-y-auto">
            <AnimatePresence initial={false}>
              {exercises.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center h-48 gap-3 text-center px-6"
                >
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                  >
                    <BookmarkPlus className="w-6 h-6 text-[var(--text-muted)]" />
                  </div>
                  <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                    Add exercises to build your plan
                  </p>
                </motion.div>
              ) : (
                exercises.map((ex) => (
                  <motion.div
                    key={ex.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <PlanExerciseCard
                      ex={ex}
                      onChange={(updated) =>
                        setExercises((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
                      }
                      onRemove={() => setExercises((prev) => prev.filter((e) => e.id !== ex.id))}
                      onOpenDial={(setIdx, field) => openDial(ex.id, setIdx, field)}
                    />
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>

          {/* Bottom bar */}
          <div
            className="shrink-0 px-4 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] border-t space-y-2"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="btn-glow btn-glow-subtle w-full py-3 flex items-center justify-center gap-2 text-[13px] font-semibold rounded-xl"
              style={{ color: 'var(--text-primary)' }}
            >
              <Plus className="w-4 h-4 text-[var(--accent)]" />
              Add Exercise
            </button>
            <button
              type="button"
              onClick={handleStart}
              disabled={saving || exercises.length === 0}
              className="w-full py-4 rounded-xl text-[14px] font-bold text-black flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity"
              style={{ background: 'var(--accent)' }}
            >
              {saving ? 'Saving…' : (
                <>
                  <Check className="w-4 h-4" />
                  Start Workout
                  {exercises.length > 0 && (
                    <span className="opacity-70 font-medium text-[12px]">
                      · {exercises.reduce((t, e) => t + e.sets.length, 0)} sets
                    </span>
                  )}
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>

      {/* ExercisePicker above the sheet */}
      {showPicker && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120 }}>
          <ExercisePicker
            onSelect={handleAddExercise}
            onClose={() => setShowPicker(false)}
            recentExercises={[]}
          />
        </div>
      )}

      {/* Dial Picker */}
      {dialState && dialSet && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 130 }}>
          <DialPicker
            title={dialState.field === 'weight' ? 'Weight' : 'Reps'}
            fieldKind={dialState.field}
            inputType="weight_reps"
            initialValue={dialState.field === 'weight' ? dialSet.weight : dialSet.reps}
            weightUnit="lbs"
            onClose={() => setDialState(null)}
            onConfirm={handleDialConfirm}
          />
        </div>
      )}
    </>
  );
};
