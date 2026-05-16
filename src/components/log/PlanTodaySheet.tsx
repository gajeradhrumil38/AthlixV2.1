import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Check, Copy, BookmarkCheck, Bookmark } from 'lucide-react';
import { ExercisePicker } from './ExercisePicker';
import { DialPicker } from './DialPicker';
import { useAuth } from '../../contexts/AuthContext';
import { saveTemplate, getLastExerciseSession } from '../../lib/supabaseData';
import type { ExerciseEntry } from '../../legacy-pages/Log';
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
  initialTemplate?: {
    id: string;
    title: string;
    exercises: PlannedExercise[];
  };
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
  Glutes: '#F4B96A',
  Forearms: '#98D4E8',
};
const muscleColor = (mg: string) => MUSCLE_COLORS[mg] ?? 'var(--text-muted)';

const createId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/* ── Value box ── */
const ValueBox: React.FC<{ label: string; value: number; onTap: () => void }> = ({ label, value, onTap }) => (
  <button
    type="button"
    onClick={onTap}
    className="relative flex h-[82px] w-full flex-col items-center justify-center gap-[3px] overflow-hidden rounded-xl border text-center transition-all active:scale-[0.97]"
    style={{ background: 'var(--bg-base)', borderColor: 'var(--border)' }}
  >
    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
    <div className="font-victory tabular-nums text-[36px] leading-none font-black text-[var(--text-primary)]">{value}</div>
    <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-[var(--text-secondary)]">{label}</div>
  </button>
);

/* ── Set separator ── */
const SetSeparator: React.FC<{ onCopy: () => void; onRemove: () => void }> = ({ onCopy, onRemove }) => (
  <div className="flex items-center gap-2 py-0.5 px-4 my-1">
    <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
    <button
      type="button"
      onClick={onCopy}
      className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[11px] font-semibold active:scale-95 transition-all"
      style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <Copy className="w-3 h-3" />
      Copy set
    </button>
    <button
      type="button"
      onClick={onRemove}
      className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[11px] font-semibold active:scale-95 transition-all"
      style={{ background: 'rgba(248,113,113,0.06)', color: 'rgba(248,113,113,0.7)', border: '1px solid rgba(248,113,113,0.15)' }}
    >
      <X className="w-3 h-3" />
      Remove
    </button>
    <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
  </div>
);

/* ── One set row ── */
const PlanSetRow: React.FC<{
  index: number;
  set: PlannedSet;
  weightUnit: string;
  onOpenDial: (field: 'weight' | 'reps') => void;
}> = ({ index, set, weightUnit, onOpenDial }) => (
  <div
    className="relative overflow-hidden rounded-2xl border mx-4"
    style={{ background: 'var(--bg-base)', borderColor: 'var(--border)' }}
  >
    <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: 'var(--border)' }} />
    <div className="flex items-center px-4 pt-3 pb-2 pl-5">
      <div
        className="rounded-lg px-2 py-[3px] text-[10px] font-bold tracking-[0.14em] uppercase"
        style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
      >
        Set {index}
      </div>
      {(set.weight > 0 || set.reps > 0) && (
        <span className="ml-2 text-[10px] font-medium tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {set.weight > 0 ? `${set.weight}${weightUnit}` : ''}
          {set.weight > 0 && set.reps > 0 ? ' × ' : ''}
          {set.reps > 0 ? `${set.reps} reps` : ''}
        </span>
      )}
    </div>
    <div className="grid grid-cols-2 gap-2 px-3 pb-3 pl-4">
      <ValueBox label={weightUnit} value={set.weight} onTap={() => onOpenDial('weight')} />
      <ValueBox label="reps" value={set.reps} onTap={() => onOpenDial('reps')} />
    </div>
  </div>
);

