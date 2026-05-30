import React, { useReducer, useEffect, useRef, useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, Check, X, SkipForward, Edit3, Plus, Trash2, ArrowUp, ArrowDown, Sparkles } from 'lucide-react';

// ── Palette ──────────────────────────────────────────────
const SK = {
  accent:     '#D4A5B8',
  accentDim:  'rgba(212,165,184,0.12)',
  accentGlow: 'rgba(212,165,184,0.28)',
  done:       '#7EC8A4',
  doneDim:    'rgba(126,200,164,0.1)',
  skip:       'rgba(255,255,255,0.28)',
  border:     'rgba(212,165,184,0.14)',
  borderMid:  'rgba(255,255,255,0.07)',
} as const;

// ── Types ────────────────────────────────────────────────
type Status  = 'pending' | 'done' | 'skipped';
type DayName = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
const DAY_NAMES: DayName[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface ProductEntry    { productId: string; status: Status; scheduledDate: string; }
interface SubcatDay       { products: ProductEntry[]; }
interface DayData         { subcats: Record<string, SubcatDay>; }
interface WeekData        { days: Record<string, DayData>; }
interface RoutineProduct  { id: string; name: string; durationSec: number; oneTime?: boolean; }
interface AppState {
  weeks:         Record<string, WeekData>;
  routine:       Record<string, RoutineProduct[]>;
  subcategories: string[];
  productLibrary: { id: string; name: string }[];
}

// ── ISO week helpers ──────────────────────────────────────
function isoWeekId(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}

function weekStartDate(weekId: string): Date {
  const [year, wkStr] = weekId.split('-W');
  const wk = parseInt(wkStr, 10);
  const jan4 = new Date(Date.UTC(parseInt(year, 10), 0, 4));
  const dayOfWeek = (jan4.getUTCDay() || 7);
  const startMs = jan4.getTime() - (dayOfWeek - 1) * 86400000 + (wk - 1) * 7 * 86400000;
  return new Date(startMs);
}

function dayDate(weekId: string, day: DayName): string {
  const start = weekStartDate(weekId);
  const idx = DAY_NAMES.indexOf(day);
  const d = new Date(start.getTime() + idx * 86400000);
  return d.toISOString().slice(0, 10);
}

function todayWeekId(): string { return isoWeekId(new Date()); }
function todayDayName(): DayName {
  const d = new Date().getDay(); // 0=Sun
  return DAY_NAMES[d === 0 ? 6 : d - 1];
}

function generateWeekIds(past = 2, future = 2): string[] {
  const base = weekStartDate(todayWeekId());
  return Array.from({ length: past + 1 + future }, (_, i) => {
    const d = new Date(base.getTime() + (i - past) * 7 * 86400000);
    return isoWeekId(d);
  });
}

function nextDayInfo(weekId: string, day: DayName): { weekId: string; day: DayName } {
  const idx = DAY_NAMES.indexOf(day);
  if (idx < 6) return { weekId, day: DAY_NAMES[idx + 1] };
  const start = weekStartDate(weekId);
  const nextWeek = new Date(start.getTime() + 7 * 86400000);
  return { weekId: isoWeekId(nextWeek), day: 'Mon' };
}

// ── Default state ─────────────────────────────────────────
const DEFAULT_SUBCATS = ['Morning', 'Night'];
const DEFAULT_ROUTINE: Record<string, RoutineProduct[]> = {
  Morning: [
    { id: 'm1', name: 'Cleanser',    durationSec: 30 },
    { id: 'm2', name: 'Toner',       durationSec: 0  },
    { id: 'm3', name: 'Moisturizer', durationSec: 0  },
    { id: 'm4', name: 'SPF',         durationSec: 0  },
  ],
  Night: [
    { id: 'n1', name: 'Oil Cleanser', durationSec: 30 },
    { id: 'n2', name: 'Face Wash',    durationSec: 30 },
    { id: 'n3', name: 'Serum',        durationSec: 0  },
    { id: 'n4', name: 'Night Cream',  durationSec: 0  },
  ],
};

function buildEmptyWeek(weekId: string, subcats: string[], routine: Record<string, RoutineProduct[]>): WeekData {
  const days: Record<string, DayData> = {};
  for (const day of DAY_NAMES) {
    const subcatMap: Record<string, SubcatDay> = {};
    for (const sub of subcats) {
      const prods = routine[sub] ?? [];
      subcatMap[sub] = {
        products: prods
          .filter(p => !p.oneTime)
          .map(p => ({ productId: p.id, status: 'pending', scheduledDate: dayDate(weekId, day) })),
      };
    }
    days[day] = { subcats: subcatMap };
  }
  return { days };
}

function initialState(): AppState {
  try {
    const raw = localStorage.getItem('athlix_skincare_v1');
    if (raw) return JSON.parse(raw);
  } catch {}
  const weeks: Record<string, WeekData> = {};
  const weekIds = generateWeekIds(2, 2);
  for (const wid of weekIds) {
    weeks[wid] = buildEmptyWeek(wid, DEFAULT_SUBCATS, DEFAULT_ROUTINE);
  }
  return {
    weeks,
    routine: DEFAULT_ROUTINE,
    subcategories: DEFAULT_SUBCATS,
    productLibrary: [],
  };
}

// ── Reducer ───────────────────────────────────────────────
type Action =
  | { type: 'SET_STATUS'; weekId: string; day: DayName; sub: string; productId: string; status: Status }
  | { type: 'SKIP_CARRY'; weekId: string; day: DayName; sub: string; productId: string }
  | { type: 'ADD_PRODUCT'; sub: string; name: string; durationSec: number; oneTime?: boolean }
  | { type: 'REMOVE_PRODUCT'; sub: string; productId: string }
  | { type: 'MOVE_PRODUCT'; sub: string; productId: string; dir: 'up' | 'down' }
  | { type: 'ADD_SUBCAT'; name: string }
  | { type: 'REMOVE_SUBCAT'; name: string }
  | { type: 'ENSURE_WEEKS' };

function cloneDeep<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }

