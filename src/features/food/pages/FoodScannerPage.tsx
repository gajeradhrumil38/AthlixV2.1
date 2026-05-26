import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { FoodScanner } from '../components/FoodScanner';
import { FoodResults } from '../components/FoodResults';
import type { DetectedFood, ScanState } from '../types';
import { calcTotals } from '../../../services/foodRecognition.service';
import { saveFoodScan } from '../../../lib/foodData';
import { useAuth } from '../../../contexts/AuthContext';

const INITIAL_STATE: ScanState = {
  step:                'idle',
  imageFile:           null,
  imagePreviewUrl:     null,
  uploadedImageUrl:    null,
  uploadedThumbUrl:    null,
  foods:               [],
  error:               null,
};

export const FoodScannerPage: React.FC = () => {
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const [state, setState] = useState<ScanState>(INITIAL_STATE);
  const [saving, setSaving] = useState(false);

  const handleScanComplete = (result: ScanState) => {
    setState(result);
  };

  const handleSave = async (foods: DetectedFood[]) => {
    if (!user) return;
    setSaving(true);
    try {
      const totals = calcTotals(foods);
      await saveFoodScan(user.id, {
        image_url:     state.uploadedImageUrl ?? undefined,
        thumbnail_url: state.uploadedThumbUrl  ?? undefined,
        foods_detected: foods,
        ...totals,
      });
      toast.success('Scan saved!');
      navigate('/food/history');
    } catch {
      toast.error('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleScanAgain = () => {
    if (state.imagePreviewUrl) URL.revokeObjectURL(state.imagePreviewUrl);
    setState(INITIAL_STATE);
  };

  const showResults = state.step === 'done';

  return (
    <div className="px-4 py-5 space-y-5 max-w-[480px] mx-auto">

      {/* Page header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] mb-1"
          style={{ color: 'rgba(255,255,255,0.3)' }}>Food Scanner</p>
        <h1 className="text-[22px] font-bold leading-tight" style={{ color: '#fff', letterSpacing: '-0.02em' }}>
          {showResults ? 'Scan Results' : 'Scan Your Meal'}
        </h1>
        {!showResults && (
          <p className="text-[13px] mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Point at food to instantly get calorie & macro data.
          </p>
        )}
      </div>

      <AnimatePresence mode="wait">
        {showResults ? (
          <motion.div key="results"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}>
            <FoodResults
              state={state}
              onSave={handleSave}
              onScanAgain={handleScanAgain}
              saving={saving}
            />
          </motion.div>
        ) : (
          <motion.div key="scanner"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}>
            <FoodScanner onScanComplete={handleScanComplete} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
