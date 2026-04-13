import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, X } from 'lucide-react';
import type { DialFieldKind, ExerciseInputType, WeightUnit, DistanceUnit } from '../../lib/exerciseTypes';
import { haptics } from '../../lib/haptics';

interface DialPickerProps {
  title: string;
  fieldKind: DialFieldKind;
  inputType: ExerciseInputType;
  initialValue: number;
  weightUnit?: WeightUnit;
  distanceUnit?: DistanceUnit;
  onClose: () => void;
  onConfirm: (value: number) => void;
}

interface PickerColumn {
  id: string;
  values: number[];
  format: (value: number) => string;
  initialIndex: number;
  unitLabel?: string;
}

const DIAL_ITEM_HEIGHT = 46;
const DIAL_VIEW_HEIGHT = 252;
const DIAL_PADDING = (DIAL_VIEW_HEIGHT - DIAL_ITEM_HEIGHT) / 2;
const DIAL_SNAP_DELAY = 110;

const clampIndex = (index: number, length: number) => Math.max(0, Math.min(length - 1, index));

const buildColumns = (
  fieldKind: DialFieldKind,
  inputType: ExerciseInputType,
  initialValue: number,
  weightUnit: WeightUnit,
  distanceUnit: DistanceUnit,
): PickerColumn[] => {
  const wholePart = Math.floor(Math.max(0, initialValue));

  switch (fieldKind) {
    case 'weight': {
      const maxWeight = weightUnit === 'kg' ? 300 : 600;
      const wholeValues = Array.from({ length: maxWeight + 1 }, (_, index) => index);
      const decimalValues = [0, 5];
      const decimal = Math.abs(initialValue - wholePart) >= 0.25 ? 5 : 0;
      return [
        {
          id: 'whole',
          values: wholeValues,
          format: (value) => String(value),
          initialIndex: Math.min(maxWeight, wholePart),
          unitLabel: weightUnit.toUpperCase(),
        },
        {
          id: 'decimal',
          values: decimalValues,
          format: (value) => `.${value}`,
          initialIndex: decimalValues.findIndex((value) => value === decimal),
        },
      ];
    }

    case 'distance': {
      const wholeValues = Array.from({ length: 101 }, (_, index) => index);
      const decimalValues = Array.from({ length: 10 }, (_, index) => index);
      const decimal = Math.max(0, Math.min(9, Math.round((initialValue - wholePart) * 10)));
      return [
        {
          id: 'whole',
          values: wholeValues,
          format: (value) => String(value),
          initialIndex: Math.min(wholeValues.length - 1, wholePart),
          unitLabel: distanceUnit.toUpperCase(),
        },
        {
          id: 'decimal',
          values: decimalValues,
          format: (value) => `.${value}`,
          initialIndex: decimal,
        },
      ];
    }

    case 'minutes': {
      const max = inputType === 'time_only' ? 120 : 180;
      const values = Array.from({ length: max + 1 }, (_, index) => index);
      return [
        {
          id: 'minutes',
          values,
          format: (value) => String(value),
          initialIndex: Math.max(0, Math.min(values.length - 1, Math.round(initialValue))),
          unitLabel: 'MIN',
        },
      ];
    }

    case 'seconds': {
      const values = Array.from({ length: 12 }, (_, index) => index * 5);
      const snapped = Math.max(0, Math.min(55, Math.round(initialValue / 5) * 5));
      return [
        {
          id: 'seconds',
          values,
          format: (value) => String(value).padStart(2, '0'),
          initialIndex: values.findIndex((value) => value === snapped),
          unitLabel: 'SEC',
        },
      ];
    }

    case 'reps': {
      const min = inputType === 'reps_only' ? 1 : 0;
      const max = inputType === 'reps_only' ? 50 : 80;
      const values = Array.from({ length: max - min + 1 }, (_, index) => min + index);
      const target = Math.max(min, Math.min(max, Math.round(initialValue)));
      return [
        {
          id: 'reps',
          values,
          format: (value) => String(value),
          initialIndex: values.findIndex((value) => value === target),
          unitLabel: 'REPS',
        },
      ];
    }

    case 'height': {
      const values = Array.from({ length: 251 }, (_, index) => index);
      return [
        {
          id: 'height',
          values,
          format: (value) => String(value),
          initialIndex: Math.max(0, Math.min(values.length - 1, Math.round(initialValue))),
          unitLabel: 'CM',
        },
      ];
    }

    case 'calories': {
      const values = Array.from({ length: 301 }, (_, index) => index * 5);
      const snapped = Math.round(Math.max(0, initialValue) / 5) * 5;
      const initialIndex = Math.max(0, Math.min(values.length - 1, Math.round(snapped / 5)));
      return [
        {
          id: 'calories',
          values,
          format: (value) => String(value),
          initialIndex,
          unitLabel: 'CAL',
        },
      ];
    }

    default:
      return [
        {
          id: 'default',
          values: Array.from({ length: 101 }, (_, index) => index),
          format: (value) => String(value),
          initialIndex: Math.max(0, Math.min(100, Math.round(initialValue))),
        },
      ];
  }
};

