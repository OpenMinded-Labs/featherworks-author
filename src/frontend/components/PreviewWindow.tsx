import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { readBinaryFile } from '@tauri-apps/api/fs';
import * as pdfjsLib from 'pdfjs-dist';

// Use the worker from public folder
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

console.log('[PreviewWindow] Module loaded, hash:', window.location.hash);

// Fixed preview PDF path for macOS - matches Rust backend
const PREVIEW_PDF_PATH = '/Users/simonvandeloo/Library/Caches/com.featherworks.author/preview/preview.pdf';

// Common paper sizes
const PAPER_SIZES = [
  { label: 'A4 (210×297mm)', width: 210, height: 297 },
  { label: 'A5 (148×210mm)', width: 148, height: 210 },
  { label: 'Taschenbuch (140×216mm)', width: 140, height: 216 },
  { label: 'US Trade (152×229mm)', width: 152, height: 229 },
  { label: 'B5 (176×250mm)', width: 176, height: 250 },
  { label: 'Digest (140×216mm)', width: 140, height: 216 },
  { label: 'Mass Paperback (108×175mm)', width: 108, height: 175 },
];

// Default settings to use while loading
const DEFAULT_SETTINGS: LayoutSettings = {
  id: 'default',
  pageWidth: 148,
  pageHeight: 210,
  marginTop: 20,
  marginBottom: 20,
  marginInner: 20,
  marginOuter: 15,
  fontFamily: 'Georgia',
  fontSize: 11,
  lineHeight: 1.5,
  firstLineIndent: 5,
  paragraphSpacing: 0,
  hyphenation: true,
  hyphenationLang: 'de',
  dropCapEnabled: true,
  showPageNumbers: true,
  sceneBreakStyle: 'asterism',
};

// Full interface matching Rust backend LayoutSettings
interface LayoutSettings {
  id: string;
  presetId?: string;
  // Page dimensions (mm)
  pageWidth: number;
  pageHeight: number;
  // Margins (mm)
  marginTop: number;
  marginBottom: number;
  marginInner: number;
  marginOuter: number;
  mirrorMargins?: boolean;
  // Typography
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  firstLineIndent: number;
  textAlign?: string;
  // Widow/Orphan control
  preventWidows?: boolean;
  preventOrphans?: boolean;
  // Hyphenation
  hyphenation: boolean;
  hyphenationLang?: string;
  // OpenType features
  ligatures?: boolean;
  kerning?: boolean;
  opticalMarginAlign?: boolean;
  // Headers & Footers
  headerText?: string;
  showPageNumbers: boolean;
  pageNumberPosition?: string;
  runningHeaderLeft?: string;
  runningHeaderRight?: string;
  runningHeaderStyle?: string;
  // Chapters
  chapterStartPage?: string;
  chapterTitleFont?: string;
  chapterTitleSize?: number;
  dropCapEnabled: boolean;
  dropCapLines?: number;
  // Front matter
  includeHalfTitle?: boolean;
  includeTitlePage?: boolean;
  includeCopyright?: boolean;
  copyrightText?: string;
  dedication?: string;
  epigraph?: string;
  titleLogoPath?: string;
  epigraphAuthor?: string;
  // Table of contents
  includeToc?: boolean;
  tocTitle?: string;
  tocIncludeScenes?: boolean;
  // Scene breaks
  sceneBreakStyle: string;
  sceneBreakCustom?: string;
  sceneBreakImagePath?: string;
}

/**
 * Preview Window – zeigt zwei Seiten nebeneinander, blätterbar, zoombar.
 * Empfängt per Tauri-Event den Pfad einer neu gerenderten PDF und lädt diese.
 * Mit Settings-Panel für Live-Änderungen.
 */
interface PreviewWindowProps {
  embedded?: boolean;
  hideSettings?: boolean; // Hide the internal settings panel (when using sidebar settings)
  onBack?: () => void;
  onExport?: () => void; // Callback to open export dialog
}

