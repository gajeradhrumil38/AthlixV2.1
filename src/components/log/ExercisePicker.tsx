import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, X, Plus, History, LayoutGrid } from 'lucide-react';
import { MUSCLE_COLORS } from '../FitnessIcons';
import { useAuth } from '../../contexts/AuthContext';
import { getExerciseLibraryByGroup, getRecentExerciseOptions, searchExerciseLibrary } from '../../lib/supabaseData';
import { ExerciseImage } from '../shared/ExerciseImage';

interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  exercise_db_id?: string;
  lastSession?: {
    weight: number;
    reps: number;
    date: string;
  };
}

interface ExercisePickerProps {
  onSelect: (exercise: Exercise) => void;
  onClose: () => void;
  recentExercises: Exercise[];
}

const MUSCLE_GROUPS = [
  { name: 'Chest', color: MUSCLE_COLORS.Chest, previewExerciseId: 'ot_benchpress' },
  { name: 'Back', color: MUSCLE_COLORS.Back, previewExerciseId: 'ot_tbarrow' },
  { name: 'Shoulders', color: MUSCLE_COLORS.Shoulders, previewExerciseId: 'ot_arnoldpress' },
  { name: 'Biceps', color: MUSCLE_COLORS.Biceps, previewExerciseId: 'ot_bicepscurl' },
  { name: 'Triceps', color: MUSCLE_COLORS.Triceps, previewExerciseId: 'ot_tricepskickback' },
  { name: 'Legs', color: MUSCLE_COLORS.Legs, previewExerciseId: 'ot_legpressx' },
  { name: 'Core', color: MUSCLE_COLORS.Core, previewExerciseId: 'ot_crunches' },
  { name: 'Cardio', color: MUSCLE_COLORS.Cardio, previewExerciseId: '' },
];

