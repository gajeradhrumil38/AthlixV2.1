import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Play, Pause, ChevronLeft, ChevronRight, Clock, Activity, Trash2, Plus, X } from 'lucide-react';
import { WorkoutState, ExerciseEntry, Set } from '../../pages/Log';
import { ExerciseTabBar } from './ExerciseTabBar';
import { ExerciseContent } from './ExerciseContent';
import { RestTimer } from './RestTimer';
import { ExercisePicker } from './ExercisePicker';
import { WeightRepsModal } from './WeightRepsModal';

interface ActiveWorkoutProps {
  workout: WorkoutState;
  setWorkout: React.Dispatch<React.SetStateAction<WorkoutState | null>>;
  onFinish: () => void;
  allowLiveAddExercise?: boolean;
  openExercisePickerOnStart?: boolean;
  weightUnit?: 'kg' | 'lbs';
}

const pad2 = (value: number) => value.toString().padStart(2, '0');

const toLocalDateTimeInput = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

const parseLocalDateTime = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const formatClockTime = (value?: string) => {
  const date = parseLocalDateTime(value);
  if (!date) return '--:--';
  const hours = date.getHours();
  const displayHour = hours % 12 || 12;
  const period = hours >= 12 ? 'PM' : 'AM';
  return `${displayHour}:${pad2(date.getMinutes())} ${period}`;
};

const HOURS_12 = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);
const TIME_POPOVER_WIDTH = 344;
const TIME_ROW_HEIGHT = 48;
const TIME_WHEEL_HEIGHT = 176;
const TIME_WHEEL_PADDING = (TIME_WHEEL_HEIGHT - TIME_ROW_HEIGHT) / 2;

interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const triggerHaptic = (pattern: number | number[] = 8) => {
  if (!navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Ignore unsupported vibration behavior.
  }
};

