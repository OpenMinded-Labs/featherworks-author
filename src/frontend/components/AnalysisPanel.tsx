import React from 'react';
import { useTranslation } from 'react-i18next';

export const AnalysisPanel: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="flex-col-gap-10 full-height">
      <div className="panel-title">
        {t('analysis.title')} <span className="muted muted-aux">{t('preview')}</span>
      </div>
      <div className="panel-sub">
        {t('analysis.plannedModules')}:
        <ul className="panel-list">
          <li>{t('analysis.readingFlow')}</li>
          <li>{t('analysis.dialogBalance')}</li>
          <li>{t('analysis.emotionalIntensity')}</li>
          <li>{t('analysis.fillerWords')}</li>
          <li>{t('analysis.moodTrack')}</li>
        </ul>
      </div>
      <div className="panel-body panel-body-dashed">
        <div className="muted-small">{t('analysis.noAnalysisYet')}</div>
      </div>
      <button type="button" className="btn btn-sm" disabled aria-disabled>
        {t('analysis.analyzeScene')} {t('analysis.comingSoon')}
      </button>
    </div>
  );
};
