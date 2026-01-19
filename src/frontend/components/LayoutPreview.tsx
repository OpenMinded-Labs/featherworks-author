import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import '../styles/layout-preview.css';

// ============================================================
// Layout Preview - CSS-based WYSIWYG Preview
// ============================================================
// 
// This component provides a high-fidelity CSS preview that closely
// matches the final PDF output. Changes are reflected instantly.
//
// Key features:
// - Real mm/pt measurements converted to screen pixels
// - CSS hyphenation matching Typst behavior
// - Simulated page breaks based on content height
// - Drop caps, scene breaks, running headers
// ============================================================

// Screen DPI for mm-to-pixel conversion (96 DPI standard)
const MM_TO_PX = 96 / 25.4; // ~3.78 px per mm
const PT_TO_PX = 96 / 72;   // ~1.33 px per pt

// Paper sizes in mm
const PAPER_SIZES = [
  { label: 'A4 (210×297mm)', width: 210, height: 297 },
  { label: 'A5 (148×210mm)', width: 148, height: 210 },
  { label: 'Taschenbuch (140×216mm)', width: 140, height: 216 },
  { label: 'US Trade (152×229mm)', width: 152, height: 229 },
  { label: 'B5 (176×250mm)', width: 176, height: 250 },
  { label: 'Digest (140×216mm)', width: 140, height: 216 },
  { label: 'Mass Paperback (108×175mm)', width: 108, height: 175 },
];

// Scene break symbols
const SCENE_BREAKS: Record<string, string> = {
  asterism: '⁂',
  asterisks: '* * *',
  line: '―――――',
  ornament: '❧',
  fleuron: '❦',
  blank: '',
};

// Available fonts (should match Typst fonts)
const FONTS = [
  'Crimson Pro',
  'EB Garamond', 
  'Linux Libertine',
  'Palatino',
  'Georgia',
  'Times New Roman',
];

interface LayoutSettings {
  id: string;
  presetId?: string;
  pageWidth: number;
  pageHeight: number;
  marginTop: number;
  marginBottom: number;
  marginInner: number;
  marginOuter: number;
  mirrorMargins?: boolean;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  firstLineIndent: number;
  textAlign?: string;
  preventWidows?: boolean;
  preventOrphans?: boolean;
  hyphenation: boolean;
  hyphenationLang?: string;
  ligatures?: boolean;
  kerning?: boolean;
  headerText?: string;
  showPageNumbers: boolean;
  pageNumberPosition?: string;
  runningHeaderLeft?: string;
  runningHeaderRight?: string;
  runningHeaderStyle?: string;
  chapterStartPage?: string;
  chapterTitleFont?: string;
  chapterTitleSize?: number;
  dropCapEnabled: boolean;
  dropCapLines?: number;
  sceneBreakStyle: string;
  sceneBreakCustom?: string;
}

interface ChapterContent {
  id: string;
  title: string;
  scenes: SceneContent[];
}

interface SceneContent {
  id: string;
  title: string;
  content: string;
}

// Props for embedded mode - data passed from parent
interface LayoutPreviewProps {
  embedded?: boolean;
  hideSettings?: boolean; // Hide the internal settings panel (when using sidebar settings)
  chapters?: Array<{ id: string; title: string; order?: number; position?: number }>;
  scenes?: Array<{ id: string; chapter_id: string; title: string; content?: string }>;
  projectTitle?: string;
  projectAuthor?: string;
  onBack?: () => void; // Callback to return to editor
  onExport?: () => void; // Callback to open export dialog
}

const DEFAULT_SETTINGS: LayoutSettings = {
  id: 'default',
  pageWidth: 148,
  pageHeight: 210,
  marginTop: 20,
  marginBottom: 25,
  marginInner: 20,
  marginOuter: 15,
  mirrorMargins: true,
  fontFamily: 'Crimson Pro',
  fontSize: 11,
  lineHeight: 1.4,
  paragraphSpacing: 0,
  firstLineIndent: 5,
  textAlign: 'justify',
  preventWidows: true,
  preventOrphans: true,
  hyphenation: true,
  hyphenationLang: 'de',
  ligatures: true,
  kerning: true,
  showPageNumbers: true,
  pageNumberPosition: 'bottom-outside',
  dropCapEnabled: true,
  dropCapLines: 3,
  sceneBreakStyle: 'asterism',
};

/**
 * CSS-based Layout Preview Component
 * Can be used standalone (in separate window) or embedded (in main app)
 */
