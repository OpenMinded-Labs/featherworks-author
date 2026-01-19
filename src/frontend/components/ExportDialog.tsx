import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/tauri';
import { save } from '@tauri-apps/api/dialog';

// ============================================================================
// Types
// ============================================================================

interface LayoutSettings {
  id: string;
  presetId: string | null;
  pageWidth: number;
  pageHeight: number;
  marginTop: number;
  marginBottom: number;
  marginInner: number;
  marginOuter: number;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  firstLineIndent: number;
  headerText: string | null;
  showPageNumbers: boolean;
  pageNumberPosition: string;
  chapterStartPage: string;
  chapterTitleFont: string | null;
  chapterTitleSize: number;
  dropCapEnabled: boolean;
}

interface LayoutPreset {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  settings: LayoutSettings;
}

interface Chapter {
  id: string;
  title: string;
  order: number;
}

interface Scene {
  id: string;
  title: string;
  chapter_id: string;
  content?: string;
}

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectTitle: string;
  projectAuthor: string;
  chapters: Chapter[];
  scenes: Record<string, Scene[]>;
  getSceneContent: (sceneId: string) => Promise<string>;
}

type ExportFormat = 'epub' | 'docx' | 'rtf' | 'pdf';

// ============================================================================
// Component
// ============================================================================

