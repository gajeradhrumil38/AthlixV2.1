import React, { useReducer, useEffect, useRef, useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, Check, X, SkipForward, Edit3, Plus, Trash2, ArrowUp, ArrowDown, Sparkles } from 'lucide-react';

// ── Colour system ─────────────────────────────────────────
// Three semantic colours only: amber (morning) · blue (night) · sage (done).
// All chrome — headers, cards, buttons — stays neutral white/dark.

const MORNING = {
  accent: '#C8A870',                    // warm amber
  dim:    'rgba(200,168,112,0.09)',
  border: 'rgba(200,168,112,0.18)',
  glow:   'rgba(200,168,112,0.22)',
} as const;

const NIGHT = {
  accent: '#7A9BC8',                    // cool steel blue
  dim:    'rgba(122,155,200,0.09)',
  border: 'rgba(122,155,200,0.18)',
  glow:   'rgba(122,155,200,0.22)',
} as const;

const CUSTOM = {
  accent: 'rgba(255,255,255,0.5)',
  dim:    'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.10)',
  glow:   'rgba(255,255,255,0.10)',
} as const;

const DONE = {
  accent: '#6EC4A0',                    // sage green
  dim:    'rgba(110,196,160,0.09)',
  border: 'rgba(110,196,160,0.18)',
} as const;

// Neutral chrome tokens (no hue)
const N = {
  heading:   'rgba(255,255,255,0.90)',
  secondary: 'rgba(255,255,255,0.45)',
  muted:     'rgba(255,255,255,0.22)',
  hairline:  'rgba(255,255,255,0.07)',
  surface:   'rgba(255,255,255,0.03)',
  card:      'rgba(255,255,255,0.05)',
} as const;

interface SubcatColors { accent: string; dim: string; border: string; glow: string; }
function subcatColor(sub: string): SubcatColors {
  if (sub === 'Morning') return MORNING;
  if (sub === 'Night')   return NIGHT;
  return CUSTOM;
}

// ── Types ────────────────────────────────────────────────
type Status  = 'pending' | 'done' | 'skipped';
type DayName = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
const DAY_NAMES: DayName[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface ProductEntry   { productId: string; status: Status; scheduledDate: string; }
interface SubcatDay      { products: ProductEntry[]; }
interface DayData        { subcats: Record<string, SubcatDay>; }
interface WeekData       { days: Record<string, DayData>; }
interface RoutineProduct { id: string; name: string; durationSec: number; oneTime?: boolean; }
interface AppState {
  weeks:          Record<string, WeekData>;
  routine:        Record<string, RoutineProduct[]>;
  subcategories:  string[];
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
  const dayOfWeek = jan4.getUTCDay() || 7;
  const startMs = jan4.getTime() - (dayOfWeek - 1) * 86400000 + (wk - 1) * 7 * 86400000;
  return new Date(startMs);
}

function dayDate(weekId: string, day: DayName): string {
  const start = weekStartDate(weekId);
  const idx = DAY_NAMES.indexOf(day);
  return new Date(start.getTime() + idx * 86400000).toISOString().slice(0, 10);
}

function todayWeekId(): string { return isoWeekId(new Date()); }
function todayDayName(): DayName {
  const d = new Date().getDay();
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
  return { weekId: isoWeekId(new Date(start.getTime() + 7 * 86400000)), day: 'Mon' };
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
      subcatMap[sub] = {
        products: (routine[sub] ?? [])
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
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && parsed.routine && parsed.subcategories && parsed.weeks) return parsed;
    }
  } catch {}
  const weeks: Record<string, WeekData> = {};
  for (const wid of generateWeekIds(2, 2)) {
    weeks[wid] = buildEmptyWeek(wid, DEFAULT_SUBCATS, DEFAULT_ROUTINE);
  }
  return { weeks, routine: DEFAULT_ROUTINE, subcategories: DEFAULT_SUBCATS, productLibrary: [] };
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
    if (!s.weeks[weekId]) s.weeks[weekId] = buildEmptyWeek(weekId, s.subcategories, s.routine);
  };

  switch (action.type) {
    case 'ENSURE_WEEKS': {
      let changed = false;
      for (const wid of generateWeekIds(2, 2)) {
        if (!s.weeks[wid]) { ensureWeek(wid); changed = true; }
      }
      return changed ? s : state;
    }
    case 'SET_STATUS': {
      ensureWeek(action.weekId);
      const dayData = s.weeks[action.weekId].days[action.day];
      const sub = dayData?.subcats[action.sub];
      if (!sub) return s;
      const entry = sub.products.find(p => p.productId === action.productId);
      if (entry) entry.status = action.status;
      return s;
    }
    case 'SKIP_CARRY': {
      ensureWeek(action.weekId);
      const dayData = s.weeks[action.weekId].days[action.day];
      const sub = dayData?.subcats[action.sub];
      if (!sub) return s;
      const entry = sub.products.find(p => p.productId === action.productId);
      if (!entry) return s;
      entry.status = 'skipped';
      const next = nextDayInfo(action.weekId, action.day);
      ensureWeek(next.weekId);
      const nextSub = s.weeks[next.weekId].days[next.day]?.subcats[action.sub];
      if (nextSub && !nextSub.products.find(p => p.productId === action.productId)) {
        nextSub.products.push({ productId: action.productId, status: 'pending', scheduledDate: dayDate(next.weekId, next.day) });
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
            if (s.weeks[wid].days[day]) s.weeks[wid].days[day].subcats[action.name] = { products: [] };
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
        for (const day of DAY_NAMES) delete s.weeks[wid].days[day]?.subcats[action.name];
      }
      return s;
    }
    default: return s;
  }
}

