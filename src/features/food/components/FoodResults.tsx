import React, { useState } from 'react';
import { CheckCircle2, Edit3, Plus, RotateCcw, Trash2, X, Search } from 'lucide-react';
import type { DetectedFood, ScanState } from '../types';
import { calcTotals, searchFood } from '../../../services/foodRecognition.service';

interface Props {
  state: ScanState;
  onSave: (foods: DetectedFood[]) => Promise<void>;
  onScanAgain: () => void;
  saving: boolean;
}

// ── Inline serving editor ────────────────────────────────────────────────────

const ServingEditor: React.FC<{
  food: DetectedFood;
  onUpdate: (updated: DetectedFood) => void;
  onRemove: () => void;
}> = ({ food, onUpdate, onRemove }) => {
  const [qty, setQty] = useState(String(food.servings));

  const commit = () => {
    const n = parseFloat(qty);
    if (!isNaN(n) && n > 0) onUpdate({ ...food, servings: n });
  };

  const effectiveCal = Math.round(food.calories * food.servings);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#1a1d24', border: '1px solid rgba(255,255,255,0.08)' }}>
      {/* Food header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold leading-tight" style={{ color: '#fff' }}>{food.name}</p>
          {food.brand && (
            <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{food.brand}</p>
          )}
          <p className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{food.servingSize}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[24px] font-black tabular-nums leading-none" style={{ color: '#C8FF00' }}>
            {effectiveCal}
          </p>
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>kcal</p>
        </div>
      </div>

      {/* Macros row */}
      <div className="grid grid-cols-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {[
          { label: 'Protein', val: food.protein * food.servings, color: '#60a5fa' },
          { label: 'Carbs',   val: food.carbs   * food.servings, color: '#fbbf24' },
          { label: 'Fat',     val: food.fat      * food.servings, color: '#f87171' },
        ].map(({ label, val, color }, i, arr) => (
          <div key={label} className="text-center py-2.5"
            style={{ borderRight: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
            <p className="text-[13px] font-bold tabular-nums" style={{ color }}>{val.toFixed(1)}g</p>
            <p className="text-[9px] uppercase tracking-wider mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Servings editor + remove */}
      <div className="flex items-center gap-2 px-4 py-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <p className="text-[11px] font-semibold shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }}>Servings:</p>
        <div className="flex items-center gap-1 flex-1">
          <button onClick={() => { const n = Math.max(0.5, food.servings - 0.5); onUpdate({ ...food, servings: n }); setQty(String(n)); }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-lg font-bold transition-all active:scale-90"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>−</button>
          <input
            type="number" min={0.1} step={0.5} value={qty}
            onChange={(e) => setQty(e.target.value)}
            onBlur={commit}
            className="w-14 text-center text-[13px] font-bold rounded-lg h-7 focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}
          />
          <button onClick={() => { const n = food.servings + 0.5; onUpdate({ ...food, servings: n }); setQty(String(n)); }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-lg font-bold transition-all active:scale-90"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>+</button>
        </div>
        <button onClick={onRemove}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90"
          style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}>
          <Trash2 className="w-3.5 h-3.5" style={{ color: '#f87171' }} />
        </button>
      </div>
    </div>
  );
};

// ── Add food search modal ────────────────────────────────────────────────────

const AddFoodModal: React.FC<{
  onAdd: (food: DetectedFood) => void;
  onClose: () => void;
}> = ({ onAdd, onClose }) => {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<DetectedFood[]>([]);
  const [loading, setLoading]   = useState(false);
  const [searched, setSearched] = useState(false);

  const doSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const r = await searchFood(query);
      setResults(r);
      setSearched(true);
    } catch { setResults([]); setSearched(true); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-[480px] rounded-t-[24px] overflow-hidden pb-[max(20px,env(safe-area-inset-bottom))]"
        style={{ background: '#111419', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>

        <div className="w-9 h-1 rounded-full mx-auto mt-4 mb-4 opacity-30" style={{ background: '#fff' }} />
        <div className="flex items-center justify-between px-5 mb-4">
          <p className="text-[16px] font-bold" style={{ color: '#fff' }}>Add Food</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.08)' }}>
            <X className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.5)' }} />
          </button>
        </div>

        {/* Search input */}
        <div className="flex gap-2 px-5 mb-4">
          <input
            autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            placeholder="Search food name…"
            className="flex-1 px-3 py-2.5 rounded-xl text-[14px] focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', caretColor: '#C8FF00' }}
          />
          <button onClick={doSearch} disabled={loading}
            className="px-4 py-2.5 rounded-xl text-[13px] font-bold active:scale-95 transition-all disabled:opacity-50"
            style={{ background: '#C8FF00', color: '#000' }}>
            {loading ? '…' : <Search className="w-4 h-4" />}
          </button>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1 px-5 space-y-2 pb-2">
          {searched && results.length === 0 && (
            <p className="text-center text-[13px] py-8" style={{ color: 'rgba(255,255,255,0.3)' }}>
              No results found for "{query}"
            </p>
          )}
          {results.map((food) => (
            <button key={food.id} onClick={() => { onAdd(food); onClose(); }}
              className="w-full text-left px-4 py-3.5 rounded-2xl active:scale-[0.98] transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold leading-tight" style={{ color: '#fff' }}>{food.name}</p>
                  {food.brand && <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{food.brand}</p>}
                  <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{food.servingSize}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[18px] font-black" style={{ color: '#C8FF00' }}>{Math.round(food.calories)}</p>
                  <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>kcal</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Main FoodResults ─────────────────────────────────────────────────────────

export const FoodResults: React.FC<Props> = ({ state, onSave, onScanAgain, saving }) => {
  const [foods, setFoods]           = useState<DetectedFood[]>(state.foods);
  const [showAddModal, setShowAdd]  = useState(false);
  const [noFood]                    = useState(state.foods.length === 0);

  const totals = calcTotals(foods);

  const updateFood = (idx: number, updated: DetectedFood) =>
    setFoods((prev) => prev.map((f, i) => (i === idx ? updated : f)));

  const removeFood = (idx: number) => setFoods((prev) => prev.filter((_, i) => i !== idx));

  const addFood = (food: DetectedFood) => setFoods((prev) => [...prev, food]);

  return (
    <div className="space-y-4">

      {/* ── No-food-detected banner ── */}
      {noFood && (
        <div className="rounded-2xl px-5 py-5 text-center"
          style={{ background: 'rgba(250,199,117,0.06)', border: '1px solid rgba(250,199,117,0.18)' }}>
          <p className="text-[15px] font-bold" style={{ color: '#FAC775' }}>No food detected</p>
          <p className="text-[12px] mt-1 leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
            FatSecret couldn't identify food in this image.{'\n'}
            You can add items manually using the button below.
          </p>
        </div>
      )}

      {/* ── Summary card ── */}
      {foods.length > 0 && (
        <div className="rounded-2xl p-5"
          style={{ background: 'linear-gradient(160deg,#16191F,#111419)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Total Nutrition
          </p>
          <div className="flex items-end gap-2 mb-4">
            <span className="text-[56px] font-black leading-none tabular-nums" style={{ color: '#C8FF00' }}>
              {totals.total_calories}
            </span>
            <span className="text-[16px] font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>kcal</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Protein', val: totals.total_protein, color: '#60a5fa', unit: 'g' },
              { label: 'Carbs',   val: totals.total_carbs,   color: '#fbbf24', unit: 'g' },
              { label: 'Fat',     val: totals.total_fat,     color: '#f87171', unit: 'g' },
            ].map(({ label, val, color, unit }) => (
              <div key={label} className="rounded-xl p-3 text-center"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{label}</p>
                <p className="text-[18px] font-black tabular-nums" style={{ color }}>
                  {val.toFixed(1)}<span className="text-[10px] font-semibold ml-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{unit}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Food cards ── */}
      {foods.map((food, i) => (
        <ServingEditor key={`${food.id}-${i}`} food={food}
          onUpdate={(u) => updateFood(i, u)}
          onRemove={() => removeFood(i)} />
      ))}

      {/* ── Add food button ── */}
      <button onClick={() => setShowAdd(true)}
        className="w-full py-3.5 rounded-2xl text-[14px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}>
        <Plus className="w-4 h-4" /> Add food manually
      </button>

      {/* ── Action buttons ── */}
      <div className="space-y-2 pt-2">
        <button onClick={() => onSave(foods)} disabled={saving || foods.length === 0}
          className="w-full py-4 rounded-2xl text-[16px] font-bold text-black flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
          style={{ background: '#C8FF00' }}>
          <CheckCircle2 className="w-5 h-5" />
          {saving ? 'Saving…' : 'Save to History'}
        </button>
        <button onClick={onScanAgain}
          className="w-full py-4 rounded-2xl text-[15px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
          <RotateCcw className="w-4 h-4" /> Scan Again
        </button>
      </div>

      {/* ── Captured image preview (small) ── */}
      {state.imagePreviewUrl && (
        <div className="flex items-center gap-3 rounded-2xl p-3"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <img src={state.imagePreviewUrl} alt="Captured" className="w-14 h-14 rounded-xl object-cover" />
          <div>
            <p className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>Scanned image</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
              {foods.length} item{foods.length !== 1 ? 's' : ''} detected
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Edit3 className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.25)' }} />
          </div>
        </div>
      )}

      {showAddModal && (
        <AddFoodModal onAdd={addFood} onClose={() => setShowAdd(false)} />
      )}
    </div>
  );
};
