import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, ChevronRight, Check, BookmarkPlus } from 'lucide-react';
import { ExercisePicker } from './ExercisePicker';
import { useAuth } from '../../contexts/AuthContext';
import { saveTemplate } from '../../lib/supabaseData';
import type { ExerciseEntry, Set } from '../../legacy-pages/Log';
import toast from 'react-hot-toast';

interface PlannedExercise {
  id: string;
  name: string;
  muscleGroup: string;
  exercise_db_id?: string;
  sets: number;
  reps: number;
  weight: number;
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

const NumStepper: React.FC<{
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}> = ({ value, min = 1, max = 99, onChange }) => (
  <div className="flex items-center gap-1">
    <button
      type="button"
      onClick={() => onChange(Math.max(min, value - 1))}
      className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)]"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
    >
      <span className="text-[14px] font-bold leading-none">−</span>
    </button>
    <span className="w-7 text-center text-[13px] font-bold text-[var(--text-primary)] tabular-nums">{value}</span>
    <button
      type="button"
      onClick={() => onChange(Math.min(max, value + 1))}
      className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)]"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
    >
      <span className="text-[14px] font-bold leading-none">+</span>
    </button>
  </div>
);

export const PlanTodaySheet: React.FC<PlanTodaySheetProps> = ({ onClose, onStartPlan }) => {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [exercises, setExercises] = useState<PlannedExercise[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleAddExercise = (ex: { name: string; muscleGroup: string; exercise_db_id?: string }) => {
    const newEx: PlannedExercise = {
      id: createId(),
      name: ex.name,
      muscleGroup: ex.muscleGroup,
      exercise_db_id: ex.exercise_db_id,
      sets: 3,
      reps: 10,
      weight: 0,
    };
    setExercises((prev) => [...prev, newEx]);
    setExpandedId(newEx.id);
    setShowPicker(false);
  };

  const updateEx = (id: string, patch: Partial<PlannedExercise>) => {
    setExercises((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const removeEx = (id: string) => {
    setExercises((prev) => prev.filter((e) => e.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const handleStart = async () => {
    if (!exercises.length) {
      toast.error('Add at least one exercise to your plan');
      return;
    }

    const planTitle = title.trim() || `Plan — ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;

    setSaving(true);
    try {
      if (user) {
        await saveTemplate(user.id, {
          title: planTitle,
          exercises: exercises.map((ex, i) => ({
            name: ex.name,
            muscle_group: ex.muscleGroup,
            default_sets: ex.sets,
            default_reps: ex.reps,
            default_weight: ex.weight,
            exercise_db_id: ex.exercise_db_id ?? null,
            order_index: i,
          })),
        });
      }
    } catch {
      // Non-fatal — still start the workout even if template save fails
    } finally {
      setSaving(false);
    }

    const workoutExercises: ExerciseEntry[] = exercises.map((ex) => ({
      id: createId(),
      name: ex.name,
      muscleGroup: ex.muscleGroup,
      exercise_db_id: ex.exercise_db_id,
      sets: Array.from({ length: ex.sets }, () => ({
        id: createId(),
        weight: ex.weight || null,
        reps: ex.reps || null,
        done: false,
        planned_weight: ex.weight || null,
        planned_reps: ex.reps || null,
      })) as Set[],
    }));

    onStartPlan(workoutExercises, planTitle);
  };

  return (
    <>
      <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 backdrop-blur-sm">
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 26, stiffness: 220 }}
          className="w-full max-w-[480px] flex flex-col rounded-t-[24px] border-t border-[var(--border)]"
          style={{ background: 'var(--bg-surface)', height: '88%' }}
        >
          {/* Handle + header */}
          <div className="shrink-0 px-5 pt-3 pb-4 border-b border-[var(--border)]">
            <div className="w-10 h-1 bg-[var(--text-muted)] rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[16px] font-bold text-[var(--text-primary)]">Plan Today's Workout</h2>
              <button onClick={onClose} className="p-1.5 text-[var(--text-muted)] rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Plan — ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`}
              className="w-full px-3 py-2.5 rounded-xl text-[13px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            />
          </div>

          {/* Exercise list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {exercises.length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 text-center gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                  <BookmarkPlus className="w-5 h-5 text-[var(--text-muted)]" />
                </div>
                <p className="text-[13px] text-[var(--text-muted)]">Add exercises to build your plan</p>
              </div>
            )}

            {exercises.map((ex) => {
              const isOpen = expandedId === ex.id;
              const color = muscleColor(ex.muscleGroup);
              return (
                <div
                  key={ex.id}
                  className="rounded-2xl overflow-hidden"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                >
                  {/* Row header */}
                  <div className="flex items-center gap-3 px-3 py-3">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: color }}
                    />
                    <button
                      type="button"
                      className="flex-1 text-left min-w-0"
                      onClick={() => setExpandedId(isOpen ? null : ex.id)}
                    >
                      <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{ex.name}</p>
                      <p className="text-[10px] uppercase tracking-[0.08em] mt-0.5" style={{ color }}>
                        {ex.muscleGroup} · {ex.sets}×{ex.reps}{ex.weight > 0 ? ` @ ${ex.weight}kg` : ''}
                      </p>
                    </button>
                    <ChevronRight
                      className="w-4 h-4 shrink-0 transition-transform duration-200 text-[var(--text-muted)]"
                      style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                    />
                    <button
                      type="button"
                      onClick={() => removeEx(ex.id)}
                      className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ color: 'rgba(248,113,113,0.6)' }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Expanded controls */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div
                          className="px-4 pb-4 pt-1 grid grid-cols-3 gap-3 border-t"
                          style={{ borderColor: 'var(--border)' }}
                        >
                          <div className="flex flex-col items-center gap-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Sets</span>
                            <NumStepper value={ex.sets} onChange={(v) => updateEx(ex.id, { sets: v })} />
                          </div>
                          <div className="flex flex-col items-center gap-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Reps</span>
                            <NumStepper value={ex.reps} onChange={(v) => updateEx(ex.id, { reps: v })} />
                          </div>
                          <div className="flex flex-col items-center gap-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Weight</span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => updateEx(ex.id, { weight: Math.max(0, ex.weight - 5) })}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)]"
                                style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}
                              >
                                <span className="text-[14px] font-bold leading-none">−</span>
                              </button>
                              <span className="w-8 text-center text-[12px] font-bold text-[var(--text-primary)] tabular-nums">{ex.weight}</span>
                              <button
                                type="button"
                                onClick={() => updateEx(ex.id, { weight: ex.weight + 5 })}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)]"
                                style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}
                              >
                                <span className="text-[14px] font-bold leading-none">+</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          {/* Bottom actions */}
          <div className="shrink-0 px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 border-t border-[var(--border)] space-y-2" style={{ background: 'var(--bg-surface)' }}>
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
              className="w-full py-3.5 rounded-xl text-[14px] font-bold text-black flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
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

      {showPicker && (
        <ExercisePicker
          onSelect={handleAddExercise}
          onClose={() => setShowPicker(false)}
          recentExercises={[]}
        />
      )}
    </>
  );
};
