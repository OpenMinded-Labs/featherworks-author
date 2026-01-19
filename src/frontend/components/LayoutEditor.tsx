import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { useTranslation } from 'react-i18next';

// ============================================================
// Types
// ============================================================

interface LayoutSettings {
  id: string;
  presetId?: string;
  pageWidth: number;
  pageHeight: number;
  marginTop: number;
  marginBottom: number;
  marginInner: number;
  marginOuter: number;
  mirrorMargins: boolean;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  firstLineIndent: number;
  textAlign: string;
  preventWidows: boolean;
  preventOrphans: boolean;
  hyphenation: boolean;
  hyphenationLang: string;
  ligatures: boolean;
  kerning: boolean;
  opticalMarginAlign: boolean;
  headerText?: string;
  showPageNumbers: boolean;
  pageNumberPosition: string;
  runningHeaderLeft?: string;
  runningHeaderRight?: string;
  runningHeaderStyle: string;
  chapterStartPage: string;
  chapterTitleFont?: string;
  chapterTitleSize: number;
  dropCapEnabled: boolean;
  dropCapLines: number;
  includeHalfTitle: boolean;
  includeTitlePage: boolean;
  includeCopyright: boolean;
  copyrightText?: string;
  titleLogoPath?: string;
  dedication?: string;
  epigraph?: string;
  epigraphAuthor?: string;
  includeToc: boolean;
  tocTitle: string;
  tocIncludeScenes: boolean;
  sceneBreakStyle: string;
  sceneBreakCustom?: string;
  sceneBreakImagePath?: string;
}

interface LayoutPreset {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  settings: LayoutSettings;
}

interface BookMetadata {
  subtitle?: string;
  authorBio?: string;
  publisher?: string;
  publishDate?: string;
  edition?: string;
  language?: string;
  copyrightYear?: number;
  copyrightHolder?: string;
  copyrightText?: string;
  allRightsReserved: boolean;
  dedication?: string;
  epigraph?: string;
  epigraphAuthor?: string;
  acknowledgments?: string;
  foreword?: string;
  forewordAuthor?: string;
  preface?: string;
  introduction?: string;
  aboutAuthor?: string;
  alsoByAuthor?: string[];
  seriesName?: string;
  seriesNumber?: number;
  coverImagePath?: string;
  coverDesigner?: string;
  categories?: string[];
  keywords?: string[];
  description?: string;
  shortDescription?: string;
}

interface Edition {
  id: string;
  name: string;
  editionType: string;
  isbn?: string;
  isbn13?: string;
  asin?: string;
  price?: number;
  currency?: string;
  layoutPresetId?: string;
  layoutOverrides?: EditionLayoutOverrides;
  includeAboutAuthor: boolean;
  includeAlsoBy: boolean;
  includePreview: boolean;
  previewChapterId?: string;
  ebookCoverPath?: string;
  printCoverPath?: string;
  spineWidth?: number;
  bleed?: number;
  distributor?: string;
  distributorId?: string;
  published: boolean;
  publishDate?: string;
}

interface EditionLayoutOverrides {
  pageWidth?: number;
  pageHeight?: number;
  marginTop?: number;
  marginBottom?: number;
  marginInner?: number;
  marginOuter?: number;
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  largePrintFontSize?: number;
}

// ============================================================
// Component
// ============================================================

interface LayoutEditorProps {
  projectTitle?: string;
  projectAuthor?: string;
  onClose?: () => void;
  /** optional handlers to open the embedded previews instead of spawning Tauri windows */
  onOpenCssPreview?: () => void;
  onOpenPdfPreview?: () => void;
}

type TabType = 'format' | 'typography' | 'frontmatter' | 'editions' | 'metadata';

const EDITION_TYPES = [
  { value: 'ebook', label: 'E-Book', icon: '📱' },
  { value: 'ebook-kindle', label: 'Kindle (MOBI)', icon: '📚' },
  { value: 'ebook-epub', label: 'EPUB', icon: '📖' },
  { value: 'softcover', label: 'Taschenbuch', icon: '📕' },
  { value: 'hardcover', label: 'Hardcover', icon: '📗' },
  { value: 'large-print', label: 'Großdruck', icon: '🔍' },
  { value: 'pdf', label: 'PDF', icon: '📄' },
];

const FONT_FAMILIES = [
  'Crimson Pro',
  'EB Garamond',
  'Libertinus Serif',
  'Georgia',
  'Times New Roman',
  'Palatino',
  'Baskerville',
  'Merriweather',
  'Source Serif Pro',
  'Lora',
];

const PAGE_FORMATS = [
  { name: 'A5', width: 148, height: 210 },
  { name: 'A4', width: 210, height: 297 },
  { name: 'Digest (US)', width: 140, height: 216 },
  { name: 'Trade Paperback', width: 152, height: 229 },
  { name: 'B5', width: 176, height: 250 },
  { name: 'Taschenbuch', width: 108, height: 175 },
  { name: '6×9 inch', width: 152.4, height: 228.6 },
  { name: '5.5×8.5 inch', width: 139.7, height: 215.9 },
];

