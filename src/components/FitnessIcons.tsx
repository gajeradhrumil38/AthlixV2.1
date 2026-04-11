import React from 'react';

export type FitnessGlyphName =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'legs'
  | 'core'
  | 'cardio'
  | 'push'
  | 'calendar'
  | 'stats'
  | 'goal'
  | 'body'
  | 'spark'
  | 'trophy'
  | 'bolt'
  | 'week'
  | 'heart'
  | 'strength';

export const MUSCLE_COLORS: Record<string, string> = {
  Chest: '#FF7C96',
  Back: '#5FD4C2',
  Shoulders: '#FDBA74',
  Biceps: '#A3E635',
  Triceps: '#22D3EE',
  Legs: '#A78BFA',
  Abs: '#FCD34D',
  Core: '#FCD34D',
  Cardio: '#38BDF8',
};

const filled = {
  fill: 'currentColor',
};

const stroked = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const ExerciseSilhouette: React.FC<{
  type: 'bench' | 'pullup' | 'press' | 'curl' | 'extension' | 'squat' | 'crunch' | 'run';
}> = ({ type }) => {
  switch (type) {
    case 'bench':
      return (
        <>
          <rect {...filled} x="4" y="7" width="16" height="1.4" rx="0.7" />
          <rect {...filled} x="3" y="6.2" width="1.5" height="3" rx="0.5" />
          <rect {...filled} x="19.5" y="6.2" width="1.5" height="3" rx="0.5" />
          <rect {...filled} x="6" y="15.2" width="10" height="1.4" rx="0.7" />
          <rect {...filled} x="6.2" y="15.2" width="1.2" height="3.8" rx="0.6" />
          <circle {...filled} cx="7.2" cy="12.2" r="1.4" />
          <rect {...filled} x="8.4" y="11.5" width="5.2" height="1.5" rx="0.75" />
          <rect {...filled} x="9.2" y="8.4" width="1.1" height="3.3" rx="0.55" transform="rotate(18 9.75 10)" />
          <rect {...filled} x="13.6" y="8.3" width="1.1" height="3.4" rx="0.55" transform="rotate(-18 14.15 10)" />
          <rect {...filled} x="13.3" y="12.1" width="1.1" height="3.2" rx="0.55" transform="rotate(-20 13.85 13.7)" />
          <rect {...filled} x="9.7" y="12.2" width="1.1" height="3" rx="0.55" transform="rotate(28 10.25 13.7)" />
        </>
      );
    case 'pullup':
      return (
        <>
          <rect {...filled} x="4" y="4.5" width="16" height="1.5" rx="0.75" />
          <rect {...filled} x="4.5" y="5.5" width="1.2" height="10.5" rx="0.6" />
          <rect {...filled} x="18.3" y="5.5" width="1.2" height="10.5" rx="0.6" />
          <circle {...filled} cx="12" cy="8.4" r="1.5" />
          <rect {...filled} x="10.9" y="9.7" width="2.2" height="4.3" rx="1.1" />
          <rect {...filled} x="9.2" y="5.6" width="1.1" height="4.5" rx="0.55" transform="rotate(24 9.75 7.85)" />
          <rect {...filled} x="13.7" y="5.6" width="1.1" height="4.5" rx="0.55" transform="rotate(-24 14.25 7.85)" />
          <rect {...filled} x="10.5" y="13.7" width="1.1" height="4.7" rx="0.55" transform="rotate(18 11.05 16.05)" />
          <rect {...filled} x="12.4" y="13.7" width="1.1" height="4.7" rx="0.55" transform="rotate(-18 12.95 16.05)" />
        </>
      );
    case 'press':
      return (
        <>
          <circle {...filled} cx="12" cy="5.6" r="1.45" />
          <rect {...filled} x="10.9" y="7" width="2.2" height="5" rx="1.1" />
          <rect {...filled} x="8.4" y="6.3" width="1.1" height="5" rx="0.55" transform="rotate(22 8.95 8.8)" />
          <rect {...filled} x="14.5" y="6.3" width="1.1" height="5" rx="0.55" transform="rotate(-22 15.05 8.8)" />
          <rect {...filled} x="7.7" y="4" width="2.4" height="1.1" rx="0.55" />
          <rect {...filled} x="13.9" y="4" width="2.4" height="1.1" rx="0.55" />
          <rect {...filled} x="10.1" y="11.4" width="1.2" height="5.2" rx="0.6" transform="rotate(20 10.7 14)" />
          <rect {...filled} x="12.7" y="11.4" width="1.2" height="5.2" rx="0.6" transform="rotate(-20 13.3 14)" />
        </>
      );
    case 'curl':
      return (
        <>
          <circle {...filled} cx="10" cy="5.8" r="1.5" />
          <rect {...filled} x="8.9" y="7.2" width="2.2" height="5" rx="1.1" transform="rotate(12 10 9.7)" />
          <rect {...filled} x="7.9" y="12" width="1.15" height="5.2" rx="0.58" transform="rotate(18 8.45 14.6)" />
          <rect {...filled} x="10.8" y="12.1" width="1.15" height="5.3" rx="0.58" transform="rotate(-8 11.35 14.75)" />
          <rect {...filled} x="13.3" y="7.5" width="1.2" height="4.6" rx="0.6" transform="rotate(-52 13.9 9.8)" />
          <rect {...filled} x="14.1" y="6.7" width="1.5" height="1.1" rx="0.4" transform="rotate(-52 14.85 7.25)" />
          <rect {...filled} x="15.8" y="8.7" width="1.5" height="1.1" rx="0.4" transform="rotate(-52 16.55 9.25)" />
        </>
      );
    case 'extension':
      return (
        <>
          <circle {...filled} cx="11" cy="5.7" r="1.45" />
          <rect {...filled} x="10" y="7.1" width="2.1" height="5" rx="1.05" />
          <rect {...filled} x="11.7" y="5.2" width="1.1" height="4.6" rx="0.55" transform="rotate(-26 12.25 7.5)" />
          <rect {...filled} x="12.8" y="4" width="1.5" height="1.1" rx="0.4" transform="rotate(-26 13.55 4.55)" />
          <rect {...filled} x="14.2" y="5" width="1.5" height="1.1" rx="0.4" transform="rotate(-26 14.95 5.55)" />
          <rect {...filled} x="8.2" y="8.2" width="1.05" height="4" rx="0.52" transform="rotate(26 8.72 10.2)" />
          <rect {...filled} x="9.1" y="11.9" width="1.15" height="5" rx="0.58" transform="rotate(20 9.67 14.4)" />
          <rect {...filled} x="11.6" y="11.9" width="1.15" height="5.1" rx="0.58" transform="rotate(-12 12.17 14.45)" />
        </>
      );
    case 'squat':
      return (
        <>
          <circle {...filled} cx="12.2" cy="5.6" r="1.45" />
          <rect {...filled} x="11.1" y="7.1" width="2.2" height="4.5" rx="1.1" />
          <rect {...filled} x="8.1" y="7.4" width="1.15" height="4.3" rx="0.58" transform="rotate(58 8.68 9.55)" />
          <rect {...filled} x="15.2" y="7.4" width="1.15" height="4.3" rx="0.58" transform="rotate(-58 15.78 9.55)" />
          <rect {...filled} x="8.8" y="11" width="1.2" height="5.4" rx="0.6" transform="rotate(52 9.4 13.7)" />
          <rect {...filled} x="14.4" y="11" width="1.2" height="5.4" rx="0.6" transform="rotate(-52 15 13.7)" />
          <rect {...filled} x="8.2" y="15.2" width="4" height="1.2" rx="0.6" transform="rotate(-20 10.2 15.8)" />
          <rect {...filled} x="12.5" y="15.2" width="4" height="1.2" rx="0.6" transform="rotate(20 14.5 15.8)" />
        </>
      );
    case 'crunch':
      return (
        <>
          <rect {...filled} x="4" y="17.4" width="10.5" height="1.2" rx="0.6" />
          <circle {...filled} cx="16.8" cy="10.2" r="1.45" />
          <rect {...filled} x="13.1" y="10.7" width="5" height="1.35" rx="0.68" transform="rotate(-35 15.6 11.38)" />
          <rect {...filled} x="9.5" y="13.1" width="4.8" height="1.35" rx="0.68" transform="rotate(26 11.9 13.78)" />
          <rect {...filled} x="7" y="13.8" width="1.15" height="4.4" rx="0.58" transform="rotate(-26 7.58 16)" />
          <rect {...filled} x="10.7" y="14.2" width="1.15" height="4.4" rx="0.58" transform="rotate(40 11.28 16.4)" />
        </>
      );
    case 'run':
      return (
        <>
          <circle {...filled} cx="12.8" cy="5.6" r="1.45" />
          <rect {...filled} x="11.7" y="7.1" width="2.1" height="4.4" rx="1.05" transform="rotate(18 12.75 9.3)" />
          <rect {...filled} x="14.3" y="7.7" width="1.05" height="4" rx="0.52" transform="rotate(-52 14.82 9.7)" />
          <rect {...filled} x="9.6" y="9" width="1.05" height="4" rx="0.52" transform="rotate(62 10.12 11)" />
          <rect {...filled} x="13.1" y="11" width="1.2" height="5.8" rx="0.6" transform="rotate(-28 13.7 13.9)" />
          <rect {...filled} x="10" y="11.5" width="1.2" height="6.2" rx="0.6" transform="rotate(34 10.6 14.6)" />
        </>
      );
    default:
      return null;
  }
};