// ── Timer Bar ─────────────────────────────────────────────
interface TimerBarProps { durationSec: number; onComplete: () => void; barColor: string; }
const TimerBar: React.FC<TimerBarProps> = ({ durationSec, onComplete, barColor }) => {
  const [remaining, setRemaining] = useState(durationSec);
  const rafRef       = useRef<number>();
  const startRef     = useRef<number>(Date.now());
  const onCompleteRef= useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (durationSec <= 0) { onCompleteRef.current(); return; }
    startRef.current = Date.now();
    const tick = () => {
      const elapsed = (Date.now() - startRef.current) / 1000;
      const left = Math.max(0, durationSec - elapsed);
      setRemaining(left);
      if (left > 0) rafRef.current = requestAnimationFrame(tick);
      else onCompleteRef.current();
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [durationSec]);

  const pct = durationSec > 0 ? ((durationSec - remaining) / durationSec) * 100 : 100;

  return (
    <div className="mt-2.5">
      <div className="flex justify-between mb-1.5" style={{ fontSize: 11, color: N.muted }}>
        <span style={{ letterSpacing: '0.06em' }}>TIMER</span>
        <span>{Math.ceil(remaining)}s</span>
      </div>
      <div className="rounded-full overflow-hidden" style={{ height: 3, background: 'rgba(255,255,255,0.08)' }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: barColor, transition: 'width 0.1s linear' }}
        />
      </div>
    </div>
  );
};