export const LayoutEditor: React.FC<LayoutEditorProps> = ({
  projectTitle,
  projectAuthor,
  onClose,
  onOpenCssPreview,
  onOpenPdfPreview,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('format');
  const [settings, setSettings] = useState<LayoutSettings | null>(null);
  const [presets, setPresets] = useState<LayoutPreset[]>([]);
  const [metadata, setMetadata] = useState<BookMetadata | null>(null);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [selectedEdition, setSelectedEdition] = useState<Edition | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showPreviewDropdown, setShowPreviewDropdown] = useState(false);

  const previewGeometry = useMemo(() => {
    if (!settings) return null;
    const clampedWidth = Math.min(Math.max(settings.pageWidth * 1.2, 180), 320);
    const scale = clampedWidth / settings.pageWidth;
    const height = settings.pageHeight * scale;
    return { width: clampedWidth, height, scale };
  }, [settings]);

  const defaultSettings = useCallback((): LayoutSettings => ({
    id: 'default',
    pageWidth: 148,
    pageHeight: 210,
    marginTop: 20,
    marginBottom: 20,
    marginInner: 20,
    marginOuter: 20,
  mirrorMargins: true,
    fontFamily: 'Crimson Pro',
    fontSize: 11,
    lineHeight: 1.4,
    paragraphSpacing: 4,
    firstLineIndent: 6,
    textAlign: 'justify',
    preventWidows: true,
    preventOrphans: true,
    hyphenation: true,
    hyphenationLang: 'de',
    ligatures: true,
    kerning: true,
    opticalMarginAlign: true,
    headerText: projectTitle || 'Featherworks Author',
    showPageNumbers: true,
    pageNumberPosition: 'bottom-center',
    runningHeaderLeft: projectAuthor || '',
    runningHeaderRight: projectTitle || '',
    runningHeaderStyle: 'title-author',
    chapterStartPage: 'right',
    chapterTitleFont: 'Crimson Pro',
    chapterTitleSize: 18,
    dropCapEnabled: false,
    dropCapLines: 3,
    includeHalfTitle: true,
    includeTitlePage: true,
    includeCopyright: true,
    copyrightText: projectAuthor || '',
    titleLogoPath: '',
    dedication: '',
    epigraph: '',
    epigraphAuthor: '',
    includeToc: true,
    tocTitle: 'Inhalt',
    tocIncludeScenes: false,
  sceneBreakStyle: 'asterism',
    sceneBreakImagePath: '',
  }), [projectAuthor, projectTitle]);

  const defaultMetadata = useCallback((): BookMetadata => ({
    authorBio: '',
    publisher: '',
    publishDate: '',
    language: 'de',
    allRightsReserved: true,
    dedication: '',
    epigraph: '',
    epigraphAuthor: '',
    acknowledgments: '',
    foreword: '',
    forewordAuthor: '',
    preface: '',
    introduction: '',
    aboutAuthor: '',
    alsoByAuthor: [],
  }), []);

  // Load data - only run ONCE on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [settingsData, presetsData, metadataData, editionsData] = await Promise.all([
          invoke<LayoutSettings>('get_layout_settings'),
          invoke<LayoutPreset[]>('list_layout_presets'),
          invoke<BookMetadata>('get_book_metadata'),
          invoke<Edition[]>('list_editions'),
        ]);
        const mergedSettings = { ...defaultSettings(), ...settingsData };
        setSettings(mergedSettings);
        setPresets(presetsData);
        setMetadata(metadataData);
        setEditions(editionsData);
        if (editionsData.length > 0) {
          setSelectedEdition(editionsData[0]);
        }
      } catch (error) {
        console.error('[LayoutEditor] Failed to load layout data:', error);
        // Fallback to safe defaults so UI still renders
        setSettings(defaultSettings());
        setMetadata(defaultMetadata());
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [defaultMetadata, defaultSettings]); // FIXED: removed metadata/settings from deps to prevent infinite loop

  // Update setting
  const updateSetting = useCallback(<K extends keyof LayoutSettings>(
    key: K,
    value: LayoutSettings[K]
  ) => {
    setSettings(prev => prev ? { ...prev, [key]: value } : null);
    setDirty(true);
  }, []);

  // Update metadata
  const updateMetadata = useCallback(<K extends keyof BookMetadata>(
    key: K,
    value: BookMetadata[K]
  ) => {
    setMetadata(prev => prev ? { ...prev, [key]: value } : null);
    setDirty(true);
  }, []);

  // Save all
  const handleSave = async () => {
    if (!settings || !metadata) return;
    setSaving(true);
    try {
      await Promise.all([
        invoke('save_layout_settings', { settings }),
        invoke('save_book_metadata', { metadata }),
      ]);
      setDirty(false);
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setSaving(false);
    }
  };

  // Apply preset
  const applyPreset = (preset: LayoutPreset) => {
    setSettings({ ...preset.settings, id: settings?.id || preset.settings.id });
    setDirty(true);
  };

  // Create edition
  const createEdition = async (type: string) => {
    const newEdition: Edition = {
      id: `edition-${Date.now()}`,
      name: EDITION_TYPES.find(t => t.value === type)?.label || type,
      editionType: type,
      includeAboutAuthor: true,
      includeAlsoBy: true,
      includePreview: type.startsWith('ebook'),
      published: false,
      bleed: type === 'softcover' || type === 'hardcover' ? 3.0 : undefined,
    };
    try {
      await invoke('create_edition', { edition: newEdition });
      setEditions([...editions, newEdition]);
      setSelectedEdition(newEdition);
    } catch (error) {
      console.error('Failed to create edition:', error);
    }
  };

  // Delete edition
  const deleteEdition = async (editionId: string) => {
    try {
      await invoke('delete_edition', { editionId });
      const updated = editions.filter(e => e.id !== editionId);
      setEditions(updated);
      if (selectedEdition?.id === editionId) {
        setSelectedEdition(updated[0] || null);
      }
    } catch (error) {
      console.error('Failed to delete edition:', error);
    }
  };

  // Update edition
  const updateEdition = async (edition: Edition) => {
    try {
      await invoke('update_edition', { edition });
      setEditions(editions.map(e => e.id === edition.id ? edition : e));
      if (selectedEdition?.id === edition.id) {
        setSelectedEdition(edition);
      }
    } catch (error) {
      console.error('Failed to update edition:', error);
    }
  };

  const renderPreviewPage = useCallback((side: 'left' | 'right', pageNumber: number) => {
    if (!settings || !previewGeometry) return null;

    const { width, height, scale } = previewGeometry;
    const innerMargin = (settings.mirrorMargins && side === 'left' ? settings.marginOuter : settings.marginInner) * scale;
    const outerMargin = (settings.mirrorMargins && side === 'left' ? settings.marginInner : settings.marginOuter) * scale;
    const topMargin = settings.marginTop * scale;
    const bottomMargin = settings.marginBottom * scale;

    const headerText = side === 'left'
      ? (settings.runningHeaderLeft || projectAuthor || 'Autor')
      : (settings.runningHeaderRight || projectTitle || 'Titel');

    return (
      <div className="preview-page" style={{ width, height }}>
        <div
          className="preview-header"
          style={{ top: Math.max(8, topMargin - 14), left: innerMargin, right: outerMargin }}
        >
          <span className="preview-header-text">{headerText}</span>
          <span className="preview-header-page">{side === 'left' ? '⟵' : '⟶'}</span>
        </div>
        <div
          className="preview-body"
          style={{ top: topMargin, bottom: bottomMargin + 24, left: innerMargin, right: outerMargin }}
        >
          <div className="preview-dropcap">A</div>
          <div className="preview-lines">
            <span className="preview-line" />
            <span className="preview-line" />
            <span className="preview-line short" />
            <span className="preview-line" />
            <span className="preview-line" />
          </div>
          {settings.sceneBreakImagePath ? (
            <div className="preview-image" title="Szenentrenner">
              <span role="img" aria-label="scene break">🖼️</span>
            </div>
          ) : (
            <div className="preview-scene">* * *</div>
          )}
          <div className="preview-lines muted">
            <span className="preview-line" />
            <span className="preview-line" />
            <span className="preview-line short" />
          </div>
        </div>
        {settings.showPageNumbers && (
          <div
            className="preview-footer"
            style={{ bottom: Math.max(8, bottomMargin - 12), left: innerMargin, right: outerMargin }}
          >
            <span className="page-number">{pageNumber}</span>
          </div>
        )}
      </div>
    );
  }, [previewGeometry, projectAuthor, projectTitle, settings]);

  if (loading || !settings || !metadata) {
    return (
      <div className="layout-editor loading">
        <div className="spinner" />
        <p>Layout-Einstellungen werden geladen...</p>
      </div>
    );
  }

  return (
    <div className="layout-editor">
      {/* Header */}
      <div className="layout-editor-header">
        <h2>📐 Layout & Export</h2>
        <div className="header-actions">
          <div className="preview-dropdown-container" style={{ position: 'relative' }}>
            <button
              className="btn btn-preview"
              onClick={() => setShowPreviewDropdown(!showPreviewDropdown)}
              title="Vorschau öffnen"
            >
              👁️ Vorschau
              <span style={{ fontSize: '10px', marginLeft: '4px', opacity: 0.7 }}>▾</span>
            </button>
            {showPreviewDropdown && (
              <div 
                className="layout-preview-dropdown"
                onMouseLeave={() => setShowPreviewDropdown(false)}
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  background: 'var(--bg-secondary, #1e1e1e)',
                  border: '1px solid var(--border-color, #333)',
                  borderRadius: '8px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                  zIndex: 2147483647,
                  minWidth: '180px',
                  overflow: 'hidden',
                }}
              >
                <button 
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '10px 14px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border-color, #333)',
                    color: 'var(--text-primary, #f0f0f0)',
                    fontSize: '13px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onClick={async () => {
                    setShowPreviewDropdown(false);
                    try {
                      if (dirty && settings && metadata) {
                        await Promise.all([
                          invoke('save_layout_settings', { settings }),
                          invoke('save_book_metadata', { metadata }),
                        ]);
                        setDirty(false);
                      }
                      if (onOpenCssPreview) {
                        onOpenCssPreview();
                      } else {
                        await invoke('open_preview_window');
                      }
                    } catch (e) {
                      console.error('open_preview_window failed', e);
                    }
                  }}
                >
                  ⚡ Live-Vorschau (Schnell)
                </button>
                <button 
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '10px 14px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary, #f0f0f0)',
                    fontSize: '13px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onClick={async () => {
                    setShowPreviewDropdown(false);
                    try {
                      if (dirty && settings && metadata) {
                        await Promise.all([
                          invoke('save_layout_settings', { settings }),
                          invoke('save_book_metadata', { metadata }),
                        ]);
                        setDirty(false);
                      }
                      if (onOpenPdfPreview) {
                        onOpenPdfPreview();
                      } else {
                        await invoke('open_pdf_preview_window');
                      }
                    } catch (e) {
                      console.error('open_pdf_preview_window failed', e);
                    }
                  }}
                >
                  📄 PDF-Vorschau (Exakt)
                </button>
              </div>
            )}
          </div>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? 'Speichern...' : '💾 Speichern'}
          </button>
          {dirty && <span className="unsaved-indicator">●</span>}
        </div>
        <button className="btn btn-ghost close-btn" onClick={onClose}>✕</button>
      </div>

      {/* Tabs */}
      <div className="layout-tabs">
        {[
          { id: 'format', label: '📏 Format', icon: '📏' },
          { id: 'typography', label: '🔤 Typografie', icon: '🔤' },
          { id: 'frontmatter', label: '📄 Titelei', icon: '📄' },
          { id: 'editions', label: '📚 Ausgaben', icon: '📚' },
          { id: 'metadata', label: '📝 Metadaten', icon: '📝' },
        ].map(tab => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id as TabType)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="layout-content">
        {/* FORMAT TAB */}
        {activeTab === 'format' && (
          <div className="tab-content format-tab">
            <div className="section">
              <h3>Seitenformat</h3>
              <div className="preset-buttons">
                {PAGE_FORMATS.map(fmt => (
                  <button
                    key={fmt.name}
                    className={`preset-btn ${
                      Math.abs(settings.pageWidth - fmt.width) < 1 &&
                      Math.abs(settings.pageHeight - fmt.height) < 1
                        ? 'active'
                        : ''
                    }`}
                    onClick={() => {
                      updateSetting('pageWidth', fmt.width);
                      updateSetting('pageHeight', fmt.height);
                    }}
                  >
                    {fmt.name}
                    <span className="size">{fmt.width}×{fmt.height}mm</span>
                  </button>
                ))}
              </div>
              <div className="custom-size">
                <label>
                  Breite (mm)
                  <input
                    type="number"
                    value={settings.pageWidth}
                    onChange={e => updateSetting('pageWidth', Number(e.target.value))}
                  />
                </label>
                <label>
                  Höhe (mm)
                  <input
                    type="number"
                    value={settings.pageHeight}
                    onChange={e => updateSetting('pageHeight', Number(e.target.value))}
                  />
                </label>
              </div>
            </div>

            <div className="section">
              <h3>Ränder</h3>
              <div className="margin-grid">
                <div className="margin-preview">
                  <div
                    className="page-preview"
                    style={{
                      width: settings.pageWidth * 0.8,
                      height: settings.pageHeight * 0.8,
                    }}
                  >
                    <div
                      className="text-area"
                      style={{
                        top: settings.marginTop * 0.8,
                        bottom: settings.marginBottom * 0.8,
                        left: settings.marginInner * 0.8,
                        right: settings.marginOuter * 0.8,
                      }}
                    />
                  </div>
                </div>
                <div className="margin-inputs">
                  <label>
                    Oben (mm)
                    <input
                      type="number"
                      value={settings.marginTop}
                      onChange={e => updateSetting('marginTop', Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Unten (mm)
                    <input
                      type="number"
                      value={settings.marginBottom}
                      onChange={e => updateSetting('marginBottom', Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Innen/Bundsteg (mm)
                    <input
                      type="number"
                      value={settings.marginInner}
                      onChange={e => updateSetting('marginInner', Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Außen (mm)
                    <input
                      type="number"
                      value={settings.marginOuter}
                      onChange={e => updateSetting('marginOuter', Number(e.target.value))}
                    />
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={settings.mirrorMargins}
                      onChange={e => updateSetting('mirrorMargins', e.target.checked)}
                    />
                    Gegensätzliche Bund-/Außenränder (A/B-Seiten)
                  </label>
                </div>
              </div>
            </div>

            <div className="section layout-preview-section">
              <h3>Layout-Vorschau</h3>
              <p className="muted-small">Zweiseitige Vorschau mit gespiegelt gesetzten Innen-/Außenrändern, Szenentrenner und Seitenzahlen.</p>
              <div className="spread-preview">
                {renderPreviewPage('left', 12)}
                {renderPreviewPage('right', 13)}
              </div>
              <button
                className="btn btn-primary preview-fullscreen-btn"
                onClick={async () => {
                  try {
                    // Save settings first if dirty
                    if (dirty && settings && metadata) {
                      await Promise.all([
                        invoke('save_layout_settings', { settings }),
                        invoke('save_book_metadata', { metadata }),
                      ]);
                      setDirty(false);
                    }
                    await invoke('open_preview_window');
                  } catch (e) {
                    console.error('open_preview_window failed', e);
                  }
                }}
              >
                🖥️ Vollbild-Vorschau öffnen
              </button>
            </div>

            <div className="section">
              <h3>Layout-Vorlagen</h3>
              <div className="presets-list">
                {presets.map(preset => (
                  <button
                    key={preset.id}
                    className={`preset-item ${settings.presetId === preset.id ? 'active' : ''}`}
                    onClick={() => applyPreset(preset)}
                  >
                    <span className="preset-name">{preset.name}</span>
                    <span className="preset-desc">{preset.description}</span>
                    {preset.isSystem && <span className="badge">System</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TYPOGRAPHY TAB */}
        {activeTab === 'typography' && (
          <div className="tab-content typography-tab">
            <div className="section">
              <h3>Schrift</h3>
              <div className="form-row">
                <label>
                  Schriftart
                  <select
                    value={settings.fontFamily}
                    onChange={e => updateSetting('fontFamily', e.target.value)}
                  >
                    {FONT_FAMILIES.map(font => (
                      <option key={font} value={font}>{font}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Schriftgröße (pt)
                  <input
                    type="number"
                    min={8}
                    max={16}
                    step={0.5}
                    value={settings.fontSize}
                    onChange={e => updateSetting('fontSize', Number(e.target.value))}
                  />
                </label>
                <label>
                  Zeilenhöhe
                  <input
                    type="number"
                    min={1}
                    max={2.5}
                    step={0.05}
                    value={settings.lineHeight}
                    onChange={e => updateSetting('lineHeight', Number(e.target.value))}
                  />
                </label>
              </div>
            </div>

            <div className="section">
              <h3>Absatz</h3>
              <div className="form-row">
                <label>
                  Textausrichtung
                  <select
                    value={settings.textAlign}
                    onChange={e => updateSetting('textAlign', e.target.value)}
                  >
                    <option value="justify">Blocksatz</option>
                    <option value="left">Linksbündig</option>
                    <option value="right">Rechtsbündig</option>
                  </select>
                </label>
                <label>
                  Erstzeileneinzug (mm)
                  <input
                    type="number"
                    min={0}
                    max={15}
                    step={0.5}
                    value={settings.firstLineIndent}
                    onChange={e => updateSetting('firstLineIndent', Number(e.target.value))}
                  />
                </label>
                <label>
                  Absatzabstand (em)
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={settings.paragraphSpacing}
                    onChange={e => updateSetting('paragraphSpacing', Number(e.target.value))}
                  />
                </label>
              </div>
            </div>

            <div className="section">
              <h3>Typografische Optionen</h3>
              <div className="checkbox-grid">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.hyphenation}
                    onChange={e => updateSetting('hyphenation', e.target.checked)}
                  />
                  Silbentrennung
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.ligatures}
                    onChange={e => updateSetting('ligatures', e.target.checked)}
                  />
                  Ligaturen (ff, fi, fl)
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.kerning}
                    onChange={e => updateSetting('kerning', e.target.checked)}
                  />
                  Kerning
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.preventWidows}
                    onChange={e => updateSetting('preventWidows', e.target.checked)}
                  />
                  Hurenkinder vermeiden
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.preventOrphans}
                    onChange={e => updateSetting('preventOrphans', e.target.checked)}
                  />
                  Schusterjungen vermeiden
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.opticalMarginAlign}
                    onChange={e => updateSetting('opticalMarginAlign', e.target.checked)}
                  />
                  Optischer Randausgleich
                </label>
              </div>
              {settings.hyphenation && (
                <div className="form-row">
                  <label>
                    Sprache für Silbentrennung
                    <select
                      value={settings.hyphenationLang}
                      onChange={e => updateSetting('hyphenationLang', e.target.value)}
                    >
                      <option value="de">Deutsch</option>
                      <option value="en">Englisch</option>
                      <option value="fr">Französisch</option>
                      <option value="es">Spanisch</option>
                      <option value="it">Italienisch</option>
                    </select>
                  </label>
                </div>
              )}
            </div>

            <div className="section">
              <h3>Kapitel</h3>
              <div className="form-row">
                <label>
                  Kapitelstart
                  <select
                    value={settings.chapterStartPage}
                    onChange={e => updateSetting('chapterStartPage', e.target.value)}
                  >
                    <option value="any">Beliebige Seite</option>
                    <option value="odd">Rechte Seite (ungerade)</option>
                    <option value="even">Linke Seite (gerade)</option>
                  </select>
                </label>
                <label>
                  Kapitelüberschrift (pt)
                  <input
                    type="number"
                    min={12}
                    max={36}
                    value={settings.chapterTitleSize}
                    onChange={e => updateSetting('chapterTitleSize', Number(e.target.value))}
                  />
                </label>
              </div>
              <div className="checkbox-grid">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.dropCapEnabled}
                    onChange={e => updateSetting('dropCapEnabled', e.target.checked)}
                  />
                  Initialen (Drop Caps)
                </label>
              </div>
              {settings.dropCapEnabled && (
                <div className="form-row">
                  <label>
                    Initialenhöhe (Zeilen)
                    <input
                      type="number"
                      min={2}
                      max={5}
                      value={settings.dropCapLines}
                      onChange={e => updateSetting('dropCapLines', Number(e.target.value))}
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="section">
              <h3>Szenentrenner</h3>
              <div className="form-row">
                <label>
                  Stil
                  <select
                    value={settings.sceneBreakStyle}
                    onChange={e => updateSetting('sceneBreakStyle', e.target.value)}
                  >
                    <option value="asterism">⁂ Asterismus</option>
                    <option value="fleuron">❧ Fleuron</option>
                    <option value="line">─── Linie</option>
                    <option value="space">Leerzeile</option>
                    <option value="custom">Eigenes Symbol</option>
                    <option value="image">Bild/Vignette</option>
                  </select>
                </label>
                {settings.sceneBreakStyle === 'custom' && (
                  <label>
                    Symbol
                    <input
                      type="text"
                      value={settings.sceneBreakCustom || ''}
                      onChange={e => updateSetting('sceneBreakCustom', e.target.value)}
                      placeholder="z.B. * * *"
                    />
                  </label>
                )}
                {settings.sceneBreakStyle === 'image' && (
                  <label>
                    Bildpfad (Vignette)
                    <input
                      type="text"
                      value={settings.sceneBreakImagePath || ''}
                      onChange={e => updateSetting('sceneBreakImagePath', e.target.value)}
                      placeholder="/Pfad/zur/vignette.png"
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="section">
              <h3>Kolumnentitel & Seitenzahlen</h3>
              <div className="form-row">
                <label>
                  Kopfzeile
                  <select
                    value={settings.runningHeaderStyle}
                    onChange={e => updateSetting('runningHeaderStyle', e.target.value)}
                  >
                    <option value="author-title">Autor | Buchtitel</option>
                    <option value="title-chapter">Buchtitel | Kapitel</option>
                    <option value="chapter-only">Nur Kapitel</option>
                    <option value="none">Keine</option>
                  </select>
                </label>
                <label>
                  Seitenzahlen
                  <select
                    value={settings.pageNumberPosition}
                    onChange={e => updateSetting('pageNumberPosition', e.target.value)}
                  >
                    <option value="bottom-center">Unten mittig</option>
                    <option value="bottom-outside">Unten außen</option>
                    <option value="top-outside">Oben außen</option>
                  </select>
                </label>
              </div>
              <div className="checkbox-grid">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.showPageNumbers}
                    onChange={e => updateSetting('showPageNumbers', e.target.checked)}
                  />
                  Seitenzahlen anzeigen
                </label>
              </div>
            </div>
          </div>
        )}

        {/* FRONTMATTER TAB */}
        {activeTab === 'frontmatter' && (
          <div className="tab-content frontmatter-tab">
            <div className="section">
              <h3>Titelei</h3>
              <div className="checkbox-grid">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.includeHalfTitle}
                    onChange={e => updateSetting('includeHalfTitle', e.target.checked)}
                  />
                  Schmutztitel
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.includeTitlePage}
                    onChange={e => updateSetting('includeTitlePage', e.target.checked)}
                  />
                  Haupttitel
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.includeCopyright}
                    onChange={e => updateSetting('includeCopyright', e.target.checked)}
                  />
                  Impressum
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.includeToc}
                    onChange={e => updateSetting('includeToc', e.target.checked)}
                  />
                  Inhaltsverzeichnis
                </label>
              </div>
              <div className="form-row">
                <label>
                  Titelbild/Logo (optional)
                  <input
                    type="text"
                    value={settings.titleLogoPath || ''}
                    onChange={e => updateSetting('titleLogoPath', e.target.value)}
                    placeholder="/Pfad/zum/logo.png"
                  />
                </label>
              </div>
            </div>

            {settings.includeToc && (
              <div className="section">
                <h3>Inhaltsverzeichnis</h3>
                <div className="form-row">
                  <label>
                    Überschrift
                    <input
                      type="text"
                      value={settings.tocTitle}
                      onChange={e => updateSetting('tocTitle', e.target.value)}
                    />
                  </label>
                </div>
                <div className="checkbox-grid">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={settings.tocIncludeScenes}
                      onChange={e => updateSetting('tocIncludeScenes', e.target.checked)}
                    />
                    Szenen im Inhaltsverzeichnis
                  </label>
                </div>
              </div>
            )}

            <div className="section">
              <h3>Widmung</h3>
              <textarea
                value={metadata.dedication || ''}
                onChange={e => updateMetadata('dedication', e.target.value)}
                placeholder="Für meinen Großvater..."
                rows={3}
              />
            </div>

            <div className="section">
              <h3>Motto (Epigraph)</h3>
              <textarea
                value={metadata.epigraph || ''}
                onChange={e => updateMetadata('epigraph', e.target.value)}
                placeholder="Ein Zitat, das zum Buch passt..."
                rows={3}
              />
              <input
                type="text"
                value={metadata.epigraphAuthor || ''}
                onChange={e => updateMetadata('epigraphAuthor', e.target.value)}
                placeholder="— Autor des Zitats"
                style={{ marginTop: 8 }}
              />
            </div>

            <div className="section">
              <h3>Danksagung</h3>
              <textarea
                value={metadata.acknowledgments || ''}
                onChange={e => updateMetadata('acknowledgments', e.target.value)}
                placeholder="Ich danke allen, die..."
                rows={5}
              />
            </div>

            <div className="section">
              <h3>Vorwort</h3>
              <textarea
                value={metadata.foreword || ''}
                onChange={e => updateMetadata('foreword', e.target.value)}
                rows={5}
              />
              <input
                type="text"
                value={metadata.forewordAuthor || ''}
                onChange={e => updateMetadata('forewordAuthor', e.target.value)}
                placeholder="Verfasser des Vorworts"
                style={{ marginTop: 8 }}
              />
            </div>
          </div>
        )}

        {/* EDITIONS TAB */}
        {activeTab === 'editions' && (
          <div className="tab-content editions-tab">
            <div className="editions-sidebar">
              <h3>Ausgaben</h3>
              <div className="editions-list">
                {editions.map(edition => (
                  <button
                    key={edition.id}
                    className={`edition-item ${selectedEdition?.id === edition.id ? 'active' : ''}`}
                    onClick={() => setSelectedEdition(edition)}
                  >
                    <span className="edition-icon">
                      {EDITION_TYPES.find(t => t.value === edition.editionType)?.icon || '📖'}
                    </span>
                    <span className="edition-name">{edition.name}</span>
                    {edition.published && <span className="badge success">✓</span>}
                  </button>
                ))}
              </div>
              <div className="add-edition">
                <select
                  onChange={e => {
                    if (e.target.value) {
                      createEdition(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>+ Ausgabe hinzufügen</option>
                  {EDITION_TYPES.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.icon} {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedEdition && (
              <div className="edition-details">
                <div className="edition-header">
                  <input
                    type="text"
                    className="edition-title-input"
                    value={selectedEdition.name}
                    onChange={e => {
                      const updated = { ...selectedEdition, name: e.target.value };
                      setSelectedEdition(updated);
                    }}
                    onBlur={() => updateEdition(selectedEdition)}
                  />
                  <button
                    className="btn btn-ghost btn-danger"
                    onClick={() => deleteEdition(selectedEdition.id)}
                  >
                    🗑️
                  </button>
                </div>

                <div className="section">
                  <h4>ISBN & Identifikation</h4>
                  <div className="form-row">
                    <label>
                      ISBN-13
                      <input
                        type="text"
                        value={selectedEdition.isbn13 || ''}
                        onChange={e => {
                          const updated = { ...selectedEdition, isbn13: e.target.value };
                          setSelectedEdition(updated);
                        }}
                        onBlur={() => updateEdition(selectedEdition)}
                        placeholder="978-3-..."
                      />
                    </label>
                    {selectedEdition.editionType?.startsWith('ebook') && (
                      <label>
                        ASIN (Kindle)
                        <input
                          type="text"
                          value={selectedEdition.asin || ''}
                          onChange={e => {
                            const updated = { ...selectedEdition, asin: e.target.value };
                            setSelectedEdition(updated);
                          }}
                          onBlur={() => updateEdition(selectedEdition)}
                          placeholder="B0..."
                        />
                      </label>
                    )}
                  </div>
                </div>

                <div className="section">
                  <h4>Preis & Vertrieb</h4>
                  <div className="form-row">
                    <label>
                      Preis
                      <input
                        type="number"
                        step="0.01"
                        value={selectedEdition.price || ''}
                        onChange={e => {
                          const updated = { ...selectedEdition, price: Number(e.target.value) };
                          setSelectedEdition(updated);
                        }}
                        onBlur={() => updateEdition(selectedEdition)}
                      />
                    </label>
                    <label>
                      Währung
                      <select
                        value={selectedEdition.currency || 'EUR'}
                        onChange={e => {
                          const updated = { ...selectedEdition, currency: e.target.value };
                          setSelectedEdition(updated);
                          updateEdition(updated);
                        }}
                      >
                        <option value="EUR">EUR €</option>
                        <option value="USD">USD $</option>
                        <option value="GBP">GBP £</option>
                        <option value="CHF">CHF</option>
                      </select>
                    </label>
                    <label>
                      Distributor
                      <select
                        value={selectedEdition.distributor || ''}
                        onChange={e => {
                          const updated = { ...selectedEdition, distributor: e.target.value };
                          setSelectedEdition(updated);
                          updateEdition(updated);
                        }}
                      >
                        <option value="">Nicht gewählt</option>
                        <option value="kdp">Amazon KDP</option>
                        <option value="ingram">IngramSpark</option>
                        <option value="bod">BoD</option>
                        <option value="epubli">epubli</option>
                        <option value="tolino">Tolino Media</option>
                        <option value="other">Sonstige</option>
                      </select>
                    </label>
                  </div>
                </div>

                {(selectedEdition.editionType === 'softcover' ||
                  selectedEdition.editionType === 'hardcover') && (
                  <div className="section">
                    <h4>Druckspezifikationen</h4>
                    <div className="form-row">
                      <label>
                        Beschnitt (mm)
                        <input
                          type="number"
                          step="0.5"
                          value={selectedEdition.bleed || 3}
                          onChange={e => {
                            const updated = { ...selectedEdition, bleed: Number(e.target.value) };
                            setSelectedEdition(updated);
                          }}
                          onBlur={() => updateEdition(selectedEdition)}
                        />
                      </label>
                      <label>
                        Rückenbreite (mm)
                        <input
                          type="number"
                          step="0.1"
                          value={selectedEdition.spineWidth || ''}
                          onChange={e => {
                            const updated = { ...selectedEdition, spineWidth: Number(e.target.value) };
                            setSelectedEdition(updated);
                          }}
                          onBlur={() => updateEdition(selectedEdition)}
                          placeholder="Auto-berechnet"
                        />
                      </label>
                    </div>
                  </div>
                )}

                <div className="section">
                  <h4>Inhalt</h4>
                  <div className="checkbox-grid">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={selectedEdition.includeAboutAuthor}
                        onChange={e => {
                          const updated = { ...selectedEdition, includeAboutAuthor: e.target.checked };
                          setSelectedEdition(updated);
                          updateEdition(updated);
                        }}
                      />
                      Über den Autor
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={selectedEdition.includeAlsoBy}
                        onChange={e => {
                          const updated = { ...selectedEdition, includeAlsoBy: e.target.checked };
                          setSelectedEdition(updated);
                          updateEdition(updated);
                        }}
                      />
                      Weitere Bücher des Autors
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={selectedEdition.includePreview}
                        onChange={e => {
                          const updated = { ...selectedEdition, includePreview: e.target.checked };
                          setSelectedEdition(updated);
                          updateEdition(updated);
                        }}
                      />
                      Leseprobe nächstes Buch
                    </label>
                  </div>
                </div>

                <div className="section">
                  <h4>Status</h4>
                  <div className="checkbox-grid">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={selectedEdition.published}
                        onChange={e => {
                          const updated = { ...selectedEdition, published: e.target.checked };
                          setSelectedEdition(updated);
                          updateEdition(updated);
                        }}
                      />
                      Veröffentlicht
                    </label>
                  </div>
                  {selectedEdition.published && (
                    <div className="form-row">
                      <label>
                        Veröffentlichungsdatum
                        <input
                          type="date"
                          value={selectedEdition.publishDate || ''}
                          onChange={e => {
                            const updated = { ...selectedEdition, publishDate: e.target.value };
                            setSelectedEdition(updated);
                          }}
                          onBlur={() => updateEdition(selectedEdition)}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* METADATA TAB */}
        {activeTab === 'metadata' && (
          <div className="tab-content metadata-tab">
            <div className="section">
              <h3>Buch-Informationen</h3>
              <div className="form-row">
                <label>
                  Titel
                  <input type="text" value={projectTitle} disabled />
                </label>
                <label>
                  Untertitel
                  <input
                    type="text"
                    value={metadata.subtitle || ''}
                    onChange={e => updateMetadata('subtitle', e.target.value)}
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Autor
                  <input type="text" value={projectAuthor} disabled />
                </label>
                <label>
                  Sprache
                  <select
                    value={metadata.language || 'de'}
                    onChange={e => updateMetadata('language', e.target.value)}
                  >
                    <option value="de">Deutsch</option>
                    <option value="en">Englisch</option>
                    <option value="fr">Französisch</option>
                    <option value="es">Spanisch</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="section">
              <h3>Serie</h3>
              <div className="form-row">
                <label>
                  Serienname
                  <input
                    type="text"
                    value={metadata.seriesName || ''}
                    onChange={e => updateMetadata('seriesName', e.target.value)}
                    placeholder="z.B. Die Chroniken von..."
                  />
                </label>
                <label>
                  Band-Nr.
                  <input
                    type="number"
                    min={1}
                    value={metadata.seriesNumber || ''}
                    onChange={e => updateMetadata('seriesNumber', Number(e.target.value) || undefined)}
                  />
                </label>
              </div>
            </div>

            <div className="section">
              <h3>Copyright</h3>
              <div className="form-row">
                <label>
                  Copyright-Jahr
                  <input
                    type="number"
                    value={metadata.copyrightYear || new Date().getFullYear()}
                    onChange={e => updateMetadata('copyrightYear', Number(e.target.value))}
                  />
                </label>
                <label>
                  Rechteinhaber
                  <input
                    type="text"
                    value={metadata.copyrightHolder || projectAuthor}
                    onChange={e => updateMetadata('copyrightHolder', e.target.value)}
                  />
                </label>
              </div>
              <div className="checkbox-grid">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={metadata.allRightsReserved}
                    onChange={e => updateMetadata('allRightsReserved', e.target.checked)}
                  />
                  Alle Rechte vorbehalten
                </label>
              </div>
              <label>
                Copyright-Text (optional)
                <textarea
                  value={metadata.copyrightText || ''}
                  onChange={e => updateMetadata('copyrightText', e.target.value)}
                  placeholder="Zusätzlicher rechtlicher Hinweis..."
                  rows={3}
                />
              </label>
            </div>

            <div className="section">
              <h3>Verlag</h3>
              <div className="form-row">
                <label>
                  Verlagsname
                  <input
                    type="text"
                    value={metadata.publisher || ''}
                    onChange={e => updateMetadata('publisher', e.target.value)}
                    placeholder="Selfpublishing / Verlagsname"
                  />
                </label>
                <label>
                  Auflage
                  <input
                    type="text"
                    value={metadata.edition || ''}
                    onChange={e => updateMetadata('edition', e.target.value)}
                    placeholder="1. Auflage"
                  />
                </label>
              </div>
            </div>

            <div className="section">
              <h3>Beschreibung (Klappentext)</h3>
              <textarea
                value={metadata.description || ''}
                onChange={e => updateMetadata('description', e.target.value)}
                placeholder="Die spannende Geschichte von..."
                rows={5}
              />
              <label className="layout-mt-8">
                Kurzbeschreibung (max. 150 Zeichen)
                <input
                  type="text"
                  value={metadata.shortDescription || ''}
                  onChange={e => updateMetadata('shortDescription', e.target.value.slice(0, 150))}
                  maxLength={150}
                />
                <span className="char-count">
                  {(metadata.shortDescription || '').length}/150
                </span>
              </label>
            </div>

            <div className="section">
              <h3>Keywords & Kategorien</h3>
              <label>
                Keywords (kommagetrennt)
                <input
                  type="text"
                  value={(metadata.keywords || []).join(', ')}
                  onChange={e => updateMetadata('keywords', e.target.value.split(',').map(k => k.trim()).filter(Boolean))}
                  placeholder="Fantasy, Abenteuer, Magie, ..."
                />
              </label>
              <label className="layout-mt-8">
                Kategorien / BISAC-Codes
                <input
                  type="text"
                  value={(metadata.categories || []).join(', ')}
                  onChange={e => updateMetadata('categories', e.target.value.split(',').map(k => k.trim()).filter(Boolean))}
                  placeholder="FIC009000, FIC028010, ..."
                />
              </label>
            </div>

            <div className="section">
              <h3>Über den Autor</h3>
              <textarea
                value={metadata.aboutAuthor || ''}
                onChange={e => updateMetadata('aboutAuthor', e.target.value)}
                placeholder="Der Autor lebt in..."
                rows={4}
              />
            </div>

            <div className="section">
              <h3>Weitere Bücher des Autors</h3>
              <textarea
                value={(metadata.alsoByAuthor || []).join('\n')}
                onChange={e => updateMetadata('alsoByAuthor', e.target.value.split('\n').filter(Boolean))}
                placeholder="Ein Buch pro Zeile..."
                rows={4}
              />
            </div>
          </div>
        )}
      </div>

      {/* Styles */}
      <style>{`
        .layout-editor {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-primary);
          color: var(--text-primary);
          overflow: hidden;
        }
        .layout-editor.loading {
          align-items: center;
          justify-content: center;
        }
        .layout-editor-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 24px;
          border-bottom: 1px solid var(--border-color);
        }
        .layout-editor-header h2 {
          margin: 0;
          font-size: 18px;
          flex-shrink: 0;
        }
        .header-actions {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          flex: 1;
          justify-content: center;
        }
        .close-btn {
          flex-shrink: 0;
          margin-left: auto;
        }
        .unsaved-indicator {
          color: var(--accent-color);
          font-size: 20px;
        }
        .layout-tabs {
          display: flex;
          gap: 4px;
          padding: 12px 24px;
          border-bottom: 1px solid var(--border-color);
          background: var(--bg-secondary);
        }
        .tab {
          padding: 8px 16px;
          border: none;
          background: none;
          cursor: pointer;
          border-radius: 6px;
          color: var(--text-secondary);
          transition: all 0.15s;
        }
        .tab:hover {
          background: var(--bg-hover);
        }
        .tab.active {
          background: var(--accent-color);
          color: white;
        }
        .layout-content {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 24px;
        }
        .tab-content {
          max-width: 800px;
          width: 100%;
        }
        .section {
          margin-bottom: 24px;
          padding: 16px;
          background: var(--bg-secondary);
          border-radius: 8px;
        }
        .section h3, .section h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          font-weight: 600;
          color: var(--text-secondary);
        }
        .form-row {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
        }
        .form-row label {
          flex: 1;
          min-width: 150px;
        }
        label {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 12px;
          color: var(--text-secondary);
        }
        input, select, textarea {
          padding: 8px 12px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: 14px;
        }
        /* Ensure select options are readable */
        select option {
          background: var(--bg-primary);
          color: var(--text-primary);
        }
        /* Fix for dark mode inputs */
        input::placeholder {
          color: var(--text-muted);
        }
        input:focus, select:focus, textarea:focus {
          outline: none;
          border-color: var(--accent-color);
        }
        textarea {
          resize: vertical;
          min-height: 60px;
        }
        .checkbox-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 8px;
        }
        .checkbox-label {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: var(--text-primary);
          cursor: pointer;
        }
        .checkbox-label input {
          width: 16px;
          height: 16px;
        }
        .preset-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 16px;
        }
        .preset-btn {
          display: flex;
          flex-direction: column;
          padding: 12px 16px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-primary);
          cursor: pointer;
          transition: all 0.15s;
        }
        .preset-btn:hover {
          border-color: var(--accent-color);
        }
        .preset-btn.active {
          border-color: var(--accent-color);
          background: var(--accent-color-light);
        }
        .preset-btn .size {
          font-size: 11px;
          color: var(--text-muted);
        }
        .custom-size {
          display: flex;
          gap: 16px;
        }
        .margin-grid {
          display: flex;
          gap: 24px;
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .margin-preview {
          flex-shrink: 0;
          min-width: 240px;
        }
        .page-preview {
          position: relative;
          background: white;
          border: 1px solid var(--border-color);
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          max-width: 100%;
        }
        .text-area {
          position: absolute;
          background: #f0f0f0;
          border: 1px dashed #ccc;
        }
        .margin-inputs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          min-width: 260px;
        }
        .presets-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .preset-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-primary);
          cursor: pointer;
          text-align: left;
        }
        .preset-item:hover {
          border-color: var(--accent-color);
        }
        .preset-item.active {
          border-color: var(--accent-color);
          background: var(--accent-color-light);
        }
        .preset-name {
          font-weight: 500;
        }
        .preset-desc {
          font-size: 12px;
          color: var(--text-muted);
        }
        .badge {
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          background: var(--bg-tertiary);
        }
        .badge.success {
          background: #48bb78;
          color: white;
        }
        .layout-preview-section {
          overflow: hidden;
        }
        .spread-preview {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          align-items: flex-start;
          justify-content: center;
          overflow-x: auto;
          max-width: 100%;
          padding: 8px 0;
        }
        /* Responsive: Scale down preview on smaller panels */
        @container (max-width: 400px) {
          .spread-preview {
            transform: scale(0.8);
            transform-origin: top center;
          }
        }
        .preview-page {
          position: relative;
          background: white;
          border: 1px solid var(--border-color);
          border-radius: 10px;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
          overflow: hidden;
          flex-shrink: 0;
        }
        .preview-header {
          position: absolute;
          display: flex;
          justify-content: space-between;
          gap: 8px;
          font-size: 10px;
          color: var(--text-muted);
          line-height: 1.3;
        }
        .preview-body {
          position: absolute;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .preview-lines {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .preview-line {
          display: block;
          height: 6px;
          background: linear-gradient(90deg, rgba(0,0,0,0.25), rgba(0,0,0,0.12));
          border-radius: 999px;
        }
        .preview-line.short {
          width: 70%;
        }
        .preview-lines.muted .preview-line {
          opacity: 0.65;
        }
        .preview-dropcap {
          width: 24px;
          height: 24px;
          border-radius: 6px;
          background: var(--accent-color-light);
          color: var(--accent-color);
          display: grid;
          place-items: center;
          font-weight: 700;
          font-size: 14px;
          box-shadow: inset 0 0 0 1px rgba(0,0,0,0.05);
        }
        .preview-scene {
          display: flex;
          justify-content: center;
          letter-spacing: 6px;
          color: var(--text-muted);
          font-size: 11px;
        }
        .preview-image {
          display: grid;
          place-items: center;
          height: 32px;
          border-radius: 8px;
          background: var(--glass-bg);
          color: var(--text-muted);
          border: 1px dashed var(--border-color);
        }
        .preview-footer {
          position: absolute;
          display: flex;
          justify-content: flex-end;
          font-size: 11px;
          color: var(--text-secondary);
        }
        .page-number {
          padding: 4px 8px;
          border-radius: 999px;
          background: var(--bg-secondary);
          box-shadow: inset 0 0 0 1px var(--border-color);
        }
        .editions-tab {
          display: flex;
          gap: 24px;
          max-width: none;
        }
        .editions-sidebar {
          width: 220px;
          flex-shrink: 0;
        }
        .editions-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 12px;
        }
        .edition-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          background: var(--bg-primary);
          cursor: pointer;
          text-align: left;
        }
        .edition-item:hover {
          background: var(--bg-hover);
        }
        .edition-item.active {
          border-color: var(--accent-color);
          background: var(--accent-color-light);
        }
        .edition-icon {
          font-size: 18px;
        }
        .edition-name {
          flex: 1;
          font-size: 13px;
        }
        .add-edition select {
          width: 100%;
        }
        .edition-details {
          flex: 1;
          min-width: 0;
        }
        .edition-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }
        .edition-title-input {
          flex: 1;
          font-size: 18px;
          font-weight: 600;
          border: none;
          background: transparent;
          padding: 4px;
        }
        .edition-title-input:focus {
          outline: none;
          border-bottom: 2px solid var(--accent-color);
        }
        .btn {
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.15s;
        }
        .btn-primary {
          background: var(--accent-color);
          color: white;
        }
        .btn-primary:hover {
          opacity: 0.9;
        }
        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .btn-ghost {
          background: transparent;
          color: var(--text-secondary);
        }
        .btn-ghost:hover {
          background: var(--bg-hover);
        }
        .btn-preview {
          background: var(--accent-color, #3b82f6);
          color: white;
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 5px 10px;
          font-size: 12px;
        }
        .btn-preview:hover {
          background: var(--accent-hover, #2563eb);
        }
        .btn-danger:hover {
          color: #e53e3e;
        }
        .char-count {
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 4px;
        }
        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid var(--border-color);
          border-top-color: var(--accent-color);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default LayoutEditor;
