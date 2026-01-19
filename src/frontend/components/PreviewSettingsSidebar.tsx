import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

// Paper sizes in mm
const PAPER_SIZES = [
  { label: 'A5 (148×210)', width: 148, height: 210 },
  { label: 'A4 (210×297)', width: 210, height: 297 },
  { label: 'US Trade (152×229)', width: 152, height: 229 },
  { label: 'US Letter (216×279)', width: 216, height: 279 },
  { label: 'Digest (140×216)', width: 140, height: 216 },
  { label: 'Pocket (108×175)', width: 108, height: 175 },
];

const FONTS = [
  'EB Garamond',
  'Crimson Pro',
  'Libre Baskerville',
  'Lora',
  'Merriweather',
  'Spectral',
  'Source Serif Pro',
  'PT Serif',
  'Noto Serif',
  'Georgia',
];

export interface LayoutSettings {
  pageWidth: number;
  pageHeight: number;
  marginTop: number;
  marginBottom: number;
  marginInner: number;
  marginOuter: number;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  firstLineIndent: number;
  textAlign: string; // "justify" | "left"
  hyphenation: boolean;
  hyphenationLang: string;
  dropCapEnabled: boolean;
  dropCapLines: number;
  showPageNumbers: boolean;
  ligatures: boolean;
  sceneBreakStyle: string;
  chapterStartRecto: boolean;
}

const DEFAULT_SETTINGS: LayoutSettings = {
  pageWidth: 148,
  pageHeight: 210,
  marginTop: 20,
  marginBottom: 25,
  marginInner: 20,
  marginOuter: 15,
  fontFamily: 'EB Garamond',
  fontSize: 11,
  lineHeight: 1.4,
  firstLineIndent: 5,
  textAlign: 'justify',
  hyphenation: true,
  hyphenationLang: 'de',
  dropCapEnabled: false,
  dropCapLines: 3,
  showPageNumbers: true,
  ligatures: true,
  sceneBreakStyle: 'asterism',
  chapterStartRecto: true,
};

interface PreviewSettingsSidebarProps {
  previewMode: 'css' | 'pdf';
  onBack: () => void;
  onSettingsChange?: (settings: LayoutSettings) => void;
  onRefreshPreview?: () => void;
}