// ── Product Item ──────────────────────────────────────────
interface ProductItemProps {
  product: RoutineProduct;
  entry:   ProductEntry | undefined;
  colors:  SubcatColors;
  onDone:  () => void;
  onSkip:  () => void;
}
const ProductItem: React.FC<ProductItemProps> = ({ product, entry, colors, onDone, onSkip }) => {
  const [timerActive, setTimerActive]     = useState(false);
  // Optimistic flag — updates the circle IMMEDIATELY on tap, before state propagates.
  const [optimisticDone, setOptimisticDone] = useState(false);

  const status     = entry?.status ?? 'pending';
  const isDone     = status === 'done' || optimisticDone;
  const isSkipped  = status === 'skipped' && !optimisticDone;
  const inProgress = timerActive && !isDone; // timer running, not yet confirmed

  // When state reverts to pending (external undo), clear the optimistic flag.
  useEffect(() => {
    if (status === 'pending') { setOptimisticDone(false); setTimerActive(false); }
    if (status !== 'pending')  setTimerActive(false);
  }, [status]);

  const handleDone = useCallback(() => {
    if (isDone) return;
    if (product.durationSec > 0) {
      setTimerActive(true);           // timer products: show countdown first
    } else {
      setOptimisticDone(true);        // no timer: fill circle immediately
      onDone();
    }
  }, [product.durationSec, isDone, onDone]);

  const handleTimerComplete = useCallback(() => {
    setTimerActive(false);
    setOptimisticDone(true);          // fill circle the moment timer ends
    onDone();
  }, [onDone]);

  const handleUndo = useCallback(() => {
    setOptimisticDone(false);
    setTimerActive(false);
    onSkip();                         // DayPanel detects done/skipped → resets to pending
  }, [onSkip]);

  const bg     = isDone ? DONE.dim    : isSkipped ? 'rgba(255,255,255,0.025)' : colors.dim;
  const border = isDone ? DONE.border : isSkipped ? 'rgba(255,255,255,0.05)'  : colors.border;

  // Circle appearance:
  //   done        → solid sage fill + dark checkmark
  //   in-progress → subcat-dim fill + subcat border + small centre dot
  //   skipped     → neutral faint ring
  //   pending     → transparent + subcat ring
  const circleBg = isDone ? DONE.accent : inProgress ? colors.dim : 'transparent';
  const circleBorder = isDone ? DONE.accent
    : inProgress ? colors.accent
    : isSkipped  ? 'rgba(255,255,255,0.15)'
    : colors.accent;

  return (
    <div
      className="rounded-2xl px-4 py-3 mb-2"
      style={{ background: bg, border: `1px solid ${border}`, opacity: isSkipped ? 0.5 : 1, transition: 'background 0.2s ease, border-color 0.2s ease' }}
    >
      <div className="flex items-center gap-3">
        {/* Status circle — fills green instantly on tap via optimistic state */}
        <div
          className="shrink-0 flex items-center justify-center rounded-full"
          style={{ width: 26, height: 26, background: circleBg, border: `1.5px solid ${circleBorder}`, transition: 'all 0.18s ease' }}
        >
          {isDone    && <Check size={13} color="#0a0c10" strokeWidth={3} />}
          {isSkipped && <X    size={11} color="rgba(255,255,255,0.35)" strokeWidth={2.5} />}
          {inProgress && (
            <div className="rounded-full" style={{ width: 6, height: 6, background: colors.accent, opacity: 0.9 }} />
          )}
        </div>

        <span
          className="flex-1 text-[14px] font-medium leading-snug"
          style={{
            color:          isDone ? DONE.accent : isSkipped ? 'rgba(255,255,255,0.3)' : 'var(--text-primary)',
            textDecoration: isSkipped ? 'line-through' : 'none',
            fontFamily:     product.name.length < 14 ? "'Playfair Display', serif" : 'inherit',
            transition:     'color 0.2s ease',
          }}
        >
          {product.name}
          {product.oneTime && (
            <span className="ml-2 text-[10px] font-bold tracking-[0.08em] uppercase" style={{ color: N.muted }}>today</span>
          )}
          {product.durationSec > 0 && !inProgress && !isDone && !isSkipped && (
            <span className="ml-2 text-[11px]" style={{ color: N.muted }}>{product.durationSec}s</span>
          )}
        </span>

        {/* Buttons: shown only when pending and not in timer */}
        {!isDone && !isSkipped && !inProgress && (
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={handleDone}
              className="flex items-center justify-center rounded-xl active:scale-90 transition-transform"
              style={{ width: 32, height: 32, background: DONE.accent, color: '#0a0c10' }}
            >
              <Check size={14} strokeWidth={3} />
            </button>
            <button
              onClick={onSkip}
              className="flex items-center justify-center rounded-xl active:scale-90 transition-transform"
              style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.06)', color: N.secondary }}
            >
              <SkipForward size={13} strokeWidth={2} />
            </button>
          </div>
        )}
        {(isDone || isSkipped) && (
          <button
            onClick={handleUndo}
            className="text-[11px] font-medium active:opacity-50 transition-opacity"
            style={{ color: N.muted }}
          >
            undo
          </button>
        )}
      </div>

      {inProgress && (
        <TimerBar durationSec={product.durationSec} onComplete={handleTimerComplete} barColor={colors.accent} />
      )}
    </div>
  );
};