/* ── Exercise block ── */
const PlanExerciseCard: React.FC<{
  ex: PlannedExercise;
  weightUnit: string;
  isWorkoutOnly?: boolean;
  onChange: (updated: PlannedExercise) => void;
  onRemove: () => void;
  onOpenDial: (setIdx: number, field: 'weight' | 'reps') => void;
}> = ({ ex, weightUnit, isWorkoutOnly, onChange, onRemove, onOpenDial }) => {
  const color = muscleColor(ex.muscleGroup);
  const [confirmRemoveIdx, setConfirmRemoveIdx] = useState<number | null>(null);

  const addSet = () => {
    const last = ex.sets[ex.sets.length - 1];
    onChange({ ...ex, sets: [...ex.sets, { weight: last?.weight ?? 0, reps: last?.reps ?? 10 }] });
  };

  const copySet = (i: number) => {
    const src = ex.sets[i];
    if (!src) return;
    const next = [...ex.sets];
    next.splice(i + 1, 0, { weight: src.weight, reps: src.reps });
    onChange({ ...ex, sets: next });
  };

  const removeSet = (i: number) => {
    if (ex.sets.length <= 1) return;
    onChange({ ...ex, sets: ex.sets.filter((_, idx) => idx !== i) });
    setConfirmRemoveIdx(null);
  };

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="flex items-start justify-between px-4 pt-5 pb-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-[20px] font-bold text-[var(--text-primary)] leading-tight">{ex.name}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-[10px] font-bold uppercase tracking-[1.6px]" style={{ color }}>{ex.muscleGroup}</p>
            {isWorkoutOnly && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(200,255,0,0.1)', color: 'var(--accent)', border: '1px solid rgba(200,255,0,0.2)' }}>
                Session only
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="mt-1 flex h-[34px] w-[34px] items-center justify-center rounded-lg shrink-0"
          style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171' }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-2 pb-2">
        {ex.sets.map((s, i) => (
          <React.Fragment key={i}>
            <PlanSetRow index={i + 1} set={s} weightUnit={weightUnit} onOpenDial={(field) => onOpenDial(i, field)} />
            <SetSeparator onCopy={() => copySet(i)} onRemove={() => setConfirmRemoveIdx(i)} />
          </React.Fragment>
        ))}
      </div>

      <div className="flex items-center justify-between px-4 pt-1 pb-5">
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
          onClick={addSet}
          className="flex items-center gap-1 text-[12px] font-semibold active:opacity-70 transition-opacity"
          style={{ color: 'var(--accent)' }}
        >
          ↓ Repeat last
        </button>
      </div>

      {confirmRemoveIdx !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6" onClick={() => setConfirmRemoveIdx(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-[320px] rounded-2xl p-5"
            style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[15px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Remove Set {confirmRemoveIdx + 1}?</p>
            <p className="text-[13px] mb-5" style={{ color: 'var(--text-muted)' }}>This action cannot be undone.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmRemoveIdx(null)}
                className="flex-1 h-11 rounded-xl text-[13px] font-semibold"
                style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => removeSet(confirmRemoveIdx)}
                className="flex-1 h-11 rounded-xl text-[13px] font-semibold"
                style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171' }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Main sheet ── */
export const PlanTodaySheet: React.FC<PlanTodaySheetProps> = ({ onClose, onStartPlan, initialTemplate }) => {
  const { user } = useAuth();
  const [title, setTitle] = useState(initialTemplate?.title ?? '');
  const [exercises, setExercises] = useState<PlannedExercise[]>(initialTemplate?.exercises ?? []);
  const [showPicker, setShowPicker] = useState(!initialTemplate);
  const [saving, setSaving] = useState(false);
  const [dialState, setDialState] = useState<DialState | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(initialTemplate?.id ?? null);
  const [isSaved, setIsSaved] = useState(!!initialTemplate?.id);
  // Tracks exercises added for this workout session only (not saved to template)
  const [workoutOnlyIds, setWorkoutOnlyIds] = useState<Set<string>>(new Set());
  // Shows the "Added exercise — update plan?" action popup
  const [pendingActionExercise, setPendingActionExercise] = useState<PlannedExercise | null>(null);
  // Prevents dirty-flag trigger when adding workout-only exercise
  const skipDirtyRef = useRef(false);

  const inferPlanName = (exs: PlannedExercise[]) => {
    const muscles = new Set(exs.map((e) => e.muscleGroup));
    if (muscles.has('Chest') || muscles.has('Triceps')) return 'Push Day';
    if (muscles.has('Back') || muscles.has('Biceps')) return 'Pull Day';
    if (muscles.has('Legs') || muscles.has('Glutes')) return 'Leg Day';
    if (muscles.has('Shoulders')) return 'Shoulder Day';
    if (muscles.has('Core') || muscles.has('Cardio')) return 'Cardio Day';
    return 'My Plan';
  };
  const defaultTitle = inferPlanName(exercises);

  // Mark unsaved whenever plan content changes, unless we're adding a workout-only exercise
  useEffect(() => {
    if (skipDirtyRef.current) { skipDirtyRef.current = false; return; }
    if (isSaved) setIsSaved(false);
  }, [exercises, title]); // eslint-disable-line react-hooks/exhaustive-deps

  // Exercises that count toward the saved plan (exclude session-only additions)
  const planExercises = exercises.filter((ex) => !workoutOnlyIds.has(ex.id));

  const handleSavePlan = async () => {
    if (!planExercises.length) { toast.error('Add at least one exercise'); return; }
    if (!user) { toast.error('Sign in to save plans'); return; }
    const planTitle = title.trim() || defaultTitle;
    setSaving(true);
    try {
      const saved = await saveTemplate(user.id, {
        templateId,
        title: planTitle,
        exercises: planExercises.map((ex, i) => ({
          name: ex.name,
          muscle_group: ex.muscleGroup,
          default_sets: ex.sets.length,
          default_reps: Math.max(1, Math.round(ex.sets.reduce((s, r) => s + r.reps, 0) / ex.sets.length)),
          default_weight: Math.round(ex.sets.reduce((s, r) => s + r.weight, 0) / ex.sets.length),
          exercise_db_id: ex.exercise_db_id ?? null,
          order_index: i,
        })),
      });
      if (saved && !templateId) setTemplateId(saved as string);
      setIsSaved(true);
      toast.success(templateId ? 'Plan updated!' : 'Plan saved to My Plans!');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  const openDial = (exId: string, setIdx: number, field: 'weight' | 'reps') => {
    setDialState({ exId, setIdx, field });
  };

  const handleDialConfirm = (value: number) => {
    if (!dialState) return;
    const { exId, setIdx, field } = dialState;
    setExercises((prev) =>
      prev.map((ex) =>
        ex.id !== exId ? ex : { ...ex, sets: ex.sets.map((s, idx) => (idx === setIdx ? { ...s, [field]: value } : s)) }
      )
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

    const newEx: PlannedExercise = {
      id: createId(),
      name: ex.name,
      muscleGroup: ex.muscleGroup,
      exercise_db_id: ex.exercise_db_id,
      sets,
    };

    // If this is an already-saved plan, ask what to do with the new exercise
    if (templateId && isSaved) {
      skipDirtyRef.current = true; // don't mark dirty yet — let user decide
      setExercises((prev) => [...prev, newEx]);
      setPendingActionExercise(newEx);
    } else {
      setExercises((prev) => [...prev, newEx]);
    }
  };

  const handleStart = async () => {
    if (!exercises.length) {
      toast.error('Add at least one exercise to your plan');
      return;
    }

    const planTitle = title.trim() || defaultTitle;
    setSaving(true);
    try {
      // Auto-save only if updating an existing saved plan
      if (user && templateId) {
        await saveTemplate(user.id, {
          templateId,
          title: planTitle,
          exercises: planExercises.map((ex, i) => ({
            name: ex.name,
            muscle_group: ex.muscleGroup,
            default_sets: ex.sets.length,
            default_reps: Math.max(1, Math.round(ex.sets.reduce((s, r) => s + r.reps, 0) / ex.sets.length)),
            default_weight: Math.round(ex.sets.reduce((s, r) => s + r.weight, 0) / ex.sets.length),
            exercise_db_id: ex.exercise_db_id ?? null,
            order_index: i,
          })),
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
      })) as ExerciseEntry['sets'],
    }));

    onStartPlan(workoutExercises, planTitle);
  };

  // Save button label & style
  const saveLabel = isSaved ? 'Saved' : templateId ? 'Update' : 'Save';
  const saveIcon = isSaved ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />;

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
          <div className="shrink-0 px-5 pt-3 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="w-10 h-1 bg-[var(--text-muted)] rounded-full mx-auto mb-4 opacity-40" />
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={defaultTitle}
                  className="text-[18px] font-bold bg-transparent focus:outline-none w-full truncate"
                  style={{ color: 'var(--text-primary)', caretColor: 'var(--accent)' }}
                />
                <p className="text-[11px] font-medium mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {exercises.length === 0
                    ? 'No exercises yet'
                    : `${exercises.length} exercise${exercises.length > 1 ? 's' : ''} · ${exercises.reduce((t, e) => t + e.sets.length, 0)} sets`}
                </p>
              </div>

              {/* Save / Update button */}
              <button
                type="button"
                onClick={handleSavePlan}
                disabled={saving || exercises.length === 0}
                title={saveLabel}
                className="flex items-center gap-1.5 h-9 px-3 shrink-0 rounded-xl active:scale-95 transition-all disabled:opacity-40"
                style={isSaved
                  ? { background: 'rgba(200,255,0,0.12)', border: '1px solid rgba(200,255,0,0.3)', color: 'var(--accent)' }
                  : { background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
              >
                {saveIcon}
                <span className="text-[12px] font-bold">{saveLabel}</span>
              </button>

              {/* Close */}
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl active:scale-95 transition-transform"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
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
                  className="flex flex-col items-center justify-center gap-3 text-center px-6"
                  style={{ minHeight: 220 }}
                >
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                  >
                    <Plus className="w-6 h-6" style={{ color: 'var(--accent)' }} />
                  </div>
                  <p className="text-[14px] font-semibold" style={{ color: 'var(--text-secondary)' }}>No exercises yet</p>
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
                      weightUnit="lbs"
                      isWorkoutOnly={workoutOnlyIds.has(ex.id)}
                      onChange={(updated) => setExercises((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))}
                      onRemove={() => {
                        setExercises((prev) => prev.filter((e) => e.id !== ex.id));
                        setWorkoutOnlyIds((prev: Set<string>) => { const s = new Set(prev); s.delete(ex.id); return s; });
                      }}
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
            {exercises.length > 0 && (
              <button
                type="button"
                onClick={handleStart}
                disabled={saving}
                className="w-full py-4 rounded-xl text-[14px] font-bold text-black flex items-center justify-center gap-2 transition-opacity"
                style={{ background: 'var(--accent)', opacity: saving ? 0.5 : 1 }}
              >
                {saving ? 'Saving…' : (
                  <>
                    <Check className="w-4 h-4" />
                    Start Workout
                    <span className="opacity-70 font-medium text-[12px]">
                      · {exercises.reduce((t, e) => t + e.sets.length, 0)} sets
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </motion.div>
      </div>

      {/* "Added exercise — what to do?" action popup */}
      <AnimatePresence>
        {pendingActionExercise && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="w-full max-w-[480px] rounded-t-[24px] p-5 pb-[max(28px,env(safe-area-inset-bottom))]"
              style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              {/* Drag handle */}
              <div className="w-9 h-1 rounded-full mx-auto mb-5 opacity-30" style={{ background: 'var(--text-muted)' }} />

              <p className="text-[13px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                Added to workout
              </p>
              <p className="text-[18px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                {pendingActionExercise.name}
              </p>
              <p className="text-[13px] mb-6" style={{ color: 'var(--text-muted)' }}>
                Update <strong style={{ color: 'var(--text-secondary)' }}>"{title || defaultTitle}"</strong> to include this exercise?
              </p>

              <div className="space-y-2">
                {/* Update plan */}
                <button
                  type="button"
                  onClick={() => {
                    setPendingActionExercise(null);
                    // Mark as dirty so user sees "Update" button
                    setIsSaved(false);
                    // Auto-save immediately
                    setTimeout(handleSavePlan, 50);
                  }}
                  className="w-full py-3.5 rounded-xl text-[14px] font-bold text-black active:scale-[0.98] transition-all"
                  style={{ background: 'var(--accent)' }}
                >
                  Update Plan
                </button>

                {/* This workout only */}
                <button
                  type="button"
                  onClick={() => {
                    // Mark exercise as session-only — plan stays saved
                    skipDirtyRef.current = false; // already consumed
                    setWorkoutOnlyIds((prev: Set<string>) => new Set([...prev, pendingActionExercise.id]));
                    setPendingActionExercise(null);
                    // isSaved stays true since we track it as workout-only
                    setIsSaved(true);
                  }}
                  className="w-full py-3.5 rounded-xl text-[14px] font-semibold active:scale-[0.98] transition-all"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                >
                  This Workout Only
                </button>

                {/* Cancel — remove the exercise */}
                <button
                  type="button"
                  onClick={() => {
                    setExercises((prev) => prev.filter((e) => e.id !== pendingActionExercise.id));
                    setPendingActionExercise(null);
                    setIsSaved(true);
                  }}
                  className="w-full py-3 text-[13px] font-semibold active:opacity-70 transition-opacity"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ExercisePicker */}
      {showPicker && (
        <ExercisePicker
          onSelect={handleAddExercise}
          onClose={() => setShowPicker(false)}
          recentExercises={[]}
          multiSelect
        />
      )}

      {/* Dial Picker */}
      {dialState && dialSet && (
        <DialPicker
          title={dialState.field === 'weight' ? 'Weight' : 'Reps'}
          fieldKind={dialState.field}
          inputType="weight_reps"
          initialValue={dialState.field === 'weight' ? dialSet.weight : dialSet.reps}
          weightUnit="lbs"
          onClose={() => setDialState(null)}
          onConfirm={handleDialConfirm}
        />
      )}
    </>
  );
};
