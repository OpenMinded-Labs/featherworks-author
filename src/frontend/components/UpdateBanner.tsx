import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

interface UpdateInfo {
  available: boolean;
  version: string | null;
  body: string | null;
  date: string | null;
}

interface UpdateBannerProps {
  updateInfo: UpdateInfo;
  onDismiss: () => void;
}

export const UpdateBanner: React.FC<UpdateBannerProps> = ({ updateInfo, onDismiss }) => {
  const [isInstalling, setIsInstalling] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);

  if (!updateInfo.available) return null;

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      await invoke('install_update');
      // App wird automatisch neu gestartet
    } catch (err) {
      console.error('Update installation failed:', err);
      setIsInstalling(false);
    }
  };

  return (
    <div className="update-banner">
      <div className="update-banner-content">
        <span className="update-icon">🎉</span>
        <div className="update-text">
          <strong>Update verfügbar!</strong>
          <span className="update-version">Version {updateInfo.version}</span>
        </div>
        
        <div className="update-actions">
          {updateInfo.body && (
            <button 
              className="btn btn-sm btn-ghost"
              onClick={() => setShowChangelog(!showChangelog)}
            >
              {showChangelog ? 'Ausblenden' : 'Was ist neu?'}
            </button>
          )}
          <button 
            className="btn btn-sm btn-primary"
            onClick={handleInstall}
            disabled={isInstalling}
          >
            {isInstalling ? (
              <>
                <span className="spinner-small" /> Installiere...
              </>
            ) : (
              'Jetzt aktualisieren'
            )}
          </button>
          <button 
            className="btn btn-sm btn-ghost update-dismiss"
            onClick={onDismiss}
            title="Später erinnern"
          >
            ✕
          </button>
        </div>
      </div>
      
      {showChangelog && updateInfo.body && (
        <div className="update-changelog">
          <div className="changelog-content">
            {updateInfo.body}
          </div>
        </div>
      )}
    </div>
  );
};

// Hook für Update-Check
export const useUpdateCheck = () => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const checkForUpdate = async () => {
    try {
      const info = await invoke<UpdateInfo>('check_for_update');
      if (info.available) {
        setUpdateInfo(info);
        setDismissed(false);
      }
    } catch (err) {
      console.warn('Update check failed:', err);
    }
  };

  const dismiss = () => {
    setDismissed(true);
  };

  return {
    updateInfo: dismissed ? null : updateInfo,
    checkForUpdate,
    dismiss,
  };
};