export const FitnessGlyph: React.FC<{
  name: FitnessGlyphName;
  size?: number;
  className?: string;
}> = ({ name, size = 20, className = '' }) => {
  const glyph = (() => {
    switch (name) {
      case 'chest':
      case 'push':
        return <ExerciseSilhouette type="bench" />;
      case 'back':
        return <ExerciseSilhouette type="pullup" />;
      case 'shoulders':
        return <ExerciseSilhouette type="press" />;
      case 'biceps':
        return <ExerciseSilhouette type="curl" />;
      case 'triceps':
        return <ExerciseSilhouette type="extension" />;
      case 'legs':
        return <ExerciseSilhouette type="squat" />;
      case 'core':
        return <ExerciseSilhouette type="crunch" />;
      case 'cardio':
        return <ExerciseSilhouette type="run" />;
      case 'calendar':
        return (
          <>
            <rect {...stroked} x="5" y="6" width="14" height="13" rx="3" />
            <path {...stroked} d="M8 4v4M16 4v4M5 10h14" />
          </>
        );
      case 'stats':
        return <path {...stroked} d="M6 18V9M12 18V6M18 18v-8" />;
      case 'goal':
        return (
          <>
            <circle {...stroked} cx="12" cy="12" r="7" />
            <circle {...stroked} cx="12" cy="12" r="3" />
          </>
        );
      case 'body':
        return (
          <>
            <circle {...stroked} cx="12" cy="5.5" r="2.5" />
            <path {...stroked} d="M12 8v10M8 11l4 2 4-2M9 19l3-4 3 4" />
          </>
        );
      case 'spark':
        return <path {...stroked} d="m12 4 1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" />;
      case 'trophy':
        return (
          <>
            <path {...stroked} d="M8 5h8v3a4 4 0 0 1-8 0z" />
            <path {...stroked} d="M9 18h6M12 12v6M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" />
          </>
        );
      case 'bolt':
        return <path {...stroked} d="M13 4 7 12h4l-1 8 7-10h-4z" />;
      case 'week':
        return (
          <>
            <path {...stroked} d="M5 7h14M7 5v4M17 5v4" />
            <rect {...stroked} x="5" y="7" width="14" height="12" rx="3" />
            <path {...stroked} d="M8 12h2M12 12h2M16 12h.01M8 16h2M12 16h2" />
          </>
        );
      case 'heart':
        return <path {...stroked} d="M12 19s-6.5-4.4-6.5-9.2A3.8 3.8 0 0 1 9.2 6c1.1 0 2.1.5 2.8 1.4A3.6 3.6 0 0 1 14.8 6a3.8 3.8 0 0 1 3.7 3.8C18.5 14.6 12 19 12 19Z" />;
      case 'strength':
      default:
        return (
          <>
            <path {...stroked} d="M5 10v4M7 8v8M17 8v8M19 10v4M7 12h10" />
          </>
        );
    }
  })();

  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      {glyph}
    </svg>
  );
};

