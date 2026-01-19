import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { getCurrentTheme, cycleTheme, getThemeInfo, type Theme } from '../themeService';
import { PacingRing, type PacingSettings, GENRE_DEFAULTS } from './PacingRing';

// World scan progress state
interface WorldScanProgress {
  jobId: string;
  phase: string;
  phaseNum: number;
  totalPhases: number;
  progressPercent: number;
  entitiesFound?: number;
}

export interface WordCountStats {
  words: number;
  chars: number;
  charsNoSpaces: number;
  paragraphs: number;
  sentences: number;
  readingTimeMin: number;
}

export const StatusBar: React.FC<{
  chapters: any[];
  scenes: Record<string, any[]>;
  editorWordCount: number;
  isDirty: boolean;
  stats?: WordCountStats | null;
  isSaving?: boolean;
  lastSaved?: Date | null;
  saveNow?: () => Promise<void>;
  currentSceneWords?: number;
  currentChapterWords?: number;
  totalProjectWords?: number;
  dailyWordsWritten?: number;
}> = ({ 
  chapters, 
  scenes, 
  editorWordCount, 
  isDirty, 
  stats, 
  isSaving, 
  lastSaved, 
  saveNow,
  currentSceneWords = 0,
  currentChapterWords = 0,
  totalProjectWords = 0,
  dailyWordsWritten = 0
}) => {
  const { t, i18n } = useTranslation();
  const [theme, setThemeState] = useState<Theme>(getCurrentTheme());
  const [pacingSettings, setPacingSettings] = useState<PacingSettings>({
    chapterGoal: 2500,
    dailyGoal: 500,
    dailyGoalUnit: 'words',
    ringTarget: 'scene',
    showTotalAlways: false,
    genre: 'literary'
  });
  
  // World scan progress state
  const [worldScanProgress, setWorldScanProgress] = useState<WorldScanProgress | null>(null);

  const totalScenes = Object.values(scenes).reduce((n, arr) => n + (arr?.length || 0), 0);

  // Listen for world scan progress events
  useEffect(() => {
    const unsubscribers: Array<Promise<() => void>> = [];

    unsubscribers.push(listen('world_scan_progress', (evt) => {
      const payload = evt.payload as any;
      if (payload) {
        if (payload.phase === 'Fertig') {
          // Show completion briefly, then hide
          setWorldScanProgress({
            jobId: payload.job_id || '',
            phase: payload.entities_found 
              ? `✓ ${payload.entities_found} Elemente gefunden`
              : '✓ Fertig',
            phaseNum: payload.phase_num || 0,
            totalPhases: payload.total_phases || 0,
            progressPercent: 100,
            entitiesFound: payload.entities_found
          });
          // Hide after 3 seconds
          setTimeout(() => setWorldScanProgress(null), 3000);
        } else {
          setWorldScanProgress({
            jobId: payload.job_id || '',
            phase: payload.phase || '',
            phaseNum: payload.phase_num || 0,
            totalPhases: payload.total_phases || 0,
            progressPercent: payload.progress_percent || 0
          });
        }
      }
    }));

    return () => {
      unsubscribers.forEach(unsubPromise => unsubPromise.then(unsub => unsub()));
    };
  }, []);

  // Load pacing settings on mount
  useEffect(() => {
    invoke<any>('get_pacing_settings')
      .then(settings => {
        if (settings) {
          setPacingSettings({
            chapterGoal: settings.chapter_goal || 2500,
            dailyGoal: settings.daily_goal || 500,
            dailyGoalUnit: settings.daily_goal_unit || 'words',
            ringTarget: settings.ring_target || 'scene',
            showTotalAlways: settings.show_total_always || false,
            genre: settings.genre || 'literary'
          });
        }
      })
      .catch(console.error);
  }, []);

  // Save pacing settings when they change
  const handlePacingSettingsChange = (newSettings: PacingSettings) => {
    setPacingSettings(newSettings);
    invoke('save_pacing_settings', {
      settings: {
        chapter_goal: newSettings.chapterGoal,
        daily_goal: newSettings.dailyGoal,
        daily_goal_unit: newSettings.dailyGoalUnit,
        ring_target: newSettings.ringTarget,
        show_total_always: newSettings.showTotalAlways,
        genre: newSettings.genre
      }
    }).catch(console.error);
  };
  
  const formatTime = (date: Date | null | undefined) => {
    if (!date) return '';
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  };

  const saveStatus = isSaving
    ? '💾 Speichere...'
    : isDirty
    ? '● Ungespeichert'
    : lastSaved
    ? `✓ ${t('status.saved')} ${formatTime(lastSaved)}`
    : `✓ ${t('status.saved')}`;

  const currentLang = i18n.language === 'de' ? 'de' : 'en';

  const handleThemeToggle = () => {
    const newTheme = cycleTheme();
    setThemeState(newTheme);
  };

  const themeInfo = getThemeInfo(theme);

  // Use stats.words if available, otherwise use editorWordCount
  const sceneWords = stats?.words || currentSceneWords || editorWordCount;
  const chapterWords = currentChapterWords || sceneWords;
  const totalWords = totalProjectWords || (stats?.words || 0);

  return (
    <footer className="footer" role="contentinfo">
      {/* Pacing Ring Widget */}
      <div className="footer-section footer-pacing">
        <PacingRing
          currentWords={sceneWords}
          chapterWords={chapterWords}
          totalWords={totalWords}
          dailyProgress={dailyWordsWritten}
          settings={pacingSettings}
          onSettingsChange={handlePacingSettingsChange}
          onGoalReached={() => {
            // Could trigger a toast notification here
            console.log('[Pacing] Sweet spot reached!');
          }}
        />
      </div>

      <div className="footer-section footer-stats">
        <span>{t('chapters')}: {chapters.length}</span>
        <span className="footer-divider">•</span>
        <span>{t('scenes')}: {totalScenes}</span>
        {stats && (
          <>
            <span className="footer-divider">•</span>
            <span title={`${stats.chars} ${t('status.chars')} (${stats.charsNoSpaces} ${t('status.charsNoSpaces')})`}>
              {stats.words} {t('status.words')}
            </span>
            <span className="footer-divider">•</span>
            <span title={`${stats.paragraphs} ${t('status.paragraphs')}, ${stats.sentences} ${t('status.sentences')}`}>
              ~{stats.readingTimeMin} {t('status.readingTime')}
            </span>
          </>
        )}
        {!stats && <span>{t('status.words')}: {editorWordCount}</span>}
      </div>
      
      {/* World Scan Progress Bar */}
      {worldScanProgress && (
        <div className="footer-section footer-scan-progress">
          <div className="scan-progress-container">
            <div 
              className="scan-progress-bar" 
              style={{ width: `${worldScanProgress.progressPercent}%` }}
            />
            <span className="scan-progress-text">
              🔍 {worldScanProgress.phase}
            </span>
          </div>
        </div>
      )}
      
      <div className="footer-section footer-save-status">
        <button
          className="theme-toggle"
          onClick={handleThemeToggle}
          title={currentLang === 'de' ? themeInfo.labelDe : themeInfo.label}
        >
          {themeInfo.icon}
        </button>
        <span className={`save-indicator ${isDirty ? 'unsaved' : 'saved'} ${isSaving ? 'saving' : ''}`}>
          {saveStatus}
        </span>
      </div>
    </footer>
  );
};