export const PreviewWindow: React.FC<PreviewWindowProps> = ({ embedded = false, hideSettings = false, onBack, onExport }) => {
  console.log('[PreviewWindow] Component rendering, embedded:', embedded);
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentSpread, setCurrentSpread] = useState(0); // Index of left page (0 = pages 1+2)
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(!hideSettings); // Hide if prop is set
  const [pageInputValue, setPageInputValue] = useState('1'); // For direct page input
  const [hoverSide, setHoverSide] = useState<'left' | 'right' | null>(null); // For hover navigation arrows
  // Initialize with defaults so UI is immediately usable
  const [settings, setSettings] = useState<LayoutSettings>(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsInitialized, setSettingsInitialized] = useState(false);
  const leftCanvasRef = useRef<HTMLCanvasElement>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadAttemptRef = useRef(0);
  const renderTaskRef = useRef<{ left?: any; right?: any }>({});

  // Navigation functions
  const maxSpread = Math.max(0, Math.floor((totalPages - 1) / 2));
  const prevSpread = useCallback(() => setCurrentSpread((s) => Math.max(0, s - 1)), []);
  const nextSpread = useCallback(() => setCurrentSpread((s) => Math.min(maxSpread, s + 1)), [maxSpread]);
  
  const goToPage = useCallback((page: number) => {
    const targetPage = Math.max(1, Math.min(totalPages, page));
    const targetSpread = Math.floor((targetPage - 1) / 2);
    setCurrentSpread(targetSpread);
    setPageInputValue(String(targetPage));
  }, [totalPages]);

  // Handle page input
  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInputValue(e.target.value);
  };
  
  const handlePageInputSubmit = (e: React.KeyboardEvent | React.FocusEvent) => {
    if (e.type === 'blur' || (e as React.KeyboardEvent).key === 'Enter') {
      const page = parseInt(pageInputValue, 10);
      if (!isNaN(page)) {
        goToPage(page);
      } else {
        setPageInputValue(String(currentSpread * 2 + 1));
      }
    }
  };

  // Update page input when spread changes
  useEffect(() => {
    setPageInputValue(String(currentSpread * 2 + 1));
  }, [currentSpread]);

  // Mouse wheel zoom handler
  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale(s => Math.max(0.3, Math.min(3, s + delta)));
    }
  }, []);

  // Add wheel listener
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        prevSpread();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        nextSpread();
      } else if (e.key === 'Home') {
        e.preventDefault();
        setCurrentSpread(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setCurrentSpread(maxSpread);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prevSpread, nextSpread, maxSpread]);

  // Load settings on mount - merge with defaults
  useEffect(() => {
    (async () => {
      try {
        console.log('[PreviewWindow] Loading settings from backend...');
        const s = await invoke<LayoutSettings>('get_layout_settings');
        console.log('[PreviewWindow] Settings loaded from backend:', s);
        // Merge with defaults to ensure all fields are present
        setSettings({ ...DEFAULT_SETTINGS, ...s });
        setSettingsInitialized(true);
      } catch (e) {
        console.error('[PreviewWindow] Failed to load settings, using defaults:', e);
        setSettingsInitialized(true);
      }
    })();
  }, []);

  // Update a setting
  const updateSetting = <K extends keyof LayoutSettings>(key: K, value: LayoutSettings[K]) => {
    console.log('[PreviewWindow] Updating setting:', key, '=', value);
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  // Apply paper size preset
  const applyPaperSize = (width: number, height: number) => {
    console.log('[PreviewWindow] Applying paper size:', width, 'x', height);
    setSettings(prev => ({ ...prev, pageWidth: width, pageHeight: height }));
  };

  // Save settings and re-render preview
  const handleApplySettings = async () => {
    console.log('[PreviewWindow] Saving settings and regenerating PDF...', settings);
    setSettingsLoading(true);
    setLoading(true);
    try {
      // Save settings first
      await invoke('save_layout_settings', { settings });
      console.log('[PreviewWindow] Settings saved, now regenerating PDF...');
      
      // Regenerate PDF - this will emit preview_refresh event
      await invoke('open_pdf_preview_window');
      console.log('[PreviewWindow] open_pdf_preview_window called, waiting for refresh event...');
      // The new PDF will be loaded via the preview_refresh event
    } catch (e: any) {
      console.error('[PreviewWindow] Failed to apply settings:', e);
      setError(e?.message || 'Einstellungen konnten nicht angewendet werden');
    } finally {
      setSettingsLoading(false);
    }
  };

  // Function to load PDF from path
  const loadPdf = useCallback(async (path: string) => {
    console.log('[PreviewWindow] loadPdf called with path:', path);
    setLoading(true);
    setError(null);
    
    // Clear previous PDF data to force complete reload
    setPdf(null);
    setPdfData(null);
    
    try {
      // Add timestamp to bust any cache
      console.log('[PreviewWindow] Reading PDF file at:', new Date().toISOString());
      const data = await readBinaryFile(path);
      console.log('[PreviewWindow] PDF binary loaded, size:', data.length, 'bytes');
      
      // Force new array to ensure React sees the change
      const newData = new Uint8Array(data);
      setPdfData(newData);
      setPdfPath(path);
    } catch (e: any) {
      console.error('[PreviewWindow] Failed to read PDF file:', e);
      // Don't show error on initial load - the PDF might not exist yet
      // The preview_refresh event will provide the correct path
      if (pdfPath) {
        setError(`Datei konnte nicht gelesen werden: ${e?.message || e}`);
      }
      setLoading(false);
    }
  }, [pdfPath]);

  // On mount, just set up - wait for preview_refresh event to load PDF
  // The backend sends this event after generating the PDF
  useEffect(() => {
    console.log('[PreviewWindow] Component mounted, waiting for preview_refresh event...');
    // Try to load existing preview PDF if it exists
    const timer = setTimeout(() => {
      console.log('[PreviewWindow] Attempting to load existing PDF from:', PREVIEW_PDF_PATH);
      loadPdf(PREVIEW_PDF_PATH);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [loadPdf]);

  // Listen for refresh events from main window
  useEffect(() => {
    console.log('[PreviewWindow] Setting up preview_refresh listener');
    const unlisten = listen<string>('preview_refresh', (event) => {
      console.log('[PreviewWindow] preview_refresh event received', event.payload);
      // Clear old state and reload with slight delay to ensure file is written
      setPdf(null);
      setPdfData(null);
      setSettingsLoading(false);
      setTimeout(() => {
        loadPdf(event.payload);
      }, 100);
    });
    return () => { unlisten.then((f) => f()); };
  }, [loadPdf]);

  // Parse PDF when binary data is available
  useEffect(() => {
    if (!pdfData) return;
    console.log('[PreviewWindow] Parsing PDF data...');

    pdfjsLib.getDocument({ data: pdfData }).promise
      .then((doc) => {
        console.log('[PreviewWindow] PDF parsed, pages:', doc.numPages);
        setPdf(doc);
        setTotalPages(doc.numPages);
        setCurrentSpread(0);
        setLoading(false);
      })
      .catch((e) => {
        console.error('[PreviewWindow] PDF parse error', e);
        setError(e?.message || 'PDF konnte nicht geladen werden');
        setLoading(false);
      });
  }, [pdfData]);

  // Render two pages (spread)
  const renderSpread = useCallback(async () => {
    if (!pdf) {
      console.log('[PreviewWindow] renderSpread: no pdf yet');
      return;
    }
    
    // Cancel any ongoing render tasks
    if (renderTaskRef.current.left) {
      try { renderTaskRef.current.left.cancel(); } catch (e) {}
    }
    if (renderTaskRef.current.right) {
      try { renderTaskRef.current.right.cancel(); } catch (e) {}
    }
    renderTaskRef.current = {};
    
    console.log('[PreviewWindow] renderSpread: rendering spread', currentSpread, 'scale:', scale);
    const leftPageNum = currentSpread * 2 + 1;
    const rightPageNum = leftPageNum + 1;

    const renderPage = async (pageNum: number, canvas: HTMLCanvasElement | null, side: 'left' | 'right') => {
      if (!canvas) {
        console.log(`[PreviewWindow] renderPage ${side}: no canvas`);
        return;
      }
      if (pageNum > totalPages) {
        console.log(`[PreviewWindow] renderPage ${side}: page ${pageNum} > totalPages ${totalPages}`);
        const ctx = canvas.getContext('2d');
        if (ctx) { 
          canvas.width = 400;
          canvas.height = 600;
          ctx.fillStyle = '#f0f0f0';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        return;
      }
      console.log(`[PreviewWindow] renderPage ${side}: rendering page ${pageNum}`);
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      const renderTask = page.render({ canvasContext: ctx, viewport, canvas });
      renderTaskRef.current[side] = renderTask;
      
      try {
        await renderTask.promise;
        console.log(`[PreviewWindow] renderPage ${side}: done`);
      } catch (e: any) {
        if (e?.name !== 'RenderingCancelledException') {
          console.error(`[PreviewWindow] renderPage ${side}: error`, e);
        }
      }
    };

    await Promise.all([
      renderPage(leftPageNum, leftCanvasRef.current, 'left'),
      renderPage(rightPageNum, rightCanvasRef.current, 'right'),
    ]);
  }, [pdf, currentSpread, scale, totalPages]);

  useEffect(() => { renderSpread(); }, [renderSpread]);

  // Auto-fit scale
  useEffect(() => {
    if (!pdf || !containerRef.current) return;
    (async () => {
      const page = await pdf.getPage(1);
      const vp = page.getViewport({ scale: 1 });
      const containerWidth = containerRef.current?.clientWidth || 800;
      // Two pages side by side with gap
      const desiredWidth = (containerWidth - 32) / 2;
      const newScale = desiredWidth / vp.width;
      setScale(Math.min(newScale, 1.5));
    })();
  }, [pdf]);

  // prevSpread/nextSpread are now defined as useCallback above

  return (
    <div className={`preview-window ${embedded ? 'embedded' : ''}`}>
      <header className="preview-header">
        <div className="preview-header-left">
          {/* Back button only shown when internal (not using sidebar) */}
          {embedded && onBack && !hideSettings && (
            <button 
              onClick={onBack} 
              className="back-button"
              title="Zurück zum Editor"
            >
              ← Editor
            </button>
          )}
          <h1>📄 PDF-Vorschau <span className="mode-hint">(Nach Aktualisierung)</span></h1>
        </div>
        <div className="preview-controls">
          <button onClick={prevSpread} disabled={currentSpread === 0 || !pdf} title="Zurück">◀</button>
          <span className="page-nav">
            Seite{' '}
            <input
              type="number"
              className="page-input"
              min={1}
              max={totalPages || 1}
              value={pageInputValue}
              onChange={handlePageInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  goToPage(parseInt(pageInputValue, 10));
                }
              }}
              onBlur={() => goToPage(parseInt(pageInputValue, 10))}
              title="Seitenzahl eingeben"
              disabled={!pdf}
            />
            <span> / {totalPages || '–'}</span>
          </span>
          <button onClick={nextSpread} disabled={!pdf || currentSpread >= Math.floor((totalPages - 1) / 2)} title="Weiter">▶</button>
          <span className="divider" />
          <button onClick={() => setScale((s) => Math.max(0.5, s - 0.15))} disabled={!pdf} title="Verkleinern">−</button>
          <span>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale((s) => Math.min(2, s + 0.15))} disabled={!pdf} title="Vergrößern">+</button>
          {/* Export button */}
          {onExport && (
            <>
              <span className="divider" />
              <button 
                onClick={onExport}
                className="export-btn"
                title="Exportieren (PDF, EPUB, DOCX, MOBI)"
              >
                📤 Exportieren
              </button>
            </>
          )}
          {/* Only show settings toggle when settings panel is internal (not in sidebar) */}
          {!hideSettings && (
            <>
              <span className="divider" />
              <button 
                onClick={() => setShowSettings(!showSettings)} 
                className={showSettings ? 'active' : ''}
                title="Einstellungen ein-/ausblenden"
              >⚙️</button>
            </>
          )}
        </div>
      </header>
      {error && <div className="preview-error">{error}</div>}
      <div className="preview-body">
        {/* Settings Panel */}
        {showSettings && (
          <aside className="preview-settings">
            <h3>📐 Layout-Einstellungen</h3>
            
            {!settingsInitialized && <div className="settings-loading">Lade Einstellungen...</div>}
            
            {settingsInitialized && (
              <>
                <div className="settings-section">
                  <label>Papierformat</label>
                  <select 
                    title="Papierformat auswählen"
                    value={`${settings.pageWidth}x${settings.pageHeight}`}
                    onChange={(e) => {
                      const [w, h] = e.target.value.split('x').map(Number);
                      applyPaperSize(w, h);
                    }}
                  >
                    {PAPER_SIZES.map(ps => (
                      <option key={ps.label} value={`${ps.width}x${ps.height}`}>{ps.label}</option>
                ))}
                <option value={`${settings.pageWidth}x${settings.pageHeight}`}>Benutzerdefiniert</option>
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

            <div className="settings-section">
              <label>Ränder (mm)</label>
              <div className="margin-grid">
                <div className="margin-row">
                  <span>Oben:</span>
                  <input type="number" value={settings.marginTop} onChange={(e) => updateSetting('marginTop', Number(e.target.value))} />
                </div>
                <div className="margin-row">
                  <span>Unten:</span>
                  <input type="number" value={settings.marginBottom} onChange={(e) => updateSetting('marginBottom', Number(e.target.value))} />
                </div>
                <div className="margin-row">
                  <span>Innen:</span>
                  <input type="number" value={settings.marginInner} onChange={(e) => updateSetting('marginInner', Number(e.target.value))} />
                </div>
                <div className="margin-row">
                  <span>Außen:</span>
                  <input type="number" value={settings.marginOuter} onChange={(e) => updateSetting('marginOuter', Number(e.target.value))} />
                </div>
              </div>
            </div>

            <div className="settings-section">
              <label>Typografie</label>
              <div className="typo-row">
                <span>Schrift:</span>
                <select value={settings.fontFamily} onChange={(e) => updateSetting('fontFamily', e.target.value)}>
                  <option value="Crimson Pro">Crimson Pro</option>
                  <option value="EB Garamond">EB Garamond</option>
                  <option value="Linux Libertine">Linux Libertine</option>
                  <option value="Palatino">Palatino</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Times New Roman">Times New Roman</option>
                </select>
              </div>
              <div className="typo-row">
                <span>Größe:</span>
                <input type="number" value={settings.fontSize} onChange={(e) => updateSetting('fontSize', Number(e.target.value))} step="0.5" />
                <span>pt</span>
              </div>
              <div className="typo-row">
                <span>Zeilenhöhe:</span>
                <input type="number" value={settings.lineHeight} onChange={(e) => updateSetting('lineHeight', Number(e.target.value))} step="0.1" min="1" max="2.5" />
              </div>
              <div className="typo-row">
                <span>Einzug:</span>
                <input type="number" value={settings.firstLineIndent} onChange={(e) => updateSetting('firstLineIndent', Number(e.target.value))} step="0.5" />
                <span>mm</span>
              </div>
            </div>

            <div className="settings-section">
              <label>Optionen</label>
              <div className="checkbox-row">
                <input type="checkbox" id="hyphenation" checked={settings.hyphenation} onChange={(e) => updateSetting('hyphenation', e.target.checked)} />
                <label htmlFor="hyphenation">Silbentrennung</label>
              </div>
              <div className="checkbox-row">
                <input type="checkbox" id="dropCap" checked={settings.dropCapEnabled} onChange={(e) => updateSetting('dropCapEnabled', e.target.checked)} />
                <label htmlFor="dropCap">Initialen</label>
              </div>
              <div className="checkbox-row">
                <input type="checkbox" id="pageNumbers" checked={settings.showPageNumbers} onChange={(e) => updateSetting('showPageNumbers', e.target.checked)} />
                <label htmlFor="pageNumbers">Seitenzahlen</label>
              </div>
            </div>

            <div className="settings-section">
              <label>Szenentrenner</label>
              <select value={settings.sceneBreakStyle} onChange={(e) => updateSetting('sceneBreakStyle', e.target.value)}>
                <option value="asterism">✽ ✽ ✽ (Asterismus)</option>
                <option value="asterisks">* * * (Sternchen)</option>
                <option value="line">───── (Linie)</option>
                <option value="ornament">❧ (Ornament)</option>
                <option value="blank">(Leerzeile)</option>
              </select>
            </div>

            <button 
              className="apply-btn" 
              onClick={handleApplySettings} 
              disabled={settingsLoading}
            >
              {settingsLoading ? '⏳ Generiere...' : '🔄 Vorschau aktualisieren'}
            </button>
              </>
            )}
          </aside>
        )}

        {/* PDF Preview */}
        <div 
          className="preview-content"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const width = rect.width;
            // Show arrows if hovering on left or right 15% of the area
            if (x < width * 0.15) {
              setHoverSide('left');
            } else if (x > width * 0.85) {
              setHoverSide('right');
            } else {
              setHoverSide(null);
            }
          }}
          onMouseLeave={() => setHoverSide(null)}
        >
          {loading && !pdf && <div className="preview-loading">Lade Vorschau…</div>}
          
          {/* Left navigation arrow */}
          {hoverSide === 'left' && currentSpread > 0 && pdf && (
            <button 
              className="nav-arrow nav-arrow-left" 
              onClick={prevSpread}
              title="Vorherige Seite"
            >
              ◀
            </button>
          )}
          
          <div className={`preview-spread ${pdf ? '' : 'hidden'}`} ref={containerRef}>
            <canvas ref={leftCanvasRef} className="preview-page" />
            <canvas ref={rightCanvasRef} className="preview-page" />
          </div>
          
          {/* Right navigation arrow */}
          {hoverSide === 'right' && pdf && currentSpread < maxSpread && (
            <button 
              className="nav-arrow nav-arrow-right" 
              onClick={nextSpread}
              title="Nächste Seite"
            >
              ▶
            </button>
          )}
        </div>
      </div>
      <style>{`
        .preview-window {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: var(--bg-primary, #1a1a1a);
          color: var(--text-primary, #f0f0f0);
        }
        .preview-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 20px;
          background: var(--bg-secondary, #222);
          border-bottom: 1px solid var(--border-color, #333);
        }
        .preview-header h1 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }
        .mode-hint {
          font-size: 11px;
          font-weight: 400;
          color: var(--text-muted, #888);
        }
        .preview-controls {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .preview-controls button {
          background: var(--bg-tertiary, #333);
          border: none;
          border-radius: 6px;
          padding: 6px 12px;
          color: inherit;
          cursor: pointer;
          font-size: 14px;
        }
        .preview-controls button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .preview-controls button.active {
          background: var(--accent-color, #4a9eff);
          color: white;
        }
        .preview-controls .export-btn {
          background: var(--accent-color, #3b82f6);
          color: white;
          font-size: 13px;
        }
        .preview-controls .export-btn:hover {
          background: var(--accent-hover, #2563eb);
        }
        .preview-controls .divider {
          width: 1px;
          height: 20px;
          background: var(--border-color, #444);
          margin: 0 8px;
        }
        .page-nav {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 13px;
        }
        .page-input {
          width: 48px;
          background: var(--bg-tertiary, #333);
          border: 1px solid var(--border-color, #444);
          border-radius: 4px;
          padding: 4px 6px;
          color: inherit;
          font-size: 13px;
          text-align: center;
        }
        .page-input:focus {
          border-color: var(--accent-color, #4a9eff);
          outline: none;
        }
        .page-input:disabled {
          opacity: 0.5;
        }
        /* Hide spinner arrows in number input */
        .page-input::-webkit-outer-spin-button,
        .page-input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .page-input[type=number] {
          -moz-appearance: textfield;
        }
        .preview-error {
          background: rgba(220,53,69,0.2);
          color: #ff6b6b;
          padding: 10px 20px;
          text-align: center;
        }
        .preview-loading {
          text-align: center;
          padding: 40px;
          color: var(--text-muted, #888);
        }
        .preview-body {
          flex: 1;
          display: flex;
          overflow: hidden;
        }
        .preview-settings {
          width: 280px;
          background: var(--bg-secondary, #222);
          border-right: 1px solid var(--border-color, #333);
          padding: 16px;
          overflow-y: auto;
          flex-shrink: 0;
        }
        .preview-settings h3 {
          margin: 0 0 16px 0;
          font-size: 14px;
          font-weight: 600;
        }
        .settings-loading {
          color: var(--text-muted, #888);
          font-size: 13px;
          padding: 20px 0;
          text-align: center;
        }
        .settings-section {
          margin-bottom: 20px;
        }
        .settings-section > label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-muted, #888);
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .settings-section select,
        .settings-section input[type="number"] {
          background: var(--bg-tertiary, #333);
          border: 1px solid var(--border-color, #444);
          border-radius: 4px;
          padding: 6px 8px;
          color: inherit;
          font-size: 13px;
        }
        .settings-section select {
          width: 100%;
        }
        .dimension-inputs {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 8px;
        }
        .dimension-inputs input {
          width: 70px;
        }
        .margin-grid {
          display: grid;
          gap: 8px;
        }
        .margin-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .margin-row span {
          width: 50px;
          font-size: 12px;
        }
        .margin-row input {
          width: 60px;
        }
        .typo-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }
        .typo-row span:first-child {
          width: 70px;
          font-size: 12px;
        }
        .typo-row select {
          flex: 1;
        }
        .typo-row input {
          width: 60px;
        }
        .checkbox-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
        }
        .checkbox-row input[type="checkbox"] {
          width: 16px;
          height: 16px;
        }
        .checkbox-row label {
          font-size: 13px;
          cursor: pointer;
        }
        .apply-btn {
          width: 100%;
          padding: 12px;
          background: var(--accent-color, #4a9eff);
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 16px;
        }
        .apply-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .apply-btn:hover:not(:disabled) {
          background: var(--accent-hover, #3a8eef);
        }
        .preview-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
        }
        .preview-spread {
          flex: 1;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          gap: 16px;
          padding: 24px;
          overflow: auto;
          background: #2a2a2a;
        }
        .preview-spread.hidden {
          display: none;
        }
        .preview-page {
          background: white;
          box-shadow: 0 4px 20px rgba(0,0,0,0.4);
          border-radius: 4px;
          flex-shrink: 0;
        }
        /* Navigation arrows on hover */
        .nav-arrow {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 48px;
          height: 80px;
          background: rgba(0, 0, 0, 0.5);
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 20px;
          cursor: pointer;
          z-index: 10;
          transition: background 0.2s, opacity 0.2s;
          opacity: 0.8;
        }
        .nav-arrow:hover {
          background: rgba(0, 0, 0, 0.7);
          opacity: 1;
        }
        .nav-arrow-left {
          left: 20px;
        }
        .nav-arrow-right {
          right: 20px;
        }
        /* Embedded mode overrides */
        .preview-window.embedded {
          height: 100%;
          position: relative;
        }
      `}</style>
    </div>
  );
};

export default PreviewWindow;
