import React, { useState, useEffect, useMemo, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';

// Types
export interface PacingSettings {
  chapterGoal: number;      // Target words for chapter/scene
  dailyGoal: number;        // Daily word goal
  dailyGoalUnit: 'words' | 'characters' | 'minutes';
  ringTarget: 'scene' | 'chapter';
  showTotalAlways: boolean;
  genre: string;
}

interface PacingRingProps {
  currentWords: number;         // Words in current scene
  chapterWords: number;         // Words in current chapter
  totalWords: number;           // Total manuscript words
  dailyProgress: number;        // Today's words written
  settings: PacingSettings;
  onSettingsChange?: (settings: PacingSettings) => void;
  onGoalReached?: () => void;   // Callback for celebration animation
}

// Genre defaults (average chapter lengths)
export const GENRE_DEFAULTS: Record<string, number> = {
  'thriller': 2000,
  'crime': 2500,
  'romance': 3000,
  'fantasy': 4000,
  'scifi': 3500,
  'literary': 3000,
  'ya': 2500,
  'childrens': 1500,
  'horror': 2500,
  'historical': 3500,
  'mystery': 2500,
  'custom': 2500,
};

// Pacing phase calculation
type PacingPhase = 'start' | 'approaching' | 'sweetspot' | 'warning' | 'epic';

interface PhaseInfo {
  phase: PacingPhase;
  color: string;
  glowColor: string;
  label: string;
  icon: string;
}

function calculatePhase(percentage: number): PhaseInfo {
  if (percentage < 50) {
    return {
      phase: 'start',
      color: '#ef4444',      // Red
      glowColor: 'rgba(239, 68, 68, 0.4)',
      label: 'pacing.phase.start',
      icon: '🔴'
    };
  } else if (percentage < 85) {
    return {
      phase: 'approaching',
      color: '#eab308',      // Yellow
      glowColor: 'rgba(234, 179, 8, 0.4)',
      label: 'pacing.phase.approaching',
      icon: '🟡'
    };
  } else if (percentage <= 115) {
    return {
      phase: 'sweetspot',
      color: '#22c55e',      // Green
      glowColor: 'rgba(34, 197, 94, 0.5)',
      label: 'pacing.phase.sweetspot',
      icon: '🟢'
    };
  } else if (percentage <= 150) {
    return {
      phase: 'warning',
      color: '#f97316',      // Orange
      glowColor: 'rgba(249, 115, 22, 0.4)',
      label: 'pacing.phase.warning',
      icon: '🟠'
    };
  } else {
    return {
      phase: 'epic',
      color: '#dc2626',      // Deep Red
      glowColor: 'rgba(220, 38, 38, 0.5)',
      label: 'pacing.phase.epic',
      icon: '🔴'
    };
  }
}

export const PacingRing: React.FC<PacingRingProps> = ({
  currentWords,
  chapterWords,
  totalWords,
  dailyProgress,
  settings,
  onSettingsChange,
  onGoalReached
}) => {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [lastPhase, setLastPhase] = useState<PacingPhase>('start');
  const ringRef = React.useRef<SVGSVGElement>(null);
  const progressRef = React.useRef<SVGCircleElement>(null);
  const dailyFillRef = React.useRef<HTMLDivElement>(null);

  // Calculate which words to use based on settings
  const targetWords = settings.ringTarget === 'scene' ? currentWords : chapterWords;
  const goal = settings.chapterGoal || GENRE_DEFAULTS[settings.genre] || 2500;
  
  // Calculate percentage and phase
  const percentage = goal > 0 ? (targetWords / goal) * 100 : 0;
  const phaseInfo = useMemo(() => calculatePhase(percentage), [percentage]);
  
  // SVG Ring calculations
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(percentage, 150) / 150) * circumference;
  
  // Daily goal progress
  const dailyPercentage = settings.dailyGoal > 0 
    ? Math.min((dailyProgress / settings.dailyGoal) * 100, 100) 
    : 0;

  // Celebration trigger when entering sweet spot
  useEffect(() => {
    if (phaseInfo.phase === 'sweetspot' && lastPhase !== 'sweetspot') {
      setShowCelebration(true);
      onGoalReached?.();
      setTimeout(() => setShowCelebration(false), 2000);
    }
    setLastPhase(phaseInfo.phase);
  }, [phaseInfo.phase, lastPhase, onGoalReached]);

  useLayoutEffect(() => {
    const ring = ringRef.current;
    if (ring) {
      ring.dataset.phase = phaseInfo.phase;
      ring.style.filter = phaseInfo.phase === 'sweetspot'
        ? `drop-shadow(0 0 8px ${phaseInfo.glowColor})`
        : 'none';
    }
    if (progressRef.current) {
      progressRef.current.dataset.phase = phaseInfo.phase;
      progressRef.current.style.stroke = phaseInfo.color;
      progressRef.current.style.transition = 'stroke-dashoffset 0.5s ease, stroke 0.5s ease';
    }
    if (dailyFillRef.current) {
      dailyFillRef.current.style.width = `${dailyPercentage}%`;
    }
  }, [phaseInfo.color, phaseInfo.glowColor, phaseInfo.phase, dailyPercentage]);

  return (
    <div 
      className={`pacing-ring-container ${isHovered ? 'expanded' : ''} ${showCelebration ? 'celebrating' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Celebration particles */}
      {showCelebration && (
        <div className="pacing-celebration">
          {[...Array(12)].map((_, i) => (
            <span key={i} className="pacing-particle" />
          ))}
        </div>
      )}

      {/* Main Ring */}
      <div className="pacing-ring-wrapper">
        <svg 
          ref={ringRef}
          className="pacing-ring-svg" 
          viewBox="0 0 80 80"
          data-phase={phaseInfo.phase}
        >
          {/* Background track */}
          <circle
            className="pacing-ring-track"
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            strokeWidth="6"
          />
          {/* Progress arc */}
          <circle
            className="pacing-ring-progress"
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            ref={progressRef}
            data-phase={phaseInfo.phase}
            transform="rotate(-90 40 40)"
          />
        </svg>

        {/* Center content */}
        <div className="pacing-ring-center">
          <span className="pacing-ring-value">{targetWords.toLocaleString()}</span>
          {isHovered && (
            <span className="pacing-ring-label">
              / {goal.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Daily goal indicator (small bar below ring) */}
      {settings.dailyGoal > 0 && (
        <div 
          className="pacing-daily-bar" title={t('pacing.dailyProgress', { current: dailyProgress, goal: settings.dailyGoal })}>
          <div 
            className="pacing-daily-fill"
            ref={dailyFillRef}
          />
          {dailyPercentage >= 100 && <span className="pacing-daily-complete">🔥</span>}
        </div>
      )}

      {/* Hover Panel */}
      {isHovered && (
        <div className="pacing-hover-panel">
          <div className="pacing-panel-header">
            <span className="pacing-phase-icon">{phaseInfo.icon}</span>
            <span className="pacing-phase-label">{t(phaseInfo.label)}</span>
          </div>

          <div className="pacing-stats">
            <div className="pacing-stat">
              <span className="pacing-stat-label">{t('pacing.scene')}</span>
              <span className="pacing-stat-value">{currentWords.toLocaleString()}</span>
            </div>
            <div className="pacing-stat">
              <span className="pacing-stat-label">{t('pacing.chapter')}</span>
              <span className="pacing-stat-value">{chapterWords.toLocaleString()}</span>
            </div>
            <div className="pacing-stat">
              <span className="pacing-stat-label">{t('pacing.total')}</span>
              <span className="pacing-stat-value">{totalWords.toLocaleString()}</span>
            </div>
            {settings.dailyGoal > 0 && (
              <div className="pacing-stat pacing-stat-daily">
                <span className="pacing-stat-label">{t('pacing.today')}</span>
                <span className="pacing-stat-value">
                  {dailyProgress.toLocaleString()} / {settings.dailyGoal.toLocaleString()}
                  {dailyPercentage >= 100 && ' 🎉'}
                </span>
              </div>
            )}
          </div>

          {/* Phase-specific hints */}
          <div className="pacing-hint">
            {phaseInfo.phase === 'start' && t('pacing.hint.start')}
            {phaseInfo.phase === 'approaching' && t('pacing.hint.approaching')}
            {phaseInfo.phase === 'sweetspot' && t('pacing.hint.sweetspot')}
            {phaseInfo.phase === 'warning' && t('pacing.hint.warning')}
            {phaseInfo.phase === 'epic' && t('pacing.hint.epic')}
          </div>
        </div>
      )}

      {/* Always show total if enabled */}
      {settings.showTotalAlways && !isHovered && (
        <div className="pacing-total-badge">
          {totalWords.toLocaleString()}
        </div>
      )}
    </div>
  );
};

// Settings Panel Component (for configuration)
export const PacingSettingsPanel: React.FC<{
  settings: PacingSettings;
  onChange: (settings: PacingSettings) => void;
}> = ({ settings, onChange }) => {
  const { t } = useTranslation();

  const genres = Object.keys(GENRE_DEFAULTS);

  return (
    <div className="pacing-settings">
      <h4 className="pacing-settings-title">{t('pacing.settings.title')}</h4>

      {/* Genre Selection */}
      <div className="pacing-setting-row">
        <label htmlFor="pacing-genre">{t('pacing.settings.genre')}</label>
        <select
          id="pacing-genre"
          value={settings.genre}
          onChange={e => onChange({ 
            ...settings, 
            genre: e.target.value,
            chapterGoal: GENRE_DEFAULTS[e.target.value] || settings.chapterGoal
          })}
        >
          {genres.map(g => (
            <option key={g} value={g}>{t(`pacing.genre.${g}`)}</option>
          ))}
        </select>
      </div>

      {/* Chapter Goal */}
      <div className="pacing-setting-row">
        <label htmlFor="pacing-chapter-goal">{t('pacing.settings.chapterGoal')}</label>
        <input
          id="pacing-chapter-goal"
          type="number"
          min={100}
          max={20000}
          step={100}
          value={settings.chapterGoal}
          onChange={e => onChange({ ...settings, chapterGoal: parseInt(e.target.value) || 2500 })}
        />
      </div>

      {/* Ring Target */}
      <div className="pacing-setting-row">
        <label htmlFor="pacing-ring-target">{t('pacing.settings.ringTarget')}</label>
        <select
          id="pacing-ring-target"
          value={settings.ringTarget}
          onChange={e => onChange({ ...settings, ringTarget: e.target.value as 'scene' | 'chapter' })}
        >
          <option value="scene">{t('pacing.scene')}</option>
          <option value="chapter">{t('pacing.chapter')}</option>
        </select>
      </div>

      {/* Daily Goal */}
      <div className="pacing-setting-row">
        <label htmlFor="pacing-daily-goal">{t('pacing.settings.dailyGoal')}</label>
        <input
          id="pacing-daily-goal"
          type="number"
          min={0}
          max={10000}
          step={50}
          value={settings.dailyGoal}
          onChange={e => onChange({ ...settings, dailyGoal: parseInt(e.target.value) || 0 })}
        />
      </div>

      {/* Show Total Always */}
      <div className="pacing-setting-row pacing-setting-checkbox">
        <label>
          <input
            type="checkbox"
            checked={settings.showTotalAlways}
            onChange={e => onChange({ ...settings, showTotalAlways: e.target.checked })}
          />
          {t('pacing.settings.showTotal')}
        </label>
      </div>
    </div>
  );
};

export default PacingRing;