// ── Subcat Section ────────────────────────────────────────
interface SubcatSectionProps {
  sub:      string;
  products: RoutineProduct[];
  dayData:  SubcatDay | undefined;
  isToday:  boolean;
  onDone:   (productId: string) => void;
  onSkip:   (productId: string) => void;
}
const SubcatSection: React.FC<SubcatSectionProps> = ({ sub, products, dayData, isToday, onDone, onSkip }) => {
  const [open, setOpen] = useState(isToday);
  const colors    = subcatColor(sub);
  const entries   = dayData?.products ?? [];
  const total     = entries.length;
  const doneCount = entries.filter(e => e.status === 'done').length;
  const allDone   = total > 0 && doneCount === total;

  const entryMap  = new Map(entries.map(e => [e.productId, e]));
  const routineIds= new Set(products.map(p => p.id));

  return (
    <div className="mb-4">
      {/* Section header row */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 py-1.5 active:opacity-60 transition-opacity"
      >
        {/* Colour accent line */}
        <div className="w-[3px] h-3.5 rounded-full shrink-0" style={{ background: colors.accent, opacity: 0.9 }} />
        <span
          className="text-[11px] font-black tracking-[0.14em] uppercase shrink-0"
          style={{ color: colors.accent }}
        >
          {sub}
        </span>
        <div className="flex-1 h-px" style={{ background: N.hairline }} />
        {/* Progress indicator */}
        <span
          className="text-[11px] font-medium tabular-nums shrink-0"
          style={{ color: allDone ? DONE.accent : N.muted }}
        >
          {doneCount}/{total}
        </span>
        {allDone
          ? <Check size={12} color={DONE.accent} strokeWidth={3} />
          : open
            ? <ChevronUp  size={13} color={N.muted} />
            : <ChevronDown size={13} color={N.muted} />}
      </button>

      {open && (
        <div className="mt-2">
          {products.filter(p => !p.oneTime || entryMap.has(p.id)).map(p => (
            <ProductItem
              key={p.id}
              product={p}
              entry={entryMap.get(p.id)}
              colors={colors}
              onDone={() => onDone(p.id)}
              onSkip={() => onSkip(p.id)}
            />
          ))}
          {entries.filter(e => !routineIds.has(e.productId)).map(e => (
            <ProductItem
              key={e.productId}
              product={{ id: e.productId, name: '(carried)', durationSec: 0 }}
              entry={e}
              colors={colors}
              onDone={() => onDone(e.productId)}
              onSkip={() => onSkip(e.productId)}
            />
          ))}
          {total === 0 && (
            <p className="text-[12px] px-1 py-1.5" style={{ color: N.muted }}>No products.</p>
          )}
        </div>
      )}
    </div>
  );
};

// ── Day Panel ─────────────────────────────────────────────
interface DayPanelProps {
  weekId:   string;
  day:      DayName;
  weekData: WeekData;
  subcats:  string[];
  routine:  Record<string, RoutineProduct[]>;
  isToday:  boolean;
  dispatch: React.Dispatch<Action>;
}
const DayPanel: React.FC<DayPanelProps> = ({ weekId, day, weekData, subcats, routine, isToday, dispatch }) => {
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
    <div className="px-4 pb-4 pt-3">
      {subcats.map(sub => (
        <SubcatSection
          key={sub}
          sub={sub}
          products={routine[sub] ?? []}
          dayData={dayData?.subcats[sub]}
          isToday={isToday}
          onDone={id => handleDone(sub, id)}
          onSkip={id => handleSkip(sub, id)}
        />
      ))}
    </div>
  );
};