export const FitnessBadge: React.FC<{
  name: FitnessGlyphName;
  color: string;
  size?: number;
  className?: string;
}> = ({ name, color, size = 44, className = '' }) => (
  <div
    className={`flex items-center justify-center rounded-2xl border ${className}`}
    style={{
      width: size,
      height: size,
      color,
      background: `${color}14`,
      borderColor: `${color}33`,
      boxShadow: `0 0 20px ${color}18`,
    }}
  >
    <FitnessGlyph name={name} size={size * 0.5} />
  </div>
);

export const muscleToGlyph = (muscle: string): FitnessGlyphName => {
  switch (muscle) {
    case 'Chest': return 'chest';
    case 'Back': return 'back';
    case 'Shoulders': return 'shoulders';
    case 'Biceps': return 'biceps';
    case 'Triceps': return 'triceps';
    case 'Legs': return 'legs';
    case 'Abs':
    case 'Core': return 'core';
    case 'Cardio': return 'cardio';
    default: return 'strength';
  }
};

export const widgetToGlyph: Record<string, FitnessGlyphName> = {
  date_navigator: 'calendar',
  quick_stats: 'stats',
  weekly_goal: 'goal',
  muscle_map: 'body',
  train_next: 'spark',
  pr_banner: 'trophy',
  today_card: 'bolt',
  week_strip: 'week',
  ai_summary: 'spark',
  whoop_row: 'heart',
};