function reducer(state: AppState, action: Action): AppState {
  const s = cloneDeep(state);

  const ensureWeek = (weekId: string) => {
    if (!s.weeks[weekId]) {
      s.weeks[weekId] = buildEmptyWeek(weekId, s.subcategories, s.routine);
    }
  };

  switch (action.type) {
    case 'ENSURE_WEEKS': {
      for (const wid of generateWeekIds(2, 2)) ensureWeek(wid);
      return s;
    }
    case 'SET_STATUS': {
      ensureWeek(action.weekId);
      const day = s.weeks[action.weekId].days[action.day];
      const sub = day?.subcats[action.sub];
      if (!sub) return s;
      const entry = sub.products.find(p => p.productId === action.productId);
      if (entry) entry.status = action.status;
      return s;
    }
    case 'SKIP_CARRY': {
      ensureWeek(action.weekId);
      const day = s.weeks[action.weekId].days[action.day];
      const sub = day?.subcats[action.sub];
      if (!sub) return s;
      const entry = sub.products.find(p => p.productId === action.productId);
      if (!entry) return s;
      entry.status = 'skipped';
      // carry to next day
      const next = nextDayInfo(action.weekId, action.day);
      ensureWeek(next.weekId);
      const nextSub = s.weeks[next.weekId].days[next.day]?.subcats[action.sub];
      if (nextSub && !nextSub.products.find(p => p.productId === action.productId)) {
        nextSub.products.push({
          productId: action.productId,
          status: 'pending',
          scheduledDate: dayDate(next.weekId, next.day),
        });
      }
      return s;
    }
    case 'ADD_PRODUCT': {
      const id = `custom_${Date.now()}`;
      if (!s.routine[action.sub]) s.routine[action.sub] = [];
      s.routine[action.sub].push({ id, name: action.name, durationSec: action.durationSec, oneTime: action.oneTime });
      if (!action.oneTime) {
        for (const wid of Object.keys(s.weeks)) {
          for (const day of DAY_NAMES) {
            const sub = s.weeks[wid].days[day]?.subcats[action.sub];
            if (sub && !sub.products.find(p => p.productId === id)) {
              sub.products.push({ productId: id, status: 'pending', scheduledDate: dayDate(wid, day) });
            }
          }
        }
      } else {
        // one-time: add only to today
        const wid = todayWeekId();
        const day = todayDayName();
        ensureWeek(wid);
        const sub = s.weeks[wid].days[day]?.subcats[action.sub];
        if (sub) sub.products.push({ productId: id, status: 'pending', scheduledDate: dayDate(wid, day) });
      }
      return s;
    }
    case 'REMOVE_PRODUCT': {
      for (const sub of Object.keys(s.routine)) {
        s.routine[sub] = s.routine[sub].filter(p => p.id !== action.productId);
      }
      for (const wid of Object.keys(s.weeks)) {
        for (const day of DAY_NAMES) {
          const sub = s.weeks[wid].days[day]?.subcats[action.sub];
          if (sub) sub.products = sub.products.filter(p => p.productId !== action.productId);
        }
      }
      return s;
    }
    case 'MOVE_PRODUCT': {
      const arr = s.routine[action.sub];
      if (!arr) return s;
      const idx = arr.findIndex(p => p.id === action.productId);
      if (idx < 0) return s;
      const newIdx = action.dir === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= arr.length) return s;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return s;
    }
    case 'ADD_SUBCAT': {
      if (!s.subcategories.includes(action.name)) {
        const insertIdx = s.subcategories.indexOf('Night');
        if (insertIdx >= 0) s.subcategories.splice(insertIdx, 0, action.name);
        else s.subcategories.push(action.name);
        s.routine[action.name] = [];
        for (const wid of Object.keys(s.weeks)) {
          for (const day of DAY_NAMES) {
            if (s.weeks[wid].days[day]) {
              s.weeks[wid].days[day].subcats[action.name] = { products: [] };
            }
          }
        }
      }
      return s;
    }
    case 'REMOVE_SUBCAT': {
      if (action.name === 'Morning' || action.name === 'Night') return s;
      s.subcategories = s.subcategories.filter(c => c !== action.name);
      delete s.routine[action.name];
      for (const wid of Object.keys(s.weeks)) {
        for (const day of DAY_NAMES) {
          delete s.weeks[wid].days[day]?.subcats[action.name];
        }
      }
      return s;
    }
    default: return s;
  }
}