// ── Day Row ───────────────────────────────────────────────
interface DayRowProps {
  weekId:   string;
  day:      DayName;
  weekData: WeekData;
  subcats:  string[];
  routine:  Record<string, RoutineProduct[]>;
  dispatch: React.Dispatch<Action>;
  isToday:  boolean;
}
const DayRow: React.FC<DayRowProps> = ({ weekId, day, weekData, subcats, routine, dispatch, isToday }) => {
  const [open, setOpen] = useState(isToday);
  const dayData = weekData.days[day];

  const totalProducts = subcats.reduce((acc, sub) => acc + (dayData?.subcats[sub]?.products.length ?? 0), 0);
  const doneProducts  = subcats.reduce((acc, sub) =>
    acc + (dayData?.subcats[sub]?.products.filter(e => e.status === 'done').length ?? 0), 0);
  const allDone = totalProducts > 0 && doneProducts === totalProducts;

  return (
    <div
      className="mb-1.5 rounded-2xl overflow-hidden"
      style={{
        // Today gets a very subtle left accent strip via box-shadow; no hue in the bg
        border:    `1px solid ${isToday ? 'rgba(255,255,255,0.12)' : N.hairline}`,
        background: isToday ? 'rgba(255,255,255,0.04)' : N.surface,
        boxShadow: isToday ? 'inset 3px 0 0 rgba(255,255,255,0.14)' : 'none',
      }}
    >
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3"
      >
        <span
          className="text-[13px] font-bold w-8 text-left shrink-0"
          style={{ color: isToday ? N.heading : N.secondary }}
        >
          {day}
        </span>
        {isToday && (
          <span
            className="text-[9px] font-black tracking-[0.12em] uppercase px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(255,255,255,0.12)', color: N.heading }}
          >
            Today
          </span>
        )}
        <div className="flex-1" />

        {/* Progress */}
        {allDone
          ? <Check size={13} color={DONE.accent} strokeWidth={3} />
          : totalProducts > 0
            ? <span className="text-[11px] tabular-nums" style={{ color: N.muted }}>{doneProducts}/{totalProducts}</span>
            : null}

        {open
          ? <ChevronUp  size={14} color={N.muted} />
          : <ChevronDown size={14} color={N.muted} />}
      </button>

      {open && (
        <DayPanel
          weekId={weekId}
          day={day}
          weekData={weekData}
          subcats={subcats}
          routine={routine}
          isToday={isToday}
          dispatch={dispatch}
        />
      )}
    </div>
  );
};

