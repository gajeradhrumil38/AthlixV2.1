import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Check, Copy, BookmarkCheck, Bookmark } from 'lucide-react';
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
};
const muscleColor = (mg: string) => MUSCLE_COLORS[mg] ?? 'var(--text-muted)';

const createId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/* ── Value box — identical style to ActiveWorkout SetRow ── */
const ValueBox: React.FC<{
  label: string;
  value: number;
  onTap: () => void;
}> = ({ label, value, onTap }) => (
  <button
    type="button"
    onClick={onTap}
    className="relative flex h-[82px] w-full flex-col items-center justify-center gap-[3px] overflow-hidden rounded-xl border text-center transition-all active:scale-[0.97]"
    style={{ background: 'var(--bg-base)', borderColor: 'var(--border)' }}
  >
    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
    <div className="font-victory tabular-nums text-[36px] leading-none font-black text-[var(--text-primary)]">
      {value}
    </div>
    <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-[var(--text-secondary)]">
      {label}
    </div>
  </button>
);

/* ── Subtle separator between sets with copy / remove actions ── */
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

/* ── One set row — matches ActiveWorkout SetRow layout ── */
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
    {/* Left accent bar */}
    <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: 'var(--border)' }} />

    {/* Header */}
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

    {/* Value boxes */}
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
  onChange: (updated: PlannedExercise) => void;
  onRemove: () => void;
  onOpenDial: (setIdx: number, field: 'weight' | 'reps') => void;
}> = ({ ex, weightUnit, onChange, onRemove, onOpenDial }) => {
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
      {/* Exercise header */}
      <div className="flex items-start justify-between px-4 pt-5 pb-4">
        <div>
          <h3 className="text-[20px] font-bold text-[var(--text-primary)] leading-tight">{ex.name}</h3>
          <p className="text-[10px] font-bold uppercase tracking-[1.6px] mt-0.5" style={{ color }}>
            {ex.muscleGroup}
          </p>
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

      {/* Set rows with separators between them */}
      <div className="flex flex-col gap-2 pb-2">
        {ex.sets.map((s, i) => (
          <React.Fragment key={i}>
            <PlanSetRow
              index={i + 1}
              set={s}
              weightUnit={weightUnit}
              onOpenDial={(field) => onOpenDial(i, field)}
            />
            <SetSeparator
              onCopy={() => copySet(i)}
              onRemove={() => setConfirmRemoveIdx(i)}
            />
          </React.Fragment>
        ))}
      </div>

      {/* Footer */}
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

      {/* Remove set confirmation */}
      {confirmRemoveIdx !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onClick={() => setConfirmRemoveIdx(null)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-[320px] rounded-2xl p-5"
            style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[15px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              Remove Set {confirmRemoveIdx + 1}?
            </p>
            <p className="text-[13px] mb-5" style={{ color: 'var(--text-muted)' }}>
              This action cannot be undone.
            </p>
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
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialState, setDialState] = useState<DialState | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(initialTemplate?.id ?? null);
  const [isSaved, setIsSaved] = useState(!!initialTemplate?.id);

  const defaultTitle = `Plan — ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;

  // Auto-open the picker only on first mount when there are no pre-loaded exercises
  useEffect(() => {
    if (!initialTemplate) setShowPicker(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark unsaved whenever plan content changes after a save
  useEffect(() => {
    if (isSaved) setIsSaved(false);
  }, [exercises, title]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSavePlan = async () => {
    if (!exercises.length) { toast.error('Add at least one exercise'); return; }
    if (!user) { toast.error('Sign in to save plans'); return; }
    const planTitle = title.trim() || defaultTitle;
    setSaving(true);
    try {
      const saved = await saveTemplate(user.id, {
        templateId,
        title: planTitle,
        exercises: exercises.map((ex, i) => ({
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
          templateId,
          title: planTitle,
          exercises: exercises.map((ex, i) => ({
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
            <div className="flex items-center gap-2">
              {/* Editable plan name — takes all remaining space */}
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

              {/* Save to My Plans */}
              <button
                type="button"
                onClick={handleSavePlan}
                disabled={saving || exercises.length === 0}
                title={isSaved ? 'Plan saved' : 'Save to My Plans'}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl active:scale-95 transition-all disabled:opacity-40"
                style={isSaved
                  ? { background: 'rgba(200,255,0,0.12)', border: '1px solid rgba(200,255,0,0.3)', color: 'var(--accent)' }
                  : { background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              >
                {isSaved
                  ? <BookmarkCheck className="w-4 h-4" />
                  : <Bookmark className="w-4 h-4" />}
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
                <motion.button
                  type="button"
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => setShowPicker(true)}
                  className="w-full flex flex-col items-center justify-center gap-4 text-center px-6 active:opacity-70 transition-opacity"
                  style={{ minHeight: 260 }}
                >
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                  >
                    <Plus className="w-7 h-7" style={{ color: 'var(--accent)' }} />
                  </div>
                  <div>
                    <p className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                      Add your first exercise
                    </p>
                    <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>
                      Tap here or use the button below
                    </p>
                  </div>
                </motion.button>
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

      {/* ExercisePicker — z-[300] in ExercisePicker itself, always above this sheet */}
      {showPicker && (
        <ExercisePicker
          onSelect={handleAddExercise}
          onClose={() => setShowPicker(false)}
          recentExercises={[]}
          multiSelect
        />
      )}

      {/* Dial Picker — z-[400] in DialPicker itself */}
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