export const ExercisePicker: React.FC<ExercisePickerProps> = ({ onSelect, onClose, recentExercises }) => {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'recent' | 'muscle' | 'search'>('recent');
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [libraryExercises, setLibraryExercises] = useState<Exercise[]>([]);
  const [recentLibraryExercises, setRecentLibraryExercises] = useState<Exercise[]>([]);

  useEffect(() => {
    const loadRecent = async () => {
      if (!user) return;
      const recent = await getRecentExerciseOptions(user.id);
      setRecentLibraryExercises(
        recent.map((exercise, index) => ({
          id: `${exercise.name}-${index}`,
          name: exercise.name,
          muscleGroup: exercise.muscleGroup,
          exercise_db_id: exercise.exercise_db_id || undefined,
          lastSession: exercise.lastSession
            ? {
                weight: exercise.lastSession.weight,
                reps: exercise.lastSession.reps,
                date: exercise.lastSession.date,
              }
            : undefined,
        })),
      );
    }
    loadRecent();
  }, [user]);

  useEffect(() => {
    const loadList = async () => {
      if (!user) return;

      if (search.trim()) {
        const results = await searchExerciseLibrary(user.id, search);
        setLibraryExercises(
          results.map((exercise) => ({
            id: exercise.id,
            name: exercise.name,
            muscleGroup: exercise.muscle_group,
            exercise_db_id: exercise.exercise_db_id || undefined,
          })),
        );
        return;
      }

      if (selectedMuscle) {
        const results = await getExerciseLibraryByGroup(user.id, selectedMuscle);
        setLibraryExercises(
          results.map((exercise) => ({
            id: exercise.id,
            name: exercise.name,
            muscleGroup: exercise.muscle_group,
            exercise_db_id: exercise.exercise_db_id || undefined,
          })),
        );
        return;
      }

      setLibraryExercises([]);
    };

    loadList();
  }, [user, search, selectedMuscle]);

  const filteredExercises = useMemo(() => libraryExercises, [libraryExercises]);

  const handleSelect = (ex: Exercise) => {
    onSelect(ex);
    onClose();
  };

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-50 bg-[#0D1117] flex flex-col"
    >
      {/* Header */}
      <div className="h-[60px] flex items-center justify-between px-4 border-b border-[#1E2F42]">
        <h2 className="text-[16px] font-black text-[#E2E8F0] tracking-tight">ADD EXERCISE</h2>
        <button onClick={onClose} className="p-2 text-[#8892A4] hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Search Bar */}
      <div className="px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3A5060]" />
          <input 
            type="text"
            placeholder="Search exercises..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (e.target.value) setActiveTab('search');
            }}
            className="w-full h-11 bg-[#141C28] border border-[#1E2F42] rounded-xl pl-10 pr-4 text-[14px] text-white placeholder-[#3A5060] focus:outline-none focus:border-[#00D4FF]/50 transition-all"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-4 gap-2 mb-4">
        {[
          { id: 'recent', label: 'Recent', icon: History },
          { id: 'muscle', label: 'Muscle', icon: LayoutGrid },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as any);
              setSearch('');
              setSelectedMuscle(null);
            }}
            className={`flex-1 h-10 rounded-xl flex items-center justify-center gap-2 text-[11px] font-bold transition-all ${activeTab === tab.id ? 'bg-[#00D4FF]/15 text-[#00D4FF] border border-[#00D4FF]/40' : 'bg-[#141C28] text-[#8892A4] border border-[#1E2F42]'}`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto px-4 pb-8 no-scrollbar">
        {activeTab === 'recent' && !search && (
          <div className="space-y-2">
            {recentExercises.length > 0 ? recentExercises.map(ex => (
              <ExerciseRow key={ex.id} ex={ex} onSelect={handleSelect} />
            )) : recentLibraryExercises.length > 0 ? recentLibraryExercises.map(ex => (
              <ExerciseRow key={ex.id} ex={ex} onSelect={handleSelect} />
            )) : (
              <div className="text-center py-12 text-[#3A5060] text-[12px] font-medium">No recent exercises</div>
            )}
          </div>
        )}

        {activeTab === 'muscle' && !search && !selectedMuscle && (
          <div className="grid grid-cols-2 gap-3">
            {MUSCLE_GROUPS.map(m => (
              <button
                key={m.name}
                onClick={() => setSelectedMuscle(m.name)}
                className="h-24 bg-[#141C28] border border-[#1E2F42] rounded-3xl flex flex-col items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <ExerciseImage
                  exerciseId={m.previewExerciseId}
                  exerciseName={m.name}
                  muscleGroup={m.name}
                  size="sm"
                />
                <span className="text-[11px] font-black text-[#E2E8F0] uppercase tracking-wider">{m.name}</span>
              </button>
            ))}
          </div>
        )}

        {(selectedMuscle || activeTab === 'search') && (
          <div className="space-y-2">
            {selectedMuscle && (
              <button 
                onClick={() => setSelectedMuscle(null)}
                className="text-[10px] font-bold text-[#00D4FF] uppercase tracking-widest mb-2 flex items-center gap-1"
              >
                ← Back to Muscle Groups
              </button>
            )}
            {filteredExercises.map(ex => (
              <ExerciseRow key={ex.id} ex={ex} onSelect={handleSelect} />
            ))}
            {filteredExercises.length === 0 && (
              <div className="text-center py-12 text-[#3A5060] text-[12px] font-medium">No exercises found</div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

const ExerciseRow: React.FC<{ ex: Exercise, onSelect: (ex: Exercise) => void }> = ({ ex, onSelect }) => {
  return (
    <button 
      onClick={() => onSelect(ex)}
      className="w-full h-16 bg-[#141C28] border border-[#1E2F42] rounded-2xl p-3 flex items-center gap-3 active:scale-[0.98] transition-all text-left"
    >
      <ExerciseImage
        exerciseId={ex.exercise_db_id || ''}
        exerciseName={ex.name}
        muscleGroup={ex.muscleGroup}
        size="sm"
      />
      <div className="flex-1 flex flex-col">
        <span className="text-[13px] font-black text-[#E2E8F0] tracking-tight leading-tight">{ex.name}</span>
        <span className="text-[9px] font-bold text-[#3A5060] uppercase tracking-wider mt-0.5">{ex.muscleGroup}</span>
      </div>
      {ex.lastSession && (
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-black text-[#8892A4]">{ex.lastSession.weight}kg × {ex.lastSession.reps}</span>
          <span className="text-[8px] font-bold text-[#3A5060] uppercase tracking-widest">{ex.lastSession.date}</span>
        </div>
      )}
      <div className="w-9 h-9 rounded-2xl bg-[#00D4FF]/10 border border-[#00D4FF]/15 flex items-center justify-center text-[#00D4FF] ml-1 shadow-[0_0_16px_rgba(0,212,255,0.08)]">
        <Plus className="w-4 h-4" />
      </div>
    </button>
  );
};