export const PreviewSettingsSidebar: React.FC<PreviewSettingsSidebarProps> = ({
  previewMode,
  onBack,
  onSettingsChange,
  onRefreshPreview,
}) => {
  const [settings, setSettings] = useState<LayoutSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  // Load settings from backend
  useEffect(() => {
    (async () => {
      try {
        const saved = await invoke<LayoutSettings | null>('get_layout_settings');
        if (saved) {
          setSettings({ ...DEFAULT_SETTINGS, ...saved });
        }
      } catch (err) {
        console.error('Failed to load layout settings:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateSetting = <K extends keyof LayoutSettings>(key: K, value: LayoutSettings[K]) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    onSettingsChange?.(newSettings);
    
    // Save to backend
    invoke('save_layout_settings', { settings: newSettings }).catch(console.error);
  };

  if (loading) {
    return (
      <div className="preview-settings-sidebar">
        <div className="sidebar-header">
          <button onClick={onBack} className="back-button" title="Zurück zum Editor">
            ← Editor
          </button>
          <h2>📐 Layout</h2>
        </div>
        <div className="sidebar-loading">Lade Einstellungen...</div>
      </div>
    );
  }

  return (
    <aside className="sidebar-left preview-settings-sidebar">
      <div className="sidebar-header">
        <button onClick={onBack} className="back-button" title="Zurück zum Editor">
          ← Editor
        </button>
        <h2>{previewMode === 'pdf' ? '📄 PDF-Vorschau' : '📐 CSS-Vorschau'}</h2>
      </div>

      <div className="sidebar-content">
        {/* Paper Size */}
        <div className="settings-section">
          <h3>📄 Papierformat</h3>
          <select 
            value={`${settings.pageWidth}x${settings.pageHeight}`}
            onChange={(e) => {
              const [w, h] = e.target.value.split('x').map(Number);
              updateSetting('pageWidth', w);
              updateSetting('pageHeight', h);
            }}
            title="Papierformat auswählen"
          >
            {PAPER_SIZES.map(ps => (
              <option key={ps.label} value={`${ps.width}x${ps.height}`}>{ps.label}</option>
            ))}
          </select>
          <div className="dimension-inputs">
            <input 
              type="number" 
              value={settings.pageWidth} 
              onChange={(e) => updateSetting('pageWidth', Number(e.target.value))}
              title="Breite (mm)"
            />
            <span>×</span>
            <input 
              type="number" 
              value={settings.pageHeight} 
              onChange={(e) => updateSetting('pageHeight', Number(e.target.value))}
              title="Höhe (mm)"
            />
            <span>mm</span>
          </div>
        </div>

        {/* Margins */}
        <div className="settings-section">
          <h3>📏 Ränder (mm)</h3>
          <div className="margin-grid">
            <div className="margin-row">
              <span>Oben:</span>
              <input type="number" value={settings.marginTop} onChange={(e) => updateSetting('marginTop', Number(e.target.value))} title="Rand oben" />
            </div>
            <div className="margin-row">
              <span>Unten:</span>
              <input type="number" value={settings.marginBottom} onChange={(e) => updateSetting('marginBottom', Number(e.target.value))} title="Rand unten" />
            </div>
            <div className="margin-row">
              <span>Innen:</span>
              <input type="number" value={settings.marginInner} onChange={(e) => updateSetting('marginInner', Number(e.target.value))} title="Rand innen (Bundsteg)" />
            </div>
            <div className="margin-row">
              <span>Außen:</span>
              <input type="number" value={settings.marginOuter} onChange={(e) => updateSetting('marginOuter', Number(e.target.value))} title="Rand außen" />
            </div>
          </div>
        </div>

        {/* Typography */}
        <div className="settings-section">
          <h3>🔤 Typografie</h3>
          <div className="typo-row">
            <span>Schrift:</span>
            <select value={settings.fontFamily} onChange={(e) => updateSetting('fontFamily', e.target.value)} title="Schriftart">
              {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="typo-row">
            <span>Größe:</span>
            <input type="number" value={settings.fontSize} onChange={(e) => updateSetting('fontSize', Number(e.target.value))} step="0.5" min="8" max="16" title="Schriftgröße (pt)" />
            <span>pt</span>
          </div>
          <div className="typo-row">
            <span>Zeilenhöhe:</span>
            <input type="number" value={settings.lineHeight} onChange={(e) => updateSetting('lineHeight', Number(e.target.value))} step="0.05" min="1" max="2" title="Zeilenhöhe" />
          </div>
          <div className="typo-row">
            <span>Einzug:</span>
            <input type="number" value={settings.firstLineIndent} onChange={(e) => updateSetting('firstLineIndent', Number(e.target.value))} step="1" min="0" max="15" title="Erstzeileneinzug (mm)" />
            <span>mm</span>
          </div>
          <div className="typo-row">
            <span>Ausrichtung:</span>
            <select value={settings.textAlign || 'justify'} onChange={(e) => updateSetting('textAlign', e.target.value)} title="Textausrichtung">
              <option value="justify">Blocksatz</option>
              <option value="left">Linksbündig (Flattersatz)</option>
            </select>
          </div>
        </div>

        {/* Options */}
        <div className="settings-section">
          <h3>⚙️ Optionen</h3>
          <div className="checkbox-row">
            <input type="checkbox" id="sidebar-hyphenation" checked={settings.hyphenation} onChange={(e) => updateSetting('hyphenation', e.target.checked)} />
            <label htmlFor="sidebar-hyphenation">Silbentrennung</label>
          </div>
          <div className="checkbox-row">
            <input type="checkbox" id="sidebar-dropCap" checked={settings.dropCapEnabled} onChange={(e) => updateSetting('dropCapEnabled', e.target.checked)} />
            <label htmlFor="sidebar-dropCap">Initialen</label>
          </div>
          <div className="checkbox-row">
            <input type="checkbox" id="sidebar-pageNumbers" checked={settings.showPageNumbers} onChange={(e) => updateSetting('showPageNumbers', e.target.checked)} />
            <label htmlFor="sidebar-pageNumbers">Seitenzahlen</label>
          </div>
          <div className="checkbox-row">
            <input type="checkbox" id="sidebar-ligatures" checked={settings.ligatures ?? true} onChange={(e) => updateSetting('ligatures', e.target.checked)} />
            <label htmlFor="sidebar-ligatures">Ligaturen</label>
          </div>
          <div className="checkbox-row">
            <input type="checkbox" id="sidebar-chapterRecto" checked={settings.chapterStartRecto} onChange={(e) => updateSetting('chapterStartRecto', e.target.checked)} />
            <label htmlFor="sidebar-chapterRecto">Kapitel auf rechter Seite</label>
          </div>
        </div>

        {/* Scene Breaks */}
        <div className="settings-section">
          <h3>✂️ Szenentrenner</h3>
          <select value={settings.sceneBreakStyle} onChange={(e) => updateSetting('sceneBreakStyle', e.target.value)} title="Szenentrenner-Stil">
            <option value="asterism">⁂ Asterismus</option>
            <option value="asterisks">* * * Sternchen</option>
            <option value="line">───── Linie</option>
            <option value="ornament">❧ Ornament</option>
            <option value="fleuron">❦ Fleuron</option>
            <option value="blank">Leerzeile</option>
          </select>
        </div>

        {/* Refresh Button */}
        {onRefreshPreview && (
          <div className="settings-section">
            <button className="refresh-preview-btn" onClick={onRefreshPreview}>
              🔄 Vorschau aktualisieren
            </button>
          </div>
        )}
      </div>

      <style>{`
        .preview-settings-sidebar {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-secondary, #1e1e1e);
          color: var(--text-primary, #f0f0f0);
          overflow: hidden;
        }

        .preview-settings-sidebar .sidebar-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: var(--bg-tertiary, #252525);
          border-bottom: 1px solid var(--border-color, #333);
          flex-shrink: 0;
        }

        .preview-settings-sidebar .sidebar-header h2 {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
        }

        .preview-settings-sidebar .back-button {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          background: var(--accent-color, #3b82f6);
          border: none;
          border-radius: 6px;
          color: white;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: background 0.2s;
        }

        .preview-settings-sidebar .back-button:hover {
          background: var(--accent-hover, #2563eb);
        }

        .preview-settings-sidebar .sidebar-content {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
        }

        .preview-settings-sidebar .sidebar-loading {
          padding: 24px;
          text-align: center;
          color: var(--text-muted, #888);
        }

        .preview-settings-sidebar .settings-section {
          margin-bottom: 20px;
        }

        .preview-settings-sidebar .settings-section h3 {
          margin: 0 0 10px 0;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary, #aaa);
        }

        .preview-settings-sidebar .settings-section select {
          width: 100%;
          padding: 8px;
          background: var(--bg-tertiary, #2a2a2a);
          border: 1px solid var(--border-color, #444);
          border-radius: 6px;
          color: inherit;
          font-size: 13px;
          margin-bottom: 8px;
        }

        .preview-settings-sidebar .dimension-inputs {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .preview-settings-sidebar .dimension-inputs input {
          width: 60px;
          padding: 6px 8px;
          background: var(--bg-tertiary, #2a2a2a);
          border: 1px solid var(--border-color, #444);
          border-radius: 4px;
          color: inherit;
          font-size: 13px;
          text-align: center;
        }

        .preview-settings-sidebar .dimension-inputs span {
          color: var(--text-muted, #888);
          font-size: 13px;
        }

        .preview-settings-sidebar .margin-grid {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .preview-settings-sidebar .margin-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .preview-settings-sidebar .margin-row span {
          font-size: 13px;
          color: var(--text-secondary, #aaa);
        }

        .preview-settings-sidebar .margin-row input {
          width: 60px;
          padding: 6px 8px;
          background: var(--bg-tertiary, #2a2a2a);
          border: 1px solid var(--border-color, #444);
          border-radius: 4px;
          color: inherit;
          font-size: 13px;
          text-align: center;
        }

        .preview-settings-sidebar .typo-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .preview-settings-sidebar .typo-row span:first-child {
          width: 70px;
          font-size: 13px;
          color: var(--text-secondary, #aaa);
        }

        .preview-settings-sidebar .typo-row select {
          flex: 1;
          padding: 6px 8px;
          background: var(--bg-tertiary, #2a2a2a);
          border: 1px solid var(--border-color, #444);
          border-radius: 4px;
          color: inherit;
          font-size: 13px;
          margin-bottom: 0;
        }

        .preview-settings-sidebar .typo-row input {
          width: 60px;
          padding: 6px 8px;
          background: var(--bg-tertiary, #2a2a2a);
          border: 1px solid var(--border-color, #444);
          border-radius: 4px;
          color: inherit;
          font-size: 13px;
          text-align: center;
        }

        .preview-settings-sidebar .typo-row span:last-child {
          font-size: 12px;
          color: var(--text-muted, #666);
        }

        .preview-settings-sidebar .checkbox-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .preview-settings-sidebar .checkbox-row input[type="checkbox"] {
          width: 16px;
          height: 16px;
          accent-color: var(--accent-color, #3b82f6);
        }

        .preview-settings-sidebar .checkbox-row label {
          font-size: 13px;
          cursor: pointer;
        }

        .preview-settings-sidebar .refresh-preview-btn {
          width: 100%;
          padding: 10px 16px;
          background: var(--accent-color, #3b82f6);
          border: none;
          border-radius: 6px;
          color: white;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }

        .preview-settings-sidebar .refresh-preview-btn:hover {
          background: var(--accent-hover, #2563eb);
        }
      `}</style>
    </aside>
  );
};

export default PreviewSettingsSidebar;