export const ActiveWorkout: React.FC<ActiveWorkoutProps> = ({
  workout,
  setWorkout,
  onFinish,
  allowLiveAddExercise = true,
  openExercisePickerOnStart = false,
  weightUnit = 'kg',
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [activeRestTimer, setActiveRestTimer] = useState<{ duration: number; exerciseName: string } | null>(null);
  const [weightRepsModal, setWeightRepsModal] = useState<{ 
    setId: string; 
    field: 'weight' | 'reps'; 
    currentValue: number;
    exerciseName: string;
    setNumber: number;
  } | null>(null);
  const [timeEditorField, setTimeEditorField] = useState<'startAt' | 'endAt' | null>(null);
  const [timeEditorHour, setTimeEditorHour] = useState(12);
  const [timeEditorMinute, setTimeEditorMinute] = useState(0);
  const [timeEditorPeriod, setTimeEditorPeriod] = useState<'AM' | 'PM'>('AM');
  const autoOpenedPickerForStartRef = useRef<number | null>(null);
  const hourWheelRef = useRef<HTMLDivElement | null>(null);
  const minuteWheelRef = useRef<HTMLDivElement | null>(null);
  const timeEditorAnchorEl = useRef<HTMLButtonElement | null>(null);
  const [timeEditorAnchorRect, setTimeEditorAnchorRect] = useState<AnchorRect | null>(null);

  const createSetId = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  // Timer logic
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setWorkout(prev => {
        if (!prev) return null;
        const nextElapsedSeconds = prev.elapsedSeconds + 1;
        const startDate = parseLocalDateTime(prev.startAt) || new Date(prev.startTime);
        const nextEndDate = new Date(startDate.getTime() + nextElapsedSeconds * 1000);
        return {
          ...prev,
          elapsedSeconds: nextElapsedSeconds,
          endAt: toLocalDateTimeInput(nextEndDate),
        };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPaused, setWorkout]);

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentExercise = workout.exercises[activeIndex];
  const hasExercises = workout.exercises.length > 0;

  const updateTimeEditorAnchor = useCallback(() => {
    if (!timeEditorAnchorEl.current) return;
    const rect = timeEditorAnchorEl.current.getBoundingClientRect();
    setTimeEditorAnchorRect({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
  }, []);

  const scrollHourWheelTo = useCallback((hour: number, behavior: ScrollBehavior = 'smooth') => {
    if (!hourWheelRef.current) return;
    const index = Math.max(0, Math.min(HOURS_12.length - 1, hour - 1));
    hourWheelRef.current.scrollTo({ top: index * TIME_ROW_HEIGHT, behavior });
  }, []);

  const scrollMinuteWheelTo = useCallback((minute: number, behavior: ScrollBehavior = 'smooth') => {
    if (!minuteWheelRef.current) return;
    const index = Math.max(0, Math.min(MINUTES.length - 1, minute));
    minuteWheelRef.current.scrollTo({ top: index * TIME_ROW_HEIGHT, behavior });
  }, []);

  const selectTimeEditorHour = useCallback((hour: number, behavior: ScrollBehavior = 'smooth') => {
    setTimeEditorHour((prev) => {
      if (prev !== hour) triggerHaptic(6);
      return hour;
    });
    scrollHourWheelTo(hour, behavior);
  }, [scrollHourWheelTo]);

  const selectTimeEditorMinute = useCallback((minute: number, behavior: ScrollBehavior = 'smooth') => {
    setTimeEditorMinute((prev) => {
      if (prev !== minute) triggerHaptic(6);
      return minute;
    });
    scrollMinuteWheelTo(minute, behavior);
  }, [scrollMinuteWheelTo]);

  useEffect(() => {
    if (!openExercisePickerOnStart) return;
    if (workout.exercises.length > 0) return;
    if (autoOpenedPickerForStartRef.current === workout.startTime) return;
    autoOpenedPickerForStartRef.current = workout.startTime;
    setShowExercisePicker(true);
  }, [openExercisePickerOnStart, workout.exercises.length, workout.startTime]);

  useEffect(() => {
    if (workout.exercises.length > 0 && activeIndex > workout.exercises.length - 1) {
      setActiveIndex(workout.exercises.length - 1);
    }
  }, [activeIndex, workout.exercises.length]);

  const handleUpdateSet = (setId: string, field: 'weight' | 'reps', value: number) => {
    setWorkout(prev => {
      if (!prev) return null;
      return {
        ...prev,
        exercises: prev.exercises.map(ex => ({
          ...ex,
          sets: ex.sets.map(s => s.id === setId ? { ...s, [field]: value } : s)
        }))
      };
    });
  };

  const handleMarkSetDone = (setId: string) => {
    const ex = workout.exercises.find(e => e.sets.some(s => s.id === setId));
    if (!ex) return;
    
    const set = ex.sets.find(s => s.id === setId);
    if (!set) return;

    const isMarkingDone = !set.done;

    setWorkout(prev => {
      if (!prev) return null;
      return {
        ...prev,
        exercises: prev.exercises.map(e => e.id === ex.id ? {
          ...e,
          sets: e.sets.map(s => s.id === setId ? { ...s, done: isMarkingDone } : s)
        } : e)
      };
    });

    if (isMarkingDone) {
      setActiveRestTimer({ duration: 90, exerciseName: ex.name });
      triggerHaptic([10, 30, 10]);
    }
  };

  const handleAddSet = () => {
    setWorkout(prev => {
      if (!prev) return null;
      const newSet: Set = {
        id: createSetId(),
        weight: 0,
        reps: 0,
        done: false
      };
      const newExercises = prev.exercises.map((exercise, index) =>
        index === activeIndex
          ? { ...exercise, sets: [...exercise.sets, newSet] }
          : exercise
      );
      return { ...prev, exercises: newExercises };
    });
  };

  const handleCopyLastSet = () => {
    setWorkout(prev => {
      if (!prev) return null;
      const targetExercise = prev.exercises[activeIndex];
      if (!targetExercise) return prev;
      const lastSet = targetExercise.sets[targetExercise.sets.length - 1];
      const copiedSet: Set = {
        id: createSetId(),
        weight: lastSet?.weight ?? 0,
        reps: lastSet?.reps ?? 0,
        done: false,
      };
      const newExercises = prev.exercises.map((exercise, index) =>
        index === activeIndex
          ? { ...exercise, sets: [...exercise.sets, copiedSet] }
          : exercise
      );
      return { ...prev, exercises: newExercises };
    });
  };

  const handleAddExercise = (ex: any) => {
    const existingIndex = workout.exercises.findIndex(
      (entry) => entry.name.toLowerCase() === ex.name.toLowerCase(),
    );

    if (existingIndex !== -1) {
      setActiveIndex(existingIndex);
      setShowExercisePicker(false);
      return;
    }

    const newEntry: ExerciseEntry = {
      id: createSetId(),
      name: ex.name,
      muscleGroup: ex.muscleGroup,
      exercise_db_id: ex.exercise_db_id,
      sets: [
        { id: createSetId(), weight: ex.lastSession?.weight || 0, reps: ex.lastSession?.reps || 0, done: false },
      ],
      lastSession: ex.lastSession
    };
    setWorkout(prev => {
      if (!prev) return null;
      return { ...prev, exercises: [...prev.exercises, newEntry] };
    });
    setActiveIndex(workout.exercises.length);
    setShowExercisePicker(false);
  };

  const handleDeleteExercise = () => {
    if (window.confirm('Remove this exercise?')) {
      setWorkout(prev => {
        if (!prev) return null;
        const newEx = prev.exercises.filter((_, i) => i !== activeIndex);
        return { ...prev, exercises: newEx };
      });
      setActiveIndex(Math.max(0, activeIndex - 1));
    }
  };

  const handleAddMinute = () => {
    setWorkout((prev) => {
      if (!prev) return null;
      const nextElapsedSeconds = prev.elapsedSeconds + 60;
      const startDate = parseLocalDateTime(prev.startAt) || new Date(prev.startTime);
      const nextEndDate = new Date(startDate.getTime() + nextElapsedSeconds * 1000);
      return {
        ...prev,
        elapsedSeconds: nextElapsedSeconds,
        endAt: toLocalDateTimeInput(nextEndDate),
      };
    });
    triggerHaptic(8);
  };

  const closeTimeEditor = useCallback(() => {
    setTimeEditorField(null);
    setTimeEditorAnchorRect(null);
    timeEditorAnchorEl.current = null;
  }, []);

  const openTimeEditor = (field: 'startAt' | 'endAt', anchor: HTMLButtonElement) => {
    const currentDate =
      parseLocalDateTime(workout[field]) ||
      parseLocalDateTime(workout.startAt) ||
      new Date();
    const rect = anchor.getBoundingClientRect();
    timeEditorAnchorEl.current = anchor;
    setTimeEditorAnchorRect({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
    setTimeEditorField(field);
    setTimeEditorHour(currentDate.getHours() % 12 || 12);
    setTimeEditorMinute(currentDate.getMinutes());
    setTimeEditorPeriod(currentDate.getHours() >= 12 ? 'PM' : 'AM');
    triggerHaptic(8);
  };

  const applyTimeEditor = () => {
    if (!timeEditorField) {
      closeTimeEditor();
      return;
    }

    setWorkout((prev) => {
      if (!prev) return null;

      let nextStartAt = prev.startAt;
      let nextEndAt = prev.endAt;
      const baseStartDate = parseLocalDateTime(prev.startAt) || new Date(prev.startTime);
      const baseEndDate = parseLocalDateTime(prev.endAt) || baseStartDate;
      const editedDate = new Date(timeEditorField === 'startAt' ? baseStartDate : baseEndDate);
      const normalizedHour = timeEditorHour % 12;
      const hours24 = timeEditorPeriod === 'PM' ? normalizedHour + 12 : normalizedHour;
      editedDate.setHours(hours24, timeEditorMinute, 0, 0);

      if (timeEditorField === 'startAt') nextStartAt = toLocalDateTimeInput(editedDate);
      if (timeEditorField === 'endAt') nextEndAt = toLocalDateTimeInput(editedDate);

      const startDate = parseLocalDateTime(nextStartAt) || new Date(prev.startTime);
      let endDate = parseLocalDateTime(nextEndAt) || startDate;
      if (endDate.getTime() < startDate.getTime()) endDate = startDate;

      return {
        ...prev,
        startAt: toLocalDateTimeInput(startDate),
        endAt: toLocalDateTimeInput(endDate),
        elapsedSeconds: Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 1000)),
      };
    });

    triggerHaptic([10, 20, 10]);
    closeTimeEditor();
  };

  const timeEditorPosition = useMemo(() => {
    if (!timeEditorField || !timeEditorAnchorRect || typeof window === 'undefined') return null;

    const viewportPadding = 12;
    const popoverWidth = Math.min(TIME_POPOVER_WIDTH, window.innerWidth - viewportPadding * 2);
    const left = Math.min(
      Math.max(timeEditorAnchorRect.left + timeEditorAnchorRect.width / 2 - popoverWidth / 2, viewportPadding),
      window.innerWidth - popoverWidth - viewportPadding,
    );
    const estimatedHeight = 356;
    const gap = 10;
    const spaceBelow = window.innerHeight - (timeEditorAnchorRect.top + timeEditorAnchorRect.height);
    const renderBelow = spaceBelow >= estimatedHeight + gap || timeEditorAnchorRect.top < estimatedHeight;
    const top = renderBelow
      ? Math.min(timeEditorAnchorRect.top + timeEditorAnchorRect.height + gap, window.innerHeight - estimatedHeight - viewportPadding)
      : Math.max(viewportPadding, timeEditorAnchorRect.top - estimatedHeight - gap);

    return {
      top,
      left,
      width: popoverWidth,
      renderBelow,
      arrowLeft: timeEditorAnchorRect.left + timeEditorAnchorRect.width / 2 - left,
    };
  }, [timeEditorAnchorRect, timeEditorField]);

  useEffect(() => {
    if (!timeEditorField) return;
    scrollHourWheelTo(timeEditorHour, 'auto');
    scrollMinuteWheelTo(timeEditorMinute, 'auto');
  }, [timeEditorField, scrollHourWheelTo, scrollMinuteWheelTo]);

  useEffect(() => {
    if (!timeEditorField) return;
    const syncAnchor = () => updateTimeEditorAnchor();
    syncAnchor();
    window.addEventListener('resize', syncAnchor);
    window.addEventListener('scroll', syncAnchor, true);
    return () => {
      window.removeEventListener('resize', syncAnchor);
      window.removeEventListener('scroll', syncAnchor, true);
    };
  }, [timeEditorField, updateTimeEditorAnchor]);

  useEffect(() => {
    closeTimeEditor();
  }, [activeIndex, closeTimeEditor]);

  return (
    <div className="fixed inset-0 z-40 bg-[#0D1117] flex flex-col overflow-hidden">
      {/* Sticky Header */}
      <div className="h-[72px] flex items-center justify-between px-4 bg-[#0D1117] border-b border-[#1E2F42]">
        <div className="flex flex-col">
          <h1 className="text-[14px] font-black text-[#E2E8F0] tracking-tight leading-none mb-1 uppercase">{workout.title}</h1>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-[#00D4FF]" />
              <span className="text-[11px] font-bold text-[#00D4FF] tabular-nums">{formatTime(workout.elapsedSeconds)}</span>
            </div>
            <button
              onClick={() => setIsPaused(!isPaused)}
              className="h-6 px-2 rounded-md border border-[#1E2F42] text-[#00D4FF] bg-[#141C28] hover:bg-[#1A2538] transition-colors"
            >
              {isPaused ? <Play className="w-3 h-3 fill-current" /> : <Pause className="w-3 h-3 fill-current" />}
            </button>
            <button
              onClick={handleAddMinute}
              className="h-6 px-2 rounded-md border border-white/20 text-[#E2E8F0] bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-1 text-[10px] font-bold"
            >
              <Plus className="w-3 h-3" />
              1m
            </button>
          </div>
        </div>
        <button 
          onClick={onFinish}
          className="h-8 px-4 bg-[#00D4FF] text-black text-[11px] font-black rounded-full uppercase tracking-wider active:scale-95 transition-transform"
        >
          Finish
        </button>
      </div>

      {/* Exercise Tab Bar */}
      <ExerciseTabBar 
        exercises={workout.exercises}
        activeIndex={activeIndex}
        onTabClick={setActiveIndex}
        onAddExercise={() => setShowExercisePicker(true)}
        showAddButton={allowLiveAddExercise}
      />

      {/* Main Content */}
      <AnimatePresence mode="wait" initial={false}>
      {currentExercise ? (
        <motion.div
          key={currentExercise.id}
          className="flex-1 min-h-0"
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          <ExerciseContent 
            exercise={currentExercise}
            weightUnit={weightUnit}
            onUpdateSet={handleUpdateSet}
            onMarkSetDone={handleMarkSetDone}
            onAddSet={handleAddSet}
            onCopyLastSet={handleCopyLastSet}
            startTimeLabel={formatClockTime(workout.startAt)}
            endTimeLabel={formatClockTime(workout.endAt)}
            editingTimeField={timeEditorField}
            onEditStartTime={(anchor) => openTimeEditor('startAt', anchor)}
            onEditEndTime={(anchor) => openTimeEditor('endAt', anchor)}
            onOpenModal={(setId, field, currentValue) => {
              const setIndex = currentExercise.sets.findIndex(s => s.id === setId);
              setWeightRepsModal({ 
                setId, 
                field, 
                currentValue, 
                exerciseName: currentExercise.name,
                setNumber: setIndex + 1
              });
            }}
            onSwipeLeft={() => activeIndex < workout.exercises.length - 1 && setActiveIndex(activeIndex + 1)}
            onSwipeRight={() => activeIndex > 0 && setActiveIndex(activeIndex - 1)}
          />
        </motion.div>
      ) : (
        <motion.div
          key="empty-workout"
          className="flex-1 flex flex-col items-center justify-center p-8 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
        >
          <Activity className="w-12 h-12 text-[#1E2F42] mb-4" />
          <h3 className="text-[16px] font-black text-[#8892A4] mb-2">NO EXERCISES YET</h3>
          <p className="text-[12px] text-[#3A5060] mb-6">Add your first exercise to start tracking your progress.</p>
          <button 
            onClick={() => setShowExercisePicker(true)}
            className="h-11 px-8 bg-[#141C28] border border-[#1E2F42] text-[#00D4FF] text-[12px] font-black rounded-xl uppercase tracking-widest active:scale-95 transition-transform"
          >
            + Add Exercise
          </button>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Bottom Action Bar */}
      <div className="h-[48px] bg-[#0D1117] border-t border-[#1E2F42] flex items-center justify-between px-4">
        <button 
          onClick={handleDeleteExercise}
          className="p-2 text-[#3A5060] hover:text-[#EF4444] transition-colors"
          disabled={!currentExercise}
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => hasExercises && activeIndex > 0 && setActiveIndex(activeIndex - 1)}
            disabled={!hasExercises || activeIndex === 0}
            className={`p-2 transition-colors ${
              !hasExercises || activeIndex === 0 ? 'text-[#1E2F42]' : 'text-[#8892A4] hover:text-white'
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-[10px] font-bold text-[#3A5060] uppercase tracking-widest">
            {hasExercises ? activeIndex + 1 : 0} / {workout.exercises.length}
          </span>
          <button 
            onClick={() => hasExercises && activeIndex < workout.exercises.length - 1 && setActiveIndex(activeIndex + 1)}
            disabled={!hasExercises || activeIndex >= workout.exercises.length - 1}
            className={`p-2 transition-colors ${
              !hasExercises || activeIndex >= workout.exercises.length - 1
                ? 'text-[#1E2F42]'
                : 'text-[#8892A4] hover:text-white'
            }`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <div className="w-8" /> {/* Spacer */}
      </div>

      {/* Overlays */}
      <AnimatePresence>
        {activeRestTimer && (
          <RestTimer 
            duration={activeRestTimer.duration}
            exerciseName={activeRestTimer.exerciseName}
            onComplete={() => setActiveRestTimer(null)}
            onSkip={() => setActiveRestTimer(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showExercisePicker && (
          <ExercisePicker 
            onSelect={handleAddExercise}
            onClose={() => setShowExercisePicker(false)}
            recentExercises={[]} // In a real app, pass recent exercises
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {weightRepsModal && (
          <WeightRepsModal 
            onClose={() => setWeightRepsModal(null)}
            onConfirm={(val) => {
              handleUpdateSet(weightRepsModal.setId, weightRepsModal.field, val);
              setWeightRepsModal(null);
            }}
            initialValue={weightRepsModal.currentValue}
            field={weightRepsModal.field}
            exerciseName={weightRepsModal.exerciseName}
            setNumber={weightRepsModal.setNumber}
            weightUnit={weightUnit}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {timeEditorField && timeEditorPosition && (
          <div className="fixed inset-0 z-[180]" onClick={closeTimeEditor}>
            <motion.div
              className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
            />
            <motion.div
              onClick={(event) => event.stopPropagation()}
              className="absolute rounded-2xl border border-[#24435F] bg-[#101822]/98 shadow-[0_20px_60px_rgba(0,0,0,0.45)] overflow-hidden"
              style={{
                top: timeEditorPosition.top,
                left: timeEditorPosition.left,
                width: timeEditorPosition.width,
                transformOrigin: `${Math.max(24, Math.min(timeEditorPosition.width - 24, timeEditorPosition.arrowLeft))}px ${
                  timeEditorPosition.renderBelow ? 'top' : 'bottom'
                }`,
              }}
              initial={{
                opacity: 0,
                scale: 0.96,
                y: timeEditorPosition.renderBelow ? -8 : 8,
              }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{
                opacity: 0,
                scale: 0.98,
                y: timeEditorPosition.renderBelow ? -6 : 6,
              }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <div
                className="absolute h-3 w-3 rotate-45 border-[#24435F] bg-[#101822]"
                style={{
                  left: Math.max(18, Math.min(timeEditorPosition.width - 18, timeEditorPosition.arrowLeft)) - 6,
                  top: timeEditorPosition.renderBelow ? -6 : undefined,
                  bottom: timeEditorPosition.renderBelow ? undefined : -6,
                  borderStyle: 'solid',
                  borderLeftWidth: timeEditorPosition.renderBelow ? 1 : 0,
                  borderTopWidth: timeEditorPosition.renderBelow ? 1 : 0,
                  borderRightWidth: timeEditorPosition.renderBelow ? 0 : 1,
                  borderBottomWidth: timeEditorPosition.renderBelow ? 0 : 1,
                }}
              />

              <div className="px-3 pt-3 pb-2 border-b border-white/5 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#6F8498]">
                    {timeEditorField === 'startAt' ? 'Workout Start' : 'Workout End'}
                  </span>
                  <span className="text-[16px] font-black text-white tabular-nums">
                    {timeEditorHour}:{pad2(timeEditorMinute)} {timeEditorPeriod}
                  </span>
                </div>
                <button
                  onClick={closeTimeEditor}
                  className="h-8 w-8 rounded-full border border-white/10 bg-white/5 text-[#A7B7C6] flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-3 pt-3">
                <div className="rounded-xl border border-white/8 bg-[#141C28] p-1 grid grid-cols-2 gap-1 mb-3">
                  {(['AM', 'PM'] as const).map((period) => (
                    <button
                      key={period}
                      onClick={() => {
                        setTimeEditorPeriod(period);
                        triggerHaptic(6);
                      }}
                      className={`h-9 rounded-lg text-[11px] font-black uppercase tracking-[0.18em] transition-all ${
                        timeEditorPeriod === period
                          ? 'bg-[#00D4FF] text-black shadow-[0_0_16px_rgba(0,212,255,0.18)]'
                          : 'bg-transparent text-[#94A4B6]'
                      }`}
                    >
                      {period}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 px-3 pb-3">
                <div className="relative">
                  <div className="text-[10px] text-[#8892A4] font-bold uppercase tracking-wider mb-1 text-center">Hour</div>
                  <div
                    ref={hourWheelRef}
                    onScroll={(event) => {
                      const index = Math.max(
                        0,
                        Math.min(HOURS_12.length - 1, Math.round(event.currentTarget.scrollTop / TIME_ROW_HEIGHT)),
                      );
                      const nextHour = HOURS_12[index];
                      setTimeEditorHour((prev) => {
                        if (prev !== nextHour) triggerHaptic(4);
                        return nextHour;
                      });
                    }}
                    className="h-44 overflow-y-auto no-scrollbar rounded-xl border border-[#1E2F42] bg-[#141C28] scroll-smooth snap-y snap-mandatory overscroll-contain"
                    style={{ paddingTop: TIME_WHEEL_PADDING, paddingBottom: TIME_WHEEL_PADDING }}
                  >
                    {HOURS_12.map((hour) => (
                      <button
                        key={hour}
                        onClick={() => selectTimeEditorHour(hour)}
                        className={`w-full h-12 flex items-center justify-center text-center text-[22px] leading-none font-black tabular-nums transition-colors snap-center ${
                          timeEditorHour === hour ? 'text-transparent' : 'text-[#7E90A6]'
                        }`}
                      >
                        {hour}
                      </button>
                    ))}
                  </div>
                  <div className="pointer-events-none absolute left-2 right-2 top-1/2 -translate-y-1/2 h-12 border border-[#00D4FF]/32 bg-[#00D4FF]/8 rounded-xl shadow-[0_0_18px_rgba(0,212,255,0.10)] flex items-center justify-center z-10">
                    <span className="text-white text-[22px] leading-none font-black tabular-nums">{timeEditorHour}</span>
                  </div>
                </div>
                <div className="relative">
                  <div className="text-[10px] text-[#8892A4] font-bold uppercase tracking-wider mb-1 text-center">Minute</div>
                  <div
                    ref={minuteWheelRef}
                    onScroll={(event) => {
                      const index = Math.max(
                        0,
                        Math.min(MINUTES.length - 1, Math.round(event.currentTarget.scrollTop / TIME_ROW_HEIGHT)),
                      );
                      const nextMinute = MINUTES[index];
                      setTimeEditorMinute((prev) => {
                        if (prev !== nextMinute) triggerHaptic(4);
                        return nextMinute;
                      });
                    }}
                    className="h-44 overflow-y-auto no-scrollbar rounded-xl border border-[#1E2F42] bg-[#141C28] scroll-smooth snap-y snap-mandatory overscroll-contain"
                    style={{ paddingTop: TIME_WHEEL_PADDING, paddingBottom: TIME_WHEEL_PADDING }}
                  >
                    {MINUTES.map((minute) => (
                      <button
                        key={minute}
                        onClick={() => selectTimeEditorMinute(minute)}
                        className={`w-full h-12 flex items-center justify-center text-center text-[22px] leading-none font-black tabular-nums transition-colors snap-center ${
                          timeEditorMinute === minute ? 'text-transparent' : 'text-[#7E90A6]'
                        }`}
                      >
                        {pad2(minute)}
                      </button>
                    ))}
                  </div>
                  <div className="pointer-events-none absolute left-2 right-2 top-1/2 -translate-y-1/2 h-12 border border-[#00D4FF]/32 bg-[#00D4FF]/8 rounded-xl shadow-[0_0_18px_rgba(0,212,255,0.10)] flex items-center justify-center z-10">
                    <span className="text-white text-[22px] leading-none font-black tabular-nums">{pad2(timeEditorMinute)}</span>
                  </div>
                </div>
              </div>

              <div className="px-3 pb-3 pt-1 grid grid-cols-2 gap-2">
                <button
                  onClick={closeTimeEditor}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 text-[#A7B7C6] text-[11px] font-bold uppercase tracking-[0.14em]"
                >
                  Cancel
                </button>
                <button
                  onClick={applyTimeEditor}
                  className="h-10 rounded-xl bg-[#00D4FF] text-black text-[11px] font-black uppercase tracking-[0.14em] shadow-[0_0_20px_rgba(0,212,255,0.22)]"
                >
                  Apply
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