// ── Week Card ─────────────────────────────────────────────
interface WeekCardProps {
  weekId:        string;
  weekData:      WeekData;
  subcats:       string[];
  routine:       Record<string, RoutineProduct[]>;
  dispatch:      React.Dispatch<Action>;
  currentWeekId: string;
  currentDay:    DayName;
}
const WeekCard: React.FC<WeekCardProps> = ({ weekId, weekData, subcats, routine, dispatch, currentWeekId, currentDay }) => {
  const isCurrent = weekId === currentWeekId;
  const [open, setOpen] = useState(isCurrent);

  const start  = weekStartDate(weekId);
  const end    = new Date(start.getTime() + 6 * 86400000);
  const fmt    = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const label  = isCurrent ? 'This Week' : `${fmt(start)} – ${fmt(end)}`;

  return (
    <div
      className="mb-4 rounded-3xl overflow-hidden"
      style={{
        border:     `1px solid ${isCurrent ? 'rgba(255,255,255,0.11)' : N.hairline}`,
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
            color:      isCurrent ? N.heading : N.secondary,
            fontFamily: "'Playfair Display', serif",
          }}
        >
          {label}
        </span>
        <div className="flex-1" />
        {open
          ? <ChevronUp  size={15} color={N.muted} />
          : <ChevronDown size={15} color={N.muted} />}
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
              isToday={isCurrent && day === currentDay}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Edit Page ─────────────────────────────────────────────
interface EditPageProps {
  state:    AppState;
  dispatch: React.Dispatch<Action>;
  onBack:   () => void;
}
const EditPage: React.FC<EditPageProps> = ({ state, dispatch, onBack }) => {
  const [activeSub, setActiveSub]           = useState(state.subcategories[0] ?? 'Morning');
  const [newProductName, setNewProductName] = useState('');
  const [newProductDur, setNewProductDur]   = useState('0');
  const [newSubName, setNewSubName]         = useState('');
  const [oneTimeName, setOneTimeName]       = useState('');
  const [oneTimeSub, setOneTimeSub]         = useState(state.subcategories[0] ?? 'Morning');

  useEffect(() => {
    if (!state.subcategories.includes(oneTimeSub)) setOneTimeSub(state.subcategories[0] ?? 'Morning');
  }, [state.subcategories, oneTimeSub]);

  const products   = state.routine[activeSub] ?? [];
  const activeColors = subcatColor(activeSub);

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
    if (!n || state.subcategories.includes(n)) return;
    dispatch({ type: 'ADD_SUBCAT', name: n });
    setNewSubName('');
  };

  const inputStyle: React.CSSProperties = {
    background:   'rgba(255,255,255,0.05)',
    border:       `1px solid rgba(255,255,255,0.10)`,
    borderRadius: 12,
    color:        'var(--text-primary)',
    padding:      '10px 14px',
    fontSize:     14,
    outline:      'none',
    width:        '100%',
    boxSizing:    'border-box',
  };

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      {/* Header — neutral, no hue */}
      <div
        className="sticky top-0 z-10 flex items-center gap-3 px-5 pt-4 pb-4"
        style={{ background: 'var(--bg-base)', borderBottom: `1px solid ${N.hairline}` }}
      >
        <button
          onClick={onBack}
          className="flex items-center justify-center rounded-xl active:scale-95 transition-transform"
          style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.07)' }}
        >
          <X size={16} color={N.secondary} />
        </button>
        <h1
          className="text-[19px] font-bold flex-1"
          style={{ fontFamily: "'Playfair Display', serif", color: N.heading }}
        >
          Edit Routine
        </h1>
      </div>

      <div className="px-5 pb-10">
        {/* Subcat tabs — each shows its own colour when active */}
        <div className="flex gap-2 mt-5 mb-5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {state.subcategories.map(sub => {
            const c = subcatColor(sub);
            const isActive = activeSub === sub;
            return (
              <button
                key={sub}
                onClick={() => setActiveSub(sub)}
                className="shrink-0 px-4 py-1.5 rounded-full text-[13px] font-bold transition-all active:scale-95"
                style={{
                  background: isActive ? c.dim    : 'rgba(255,255,255,0.06)',
                  color:      isActive ? c.accent : N.muted,
                  border:     `1px solid ${isActive ? c.border : 'transparent'}`,
                }}
              >
                {sub}
              </button>
            );
          })}
        </div>

        {/* Product list */}
        <div className="mb-5">
          <p className="text-[11px] font-black tracking-[0.10em] uppercase mb-3" style={{ color: N.muted }}>
            Products · {activeSub}
          </p>
          {products.filter(p => !p.oneTime).map((p, idx, arr) => (
            <div
              key={p.id}
              className="flex items-center gap-2 mb-2 px-4 py-3 rounded-2xl"
              style={{ background: activeColors.dim, border: `1px solid ${activeColors.border}` }}
            >
              <span className="flex-1 text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>
                {p.name}
                {p.durationSec > 0 && (
                  <span className="ml-2 text-[11px]" style={{ color: N.muted }}>{p.durationSec}s</span>
                )}
              </span>
              <button
                onClick={() => dispatch({ type: 'MOVE_PRODUCT', sub: activeSub, productId: p.id, dir: 'up' })}
                disabled={idx === 0}
                className="p-1.5 rounded-lg disabled:opacity-20 transition-opacity"
                style={{ color: N.secondary }}
              >
                <ArrowUp size={14} />
              </button>
              <button
                onClick={() => dispatch({ type: 'MOVE_PRODUCT', sub: activeSub, productId: p.id, dir: 'down' })}
                disabled={idx === arr.length - 1}
                className="p-1.5 rounded-lg disabled:opacity-20 transition-opacity"
                style={{ color: N.secondary }}
              >
                <ArrowDown size={14} />
              </button>
              <button
                onClick={() => dispatch({ type: 'REMOVE_PRODUCT', sub: activeSub, productId: p.id })}
                className="p-1.5 rounded-lg active:opacity-60 transition-opacity"
                style={{ color: '#e05555' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {products.filter(p => !p.oneTime).length === 0 && (
            <p className="text-[13px] py-2" style={{ color: N.muted }}>No products yet.</p>
          )}
        </div>

        {/* Add product */}
        <div className="mb-5 p-4 rounded-3xl" style={{ background: 'var(--bg-surface)', border: `1px solid ${N.hairline}` }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-[3px] h-3.5 rounded-full" style={{ background: activeColors.accent }} />
            <p className="text-[11px] font-black tracking-[0.10em] uppercase" style={{ color: activeColors.accent }}>
              Add to {activeSub}
            </p>
          </div>
          <input
            style={inputStyle}
            className="mb-2"
            placeholder="Product name…"
            value={newProductName}
            onChange={e => setNewProductName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addProduct()}
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
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl font-bold text-[13px] active:scale-95 transition-transform"
              style={{ background: activeColors.dim, color: activeColors.accent, border: `1px solid ${activeColors.border}`, height: 44 }}
            >
              <Plus size={15} strokeWidth={3} /> Add
            </button>
          </div>
        </div>

        {/* One-time product */}
        <div className="mb-5 p-4 rounded-3xl" style={{ background: 'var(--bg-surface)', border: `1px solid ${N.hairline}` }}>
          <p className="text-[11px] font-black tracking-[0.10em] uppercase mb-1" style={{ color: N.secondary }}>
            One-Time · Today Only
          </p>
          <p className="text-[12px] mb-3" style={{ color: N.muted }}>Won't repeat tomorrow.</p>
          <div className="flex gap-2 mb-2 flex-wrap">
            {state.subcategories.map(sub => {
              const c = subcatColor(sub);
              const sel = oneTimeSub === sub;
              return (
                <button
                  key={sub}
                  onClick={() => setOneTimeSub(sub)}
                  className="px-3 py-1 rounded-full text-[12px] font-bold transition-all active:scale-95"
                  style={{
                    background: sel ? c.dim  : 'rgba(255,255,255,0.05)',
                    color:      sel ? c.accent : N.muted,
                    border:     `1px solid ${sel ? c.border : 'transparent'}`,
                  }}
                >
                  {sub}
                </button>
              );
            })}
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
              className="flex items-center justify-center rounded-2xl font-bold text-[13px] px-4 active:scale-95 transition-transform"
              style={{ background: 'rgba(255,255,255,0.07)', color: N.secondary, height: 44 }}
            >
              Add
            </button>
          </div>
        </div>

        {/* Manage sections */}
        <div className="p-4 rounded-3xl" style={{ background: 'var(--bg-surface)', border: `1px solid ${N.hairline}` }}>
          <p className="text-[11px] font-black tracking-[0.10em] uppercase mb-3" style={{ color: N.muted }}>
            Sections
          </p>
          {state.subcategories.map(sub => {
            const c = subcatColor(sub);
            return (
              <div key={sub} className="flex items-center gap-3 mb-2 py-1">
                <div className="w-[3px] h-3.5 rounded-full shrink-0" style={{ background: c.accent, opacity: 0.7 }} />
                <span className="flex-1 text-[14px]" style={{ color: 'var(--text-primary)' }}>{sub}</span>
                {sub !== 'Morning' && sub !== 'Night' && (
                  <button
                    onClick={() => { dispatch({ type: 'REMOVE_SUBCAT', name: sub }); if (activeSub === sub) setActiveSub('Morning'); }}
                    className="p-1.5 rounded-lg active:opacity-60 transition-opacity"
                    style={{ color: '#e05555' }}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            );
          })}
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
              className="flex items-center justify-center rounded-2xl font-bold text-[13px] px-4 active:scale-95 transition-transform"
              style={{ background: 'rgba(255,255,255,0.07)', color: N.secondary, height: 44 }}
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
  const [view, setView]   = useState<'main' | 'edit'>('main');
  const weekIds     = generateWeekIds(2, 2);
  const currentWeek = todayWeekId();
  const currentDay  = todayDayName();

  useEffect(() => {
    try { localStorage.setItem('athlix_skincare_v1', JSON.stringify(state)); } catch {}
  }, [state]);

  useEffect(() => { dispatch({ type: 'ENSURE_WEEKS' }); }, []);

  if (view === 'edit') {
    return <EditPage state={state} dispatch={dispatch} onBack={() => setView('main')} />;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      {/* Header — fully neutral, serif title, colour only in the small morning/night pills */}
      <div
        className="shrink-0 px-5 pt-4 pb-4"
        style={{ borderBottom: `1px solid ${N.hairline}`, background: 'var(--bg-base)' }}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={16} color={N.secondary} strokeWidth={1.8} />
              <h1
                className="text-[21px] font-bold leading-none"
                style={{ fontFamily: "'Playfair Display', serif", color: N.heading }}
              >
                Skincare
              </h1>
            </div>
            {/* Colour legend pills — replaces generic subtitle */}
            <div className="flex items-center gap-2 mt-1.5 ml-0.5">
              <span
                className="text-[10px] font-black tracking-[0.10em] uppercase px-2 py-0.5 rounded-full"
                style={{ background: MORNING.dim, color: MORNING.accent, border: `1px solid ${MORNING.border}` }}
              >
                Morning
              </span>
              <span
                className="text-[10px] font-black tracking-[0.10em] uppercase px-2 py-0.5 rounded-full"
                style={{ background: NIGHT.dim, color: NIGHT.accent, border: `1px solid ${NIGHT.border}` }}
              >
                Night
              </span>
              <span
                className="text-[10px] font-black tracking-[0.10em] uppercase px-2 py-0.5 rounded-full"
                style={{ background: DONE.dim, color: DONE.accent, border: `1px solid ${DONE.border}` }}
              >
                Done
              </span>
            </div>
          </div>

          <button
            onClick={() => setView('edit')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl active:scale-95 transition-transform mt-0.5"
            style={{ background: 'rgba(255,255,255,0.07)', border: `1px solid ${N.hairline}`, color: N.secondary }}
          >
            <Edit3 size={13} strokeWidth={2} />
            <span className="text-[13px] font-semibold">Edit</span>
          </button>
        </div>
      </div>

      {/* Week list */}
      <div className="flex-1 overflow-y-auto px-4 pt-5 pb-6">
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