export const LayoutPreview: React.FC<LayoutPreviewProps> = ({ 
  embedded = false,
  hideSettings: hideSettingsProp = false,
  chapters: propChapters,
  scenes: propScenes,
  projectTitle: propTitle,
  projectAuthor: propAuthor,
  onBack,
  onExport,
}) => {
  const [settings, setSettings] = useState<LayoutSettings>(DEFAULT_SETTINGS);
  const [chapters, setChapters] = useState<ChapterContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [scale, setScale] = useState(1.0);
  const [autoScale, setAutoScale] = useState(true); // Auto-fit to viewport
  const [currentSpread, setCurrentSpread] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [showSettings, setShowSettings] = useState(!hideSettingsProp); // Hide if prop is set
  const [viewMode, setViewMode] = useState<'spread' | 'single'>('spread');
  const [projectTitle, setProjectTitle] = useState(propTitle || 'Mein Buch');
  const [projectAuthor, setProjectAuthor] = useState(propAuthor || '');
  
  const contentRef = useRef<HTMLDivElement>(null);
  const pagesContainerRef = useRef<HTMLDivElement>(null);

  // Calculate total pages based on content
  const calculateTotalPages = useCallback(() => {
    if (!pagesContainerRef.current || !settings) return;
    const container = pagesContainerRef.current;
    const contentHeight = container.scrollHeight;
    const pageHeight = (settings.pageHeight * PT_TO_PX) - 
      ((settings.marginTop + settings.marginBottom) * PT_TO_PX);
    const pages = Math.max(1, Math.ceil(contentHeight / pageHeight));
    setTotalPages(pages);
  }, [settings]);

  // Recalculate pages when content or settings change
  useEffect(() => {
    const timer = setTimeout(calculateTotalPages, 100);
    return () => clearTimeout(timer);
  }, [chapters, settings, calculateTotalPages]);

  // Navigation helpers
  const totalSpreads = Math.ceil(totalPages / 2);
  const currentLeftPage = currentSpread * 2 + 1;
  const currentRightPage = Math.min(currentLeftPage + 1, totalPages);
  
  const prevSpread = () => setCurrentSpread(s => Math.max(0, s - 1));
  const nextSpread = () => setCurrentSpread(s => Math.min(totalSpreads - 1, s + 1));
  const goToPage = (page: number) => {
    const spread = Math.floor((page - 1) / 2);
    setCurrentSpread(Math.max(0, Math.min(totalSpreads - 1, spread)));
  };

  // Reload settings when window gets focus (user may have changed them in sidebar)
  useEffect(() => {
    if (!embedded) return;
    
    const reloadSettings = async () => {
      try {
        const s = await invoke<LayoutSettings>('get_layout_settings');
        setSettings(prev => ({ ...DEFAULT_SETTINGS, ...s }));
        console.log('[LayoutPreview] Settings reloaded on focus');
      } catch (e) {
        console.error('[LayoutPreview] Failed to reload settings:', e);
      }
    };

    // Reload on window focus
    window.addEventListener('focus', reloadSettings);
    
    // Also poll every 2 seconds for live updates while visible
    const interval = setInterval(reloadSettings, 2000);

    return () => {
      window.removeEventListener('focus', reloadSettings);
      clearInterval(interval);
    };
  }, [embedded]);

  // CRITICAL: Force full viewport on mount - only for standalone mode
  useEffect(() => {
    if (embedded) return; // Skip viewport forcing in embedded mode
    
    console.log('[LayoutPreview] Applying viewport styles...');
    
    const applyStyles = () => {
      // Force body/html styles via JS to ensure they apply
      document.documentElement.style.cssText = 'margin:0!important;padding:0!important;width:100vw!important;height:100vh!important;overflow:hidden!important;position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:0!important;';
      document.body.style.cssText = 'margin:0!important;padding:0!important;width:100vw!important;height:100vh!important;overflow:hidden!important;background:#1a1a1a!important;position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:0!important;';
      const root = document.getElementById('root');
      if (root) {
        root.style.cssText = 'margin:0!important;padding:0!important;width:100vw!important;height:100vh!important;overflow:hidden!important;position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:0!important;display:block!important;';
      }
      console.log('[LayoutPreview] Viewport styles applied. Window size:', window.innerWidth, 'x', window.innerHeight);
    };
    
    // Apply immediately
    applyStyles();
    
    // Also apply after a frame to override any late CSS
    requestAnimationFrame(applyStyles);
    
    // And again after 100ms just to be sure
    const timer = setTimeout(applyStyles, 100);
    
    // Cleanup on unmount
    return () => {
      clearTimeout(timer);
      document.documentElement.style.cssText = '';
      document.body.style.cssText = '';
      const root = document.getElementById('root');
      if (root) root.style.cssText = '';
    };
  }, [embedded]);

  // Update from props when in embedded mode
  useEffect(() => {
    if (embedded && propTitle) setProjectTitle(propTitle);
    if (embedded && propAuthor) setProjectAuthor(propAuthor);
  }, [embedded, propTitle, propAuthor]);

  // Load settings and content on mount (or use props in embedded mode)
  useEffect(() => {
    loadData();
  }, [embedded, propChapters, propScenes]);

  const loadData = async () => {
    setLoading(true);
    try {
      console.log('[LayoutPreview] Loading data... embedded:', embedded);
      
      // Load layout settings (always from backend)
      const s = await invoke<LayoutSettings>('get_layout_settings');
      console.log('[LayoutPreview] Settings loaded:', s);
      setSettings({ ...DEFAULT_SETTINGS, ...s });

      console.log('[LayoutPreview] Mode check - embedded:', embedded, 
                  'propChapters:', propChapters?.length, 
                  'propScenes:', propScenes?.length);

      // In embedded mode, prefer props; if missing, fallback to backend fetch
      if (embedded) {
        console.log('[LayoutPreview] EMBEDDED MODE - using props with backend fallback');
        const chaptersWithContent: ChapterContent[] = [];
        const scenesArray = propScenes || [];

        // Fallback: if no scenes provided, load from backend for given chapters
        if (scenesArray.length === 0 && propChapters && propChapters.length > 0) {
          console.log('[LayoutPreview] No scenes provided via props, loading from backend...');
          for (const ch of propChapters) {
            const backendScenes = await invoke<any[]>('list_scenes', { chapterId: ch.id });
            scenesArray.push(...backendScenes.map(s => ({ ...s, chapter_id: ch.id })) as any);
          }
        }

        if (!propChapters || propChapters.length === 0) {
          console.warn('[LayoutPreview] No chapters provided in props!');
          setChapters([]);
          return;
        }

        for (const ch of propChapters) {
          const chapterScenes = scenesArray.filter(s => s.chapter_id === ch.id);
          console.log(`[LayoutPreview] Chapter ${ch.id} (${ch.title}) has ${chapterScenes.length} scenes`);
          const scenesWithContent: SceneContent[] = [];
          
          for (const sc of chapterScenes) {
            let content = (sc as any).content || '';
            if (!content) {
              try {
                console.log('[LayoutPreview] Loading content for scene:', sc.id);
                const [loadedContent] = await invoke<[string, number]>('get_scene_content', { sceneId: sc.id });
                content = loadedContent || '';
                console.log('[LayoutPreview] Loaded content length:', content.length);
              } catch (e) {
                console.warn('[LayoutPreview] Could not load scene content:', sc.id, e);
              }
            }
            scenesWithContent.push({
              id: sc.id,
              title: sc.title,
              content,
            });
          }
          
          chaptersWithContent.push({
            id: ch.id,
            title: ch.title,
            scenes: scenesWithContent,
          });
        }

        console.log('[LayoutPreview] Converted chapters:', chaptersWithContent.length, 
                    'total scenes:', chaptersWithContent.reduce((sum, ch) => sum + ch.scenes.length, 0));
        setChapters(chaptersWithContent);
      } else {
        // Standalone mode: load everything from backend
        const project = await invoke<{ title: string; author: string }>('get_project');
        console.log('[LayoutPreview] Project loaded:', project);
        setProjectTitle(project.title || 'Mein Buch');
        setProjectAuthor(project.author || '');

        const chapterList = await invoke<any[]>('list_chapters');
        console.log('[LayoutPreview] Chapters loaded:', chapterList);
        const chaptersWithContent: ChapterContent[] = [];
        
        for (const ch of chapterList) {
          const scenes = await invoke<any[]>('list_scenes', { chapterId: ch.id });
          console.log(`[LayoutPreview] Scenes for chapter ${ch.id}:`, scenes);
          const scenesWithContent: SceneContent[] = [];
          
          for (const sc of scenes) {
            const [content] = await invoke<[string, number]>('get_scene_content', { sceneId: sc.id });
            scenesWithContent.push({
              id: sc.id,
              title: sc.title,
              content: content || '',
            });
          }
          
          chaptersWithContent.push({
            id: ch.id,
            title: ch.title,
            scenes: scenesWithContent,
          });
        }
        
        console.log('[LayoutPreview] All chapters with content:', chaptersWithContent);
        setChapters(chaptersWithContent);
      }
    } catch (e) {
      console.error('[LayoutPreview] Failed to load data:', e);
    } finally {
      setLoading(false);
    }
  };

  // Update a single setting
  const updateSetting = <K extends keyof LayoutSettings>(key: K, value: LayoutSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  // Save settings to backend
  const saveSettings = async () => {
    try {
      await invoke('save_layout_settings', { settings });
      console.log('[LayoutPreview] Settings saved');
    } catch (e) {
      console.error('[LayoutPreview] Failed to save settings:', e);
    }
  };

  // Auto-fit scale calculation
  useEffect(() => {
    if (!autoScale) return;
    
    const calculateAutoScale = () => {
      const container = contentRef.current;
      if (!container) {
        console.log('[AutoScale] No container ref yet, retrying...');
        return;
      }
      
      // Get available space (minus padding)
      const availableWidth = container.clientWidth - 48; // 24px padding on each side
      const availableHeight = container.clientHeight - 48;
      
      if (availableWidth <= 0 || availableHeight <= 0) {
        console.log('[AutoScale] Container has no size yet:', availableWidth, 'x', availableHeight);
        return;
      }
      
      // Calculate required space for spread (2 pages + gap) or single page
      const pageWidthMM = settings.pageWidth;
      const pageHeightMM = settings.pageHeight;
      const pageWidthPx = pageWidthMM * MM_TO_PX;
      const pageHeightPx = pageHeightMM * MM_TO_PX;
      
      const spreadGap = 20; // gap between pages
      const totalWidthNeeded = viewMode === 'spread' 
        ? (pageWidthPx * 2) + spreadGap 
        : pageWidthPx;
      const totalHeightNeeded = pageHeightPx;
      
      // Calculate scale to fit
      const scaleX = availableWidth / totalWidthNeeded;
      const scaleY = availableHeight / totalHeightNeeded;
      const newScale = Math.min(scaleX, scaleY, 1.5); // Max 150%
      
      console.log('[AutoScale] Available:', availableWidth, 'x', availableHeight, 
                  'Needed:', totalWidthNeeded, 'x', totalHeightNeeded,
                  'Scale:', newScale.toFixed(2));
      
      setScale(Math.max(0.3, newScale)); // Min 30%
    };
    
    // Calculate on mount with delay to ensure container is rendered
    const initialTimer = setTimeout(calculateAutoScale, 50);
    const secondTimer = setTimeout(calculateAutoScale, 200);
    
    // ResizeObserver for container size changes
    const resizeObserver = new ResizeObserver(() => {
      calculateAutoScale();
    });
    
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current);
    }
    
    // Also listen to window resize
    window.addEventListener('resize', calculateAutoScale);
    
    return () => {
      clearTimeout(initialTimer);
      clearTimeout(secondTimer);
      window.removeEventListener('resize', calculateAutoScale);
      resizeObserver.disconnect();
    };
  }, [autoScale, viewMode, settings.pageWidth, settings.pageHeight, showSettings, loading]);

  // Auto-save settings on change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (settings.id !== 'default') {
        saveSettings();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [settings]);

  // Calculate page dimensions in pixels (base size, not scaled)
  const pageDimensions = useMemo(() => {
    // Base dimensions without scaling - CSS transform will handle scaling
    const width = settings.pageWidth * MM_TO_PX;
    const height = settings.pageHeight * MM_TO_PX;
    const marginTop = settings.marginTop * MM_TO_PX;
    const marginBottom = settings.marginBottom * MM_TO_PX;
    const marginInner = settings.marginInner * MM_TO_PX;
    const marginOuter = settings.marginOuter * MM_TO_PX;
    const contentWidth = width - marginInner - marginOuter;
    const contentHeight = height - marginTop - marginBottom;
    
    return { width, height, marginTop, marginBottom, marginInner, marginOuter, contentWidth, contentHeight };
  }, [settings]); // Remove scale from dependencies

  // Font styles (base size, not scaled - CSS transform handles scaling)
  const fontStyles = useMemo(() => ({
    fontFamily: `"${settings.fontFamily}", Georgia, serif`,
    fontSize: `${settings.fontSize * PT_TO_PX}px`,
    lineHeight: settings.lineHeight,
    textAlign: (settings.textAlign || 'justify') as 'justify' | 'left' | 'right' | 'center',
    textIndent: `${settings.firstLineIndent * MM_TO_PX}px`,
    hyphens: (settings.hyphenation ? 'auto' : 'none') as 'auto' | 'none' | 'manual',
    WebkitHyphens: (settings.hyphenation ? 'auto' : 'none') as 'auto' | 'none' | 'manual',
    orphans: settings.preventOrphans ? 2 : 1,
    widows: settings.preventWidows ? 2 : 1,
    fontFeatureSettings: [
      settings.ligatures ? '"liga" 1' : '"liga" 0',
      settings.kerning ? '"kern" 1' : '"kern" 0',
    ].join(', '),
  }), [settings]); // Remove scale from dependencies

  // Render a single page
  const renderPage = (pageNum: number, isLeftPage: boolean) => {
    const { width, height, marginTop, marginBottom, marginInner, marginOuter } = pageDimensions;
    const leftMargin = isLeftPage ? marginInner : marginOuter;
    const rightMargin = isLeftPage ? marginOuter : marginInner;

    return (
      <div 
        className="preview-page"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          padding: `${marginTop}px ${rightMargin}px ${marginBottom}px ${leftMargin}px`,
        }}
      >
        {/* Page content placeholder - will be populated by paginated content */}
        <div 
          className="page-content"
          style={fontStyles}
          lang={settings.hyphenationLang || 'de'}
        >
          {/* Content will be rendered here based on pagination */}
        </div>

        {/* Page number */}
        {settings.showPageNumbers && (
          <div 
            className="page-number"
            style={{
              bottom: `${marginBottom * 0.4}px`,
              left: isLeftPage ? `${leftMargin}px` : 'auto',
              right: isLeftPage ? 'auto' : `${rightMargin}px`,
              fontFamily: fontStyles.fontFamily,
            }}
          >
            {pageNum}
          </div>
        )}
      </div>
    );
  };

  // Dynamic styles for drop caps (depends on settings)
  const dropCapStyle = useMemo(() => ({
    float: 'left' as const,
    fontSize: `${settings.fontSize * PT_TO_PX * (settings.dropCapLines || 3)}px`,
    lineHeight: 0.8,
    marginRight: `${3 * MM_TO_PX}px`,
    marginTop: `${2 * MM_TO_PX}px`,
    fontWeight: 'normal' as const,
  }), [settings.fontSize, settings.dropCapLines]);

  // Dynamic styles for chapter titles (depends on settings)
  const chapterTitleStyle = useMemo(() => ({
    fontFamily: settings.chapterTitleFont || fontStyles.fontFamily,
    fontSize: `${(settings.chapterTitleSize || 18) * PT_TO_PX}px`,
    textAlign: 'center' as const,
    marginBottom: `${20 * MM_TO_PX}px`,
    fontWeight: 'normal' as const,
  }), [settings.chapterTitleFont, settings.chapterTitleSize, fontStyles.fontFamily]);

  // Render sample content for preview
  const renderSampleContent = () => {
    if (chapters.length === 0) {
      // Show sample text if no content
      return (
        <div className="sample-content" style={fontStyles} lang={settings.hyphenationLang || 'de'}>
          <h2 style={chapterTitleStyle}>
            Kapitel 1
          </h2>
          <p>
            {settings.dropCapEnabled && (
              <span className="drop-cap" style={dropCapStyle}>D</span>
            )}
            {settings.dropCapEnabled ? 'ies' : 'Dies'} ist ein Beispieltext, der zeigt, wie Ihr Buch im fertigen Layout aussehen wird. 
            Die Einstellungen auf der linken Seite wirken sich direkt auf diese Vorschau aus.
          </p>
          <p>
            Ändern Sie Schriftart, Größe, Zeilenhöhe und Ränder, um das perfekte Layout für Ihr 
            Manuskript zu finden. Die Silbentrennung und der Blocksatz sorgen für ein professionelles 
            Erscheinungsbild.
          </p>
          <div className="scene-break">
            {SCENE_BREAKS[settings.sceneBreakStyle] || settings.sceneBreakCustom || '* * *'}
          </div>
          <p>
            Nach einem Szenenwechsel geht die Geschichte weiter. Hier sehen Sie, wie der 
            Szenentrenner dargestellt wird, den Sie in den Einstellungen ausgewählt haben.
          </p>
        </div>
      );
    }

    // Render actual content
    return chapters.map((chapter, chIdx) => (
      <div key={chapter.id} className="chapter-block" style={chIdx > 0 ? { pageBreakBefore: 'always' } : undefined}>
        <h2 style={{
          ...chapterTitleStyle,
          marginTop: chIdx > 0 ? `${40 * MM_TO_PX}px` : 0,
        }}>
          {chapter.title}
        </h2>
        {chapter.scenes.map((scene, scIdx) => (
          <div key={scene.id} className="scene">
            {scIdx > 0 && (
              <div className="scene-break">
                {SCENE_BREAKS[settings.sceneBreakStyle] || settings.sceneBreakCustom || '* * *'}
              </div>
            )}
            {scene.content.split('\n\n').map((para, pIdx) => (
              <p 
                key={pIdx}
                style={{
                  textIndent: pIdx === 0 && scIdx === 0 ? 0 : fontStyles.textIndent,
                  marginBottom: `${settings.paragraphSpacing * MM_TO_PX}px`,
                }}
              >
                {pIdx === 0 && scIdx === 0 && settings.dropCapEnabled && para.length > 0 && (
                  <span className="drop-cap" style={dropCapStyle}>{para[0]}</span>
                )}
                {pIdx === 0 && scIdx === 0 && settings.dropCapEnabled ? para.slice(1) : para}
              </p>
            ))}
          </div>
        ))}
      </div>
    ));
  };

  // DEBUG: Log viewport dimensions
  useEffect(() => {
    const logDimensions = () => {
      console.log('[DEBUG] Window inner:', window.innerWidth, 'x', window.innerHeight);
      console.log('[DEBUG] Document client:', document.documentElement.clientWidth, 'x', document.documentElement.clientHeight);
      console.log('[DEBUG] Body client:', document.body.clientWidth, 'x', document.body.clientHeight);
      const root = document.getElementById('root');
      console.log('[DEBUG] #root client:', root?.clientWidth, 'x', root?.clientHeight);
    };
    logDimensions();
    window.addEventListener('resize', logDimensions);
    return () => window.removeEventListener('resize', logDimensions);
  }, []);
  
  return (
    <div 
      className={`layout-preview ${embedded ? 'embedded' : ''}`}
      style={embedded ? {
        // Embedded mode: relative positioning, fill container
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#1a1a1a',
        color: '#f0f0f0',
        overflow: 'hidden',
      } : {
        // Standalone mode: fixed fullscreen
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#1a1a1a',
        color: '#f0f0f0',
        overflow: 'hidden',
        zIndex: 99999,
      }}
    >
      <header 
        className={`preview-header ${embedded ? 'embedded' : ''}`}
        style={{
          flex: '0 0 50px',
          height: '50px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 20px',
          background: embedded ? 'var(--bg-secondary, #222)' : '#222',
          borderBottom: '1px solid var(--border-color, #333)',
          boxSizing: 'border-box',
        }}
      >
        <div className="preview-header-left">
          {/* Back button only shown when internal (not using sidebar) */}
          {embedded && onBack && !hideSettingsProp && (
            <button 
              onClick={onBack} 
              className="back-button"
              title="Zurück zum Editor"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                background: 'var(--accent-color, #3b82f6)',
                border: 'none',
                borderRadius: '6px',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              ← Editor
            </button>
          )}
          <h1>
            📐 Layout-Vorschau <span>(Live)</span>
          </h1>
        </div>
        <div className="preview-controls">
          {/* Page Navigation */}
          <button 
            onClick={prevSpread} 
            disabled={currentSpread === 0}
            title="Vorherige Seite"
          >◀</button>
          <span className="page-nav">
            Seite{' '}
            <input
              type="number"
              className="page-input"
              value={currentLeftPage}
              onChange={(e) => goToPage(Number(e.target.value))}
              min={1}
              max={totalPages}
              style={{ width: '40px', textAlign: 'center' }}
              title="Seitenzahl eingeben"
            />
            {viewMode === 'spread' && currentRightPage <= totalPages && (
              <span>–{currentRightPage}</span>
            )}
            {' '}/ {totalPages}
          </span>
          <button 
            onClick={nextSpread} 
            disabled={currentSpread >= totalSpreads - 1}
            title="Nächste Seite"
          >▶</button>
          <span className="divider" />
          {/* Zoom controls */}
          <button 
            onClick={() => { setAutoScale(false); setScale(s => Math.max(0.3, s - 0.1)); }} 
            title="Verkleinern"
          >−</button>
          <span 
            onClick={() => setAutoScale(true)} 
            style={{ cursor: 'pointer' }}
            title={autoScale ? 'Auto-Fit aktiv' : 'Klicken für Auto-Fit'}
          >
            {autoScale ? '🔄' : ''}{Math.round(scale * 100)}%
          </span>
          <button 
            onClick={() => { setAutoScale(false); setScale(s => Math.min(2, s + 0.1)); }} 
            title="Vergrößern"
          >+</button>
          <span className="divider" />
          <button 
            onClick={() => setViewMode(viewMode === 'spread' ? 'single' : 'spread')}
            title={viewMode === 'spread' ? 'Einzelseite' : 'Doppelseite'}
          >
            {viewMode === 'spread' ? '📖' : '📄'}
          </button>
          {/* Export button */}
          {onExport && (
            <>
              <span className="divider" />
              <button 
                onClick={onExport}
                className="export-btn"
                title="Exportieren (PDF, EPUB, DOCX, MOBI)"
                style={{
                  background: 'var(--accent-color, #3b82f6)',
                  color: 'white',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                }}
              >
                📤 Exportieren
              </button>
            </>
          )}
          {/* Only show settings toggle when settings panel is internal (not in sidebar) */}
          {!hideSettingsProp && (
            <>
              <span className="divider" />
              <button 
                onClick={() => setShowSettings(!showSettings)} 
                className={showSettings ? 'active' : ''}
                title="Einstellungen"
              >⚙️</button>
            </>
          )}
          {!embedded && (
            <>
              <span className="divider" />
              <button 
                onClick={() => invoke('open_pdf_preview_window')} 
                title="PDF-Vorschau (exakt)"
                style={{ fontSize: '12px' }}
              >
                📄 PDF
              </button>
            </>
          )}
        </div>
      </header>

      <div 
        className="preview-body"
        style={{
          flex: '1 1 auto',
          display: 'flex',
          overflow: 'hidden',
          position: 'relative',
          minHeight: 0,
          height: embedded ? '100%' : 'calc(100vh - 50px)',
        }}
      >
        {/* Settings Panel */}
        {showSettings && (
          <aside 
            className="preview-settings"
            style={{
              width: '280px',
              flex: '0 0 280px',
              background: '#222',
              borderRight: '1px solid #333',
              padding: '16px',
              overflowY: 'auto',
              boxSizing: 'border-box',
              height: '100%',
            }}
          >
            <h3>Einstellungen</h3>
            
            {/* Paper Size */}
            <div className="settings-section">
              <label>Papierformat</label>
              <select 
                value={`${settings.pageWidth}x${settings.pageHeight}`}
                onChange={(e) => {
                  const [w, h] = e.target.value.split('x').map(Number);
                  updateSetting('pageWidth', w);
                  updateSetting('pageHeight', h);
                }}
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
              <label>Ränder (mm)</label>
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
              <label>Typografie</label>
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
            </div>

            {/* Options */}
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
              <div className="checkbox-row">
                <input type="checkbox" id="ligatures" checked={settings.ligatures ?? true} onChange={(e) => updateSetting('ligatures', e.target.checked)} />
                <label htmlFor="ligatures">Ligaturen</label>
              </div>
            </div>

            {/* Scene Breaks */}
            <div className="settings-section">
              <label>Szenentrenner</label>
              <select value={settings.sceneBreakStyle} onChange={(e) => updateSetting('sceneBreakStyle', e.target.value)} title="Szenentrenner-Stil">
                <option value="asterism">⁂ Asterismus</option>
                <option value="asterisks">* * * Sternchen</option>
                <option value="line">───── Linie</option>
                <option value="ornament">❧ Ornament</option>
                <option value="fleuron">❦ Fleuron</option>
                <option value="blank">(Leerzeile)</option>
              </select>
            </div>

            {/* Info */}
            <div className="settings-info">
              <small>
                ℹ️ Diese Vorschau zeigt eine CSS-Simulation. 
                Für die exakte Druckvorschau nutzen Sie den PDF-Button.
              </small>
            </div>
          </aside>
        )}

        {/* Preview Content */}
        <div 
          className="preview-content" 
          ref={contentRef}
          style={{
            flex: '1 1 auto',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            overflow: 'auto',
            background: '#2a2a2a',
            padding: '24px',
            boxSizing: 'border-box',
            minHeight: 0,
            height: '100%',
          }}
        >
          {loading ? (
            <div className="preview-loading">Lade Vorschau…</div>
          ) : (
            /* Wrapper maintains the scaled size for layout flow */
            <div 
              className="preview-spread-wrapper"
              style={{
                // keep unscaled logical size so surrounding UI stays fixed
                width: `${viewMode === 'spread' ? (pageDimensions.width * 2 + 4) : pageDimensions.width}px`,
                height: `${pageDimensions.height}px`,
                flexShrink: 0,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start',
                overflow: 'visible',
              }}
            >
              {/* Book spread - scaled via CSS transform */}
              <div 
                className={`preview-spread ${viewMode}`}
                style={{
                  display: 'flex',
                  gap: '4px',
                  transform: `scale(${scale})`,
                  transformOrigin: 'top center',
                }}
              >
              {/* Left page (even) */}
              <div 
                className="preview-page-wrapper"
                style={{
                  width: `${pageDimensions.width}px`,
                  height: `${pageDimensions.height}px`,
                }}
              >
              <div 
                className="preview-page"
                style={{
                  width: '100%',
                  height: '100%',
                  padding: `${pageDimensions.marginTop}px ${pageDimensions.marginOuter}px ${pageDimensions.marginBottom}px ${pageDimensions.marginInner}px`,
                  background: 'white',
                    color: '#1a1a1a',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                    borderRadius: '2px 0 0 2px',
                    position: 'relative',
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                  }}
                >
                  <div 
                    style={{
                      ...fontStyles,
                      height: '100%',
                      overflow: 'hidden',
                    }}
                    lang="de"
                  >
                    {/* Running header */}
                    <div style={{
                      position: 'absolute',
                      top: `${pageDimensions.marginTop * 0.3}px`,
                      left: `${pageDimensions.marginInner}px`,
                      fontSize: `${8 * PT_TO_PX }px`,
                      color: '#888',
                      fontStyle: 'italic',
                    }}>
                      {projectAuthor || ''}
                    </div>
                  </div>
                  {settings.showPageNumbers && (
                    <div style={{
                      position: 'absolute',
                      bottom: `${pageDimensions.marginBottom * 0.4}px`,
                      left: `${pageDimensions.marginInner}px`,
                      fontSize: `${9 * PT_TO_PX }px`,
                      color: '#666',
                    }}>
                      2
                    </div>
                  )}
                </div>
              </div>

              {/* Right page (odd) - GALLEY MODE / CONTINUOUS */}
              <div 
                className="preview-page-wrapper"
                style={{
                  width: `${pageDimensions.width}px`,
                  minHeight: `${pageDimensions.height}px`,
                  height: 'auto'
                }}
              >
                <div 
                  className="preview-page"
                  style={{
                    width: '100%',
                    minHeight: `${pageDimensions.height}px`,
                    height: 'auto',
                    padding: `${pageDimensions.marginTop}px ${pageDimensions.marginInner}px ${pageDimensions.marginBottom}px ${pageDimensions.marginOuter}px`,
                    background: 'white',
                    color: '#1a1a1a',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                    borderRadius: '0 2px 2px 0',
                    position: 'relative',
                    boxSizing: 'border-box',
                  }}
                >
                  <div 
                    style={{
                      ...fontStyles,
                      height: 'auto',
                      overflow: 'visible',
                    }}
                    lang={settings.hyphenationLang || 'de'}
                  >
                    {/* Running header */}
                    <div style={{
                      position: 'absolute',
                      top: `${pageDimensions.marginTop * 0.3}px`,
                      right: `${pageDimensions.marginOuter}px`,
                      fontSize: `${8 * PT_TO_PX }px`,
                      color: '#888',
                      fontStyle: 'italic',
                    }}>
                      {projectTitle}
                    </div>
                    
                    {/* Content Rendering (Real Manuscript) - Galley Mode (Flows naturally) */}
                    <div className="manuscript-content-flow">
                        {loading ? (
                            <div className="empty-state">
                                <p>Lade Kapitel...</p>
                            </div>
                        ) : chapters.length === 0 ? (
                            <div className="empty-state">
                                <p>Keine Kapitel gefunden.</p>
                                <p style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                                    Debug: embedded={String(embedded)}, propChapters={propChapters?.length ?? 'undefined'}, propScenes={propScenes?.length ?? 'undefined'}
                                </p>
                            </div>
                        ) : (
                            chapters.map(chapter => (
                                <div key={chapter.id} className="chapter-block">
                                    <h1 style={{
                                        fontSize: `${(settings.chapterTitleSize || 24) * PT_TO_PX }px`,
                                        fontFamily: settings.chapterTitleFont ? `"${settings.chapterTitleFont}", serif` : 'inherit',
                                        marginTop: '2em',
                                        marginBottom: '1.5em',
                                        textAlign: 'center'
                                    }}>
                                        {chapter.title}
                                    </h1>
                                    {chapter.scenes.map((scene, sIdx) => (
                                        <div key={scene.id} className="scene-block">
                                            {sIdx > 0 && (
                                                <div className="scene-break" style={{ textAlign: 'center', margin: '1.5em 0' }}>
                                                    {settings.sceneBreakStyle === 'asterism' ? '⁂' :
                                                     settings.sceneBreakStyle === 'line' ? '─────' : 
                                                     '* * *'}
                                                </div>
                                            )}
                                            {scene.content.split('\n\n').map((para, pIdx) => (
                                                <p key={pIdx} style={{
                                                    marginBottom: settings.paragraphSpacing ? `${settings.paragraphSpacing}em` : '0',
                                                    textIndent: (pIdx === 0 && sIdx === 0 && settings.dropCapEnabled) ? '0' : 
                                                                (pIdx === 0 && sIdx > 0 && settings.sceneBreakStyle !== 'blank') ? '0' :
                                                                `${settings.firstLineIndent * MM_TO_PX }px`
                                                }}>
                                                    {pIdx === 0 && sIdx === 0 && settings.dropCapEnabled ? (
                                                        <span className="drop-cap" style={{
                                                            float: 'left',
                                                            fontSize: `${(settings.dropCapLines || 3) * 3}em`,
                                                            lineHeight: '0.8',
                                                            paddingRight: '0.1em',
                                                            marginTop: '0.1em',
                                                            fontWeight: 'bold'
                                                        }}>
                                                            {para.charAt(0)}
                                                        </span>
                                                    ) : null}
                                                    {pIdx === 0 && sIdx === 0 && settings.dropCapEnabled ? para.slice(1) : para}
                                                </p>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            ))
                        )}
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LayoutPreview;
