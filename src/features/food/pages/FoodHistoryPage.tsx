import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { FoodScan } from '../types';
import { FoodHistory } from '../components/FoodHistory';
import { FoodDetailModal } from '../components/FoodDetailModal';

export const FoodHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedScan, setSelectedScan] = useState<FoodScan | null>(null);
  const [scans, setScans] = useState<FoodScan[]>([]);   // lifted for update/delete

  const handleDeleted = (id: string) => {
    setScans((prev) => prev.filter((s) => s.id !== id));
    setSelectedScan(null);
  };

  const handleUpdated = (updated: FoodScan) => {
    setScans((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setSelectedScan(updated);
  };

  return (
    <div className="px-4 py-5 max-w-[480px] mx-auto">

      {/* Page header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] mb-1"
            style={{ color: 'rgba(255,255,255,0.3)' }}>Food History</p>
          <h1 className="text-[22px] font-bold leading-tight" style={{ color: '#fff', letterSpacing: '-0.02em' }}>
            Scan History
          </h1>
        </div>
        <button onClick={() => navigate('/food/scan')}
          className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-[12px] font-bold active:scale-95 transition-all"
          style={{ background: '#C8FF00', color: '#000' }}>
          <Camera className="w-3.5 h-3.5" /> New Scan
        </button>
      </div>

      <FoodHistory onViewDetail={(scan) => setSelectedScan(scan)} />

      <AnimatePresence>
        {selectedScan && (
          <motion.div key={selectedScan.id}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <FoodDetailModal
              scan={selectedScan}
              onClose={() => setSelectedScan(null)}
              onDeleted={handleDeleted}
              onUpdated={handleUpdated}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