export const ExportDialog: React.FC<ExportDialogProps> = ({
  isOpen,
  onClose,
  projectTitle,
  projectAuthor,
  chapters,
  scenes,
  getSceneContent,
}) => {
  const { t, i18n } = useTranslation();
  const isGerman = i18n.language === 'de';
  
  // State
  const [format, setFormat] = useState<ExportFormat>('epub');
  const [presets, setPresets] = useState<LayoutPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('a5-novel');
  const [settings, setSettings] = useState<LayoutSettings | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  
  // Form state
  const [title, setTitle] = useState(projectTitle);
  const [author, setAuthor] = useState(projectAuthor);
  
  // Load presets
  useEffect(() => {
    if (isOpen) {
      loadPresets();
    }
  }, [isOpen]);
  
  const loadPresets = async () => {
    try {
      const data = await invoke<LayoutPreset[]>('list_layout_presets');
      setPresets(data);
      // Select first preset if none selected
      if (data.length > 0 && !selectedPresetId) {
        setSelectedPresetId(data[0].id);
        setSettings(data[0].settings);
      } else {
        const preset = data.find(p => p.id === selectedPresetId);
        if (preset) setSettings(preset.settings);
      }
    } catch (e) {
      console.error('Failed to load presets:', e);
    }
  };
  
  const handlePresetChange = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = presets.find(p => p.id === presetId);
    if (preset) {
      setSettings(preset.settings);
    }
  };
  
  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress(isGerman ? 'Manuskript vorbereiten...' : 'Preparing manuscript...');
    
    try {
      // Get file extension
      const ext = format === 'epub' ? 'epub' : format === 'docx' ? 'docx' : format === 'rtf' ? 'rtf' : 'pdf';
      
      // Ask for save location
      const filePath = await save({
        defaultPath: `${title || 'Manuskript'}.${ext}`,
        filters: [{
          name: format.toUpperCase(),
          extensions: [ext],
        }],
      });
      
      if (!filePath) {
        setIsExporting(false);
        return;
      }
      
      setExportProgress(isGerman ? 'Szenen laden...' : 'Loading scenes...');
      
      // Build chapter data with scene contents
      const exportChapters = [];
      const sortedChapters = [...chapters].sort((a, b) => a.order - b.order);
      
      for (const chapter of sortedChapters) {
        const chapterScenes = scenes[chapter.id] || [];
        const sortedScenes = [...chapterScenes].sort((a, b) => (a as any).order - (b as any).order);
        
        const sceneContents = [];
        for (const scene of sortedScenes) {
          const content = await getSceneContent(scene.id);
          sceneContents.push({
            title: scene.title,
            content: content,
          });
        }
        
        exportChapters.push({
          title: chapter.title,
          scenes: sceneContents,
        });
      }
      
      setExportProgress(isGerman ? `Als ${format.toUpperCase()} exportieren...` : `Exporting as ${format.toUpperCase()}...`);
      
      // Call appropriate export function
      switch (format) {
        case 'epub':
          await invoke('export_manuscript_epub', {
            chapters: exportChapters,
            outputPath: filePath,
            title: title || 'Unbenannt',
            author: author || 'Unbekannt',
          });
          break;
        case 'docx':
          await invoke('export_manuscript_docx', {
            chapters: exportChapters,
            outputPath: filePath,
            title: title || 'Unbenannt',
            author: author || 'Unbekannt',
          });
          break;
        case 'rtf':
          await invoke('export_manuscript_rtf', {
            chapters: exportChapters,
            outputPath: filePath,
            title: title || 'Unbenannt',
            author: author || 'Unbekannt',
          });
          break;
        case 'pdf':
          // PDF via Typst - coming soon
          throw new Error(isGerman ? 'PDF-Export kommt bald!' : 'PDF export coming soon!');
      }
      
      setExportProgress(isGerman ? 'Export erfolgreich!' : 'Export successful!');
      setTimeout(() => {
        onClose();
        setIsExporting(false);
        setExportProgress('');
      }, 1500);
      
    } catch (e) {
      console.error('Export failed:', e);
      setExportProgress(`${isGerman ? 'Fehler: ' : 'Error: '}${e}`);
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress('');
      }, 3000);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-xl font-semibold">
            {isGerman ? 'Manuskript exportieren' : 'Export Manuscript'}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
        
        <div className="p-4 space-y-6">
          {/* Title & Author */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                {isGerman ? 'Titel' : 'Title'}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background"
                placeholder={isGerman ? 'Buchtitel' : 'Book title'}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                {isGerman ? 'Autor' : 'Author'}
              </label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background"
                placeholder={isGerman ? 'Name des Autors' : 'Author name'}
              />
            </div>
          </div>
          
          {/* Format Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">
              {isGerman ? 'Exportformat' : 'Export Format'}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([
                { id: 'epub', label: 'EPUB', icon: '📱', desc: isGerman ? 'E-Reader' : 'E-Reader' },
                { id: 'docx', label: 'DOCX', icon: '📄', desc: isGerman ? 'Word' : 'Word' },
                { id: 'rtf', label: 'RTF', icon: '📝', desc: isGerman ? 'Universal' : 'Universal' },
                { id: 'pdf', label: 'PDF', icon: '📕', desc: isGerman ? 'Druck (bald)' : 'Print (soon)' },
              ] as { id: ExportFormat; label: string; icon: string; desc: string }[]).map(fmt => (
                <button
                  key={fmt.id}
                  onClick={() => setFormat(fmt.id)}
                  disabled={fmt.id === 'pdf'}
                  className={`p-3 rounded-lg border-2 text-center transition-all ${
                    format === fmt.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-muted-foreground'
                  } ${fmt.id === 'pdf' ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="text-2xl mb-1">{fmt.icon}</div>
                  <div className="font-medium">{fmt.label}</div>
                  <div className="text-xs text-muted-foreground">{fmt.desc}</div>
                </button>
              ))}
            </div>
          </div>
          
          {/* Preset Selection (for PDF) */}
          {format === 'pdf' && (
            <div>
              <label className="block text-sm font-medium mb-2">
                {isGerman ? 'Buchformat' : 'Book Format'}
              </label>
              <select
                value={selectedPresetId}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background"
              >
                {presets.map(preset => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name} - {preset.description}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {/* Advanced Settings Toggle */}
          {format === 'pdf' && (
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              {showSettings ? '▼' : '▶'} {isGerman ? 'Erweiterte Einstellungen' : 'Advanced Settings'}
            </button>
          )}
          
          {/* Advanced Settings */}
          {showSettings && settings && format === 'pdf' && (
            <div className="p-4 bg-muted/30 rounded-lg space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {isGerman ? 'Seitenbreite (mm)' : 'Page Width (mm)'}
                  </label>
                  <input
                    type="number"
                    value={settings.pageWidth}
                    onChange={(e) => setSettings({ ...settings, pageWidth: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-border rounded-md bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {isGerman ? 'Seitenhöhe (mm)' : 'Page Height (mm)'}
                  </label>
                  <input
                    type="number"
                    value={settings.pageHeight}
                    onChange={(e) => setSettings({ ...settings, pageHeight: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-border rounded-md bg-background"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="block text-xs mb-1">{isGerman ? 'Oben' : 'Top'}</label>
                  <input
                    type="number"
                    value={settings.marginTop}
                    onChange={(e) => setSettings({ ...settings, marginTop: parseFloat(e.target.value) })}
                    className="w-full px-2 py-1 text-sm border border-border rounded bg-background"
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1">{isGerman ? 'Unten' : 'Bottom'}</label>
                  <input
                    type="number"
                    value={settings.marginBottom}
                    onChange={(e) => setSettings({ ...settings, marginBottom: parseFloat(e.target.value) })}
                    className="w-full px-2 py-1 text-sm border border-border rounded bg-background"
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1">{isGerman ? 'Innen' : 'Inner'}</label>
                  <input
                    type="number"
                    value={settings.marginInner}
                    onChange={(e) => setSettings({ ...settings, marginInner: parseFloat(e.target.value) })}
                    className="w-full px-2 py-1 text-sm border border-border rounded bg-background"
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1">{isGerman ? 'Außen' : 'Outer'}</label>
                  <input
                    type="number"
                    value={settings.marginOuter}
                    onChange={(e) => setSettings({ ...settings, marginOuter: parseFloat(e.target.value) })}
                    className="w-full px-2 py-1 text-sm border border-border rounded bg-background"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {isGerman ? 'Schriftgröße (pt)' : 'Font Size (pt)'}
                  </label>
                  <input
                    type="number"
                    value={settings.fontSize}
                    onChange={(e) => setSettings({ ...settings, fontSize: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-border rounded-md bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {isGerman ? 'Zeilenhöhe' : 'Line Height'}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={settings.lineHeight}
                    onChange={(e) => setSettings({ ...settings, lineHeight: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-border rounded-md bg-background"
                  />
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.showPageNumbers}
                    onChange={(e) => setSettings({ ...settings, showPageNumbers: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">{isGerman ? 'Seitenzahlen' : 'Page Numbers'}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.dropCapEnabled}
                    onChange={(e) => setSettings({ ...settings, dropCapEnabled: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">{isGerman ? 'Initialen' : 'Drop Caps'}</span>
                </label>
              </div>
            </div>
          )}
          
          {/* Content Preview */}
          <div className="p-3 bg-muted/30 rounded-lg">
            <div className="text-sm font-medium mb-2">
              {isGerman ? 'Inhalt' : 'Content'}
            </div>
            <div className="text-sm text-muted-foreground">
              {chapters.length} {isGerman ? 'Kapitel' : 'chapters'}, {' '}
              {Object.values(scenes).reduce((n, arr) => n + (arr?.length || 0), 0)} {isGerman ? 'Szenen' : 'scenes'}
            </div>
            <div className="mt-2 max-h-32 overflow-y-auto text-xs">
              {chapters.sort((a, b) => a.order - b.order).map(ch => (
                <div key={ch.id} className="py-1 border-b border-border/50 last:border-0">
                  <span className="font-medium">{ch.title}</span>
                  <span className="text-muted-foreground ml-2">
                    ({(scenes[ch.id] || []).length} {isGerman ? 'Szenen' : 'scenes'})
                  </span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Export Progress */}
          {exportProgress && (
            <div className={`p-3 rounded-lg ${
              exportProgress.includes('Fehler') || exportProgress.includes('Error')
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                : exportProgress.includes('erfolgreich') || exportProgress.includes('successful')
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
            }`}>
              {isExporting && !exportProgress.includes('erfolgreich') && !exportProgress.includes('successful') && (
                <span className="inline-block animate-spin mr-2">⏳</span>
              )}
              {exportProgress}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-muted hover:bg-muted/80 rounded-md"
            disabled={isExporting}
          >
            {isGerman ? 'Abbrechen' : 'Cancel'}
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting || format === 'pdf'}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {isExporting 
              ? (isGerman ? 'Exportiere...' : 'Exporting...')
              : (isGerman ? 'Exportieren' : 'Export')
            }
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportDialog;