// ── Timer Bar ─────────────────────────────────────────────
interface TimerBarProps {
  durationSec: number;
  onComplete: () => void;
}
const TimerBar: React.FC<TimerBarProps> = ({ durationSec, onComplete }) => {
  const [remaining, setRemaining] = useState(durationSec);
  const rafRef = useRef<number>();
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    if (durationSec <= 0) { onComplete(); return; }
    const tick = () => {
      const elapsed = (Date.now() - startRef.current) / 1000;
      const left = Math.max(0, durationSec - elapsed);
      setRemaining(left);
      if (left > 0) rafRef.current = requestAnimationFrame(tick);
      else onComplete();
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [durationSec, onComplete]);

  const pct = durationSec > 0 ? ((durationSec - remaining) / durationSec) * 100 : 100;

  return (
    <div className="mt-2">
      <div className="flex justify-between mb-1" style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
        <span>Timer</span>
        <span>{Math.ceil(remaining)}s</span>
      </div>
      <div className="rounded-full overflow-hidden" style={{ height: 4, background: 'rgba(255,255,255,0.08)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: SK.accent }}
        />
      </div>
    </div>
  );
};

// ── Product Item ──────────────────────────────────────────
interface ProductItemProps {
  product: RoutineProduct;
  entry: ProductEntry | undefined;
  onDone: () => void;
  onSkip: () => void;
}
const ProductItem: React.FC<ProductItemProps> = ({ product, entry, onDone, onSkip }) => {
  const [timerActive, setTimerActive] = useState(false);
  const status = entry?.status ?? 'pending';

  const handleDone = useCallback(() => {
    if (product.durationSec > 0 && status === 'pending') {
      setTimerActive(true);
    } else {
      onDone();
    }
  }, [product.durationSec, status, onDone]);

  const handleTimerComplete = useCallback(() => {
    setTimerActive(false);
    onDone();
  }, [onDone]);

  const isDone    = status === 'done';
  const isSkipped = status === 'skipped';

  return (
    <div
      className="rounded-2xl px-4 py-3 mb-2"
      style={{
        background: isDone
          ? SK.doneDim
          : isSkipped
            ? 'rgba(255,255,255,0.04)'
            : SK.accentDim,
        border: `1px solid ${isDone ? 'rgba(126,200,164,0.18)' : isSkipped ? 'rgba(255,255,255,0.06)' : SK.border}`,
        opacity: isSkipped ? 0.55 : 1,
      }}
    >
      <div className="flex items-center gap-3">
        {/* Status dot */}
        <div
          className="shrink-0 flex items-center justify-center rounded-full"
          style={{
            width: 28, height: 28,
            background: isDone
              ? SK.done
              : isSkipped
                ? 'rgba(255,255,255,0.08)'
                : SK.accentDim,
            border: `1.5px solid ${isDone ? SK.done : isSkipped ? 'rgba(255,255,255,0.12)' : SK.accent}`,
          }}
        >
          {isDone    && <Check size={14} color="#000" strokeWidth={3} />}
          {isSkipped && <X size={12} color="rgba(255,255,255,0.4)" strokeWidth={2.5} />}
        </div>

        <span
          className="flex-1 text-[14px] font-medium"
          style={{
            color: isDone ? SK.done : isSkipped ? 'rgba(255,255,255,0.35)' : 'var(--text-primary)',
            textDecoration: isSkipped ? 'line-through' : 'none',
            fontFamily: product.name.length < 12 ? "'Playfair Display', serif" : 'inherit',
          }}
        >
          {product.name}
          {product.oneTime && (
            <span className="ml-2 text-[10px] font-black tracking-[0.08em] uppercase" style={{ color: SK.accent, opacity: 0.7 }}>
              one-time
            </span>
          )}
        </span>

        {/* Action buttons */}
        {!isDone && !isSkipped && (
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={handleDone}
              className="flex items-center justify-center rounded-xl active:scale-95 transition-transform"
              style={{ width: 34, height: 34, background: SK.done, color: '#000' }}
            >
              <Check size={15} strokeWidth={3} />
            </button>
            <button
              onClick={onSkip}
              className="flex items-center justify-center rounded-xl active:scale-95 transition-transform"
              style={{ width: 34, height: 34, background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }}
            >
              <SkipForward size={14} strokeWidth={2} />
            </button>
          </div>
        )}
        {(isDone || isSkipped) && (
          <button
            onClick={() => { setTimerActive(false); onSkip(); }}
            className="text-[11px] font-medium active:opacity-60 transition-opacity"
            style={{ color: 'rgba(255,255,255,0.28)' }}
          >
            undo
          </button>
        )}
      </div>

      {timerActive && (
        <TimerBar durationSec={product.durationSec} onComplete={handleTimerComplete} />
      )}
    </div>
  );
};

// ── Subcat Section ─────────────────────────────────────────
interface SubcatSectionProps {
  sub: string;
  products: RoutineProduct[];
  dayData: SubcatDay | undefined;
  onDone:  (productId: string) => void;
  onSkip:  (productId: string) => void;
}
const SubcatSection: React.FC<SubcatSectionProps> = ({ sub, products, dayData, onDone, onSkip }) => {
  const [open, setOpen] = useState(false);
  const entries = dayData?.products ?? [];
  const total   = products.length;
  const doneCount = entries.filter(e => e.status === 'done').length;

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-1 py-1.5 active:opacity-70 transition-opacity"
      >
        <span
          className="text-[12px] font-black tracking-[0.12em] uppercase"
          style={{ color: SK.accent }}
        >
          {sub}
        </span>
        <div className="flex-1 h-px" style={{ background: SK.border }} />
        <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {doneCount}/{total}
        </span>
        {open
          ? <ChevronUp size={14} color="rgba(255,255,255,0.3)" />
          : <ChevronDown size={14} color="rgba(255,255,255,0.3)" />}
      </button>

      {open && (
        <div className="mt-1">
          {products.map(p => (
            <ProductItem
              key={p.id}
              product={p}
              entry={entries.find(e => e.productId === p.id)}
              onDone={() => onDone(p.id)}
              onSkip={() => onSkip(p.id)}
            />
          ))}
          {products.length === 0 && (
            <p className="text-[13px] px-1 py-2" style={{ color: 'rgba(255,255,255,0.25)' }}>
              No products in {sub}.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// ── Day Panel ─────────────────────────────────────────────
interface DayPanelProps {
  weekId: string;
  day: DayName;
  weekData: WeekData;
  subcats: string[];
  routine: Record<string, RoutineProduct[]>;
  dispatch: React.Dispatch<Action>;
}
const DayPanel: React.FC<DayPanelProps> = ({ weekId, day, weekData, subcats, routine, dispatch }) => {
  const dayData = weekData.days[day];

  const handleDone = (sub: string, productId: string) =>
    dispatch({ type: 'SET_STATUS', weekId, day, sub, productId, status: 'done' });

  const handleSkip = (sub: string, productId: string) => {
    const entry = dayData?.subcats[sub]?.products.find(p => p.productId === productId);
    if (entry?.status === 'done' || entry?.status === 'skipped') {
      dispatch({ type: 'SET_STATUS', weekId, day, sub, productId, status: 'pending' });
    } else {
      dispatch({ type: 'SKIP_CARRY', weekId, day, sub, productId });
    }
  };

  return (
    <div className="px-4 pb-4 pt-2">
      {subcats.map(sub => (
        <SubcatSection
          key={sub}
          sub={sub}
          products={routine[sub] ?? []}
          dayData={dayData?.subcats[sub]}
          onDone={id => handleDone(sub, id)}
          onSkip={id => handleSkip(sub, id)}
        />
      ))}
    </div>
  );
};

// ── Day Row ───────────────────────────────────────────────
interface DayRowProps {
  weekId: string;
  day: DayName;
  weekData: WeekData;
  subcats: string[];
  routine: Record<string, RoutineProduct[]>;
  dispatch: React.Dispatch<Action>;
  isToday: boolean;
}
const DayRow: React.FC<DayRowProps> = ({ weekId, day, weekData, subcats, routine, dispatch, isToday }) => {
  const [open, setOpen] = useState(isToday);
  const dayData = weekData.days[day];

  const totalProducts = subcats.reduce((acc, sub) => acc + (routine[sub]?.length ?? 0), 0);
  const doneProducts  = subcats.reduce((acc, sub) => {
    const entries = dayData?.subcats[sub]?.products ?? [];
    return acc + entries.filter(e => e.status === 'done').length;
  }, 0);
  const allDone = totalProducts > 0 && doneProducts === totalProducts;

  return (
    <div
      className="mb-1 rounded-2xl overflow-hidden"
      style={{
        border: `1px solid ${isToday ? SK.border : SK.borderMid}`,
        background: isToday ? SK.accentDim : 'rgba(255,255,255,0.02)',
      }}
    >
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3"
      >
        <span
          className="text-[13px] font-bold w-8 text-left shrink-0"
          style={{ color: isToday ? SK.accent : 'var(--text-secondary)' }}
        >
          {day}
        </span>
        {isToday && (
          <span
            className="text-[9px] font-black tracking-[0.12em] uppercase px-2 py-0.5 rounded-full"
            style={{ background: SK.accent, color: '#000' }}
          >
            Today
          </span>
        )}
        <div className="flex-1" />
        {allDone && <Check size={14} color={SK.done} strokeWidth={3} />}
        {!allDone && totalProducts > 0 && (
          <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {doneProducts}/{totalProducts}
          </span>
        )}
        {open
          ? <ChevronUp size={15} color="rgba(255,255,255,0.28)" />
          : <ChevronDown size={15} color="rgba(255,255,255,0.28)" />}
      </button>

      {open && (
        <DayPanel
          weekId={weekId}
          day={day}
          weekData={weekData}
          subcats={subcats}
          routine={routine}
          dispatch={dispatch}
        />
      )}
    </div>
  );
};

// ── Week Card ─────────────────────────────────────────────
interface WeekCardProps {
  weekId: string;
  weekData: WeekData;
  subcats: string[];
  routine: Record<string, RoutineProduct[]>;
  dispatch: React.Dispatch<Action>;
  currentWeekId: string;
  currentDay: DayName;
}
const WeekCard: React.FC<WeekCardProps> = ({ weekId, weekData, subcats, routine, dispatch, currentWeekId, currentDay }) => {
  const isCurrentWeek = weekId === currentWeekId;
  const [open, setOpen] = useState(isCurrentWeek);

  const start = weekStartDate(weekId);
  const end   = new Date(start.getTime() + 6 * 86400000);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const label = isCurrentWeek ? 'This Week' : `${fmt(start)} – ${fmt(end)}`;

  return (
    <div
      className="mb-4 rounded-3xl overflow-hidden"
      style={{
        border: `1px solid ${isCurrentWeek ? SK.border : SK.borderMid}`,
        background: 'var(--bg-surface)',
      }}
    >
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-4"
      >
        <span
          className="text-[15px] font-bold"
          style={{
            color: isCurrentWeek ? SK.accent : 'var(--text-secondary)',
            fontFamily: "'Playfair Display', serif",
          }}
        >
          {label}
        </span>
        <div className="flex-1" />
        {open
          ? <ChevronUp size={16} color="rgba(255,255,255,0.3)" />
          : <ChevronDown size={16} color="rgba(255,255,255,0.3)" />}
      </button>

      {open && (
        <div className="px-3 pb-3">
          {DAY_NAMES.map(day => (
            <DayRow
              key={day}
              weekId={weekId}
              day={day}
              weekData={weekData}
              subcats={subcats}
              routine={routine}
              dispatch={dispatch}
              isToday={isCurrentWeek && day === currentDay}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Edit Page ─────────────────────────────────────────────
interface EditPageProps {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  onBack: () => void;
}
const EditPage: React.FC<EditPageProps> = ({ state, dispatch, onBack }) => {
  const [activeSub, setActiveSub] = useState(state.subcategories[0] ?? 'Morning');
  const [newProductName, setNewProductName] = useState('');
  const [newProductDur, setNewProductDur] = useState('0');
  const [newSubName, setNewSubName] = useState('');
  const [oneTimeName, setOneTimeName] = useState('');
  const [oneTimeSub, setOneTimeSub] = useState(state.subcategories[0] ?? 'Morning');

  const products = state.routine[activeSub] ?? [];

  const addProduct = () => {
    const n = newProductName.trim();
    if (!n) return;
    dispatch({ type: 'ADD_PRODUCT', sub: activeSub, name: n, durationSec: parseInt(newProductDur) || 0 });
    setNewProductName('');
    setNewProductDur('0');
  };

  const addOneTime = () => {
    const n = oneTimeName.trim();
    if (!n) return;
    dispatch({ type: 'ADD_PRODUCT', sub: oneTimeSub, name: n, durationSec: 0, oneTime: true });
    setOneTimeName('');
  };

  const addSubcat = () => {
    const n = newSubName.trim();
    if (!n) return;
    dispatch({ type: 'ADD_SUBCAT', name: n });
    setNewSubName('');
  };

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: `1px solid ${SK.border}`,
    borderRadius: 12,
    color: 'var(--text-primary)',
    padding: '10px 14px',
    fontSize: 14,
    outline: 'none',
    width: '100%',
  };

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      {/* Header */}
      <div
        className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4"
        style={{
          background: 'var(--bg-base)',
          borderBottom: `1px solid ${SK.borderMid}`,
          paddingTop: 'calc(env(safe-area-inset-top) + 16px)',
        }}
      >
        <button
          onClick={onBack}
          className="flex items-center justify-center rounded-xl active:scale-95 transition-transform"
          style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.07)' }}
        >
          <X size={16} color="var(--text-secondary)" />
        </button>
        <h1
          className="text-[20px] font-bold flex-1"
          style={{ fontFamily: "'Playfair Display', serif", color: SK.accent }}
        >
          Edit Routine
        </h1>
      </div>

      <div className="px-5 pb-10">
        {/* Subcategory tabs */}
        <div className="flex gap-2 mt-5 mb-5 overflow-x-auto pb-1">
          {state.subcategories.map(sub => (
            <button
              key={sub}
              onClick={() => setActiveSub(sub)}
              className="shrink-0 px-4 py-1.5 rounded-full text-[13px] font-bold transition-all"
              style={{
                background: activeSub === sub ? SK.accent : 'rgba(255,255,255,0.07)',
                color:      activeSub === sub ? '#000'    : 'rgba(255,255,255,0.5)',
              }}
            >
              {sub}
            </button>
          ))}
        </div>

        {/* Product list */}
        <div className="mb-5">
          <p className="text-[11px] font-black tracking-[0.1em] uppercase mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Products in {activeSub}
          </p>
          {products.map((p, idx) => (
            <div
              key={p.id}
              className="flex items-center gap-2 mb-2 px-4 py-3 rounded-2xl"
              style={{ background: SK.accentDim, border: `1px solid ${SK.border}` }}
            >
              <span className="flex-1 text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>
                {p.name}
                {p.durationSec > 0 && (
                  <span className="ml-2 text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {p.durationSec}s
                  </span>
                )}
              </span>
              <button
                onClick={() => dispatch({ type: 'MOVE_PRODUCT', sub: activeSub, productId: p.id, dir: 'up' })}
                disabled={idx === 0}
                className="p-1.5 rounded-lg active:opacity-60 disabled:opacity-20"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                <ArrowUp size={14} />
              </button>
              <button
                onClick={() => dispatch({ type: 'MOVE_PRODUCT', sub: activeSub, productId: p.id, dir: 'down' })}
                disabled={idx === products.length - 1}
                className="p-1.5 rounded-lg active:opacity-60 disabled:opacity-20"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                <ArrowDown size={14} />
              </button>
              <button
                onClick={() => dispatch({ type: 'REMOVE_PRODUCT', sub: activeSub, productId: p.id })}
                className="p-1.5 rounded-lg active:opacity-60"
                style={{ color: '#ef4444' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {products.length === 0 && (
            <p className="text-[13px] py-2" style={{ color: 'rgba(255,255,255,0.25)' }}>
              No products yet.
            </p>
          )}
        </div>

        {/* Add product */}
        <div className="mb-6 p-4 rounded-3xl" style={{ background: 'var(--bg-surface)', border: `1px solid ${SK.borderMid}` }}>
          <p className="text-[11px] font-black tracking-[0.1em] uppercase mb-3" style={{ color: SK.accent }}>
            Add Product to {activeSub}
          </p>
          <input
            style={inputStyle}
            placeholder="Product name…"
            value={newProductName}
            onChange={e => setNewProductName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addProduct()}
            className="mb-2"
          />
          <div className="flex gap-2">
            <input
              style={{ ...inputStyle, width: 100 }}
              placeholder="Timer (s)"
              type="number"
              min={0}
              value={newProductDur}
              onChange={e => setNewProductDur(e.target.value)}
            />
            <button
              onClick={addProduct}
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl font-bold text-[14px] active:scale-95 transition-transform"
              style={{ background: SK.accent, color: '#000', height: 44 }}
            >
              <Plus size={16} strokeWidth={3} />
              Add
            </button>
          </div>
        </div>

        {/* One-time product */}
        <div className="mb-6 p-4 rounded-3xl" style={{ background: 'var(--bg-surface)', border: `1px solid ${SK.borderMid}` }}>
          <p className="text-[11px] font-black tracking-[0.1em] uppercase mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
            One-Time Product (today only)
          </p>
          <p className="text-[12px] mb-3" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Added to today's routine only, won't repeat.
          </p>
          <div className="flex gap-2 mb-2">
            {state.subcategories.map(sub => (
              <button
                key={sub}
                onClick={() => setOneTimeSub(sub)}
                className="px-3 py-1 rounded-full text-[12px] font-bold transition-all"
                style={{
                  background: oneTimeSub === sub ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                  color: oneTimeSub === sub ? 'var(--text-primary)' : 'rgba(255,255,255,0.4)',
                }}
              >
                {sub}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="Product name…"
              value={oneTimeName}
              onChange={e => setOneTimeName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addOneTime()}
            />
            <button
              onClick={addOneTime}
              className="flex items-center justify-center rounded-2xl font-bold text-[14px] px-4 active:scale-95 transition-transform"
              style={{ background: 'rgba(255,255,255,0.09)', color: 'var(--text-secondary)', height: 44 }}
            >
              Add
            </button>
          </div>
        </div>

        {/* Manage sections */}
        <div className="p-4 rounded-3xl" style={{ background: 'var(--bg-surface)', border: `1px solid ${SK.borderMid}` }}>
          <p className="text-[11px] font-black tracking-[0.1em] uppercase mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Manage Sections
          </p>
          {state.subcategories.map(sub => (
            <div key={sub} className="flex items-center gap-2 mb-2">
              <span className="flex-1 text-[14px]" style={{ color: 'var(--text-primary)' }}>{sub}</span>
              {sub !== 'Morning' && sub !== 'Night' && (
                <button
                  onClick={() => { dispatch({ type: 'REMOVE_SUBCAT', name: sub }); if (activeSub === sub) setActiveSub('Morning'); }}
                  className="p-1.5 rounded-lg active:opacity-60"
                  style={{ color: '#ef4444' }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          <div className="flex gap-2 mt-3">
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="New section name…"
              value={newSubName}
              onChange={e => setNewSubName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSubcat()}
            />
            <button
              onClick={addSubcat}
              className="flex items-center justify-center rounded-2xl font-bold text-[14px] px-4 active:scale-95 transition-transform"
              style={{ background: 'rgba(255,255,255,0.09)', color: 'var(--text-secondary)', height: 44 }}
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────
export const SkincareRoutinePage: React.FC = () => {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [view, setView] = useState<'main' | 'edit'>('main');
  const weekIds      = generateWeekIds(2, 2);
  const currentWeek  = todayWeekId();
  const currentDay   = todayDayName();

  // Persist to localStorage
  useEffect(() => {
    try { localStorage.setItem('athlix_skincare_v1', JSON.stringify(state)); }
    catch {}
  }, [state]);

  // Ensure week data exists
  useEffect(() => {
    dispatch({ type: 'ENSURE_WEEKS' });
  }, []);

  if (view === 'edit') {
    return <EditPage state={state} dispatch={dispatch} onBack={() => setView('main')} />;
  }

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ background: 'var(--bg-base)' }}
    >
      {/* Header */}
      <div
        className="shrink-0 flex items-center justify-between px-5 pb-4"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 16px)',
          borderBottom: `1px solid ${SK.borderMid}`,
          background: 'var(--bg-base)',
        }}
      >
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Sparkles size={18} color={SK.accent} strokeWidth={1.8} />
            <h1
              className="text-[22px] font-bold"
              style={{ fontFamily: "'Playfair Display', serif", color: SK.accent }}
            >
              Skincare
            </h1>
          </div>
          <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.32)' }}>
            Your daily ritual
          </p>
        </div>
        <button
          onClick={() => setView('edit')}
          className="flex items-center gap-2 px-4 py-2 rounded-2xl active:scale-95 transition-transform"
          style={{
            background: SK.accentDim,
            border: `1px solid ${SK.border}`,
            color: SK.accent,
          }}
        >
          <Edit3 size={14} strokeWidth={2} />
          <span className="text-[13px] font-bold">Edit</span>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 pt-5 pb-8">
        {weekIds.map(weekId => (
          <WeekCard
            key={weekId}
            weekId={weekId}
            weekData={state.weeks[weekId] ?? buildEmptyWeek(weekId, state.subcategories, state.routine)}
            subcats={state.subcategories}
            routine={state.routine}
            dispatch={dispatch}
            currentWeekId={currentWeek}
            currentDay={currentDay}
          />
        ))}
      </div>
    </div>
  );
};