const composeValue = (fieldKind: DialFieldKind, selected: number[]) => {
  if (fieldKind === 'weight') {
    const whole = selected[0] || 0;
    const decimal = selected[1] || 0;
    return Number((whole + (decimal === 5 ? 0.5 : 0)).toFixed(1));
  }

  if (fieldKind === 'distance') {
    const whole = selected[0] || 0;
    const decimal = selected[1] || 0;
    return Number((whole + decimal / 10).toFixed(1));
  }

  return Number(selected[0] || 0);
};

interface DialColumnProps {
  values: number[];
  format: (value: number) => string;
  initialIndex: number;
  unitLabel?: string;
  onChange: (value: number) => void;
}

const DialColumn: React.FC<DialColumnProps> = ({ values, format, initialIndex, unitLabel, onChange }) => {
  const columnRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const hasMountedRef = useRef(false);
  const snapTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setSelectedIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    const root = columnRef.current;
    if (!root) return;

    root.scrollTo({ top: initialIndex * DIAL_ITEM_HEIGHT, behavior: 'auto' });
    hasMountedRef.current = false;
    const enableHapticsTimer = window.setTimeout(() => {
      hasMountedRef.current = true;
    }, 120);

    return () => {
      window.clearTimeout(enableHapticsTimer);
    };
  }, [initialIndex]);

  useEffect(
    () => () => {
      if (snapTimerRef.current) {
        window.clearTimeout(snapTimerRef.current);
      }
    },
    [],
  );

  const syncSelectedIndex = (scrollTop: number) => {
    const nextIndex = clampIndex(Math.round(scrollTop / DIAL_ITEM_HEIGHT), values.length);
    setSelectedIndex((prev) => {
      if (prev !== nextIndex && hasMountedRef.current) {
        haptics.tick();
      }
      return nextIndex;
    });
  };

  const snapToNearest = (behavior: ScrollBehavior = 'smooth') => {
    const root = columnRef.current;
    if (!root) return;
    const nextIndex = clampIndex(Math.round(root.scrollTop / DIAL_ITEM_HEIGHT), values.length);
    root.scrollTo({ top: nextIndex * DIAL_ITEM_HEIGHT, behavior });
  };

  const handleScroll = () => {
    const root = columnRef.current;
    if (!root) return;

    syncSelectedIndex(root.scrollTop);
    if (snapTimerRef.current) {
      window.clearTimeout(snapTimerRef.current);
    }
    snapTimerRef.current = window.setTimeout(() => {
      snapToNearest('smooth');
    }, DIAL_SNAP_DELAY);
  };

  useEffect(() => {
    const nextValue = values[selectedIndex];
    if (nextValue == null) return;
    onChange(nextValue);
  }, [onChange, selectedIndex, values]);

  return (
    <div className="relative min-w-0 flex-1">
      <div
        ref={columnRef}
        onScroll={handleScroll}
        onTouchEnd={() => snapToNearest('smooth')}
        onMouseUp={() => snapToNearest('smooth')}
        className="no-scrollbar h-[252px] overflow-y-auto"
        style={{
          scrollSnapType: 'y mandatory',
          WebkitOverflowScrolling: 'touch',
          paddingTop: DIAL_PADDING,
          paddingBottom: DIAL_PADDING,
        }}
      >
        {values.map((value, index) => {
          const distance = Math.abs(index - selectedIndex);
          const opacity = distance === 0 ? 1 : distance === 1 ? 0.56 : distance === 2 ? 0.3 : 0.15;
          const scale = distance === 0 ? 1 : distance === 1 ? 0.9 : 0.82;
          const fontSize = distance === 0 ? 58 : distance === 1 ? 44 : 34;

          return (
            <button
              key={`${value}-${index}`}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              onClick={() => {
                const node = itemRefs.current[index];
                if (!node || !columnRef.current) return;
                columnRef.current.scrollTo({ top: node.offsetTop - DIAL_PADDING, behavior: 'smooth' });
              }}
              className="flex h-[46px] w-full items-center justify-center text-center tabular-nums font-medium leading-none text-[#EAF1F8]"
              style={{
                scrollSnapAlign: 'center',
                opacity,
                transform: `scale(${scale})`,
                fontSize: `${fontSize}px`,
              }}
            >
              {format(value)}
            </button>
          );
        })}
      </div>

      {unitLabel && (
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold tracking-[0.12em] text-[#90A4BA]">
          {unitLabel}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#0D1421] via-[#0D1421]/85 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0D1421] via-[#0D1421]/85 to-transparent" />
    </div>
  );
};

export const DialPicker: React.FC<DialPickerProps> = ({
  title,
  fieldKind,
  inputType,
  initialValue,
  weightUnit = 'kg',
  distanceUnit = 'km',
  onClose,
  onConfirm,
}) => {
  const columns = useMemo(
    () => buildColumns(fieldKind, inputType, initialValue, weightUnit, distanceUnit),
    [distanceUnit, fieldKind, initialValue, inputType, weightUnit],
  );

  const [selectedValues, setSelectedValues] = useState<number[]>(
    columns.map((column) => column.values[Math.max(0, column.initialIndex)] ?? 0),
  );

  useEffect(() => {
    setSelectedValues(columns.map((column) => column.values[Math.max(0, column.initialIndex)] ?? 0));
  }, [columns]);

  const handleColumnChange = (columnIndex: number, value: number) => {
    setSelectedValues((prev) => {
      const next = [...prev];
      next[columnIndex] = value;
      return next;
    });
  };

  const submit = () => {
    onConfirm(composeValue(fieldKind, selectedValues));
  };

  return (
    <div className="fixed inset-0 z-[220]">
      <button
        type="button"
        aria-label="Dismiss picker"
        onClick={onClose}
        className="absolute inset-0 bg-black/62 backdrop-blur-[1px]"
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 270 }}
        className="absolute bottom-0 left-0 right-0 mx-auto w-full max-w-[860px] rounded-t-[24px] border border-white/10 border-b-0 bg-[rgba(11,17,27,0.96)] px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25" />

        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center gap-1 rounded-lg bg-white/5 px-3 text-[12px] font-medium text-[#D1DCE7] transition-colors hover:bg-white/10"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <h3 className="text-center text-[16px] font-semibold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-[#9FB1C3] transition-colors hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className={`relative mb-4 grid overflow-hidden rounded-[20px] border border-white/10 bg-[rgba(16,24,36,0.86)] ${
            columns.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
          }`}
        >
          {columns.map((column, index) => (
            <div key={column.id} className={index > 0 ? 'border-l border-white/10' : ''}>
              <DialColumn
                values={column.values}
                format={column.format}
                initialIndex={column.initialIndex}
                unitLabel={column.unitLabel}
                onChange={(value) => handleColumnChange(index, value)}
              />
            </div>
          ))}

          <div className="pointer-events-none absolute inset-x-2 top-1/2 -translate-y-1/2 h-[46px] rounded-xl border border-white/20 bg-white/[0.06]" />
        </div>

        <button
          type="button"
          onClick={submit}
          className="h-[52px] w-full rounded-xl bg-[#C9D6E4] text-[15px] font-semibold text-[#0E1A27] transition-colors hover:bg-[#D4DEE9]"
        >
          Done
        </button>
      </motion.div>
    </div>
  );
};
