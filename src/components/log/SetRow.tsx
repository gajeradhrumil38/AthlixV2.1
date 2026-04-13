import React from 'react';
import { Check } from 'lucide-react';
import type { Set } from '../../legacy-pages/Log';

interface SetRowField {
  field: 'weight' | 'reps';
  label: string;
  value: number | null;
  displayValue: string;
}

interface SetRowProps {
  index: number;
  set: Set;
  primary: SetRowField;
  secondary?: SetRowField | null;
  onOpenDial: (field: 'weight' | 'reps') => void;
  onMarkDone: () => void;
}

const ValueBox: React.FC<{
  field: SetRowField;
  isDone: boolean;
  onTap: () => void;
}> = ({ field, isDone, onTap }) => {
  return (
    <button
      onClick={onTap}
      className={`relative flex h-[82px] w-full flex-col items-center justify-center gap-[3px] overflow-hidden rounded-2xl border text-center transition-all active:scale-[0.97] ${
        isDone
          ? 'border-white/10 bg-white/[0.04]'
          : 'border-white/[0.08] bg-[rgba(12,20,34,0.72)]'
      }`}
    >
      {/* top shimmer line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.12] to-transparent" />
      <div className="tabular-nums text-[36px] leading-none font-black text-[#EAF1F8]">{field.displayValue}</div>
      <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#506070]">{field.label}</div>
    </button>
  );
};

export const SetRow: React.FC<SetRowProps> = ({
  index,
  set,
  primary,
  secondary,
  onOpenDial,
  onMarkDone,
}) => {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border transition-all duration-200 ${
        set.done
          ? 'border-[#2E4E68]/60 bg-[rgba(22,42,62,0.55)]'
          : 'border-white/[0.07] bg-[rgba(13,20,33,0.80)]'
      }`}
    >
      {/* left accent bar */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-[3px] transition-colors duration-200 ${
          set.done ? 'bg-[#3A7CA8]' : 'bg-[#1E3448]'
        }`}
      />

      {/* header row */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 pl-5">
        <div className="flex items-center gap-2">
          <div
            className={`rounded-md px-2 py-[3px] text-[10px] font-bold tracking-[0.14em] uppercase transition-colors duration-200 ${
              set.done
                ? 'bg-[#1E3D55] text-[#6AADD4]'
                : 'bg-white/[0.05] text-[#607585]'
            }`}
          >
            Set {index}
          </div>
          {set.done && (
            <span className="text-[10px] font-semibold tracking-[0.08em] text-[#4A7FA0] uppercase">
              Done
            </span>
          )}
        </div>

        <button
          onClick={onMarkDone}
          aria-label={set.done ? `Mark set ${index} incomplete` : `Mark set ${index} complete`}
          className={`h-[46px] w-[46px] rounded-full border flex items-center justify-center transition-all duration-200 active:scale-95 ${
            set.done
              ? 'border-[#3A7CA8]/70 bg-[#1E3D55] text-[#6AADD4]'
              : 'border-white/[0.12] bg-white/[0.04] text-white/30'
          }`}
        >
          <Check className="w-5 h-5" />
        </button>
      </div>

      {/* value boxes */}
      <div className={`grid gap-2 px-3 pb-3 pl-4 ${secondary ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <ValueBox field={primary} isDone={set.done} onTap={() => onOpenDial(primary.field)} />
        {secondary && (
          <ValueBox field={secondary} isDone={set.done} onTap={() => onOpenDial(secondary.field)} />
        )}
      </div>
    </div>
  );
};
