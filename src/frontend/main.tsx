import { confirm } from '@tauri-apps/api/dialog';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
// Early runtime diagnostic
console.log('[FW] main.tsx loaded');

// i18n initialisieren BEVOR React rendert
import './i18n';

// Globale Fehlerbehandlung für mehr Stabilität
window.onerror = (msg, source, line, col, error) => {
  console.error('[FW] Globaler Fehler:', msg, 'in', source, 'Zeile:', line);
  // Nicht abstürzen, nur loggen
  return true; // Verhindert default error handling
};

window.onunhandledrejection = (event) => {
  console.error('[FW] Unhandled Promise Rejection:', event.reason);
  // Nicht abstürzen bei Promise-Fehlern
  event.preventDefault();
};

import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/api/dialog';
import { appWindow } from '@tauri-apps/api/window';
import { Toaster, toast } from 'sonner';
import './styles/design-system.css';
import './styles/welcome.css';
import { CodeMirrorEditor } from './components/CodeMirrorEditor';
import { resolveFeatures } from './featureFlags';
import { FormatToolbar } from './components/FormatToolbar';
import { AiChatPanel } from './components/AiChatPanel';
import { FontainePanel } from './components/FontainePanel';
import { LektoratEditorSidebar } from './components/LektoratEditorSidebar';
import { preloadAllThesauri } from './thesaurusService';
import { initTheme } from './themeService';
import { EntityTooltip, EntityTooltipInfo } from './components/EntityTooltip';
import { BugReportModal } from './components/BugReportModal';

// Theme beim Start initialisieren (vor React-Render für flicker-freies Laden)
initTheme();

// Beide Thesauri (DE + EN) im Hintergrund vorladen
preloadAllThesauri().then(() => {
  console.log('[FW] Thesauri geladen');
});
import { EntitiesPanel } from './components/EntitiesPanel';
import { PlotTimeline } from './components/PlotTimeline';
import { ResearchPanel } from './components/ResearchPanel';
import { AnalysisPanel } from './components/AnalysisPanel';
import { NotesPanel } from './components/NotesPanel';
import { OperatorPanel } from './components/OperatorPanel';
import { ThesaurusPanel } from './components/ThesaurusPanel';
import { Sidebar } from './components/Sidebar';
import { EditorPane } from './components/EditorPane';
import { StatusBar, WordCountStats } from './components/StatusBar';
import { EditorSettingsPanel } from './components/EditorSettingsPanel';
import { ProofreadingSettingsPanel } from './components/ProofreadingSettingsPanel';
import { useWordCount } from './hooks/useWordCount';
import { ShortcutsHelp } from './components/ShortcutsHelp';
import { AiSettingsModal } from './components/AiSettingsModal';
import { UpdateBanner, useUpdateCheck } from './components/UpdateBanner';
import { LanguageToolSettings, type LanguageToolSettings as LTSettings } from './components/LanguageToolSettings';
import { ToolRail, type ToolId } from './components/ToolRail';
import HumanReviewPanel from './components/HumanReviewPanel';
import { ProjectLibrary } from './components/ProjectLibrary';
import { ToolDrawer } from './components/ToolDrawer';
import { LayoutEditor } from './components/LayoutEditor';
import { PreviewWindow } from './components/PreviewWindow';
import { LayoutPreview } from './components/LayoutPreview';
import { PreviewSettingsSidebar } from './components/PreviewSettingsSidebar';
import { ExportFormatDialog } from './components/ExportFormatDialog';

// Small helper to render a progress bar without inline styles (width is applied via ref)
const ProgressBar: React.FC<{ pct: number; title?: string }> = ({ pct, title }) => {
    const ref = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (ref.current) ref.current.style.width = `${pct}%`;
    }, [pct]);
    return (
        <div className="progress-bar">
            <div className="progress-fill" ref={ref} title={title} />
        </div>
    );
};

// --- Types ---
interface Project {
    id: string;
    title: string;
    author: string;
    short_name?: string | null;
    genre?: string | null;
    target_pages?: number | null;
    chapters: Chapter[];
}

interface RecentProjectEntry {
    path: string;
    title: string;
    last_opened: string;
}

interface Chapter {
    id: string;
    title: string;
    order: number;
}

interface Scene {
    id: string;
    chapter_id: string;
    title: string;
    order: number;
    word_count: number;
    status?: 'draft' | 'revised' | 'edited' | 'final';
    color?: 'none' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';
    pov?: string;
}

export interface EditorSettings {
    font_family: string;
    font_size: number;
    line_height: number;
    paragraph_spacing?: number;
    page_padding?: number;
    editor_language?: 'de' | 'en';  // Separate from UI language
}

type AppView = 'welcome' | 'editor' | 'library';
type ScenesByChapter = Record<string, Scene[]>;

// --- User Profile Types ---
interface UserProfile {
    name: string | null;
    onboarding_completed: boolean;
}

// --- Onboarding Modal ---
const OnboardingModal = ({ onComplete }: { onComplete: (name: string) => void }) => {
    const { t } = useTranslation();
    const [name, setName] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onComplete(name.trim() || '');
    };

    const handleSkip = () => {
        onComplete('');
    };

    return (
        <div className="modal-overlay" onClick={handleSkip}>
            <div className="modal onboarding-modal" onClick={e => e.stopPropagation()}>
                <div className="onboarding-content">
                    <div className="onboarding-icon">✍️</div>
                    <h2>{t('onboarding.title')}</h2>
                    <p className="onboarding-subtitle">{t('onboarding.subtitle')}</p>
                    <form onSubmit={handleSubmit}>
                        <label htmlFor="userName">{t('onboarding.nameLabel')}</label>
                        <input
                            id="userName"
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder={t('onboarding.namePlaceholder')}
                            autoFocus
                        />
                        <div className="onboarding-actions">
                            <button type="button" className="btn-secondary" onClick={handleSkip}>
                                {t('onboarding.skip')}
                            </button>
                            <button type="submit" className="btn-primary">
                                {t('onboarding.start')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

// --- Components ---

const WelcomeView = ({ onOpenProject, onNewProject, onOpenRecent, onShowLibrary }: { 
    onOpenProject: () => void; 
    onNewProject: () => void; 
    onOpenRecent: (path: string) => void;
    onShowLibrary: () => void;
}) => {
    const { t } = useTranslation();
    const [recents, setRecents] = useState<RecentProjectEntry[]>([]);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [showOnboarding, setShowOnboarding] = useState(false);

    useEffect(() => {
        invoke<RecentProjectEntry[]>("list_recent_projects")
            .then(list => setRecents(list.slice(0, 5))) // Only show 5 most recent
            .catch(e => console.error("Failed to load recent projects", e));
        
        // Load user profile
        invoke<UserProfile>("get_user_profile")
            .then(profile => {
                setUserProfile(profile);
                // Show onboarding if not completed
                if (!profile.onboarding_completed) {
                    setShowOnboarding(true);
                }
            })
            .catch(e => console.error("Failed to load user profile", e));
    }, []);

    const handleOnboardingComplete = async (name: string) => {
        const newProfile: UserProfile = {
            name: name || null,
            onboarding_completed: true
        };
        try {
            await invoke("save_user_profile", { profile: newProfile });
            setUserProfile(newProfile);
        } catch (e) {
            console.error("Failed to save user profile", e);
        }
        setShowOnboarding(false);
    };

    // Determine greeting
    const greeting = userProfile?.name 
        ? t('welcome.greeting', { name: userProfile.name })
        : t('welcome.greetingFirst');

    return (
        <>
            {showOnboarding && <OnboardingModal onComplete={handleOnboardingComplete} />}
            <div className="welcome-container">
                <div className="welcome-main">
                    <div className="welcome-hero">
                        <img src="/icon.png" alt="Featherworks Logo" className="welcome-logo" />
                        <h1 className="welcome-greeting">{greeting}</h1>
                        <p>{t('welcome.tagline')}</p>
                    </div>
                    <div className="welcome-actions">
                        <button className="action-button primary" onClick={onNewProject}>
                            <span className="icon">+</span> {t('welcome.newProject')}
                        </button>
                        <button className="action-button" onClick={onOpenProject}>
                            <span className="icon">📂</span> {t('welcome.openProject')}
                        </button>
                        <button className="action-button library-btn" onClick={onShowLibrary}>
                            <span className="icon">📚</span> {t('welcome.allProjects')}
                        </button>
                    </div>
                </div>
                <div className="welcome-sidebar">
                    <div className="welcome-sidebar-header">
                        <h2>{t('welcome.recentProjects')}</h2>
                        {recents.length > 0 && (
                            <button className="view-all-btn" onClick={onShowLibrary}>
                                {t('welcome.viewAll')} →
                            </button>
                        )}
                    </div>
                    <div className="recent-projects-list">
                        {recents.length > 0 ? (
                            recents.map(p => (
                                <div key={p.path} className="recent-item" onClick={() => onOpenRecent(p.path)}>
                                    <span className="recent-title">{p.title}</span>
                                    <span className="recent-path">{p.path}</span>
                                </div>
                            ))
                        ) : (
                            <p className="no-recents">{t('welcome.noRecent')}</p>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

const NewProjectModal = ({ onClose, onProjectCreate }: { onClose: () => void; onProjectCreate: (project: Project) => void; }) => {
    const { t } = useTranslation();
    const [title, setTitle] = useState('');
    const [author, setAuthor] = useState('');
    const [shortName, setShortName] = useState('');
    const [genre, setGenre] = useState('');
    const [targetPages, setTargetPages] = useState<string>('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title || !author) {
            toast.error(t('newProject.titleRequired'));
            return;
        }

        try {
            console.log('[Frontend] Requesting save dialog for new project');
            const path = await save({
                defaultPath: `${title}.fwauthor`,
                filters: [{ name: 'Featherworks Project', extensions: ['fwauthor'] }]
            });

            if (path) {
                console.log('[Frontend] Creating project at path:', path);
                const newProject: Project = await invoke("create_project", {
                    path,
                    req: {
                        title,
                        author,
                        short_name: shortName || null,
                        genre: genre || null,
                        target_pages: targetPages ? Number(targetPages) : null,
                    }
                });
                console.log('[Frontend] Project created successfully:', newProject);
                toast.success(t('newProject.created', { title: newProject.title }));
                onProjectCreate(newProject);
            } else {
                console.log('[Frontend] User cancelled save dialog');
            }
        } catch (err) {
            console.error('[Frontend] Error creating project:', err);
            toast.error(t('newProject.createFailed'));
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h2>{t('welcome.newProject')}</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="title">{t('newProject.title')}</label>
                        <input id="title" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
                    </div>
                    <div className="form-group">
                        <label htmlFor="author">{t('newProject.author')}</label>
                        <input id="author" value={author} onChange={e => setAuthor(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="shortname">{t('newProject.shortName')} (optional)</label>
                        <input id="shortname" value={shortName} onChange={e => setShortName(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="genre">{t('newProject.genre')} (optional)</label>
                        <input id="genre" value={genre} onChange={e => setGenre(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="targetPages">{t('newProject.targetPages')} (optional)</label>
                        <input id="targetPages" type="number" min={1} value={targetPages} onChange={e => setTargetPages(e.target.value)} />
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="secondary" onClick={onClose}>{t('cancel')}</button>
                        <button type="submit" className="primary">{t('newProject.create')}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// EditorPane component moved to ./components/EditorPane.tsx

// --- Main App Component ---
function App() {
    // ALL HOOKS MUST BE DECLARED FIRST (React Rules of Hooks)
    const { t } = useTranslation();
    const [view, setView] = useState<AppView>('welcome');
    const [project, setProject] = useState<Project | null>(null);
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [scenes, setScenes] = useState<ScenesByChapter>({});
    const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
    const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
    const [editorContent, setEditorContent] = useState('');
    const [editorWordCount, setEditorWordCount] = useState(0);
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [editorSettings, setEditorSettings] = useState<EditorSettings | null>(null);
    const [showNewProjectModal, setShowNewProjectModal] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showBugReportModal, setShowBugReportModal] = useState(false);
    const [bugReportCategory, setBugReportCategory] = useState<'bug' | 'feedback'>('bug');
    const [exportPassword, setExportPassword] = useState('');
    const [exportPath, setExportPath] = useState('');
    const [importPassword, setImportPassword] = useState('');
    const [importPath, setImportPath] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchRegex, setSearchRegex] = useState(false);
    const [searchReplace, setSearchReplace] = useState('');
    const [searchScope, setSearchScope] = useState<'scene' | 'project'>('scene');
    const [projectSearchResults, setProjectSearchResults] = useState<Array<{sceneId: string; sceneTitle: string; chapterTitle: string; matches: number}>>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isTempImported, setIsTempImported] = useState(false);
    const [debugErrors, setDebugErrors] = useState<string[]>([]);
    const [showLeft, setShowLeft] = useState(true);
    const [leftPinned, setLeftPinned] = useState(true); // Pinned = always visible, unpinned = auto-hide
    const [leftHovered, setLeftHovered] = useState(false); // For auto-hide hover trigger
    const [showRight, setShowRight] = useState(true);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [leftTab, setLeftTab] = useState<'structure'|'ai'|'entities'|'analysis'|'notes'>('structure');
    // New Tool Rail state for right sidebar
    const [activeTool, setActiveTool] = useState<ToolId | null>('info');
    const [pinnedTool, setPinnedTool] = useState<ToolId | null>(null);
    const [selectedWord, setSelectedWord] = useState<string>('');
    
    // Main content view mode: editor (write) or preview (view layout)
    const [mainViewMode, setMainViewMode] = useState<'editor' | 'preview-css' | 'preview-pdf'>('editor');
    const [showPreviewDropdown, setShowPreviewDropdown] = useState(false);
    const [previewDropdownPos, setPreviewDropdownPos] = useState<{top: number; left: number} | null>(null);
    const previewBtnRef = useRef<HTMLButtonElement>(null);
    const previewDropdownRef = useRef<HTMLDivElement>(null);
    const [showExportFormatDialog, setShowExportFormatDialog] = useState(false);

    // Click outside handler for preview dropdown
    useEffect(() => {
        if (!showPreviewDropdown) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (
                previewDropdownRef.current && !previewDropdownRef.current.contains(e.target as Node) &&
                previewBtnRef.current && !previewBtnRef.current.contains(e.target as Node)
            ) {
                setShowPreviewDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showPreviewDropdown]);

    // Provide a sensible default export path when the modal opens
    useEffect(() => {
        if (showExportModal && !exportPath) {
            setExportPath(`${project?.title || 'project'}.fwauthor`);
        }
    }, [showExportModal, exportPath, project?.title]);
    const [selectedModel, setSelectedModel] = useState<string|null>(null);
    const [lastAiText, setLastAiText] = useState<string|null>(null);
    const [focusMode, setFocusMode] = useState(false);
    
    // Lektorat Sidebar State
    const [showLektoratSidebar, setShowLektoratSidebar] = useState(true);
    const [realtimeLektorat, setRealtimeLektorat] = useState(false);
    const [editorScrollTop, setEditorScrollTop] = useState(0);
    const [lektoratHighlight, setLektoratHighlight] = useState<{ from: number; to: number; id?: string } | null>(null);
    const [humanComments, setHumanComments] = useState<Array<{ id:string; from:number; to:number; text:string; note:string; suggestion?:string; status:'open'|'accepted'|'rejected' }>>([]);
    const commentApiRef = useRef<{ getSelection: ()=> { from:number; to:number; text:string } | null } | null>(null);

    const updateHumanComment = useCallback((id: string, patch: Partial<{ note:string; suggestion?:string; status:'open'|'accepted'|'rejected' }>) => {
        setHumanComments(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    }, []);

    // Auto-hide timeout ref for left sidebar
    const leftHoverTimeoutRef = useRef<number | null>(null);
    
    // LanguageTool Settings (persisted in localStorage)
    const [ltSettings, setLtSettings] = useState<LTSettings>(() => {
        const saved = localStorage.getItem('fw_languagetool_settings');
        if (saved) {
            try { return JSON.parse(saved); } catch { /* ignore */ }
        }
        return { enabled: false, apiKey: '', username: '', language: 'de-DE' };
    });

    // Word count via WebWorker hook
    const wordStats = useWordCount(editorContent, 250);

    // Auto-Update Check
    const { updateInfo, checkForUpdate, dismiss: dismissUpdate } = useUpdateCheck();
    const lineColToOffset = useCallback((text: string, line: number, col: number = 0) => {
        const lines = text.split('\n');
        const safeLine = Math.min(Math.max(line, 1), lines.length || 1);
        const before = lines.slice(0, safeLine - 1).join('\n');
        const base = before.length + (safeLine > 1 ? 1 : 0);
        return Math.min(base + col, text.length);
    }, []);

    // Öffnet das Lektorat-Sidepanel, wenn die KI-Funde meldet
    useEffect(() => {
        const handler = (evt: Event) => {
            const detail = (evt as CustomEvent<{ line?: number }>).detail;
            setShowLektoratSidebar(true);
            if (detail?.line && editorContent) {
                const lineIndex = Math.max(0, Math.min(detail.line - 1, editorContent.split('\n').length - 1));
                const start = lineColToOffset(editorContent, lineIndex + 1, 0);
                const end = start + (editorContent.split('\n')[lineIndex]?.length ?? 0);
                setLektoratHighlight({ from: start, to: end, id: undefined });
            }
        };
        window.addEventListener('fw-open-lektorat-sidebar', handler as EventListener);
        return () => window.removeEventListener('fw-open-lektorat-sidebar', handler as EventListener);
    }, [editorContent, lineColToOffset]);

    // Check for updates on app start (with delay to not block startup)
    useEffect(() => {
        const timer = setTimeout(() => {
            checkForUpdate();
        }, 3000); // 3 Sekunden nach Start
        return () => clearTimeout(timer);
    }, []);

    // Sprache-Change aus nativen Menü
    useEffect(() => {
        const unlisten = listen<string>('request-language-change', async (event) => {
            const lang = event.payload;
            const confirmed = await confirm(
                lang === 'de'
                    ? 'Die Benutzeroberfläche (Menüs, Buttons, Dialoge) wird auf Deutsch umgestellt.\n\nDie App muss dafür neu gestartet werden. Fortfahren?'
                    : 'The user interface (menus, buttons, dialogs) will be changed to English.\n\nThe app needs to restart for this change. Continue?',
                {
                    title: lang === 'de' ? 'UI-Sprache ändern' : 'Change UI Language',
                    okLabel: lang === 'de' ? 'Neu starten' : 'Restart',
                    cancelLabel: t('cancel')
                }
            );
            if (confirmed) {
                await invoke('set_app_language', { lang });
                await invoke('restart_app');
            }
        });
        return () => { unlisten.then(fn => fn()); };
    }, [t]);

    // Persist LanguageTool settings
    useEffect(() => {
        localStorage.setItem('fw_languagetool_settings', JSON.stringify(ltSettings));
    }, [ltSettings]);

    const pushDebug = useCallback((msg: string) => {
        const line = `${new Date().toISOString()} ${msg}`;
        console.warn('[DEBUG]', line);
        setDebugErrors(prev => [...prev.slice(-199), line]);
    }, []);

    // Instrumentation: log view + project changes
    useEffect(() => { pushDebug(`view -> ${view}`); }, [view, pushDebug]);
    useEffect(() => { if (project) { pushDebug(`project loaded id=${project.id} title="${project.title}"`); } }, [project, pushDebug]);

    const editorCommandRef = useRef<null | ((cmd: string) => void)>(null);
    const searchApiRef = useRef<null | ({ next: () => void; prev: () => void; replaceOne: (replacement: string) => void; replaceAll: (replacement: string) => void })>(null);
    const saveTimeoutRef = useRef<number | null>(null);

    const features = resolveFeatures('core', undefined);

    const saveNow = useCallback(async () => {
        if (!isDirty || !activeSceneId) {
            console.log('[Save] Skipped: isDirty=', isDirty, 'activeSceneId=', activeSceneId);
            return;
        }
        if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); }

        console.log('[Save] Starting save for scene:', activeSceneId);
        setIsSaving(true);
        
        try {
            if (features.patchPipeline) {
                console.log('[Save] Using patch pipeline');
                await invoke('apply_scene_patch', { req: { sceneId: activeSceneId, fullText: editorContent } });
            } else {
                console.log('[Save] Using simple content update');
                await invoke('update_scene_content', { req: { id: activeSceneId, content: editorContent } });
            }
            console.log('[Save] Success!');
            setIsDirty(false); 
            setLastSaved(new Date());
            
            // Trigger auto-summarization in background (fire-and-forget, no chat output)
            invoke('auto_summarize_scene', { req: { sceneId: activeSceneId } })
                .then((summary) => {
                    console.log('[AutoSummarize] Scene summarized:', summary);
                })
                .catch((e) => {
                    console.warn('[AutoSummarize] Failed (non-critical):', e);
                });
        } catch (e) {
            console.error('[Save] Failed:', e);
            toast.error(t('toast.saveFailed', { error: String(e) }));
        } finally {
            setIsSaving(false);
        }
    }, [isDirty, activeSceneId, editorContent, features.patchPipeline]);

    const loadSceneContent = useCallback(async (sceneId: string) => {
        if (isDirty) saveNow();
        setIsLoading(true);
        try {
            const [raw, wordCount]: [string, number] = await invoke("get_scene_content", { id: sceneId });
            // If raw looks like JSON doc (starts with '{' or '[') attempt parse later; for now keep plaintext
            setEditorContent(raw);
            setEditorWordCount(wordCount);
            setActiveSceneId(sceneId);
            setIsDirty(false);
        } catch (e) {
            toast.error(t('toast.sceneContentLoadFailed'));
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, [isDirty, saveNow]);

    const refetchAll = useCallback(async (projectId: string, targetChapterId?: string | null, targetSceneId?: string | null) => {
        setIsLoading(true);
        pushDebug(`refetchAll start project=${projectId} chapter=${targetChapterId} scene=${targetSceneId}`);
        try {
            const full = await invoke<{ project: Project; chapters: Chapter[]; scenes_by_chapter: Record<string, Scene[]> }>("load_full_project");
            setProject(full.project);
            const sortedChapters = [...full.chapters].sort((a,b)=>a.order-b.order);
            setChapters(sortedChapters);
            // normalize scenes sorting and apply saved meta (status/color)
            const scMap: ScenesByChapter = {};
            const savedMeta = (() => {
                try {
                    const stored = localStorage.getItem('featherworks_scene_meta');
                    return stored ? JSON.parse(stored) : {};
                } catch { return {}; }
            })();
            Object.entries(full.scenes_by_chapter).forEach(([cid, list]) => {
                scMap[cid] = [...list].sort((a,b)=>a.order-b.order).map(sc => ({
                    ...sc,
                    status: savedMeta[sc.id]?.status || 'draft',
                    color: savedMeta[sc.id]?.color || 'none',
                    pov: savedMeta[sc.id]?.pov || ''
                }));
            });
            setScenes(scMap);
            const finalChapterId = targetChapterId || sortedChapters[0]?.id || null;
            setActiveChapterId(finalChapterId);
            const finalSceneId = targetSceneId || (finalChapterId ? scMap[finalChapterId]?.[0]?.id : null);
            if (finalSceneId) {
                try { await loadSceneContent(finalSceneId); } catch (e:any) { pushDebug(`loadSceneContent failed: ${e}`); throw e; }
            } else {
                setEditorContent(''); setEditorWordCount(0); setActiveSceneId(null);
            }
            setView('editor');
            pushDebug('refetchAll success -> editor view');
        } catch (e:any) {
            console.error('[Frontend] Error in refetchAll:', e);
            pushDebug(`refetchAll error: ${e}`);
            toast.error(t('toast.projectLoadFailed'));
            setView('welcome');
        } finally {
            setIsLoading(false);
        }
    }, [loadSceneContent, pushDebug]);

    const openProjectByPath = useCallback(async (path: string) => {
        setIsLoading(true);
        console.log('[Frontend] Opening project at path:', path);
        try {
            const proj: Project = await invoke("open_project", { path });
            console.log('[Frontend] Successfully opened project:', proj);
            await refetchAll(proj.id);
        } catch (e) {
            console.error('[Frontend] Failed to open project:', e);
            toast.error(t('toast.projectOpenFailed'));
            setView('welcome');
        } finally {
            setIsLoading(false);
        }
    }, [refetchAll]);


    const handleOpenProject = useCallback(async () => {
        try {
            const selectedPath = await open({
                multiple: false,
                filters: [{ name: 'Featherworks Project', extensions: ['fwauthor'] }]
            });
            if (typeof selectedPath === 'string') {
                await openProjectByPath(selectedPath);
            }
        } catch (e) {
            console.error(e);
            toast.error(t('toast.projectOpenFailed'));
        }
    }, [openProjectByPath]);

    const handleNewProject = () => {
        setShowNewProjectModal(true);
    };

    const handleProjectCreated = (newProject: Project) => {
        console.log('[Frontend] Project created:', newProject);
        setShowNewProjectModal(false);
        refetchAll(newProject.id);
    };

    const handleCreateScene = async (chapterId: string) => {
        if (!project) return;
        try {
            const newScene: Scene = await invoke("create_scene", { req: { chapter_id: chapterId, title: t('newScene') } });
            toast.success(t('toast.sceneCreated', { title: newScene.title }));
            await refetchAll(project.id, chapterId, newScene.id);
        } catch (e) {
            toast.error(t('toast.sceneCreateFailed', { error: String(e) }));
            console.error(e);
        }
    };

    const handleCreateChapter = async () => {
        if (!project) return;
        try {
            const defaultTitle = `${t('prompt.chapter')} ${chapters.length + 1}`;
            const title = window.prompt(t('prompt.newChapter'), defaultTitle) || defaultTitle;
            const newChapter: Chapter = await invoke("create_chapter", { title });
            toast.success(t('toast.chapterCreated', { title: newChapter.title }));
            await refetchAll(project.id, newChapter.id, null);
        } catch (e) {
            toast.error(t('toast.chapterCreateFailed', { error: String(e) }));
        }
    };

    const handleRenameChapter = async (chapterId: string, newTitle: string) => {
        try {
            await invoke('rename_chapter', { chapterId, newTitle });
            if (project) await refetchAll(project.id, chapterId, null);
            toast.success(t('toast.chapterRenamed'));
        } catch (e) {
            console.error('rename_chapter failed', e);
            toast.error(t('toast.chapterRenameFailed'));
        }
    };

    const handleRenameScene = async (sceneId: string, newTitle: string) => {
        try {
            await invoke('rename_scene', { sceneId, newTitle });
            if (project) await refetchAll(project.id, null, sceneId);
            toast.success(t('toast.sceneRenamed'));
        } catch (e) {
            console.error('rename_scene failed', e);
            toast.error(t('toast.sceneRenameFailed'));
        }
    };

    const handleReorderChapters = async (orderedIds: string[]) => {
        try {
            await invoke('reorder_chapters', { orderedIds });
            // Update local state optimistically
            const reordered = orderedIds.map((id, idx) => {
                const ch = chapters.find(c => c.id === id);
                return ch ? { ...ch, order: idx + 1 } : null;
            }).filter(Boolean) as Chapter[];
            setChapters(reordered);
            toast.success(t('toast.chapterOrderUpdated'));
        } catch (e) {
            console.error('reorder_chapters failed', e);
            toast.error(t('toast.chapterOrderFailed'));
            if (project) await refetchAll(project.id); // Rollback
        }
    };

    const handleReorderScenes = async (chapterId: string, orderedSceneIds: string[]) => {
        try {
            await invoke('reorder_scenes', { chapterId, orderedSceneIds });
            // Update local state optimistically
            const currentScenes = scenes[chapterId] || [];
            const reordered = orderedSceneIds.map((id, idx) => {
                const sc = currentScenes.find(s => s.id === id);
                return sc ? { ...sc, order: idx + 1 } : null;
            }).filter(Boolean) as Scene[];
            setScenes(prev => ({ ...prev, [chapterId]: reordered }));
            toast.success(t('toast.sceneOrderUpdated'));
        } catch (e) {
            console.error('reorder_scenes failed', e);
            toast.error(t('toast.sceneOrderFailed'));
            if (project) await refetchAll(project.id); // Rollback
        }
    };

    // Szenen-Status/Farbe/POV wird vorerst nur lokal in localStorage gespeichert
    // um DB-Migrationen zu vermeiden
    const SCENE_META_KEY = 'featherworks_scene_meta';
    
    type SceneMeta = { status?: Scene['status']; color?: Scene['color']; pov?: string };
    
    const loadSceneMeta = (): Record<string, SceneMeta> => {
        try {
            const stored = localStorage.getItem(SCENE_META_KEY);
            return stored ? JSON.parse(stored) : {};
        } catch {
            return {};
        }
    };
    
    const saveSceneMeta = (meta: Record<string, SceneMeta>) => {
        try {
            localStorage.setItem(SCENE_META_KEY, JSON.stringify(meta));
        } catch (e) {
            console.error('Failed to save scene meta', e);
        }
    };
    
    const handleSceneStatusChange = (sceneId: string, status: Scene['status']) => {
        // Update in scenes state
        setScenes(prev => {
            const updated = { ...prev };
            for (const chapterId of Object.keys(updated)) {
                updated[chapterId] = updated[chapterId].map(sc => 
                    sc.id === sceneId ? { ...sc, status } : sc
                );
            }
            return updated;
        });
        // Persist to localStorage
        const meta = loadSceneMeta();
        meta[sceneId] = { ...meta[sceneId], status };
        saveSceneMeta(meta);
    };
    
    const handleSceneColorChange = (sceneId: string, color: Scene['color']) => {
        // Update in scenes state
        setScenes(prev => {
            const updated = { ...prev };
            for (const chapterId of Object.keys(updated)) {
                updated[chapterId] = updated[chapterId].map(sc => 
                    sc.id === sceneId ? { ...sc, color } : sc
                );
            }
            return updated;
        });
        // Persist to localStorage
        const meta = loadSceneMeta();
        meta[sceneId] = { ...meta[sceneId], color };
        saveSceneMeta(meta);
    };
    
    const handleScenePovChange = (sceneId: string, pov: string) => {
        // Update in scenes state
        setScenes(prev => {
            const updated = { ...prev };
            for (const chapterId of Object.keys(updated)) {
                updated[chapterId] = updated[chapterId].map(sc => 
                    sc.id === sceneId ? { ...sc, pov } : sc
                );
            }
            return updated;
        });
        // Persist to localStorage
        const meta = loadSceneMeta();
        meta[sceneId] = { ...meta[sceneId], pov };
        saveSceneMeta(meta);
    };

    const handleSaveEditorSettings = async (next: Partial<EditorSettings>) => {
        if (!editorSettings) return;
        const merged = { ...editorSettings, ...next };
        try {
            await invoke("save_editor_settings", { settings: merged });
            setEditorSettings(merged);
            toast.success(t('toast.settingsSaved'));
        } catch (e) {
            toast.error(t('toast.settingsSaveFailed'));
            console.error(e);
        }
    };

    // Projekt-weite Suche
    const handleProjectSearch = async () => {
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        setProjectSearchResults([]);
        
        try {
            const results: Array<{sceneId: string; sceneTitle: string; chapterTitle: string; matches: number}> = [];
            
            for (const chapter of chapters) {
                const chapterScenes = scenes[chapter.id] || [];
                for (const scene of chapterScenes) {
                    try {
                        const [content]: [string, number] = await invoke("get_scene_content", { id: scene.id });
                        let matches = 0;
                        
                        if (searchRegex) {
                            try {
                                const regex = new RegExp(searchQuery, 'gi');
                                const found = content.match(regex);
                                matches = found ? found.length : 0;
                            } catch {
                                // Invalid regex
                            }
                        } else {
                            const searchLower = searchQuery.toLowerCase();
                            const contentLower = content.toLowerCase();
                            let pos = 0;
                            while ((pos = contentLower.indexOf(searchLower, pos)) !== -1) {
                                matches++;
                                pos += searchQuery.length;
                            }
                        }
                        
                        if (matches > 0) {
                            results.push({
                                sceneId: scene.id,
                                sceneTitle: scene.title,
                                chapterTitle: chapter.title,
                                matches
                            });
                        }
                    } catch (e) {
                        console.error(`Failed to search scene ${scene.id}:`, e);
                    }
                }
            }
            
            setProjectSearchResults(results);
            if (results.length === 0) {
                toast.info(t('toast.noMatchesFound'));
            } else {
                toast.success(t('toast.matchesFound', { total: results.reduce((sum, r) => sum + r.matches, 0), scenes: results.length }));
            }
        } catch (e) {
            console.error('Project search failed:', e);
            toast.error(t('toast.searchFailed'));
        } finally {
            setIsSearching(false);
        }
    };
    
    // Projekt-weites Ersetzen
    const handleProjectReplaceAll = async () => {
        if (!searchQuery.trim()) return;
        
        const confirmed = window.confirm(
            t('confirm.replaceAll', { query: searchQuery, replace: searchReplace })
        );
        if (!confirmed) return;
        
        setIsSearching(true);
        let totalReplacements = 0;
        let scenesModified = 0;
        
        try {
            // Erst aktuelle Szene speichern
            if (isDirty) await saveNow();
            
            for (const chapter of chapters) {
                const chapterScenes = scenes[chapter.id] || [];
                for (const scene of chapterScenes) {
                    try {
                        const [content]: [string, number] = await invoke("get_scene_content", { id: scene.id });
                        let newContent: string;
                        let replacements = 0;
                        
                        if (searchRegex) {
                            try {
                                const regex = new RegExp(searchQuery, 'gi');
                                const matches = content.match(regex);
                                replacements = matches ? matches.length : 0;
                                newContent = content.replace(regex, searchReplace);
                            } catch {
                                continue;
                            }
                        } else {
                            const searchLower = searchQuery.toLowerCase();
                            const contentLower = content.toLowerCase();
                            let pos = 0;
                            while ((pos = contentLower.indexOf(searchLower, pos)) !== -1) {
                                replacements++;
                                pos += searchQuery.length;
                            }
                            // Case-preserving replace
                            newContent = content.split(new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')).join(searchReplace);
                        }
                        
                        if (replacements > 0) {
                            await invoke("save_scene_content", { id: scene.id, content: newContent });
                            totalReplacements += replacements;
                            scenesModified++;
                            
                            // Update current scene if it's the one we just modified
                            if (scene.id === activeSceneId) {
                                setEditorContent(newContent);
                                setEditorWordCount(newContent.split(/\s+/).filter(Boolean).length);
                            }
                        }
                    } catch (e) {
                        console.error(`Failed to replace in scene ${scene.id}:`, e);
                    }
                }
            }
            
            toast.success(t('toast.replacementsComplete', { total: totalReplacements, scenes: scenesModified }));
            setProjectSearchResults([]);
        } catch (e) {
            console.error('Project replace failed:', e);
            toast.error(t('toast.replaceFailed'));
        } finally {
            setIsSearching(false);
        }
    };

    const handleChapterClick = (chapterId: string) => {
        if (activeChapterId === chapterId) return;
        if (isDirty) saveNow();
        setActiveChapterId(chapterId);
        const firstSceneId = scenes[chapterId]?.[0]?.id;
        if (firstSceneId) {
            loadSceneContent(firstSceneId);
        } else {
            setActiveSceneId(null);
            setEditorContent('');
            setEditorWordCount(0);
        }
    };

    const handleEditorChange = (newContent: string) => {
        setEditorContent(newContent);
        setEditorWordCount(newContent.split(/\s+/).filter(Boolean).length);
        setIsDirty(true);
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = window.setTimeout(saveNow, 1500);
    };

    // Keyboard shortcuts for formatting, search, navigation and escape actions
    useEffect(() => {
        const onKey = async (e: KeyboardEvent) => {
            // ESC key: exit focus mode, fullscreen, or search
            if (e.key === 'Escape') {
                if (showSearch) { setShowSearch(false); setProjectSearchResults([]); return; }
                if (focusMode) { setFocusMode(false); return; }
                if (isFullscreen) {
                    await appWindow.setFullscreen(false);
                    setIsFullscreen(false);
                    return;
                }
            }
            
            const isMod = e.metaKey || e.ctrlKey;
            const key = e.key.toLowerCase();
            
            if (isMod) {
                const run = editorCommandRef.current;
                
                switch (key) {
                    // Datei-Operationen
                    case 's': 
                        e.preventDefault(); 
                        saveNow(); 
                        return;
                    case 'n':
                        if (e.shiftKey) {
                            // Cmd+Shift+N: Neues Projekt
                            e.preventDefault();
                            setShowNewProjectModal(true);
                        } else if (activeChapterId) {
                            // Cmd+N: Neue Szene
                            e.preventDefault();
                            handleCreateScene(activeChapterId);
                        }
                        return;
                    case 'o':
                        e.preventDefault();
                        handleOpenProject();
                        return;
                        
                    // Suchen & Ersetzen
                    case 'f':
                        e.preventDefault();
                        setShowSearch(true);
                        setSearchScope('scene');
                        return;
                    case 'h':
                        // Cmd+H: Suchen & Ersetzen (wie in vielen Editoren)
                        e.preventDefault();
                        setShowSearch(true);
                        return;
                    case 'g':
                        if (showSearch) {
                            e.preventDefault();
                            if (e.shiftKey) {
                                searchApiRef.current?.prev();
                            } else {
                                searchApiRef.current?.next();
                            }
                        }
                        return;
                        
                    // Ansicht
                    case 'e':
                        if (e.shiftKey) {
                            // Cmd+Shift+E: Fokus-Modus toggle
                            e.preventDefault();
                            setFocusMode(f => !f);
                        }
                        return;
                    case 'Enter':
                        // Cmd+Enter: Vollbild toggle
                        e.preventDefault();
                        const next = !isFullscreen;
                        await appWindow.setFullscreen(next);
                        setIsFullscreen(next);
                        return;
                        
                    // Navigation
                    case 'ArrowUp':
                        if (e.shiftKey && activeChapterId) {
                            // Cmd+Shift+Up: Vorheriges Kapitel
                            e.preventDefault();
                            const idx = chapters.findIndex(c => c.id === activeChapterId);
                            if (idx > 0) {
                                const prevChapter = chapters[idx - 1];
                                handleChapterClick(prevChapter.id);
                            }
                        }
                        return;
                    case 'ArrowDown':
                        if (e.shiftKey && activeChapterId) {
                            // Cmd+Shift+Down: Nächstes Kapitel
                            e.preventDefault();
                            const idx = chapters.findIndex(c => c.id === activeChapterId);
                            if (idx < chapters.length - 1) {
                                const nextChapter = chapters[idx + 1];
                                handleChapterClick(nextChapter.id);
                            }
                        }
                        return;
                    case 'pageup':
                    case '[':
                        if (activeChapterId && activeSceneId) {
                            // Cmd+[ oder Cmd+PageUp: Vorherige Szene
                            e.preventDefault();
                            const chapterScenes = scenes[activeChapterId] || [];
                            const idx = chapterScenes.findIndex(s => s.id === activeSceneId);
                            if (idx > 0) {
                                loadSceneContent(chapterScenes[idx - 1].id);
                            }
                        }
                        return;
                    case 'pagedown':
                    case ']':
                        if (activeChapterId && activeSceneId) {
                            // Cmd+] oder Cmd+PageDown: Nächste Szene
                            e.preventDefault();
                            const chapterScenes = scenes[activeChapterId] || [];
                            const idx = chapterScenes.findIndex(s => s.id === activeSceneId);
                            if (idx < chapterScenes.length - 1) {
                                loadSceneContent(chapterScenes[idx + 1].id);
                            }
                        }
                        return;
                        
                    // Sidebars
                    case '\\':
                        // Cmd+\: Linke Sidebar toggle
                        e.preventDefault();
                        setShowLeft(s => !s);
                        return;
                    case '/':
                        if (e.shiftKey) {
                            // Cmd+Shift+/: Rechte Sidebar toggle
                            e.preventDefault();
                            setShowRight(s => !s);
                        }
                        return;
                }
                
                // Formatierung (braucht Editor-Command-Ref)
                if (run) {
                    switch (key) {
                        case 'b': e.preventDefault(); run('bold'); break;
                        case 'i': e.preventDefault(); run('italic'); break;
                        case 'u': e.preventDefault(); run('underline'); break;
                        case 'd': 
                            if (e.shiftKey) {
                                e.preventDefault(); 
                                run('strikethrough'); 
                            }
                            break;
                    }
                }
            }
            
            // Alt/Option Shortcuts
            if (e.altKey && !isMod) {
                switch (key) {
                    case 'f':
                        // Alt+F: Projekt-weite Suche
                        e.preventDefault();
                        setShowSearch(true);
                        setSearchScope('project');
                        return;
                }
            }
            
            // Search navigation (ohne Modifier)
            if (showSearch && e.key === 'Enter' && !isMod) {
                e.preventDefault();
                if (searchScope === 'project') {
                    handleProjectSearch();
                } else {
                    if (e.shiftKey) { 
                        searchApiRef.current?.prev(); 
                    } else { 
                        searchApiRef.current?.next(); 
                    }
                }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [saveNow, showSearch, searchScope, focusMode, isFullscreen, activeChapterId, activeSceneId, chapters, scenes, handleOpenProject, handleCreateScene, handleChapterClick, loadSceneContent, handleProjectSearch]);

    // Autosave: Intervall-basiert alle 30 Sekunden wenn dirty
    useEffect(() => {
        const AUTOSAVE_INTERVAL = 30000; // 30 Sekunden
        
        const autosaveInterval = setInterval(() => {
            if (isDirty && activeSceneId) {
                console.log('[Autosave] Triggering automatic save...');
                saveNow();
            }
        }, AUTOSAVE_INTERVAL);
        
        return () => clearInterval(autosaveInterval);
    }, [isDirty, activeSceneId, saveNow]);
    
    // Autosave: Bei Fensterschließen oder Tab-Wechsel
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                // Synchron speichern ist nicht möglich, aber wir warnen den User
                e.preventDefault();
                e.returnValue = 'Sie haben ungespeicherte Änderungen. Wirklich verlassen?';
                // Versuche trotzdem zu speichern
                saveNow();
            }
        };
        
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden' && isDirty) {
                console.log('[Autosave] Tab hidden, saving...');
                saveNow();
            }
        };
        
        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isDirty, saveNow]);

    useEffect(() => {
        // Apply/remove focus-mode class on body for global styling
        const cls = document.body.classList;
        focusMode ? cls.add('focus-mode') : cls.remove('focus-mode');
    }, [focusMode]);

    useEffect(()=>{
        console.log('[menu-listeners] Setting up menu event listeners...');
        invoke("get_editor_settings").then(s => setEditorSettings(s as EditorSettings)).catch((e)=>{
            console.error('get_editor_settings failed, falling back to defaults', e);
            // Fallback defaults ensure the editor renders even if settings table was missing before migration
            setEditorSettings({ font_family: 'Inter', font_size: 16, line_height: 1.6 });
        });
        invoke('get_project_status').then((st:any)=>{ if(st && typeof st.is_temp==='boolean') setIsTempImported(st.is_temp); }).catch(()=>{});
        const unlistenOpen = listen('menu_open_project', () => { console.log('[menu-event] menu_open_project received'); toast.info('Projekt öffnen…'); handleOpenProject(); });
        const unlistenNew = listen('menu_new_project', () => { console.log('[menu-event] menu_new_project received'); toast.info('Neues Projekt…'); handleNewProject(); });
        const unlistenSave = listen('menu_save', async () => {
            console.log('[menu-event] menu_save received');
            toast.info('Speichere…');
            await saveNow();
            try { await invoke('save_project'); } catch(e){ console.warn('save_project failed (non-fatal)', e); }
        });
        const unlistenSaveAs = listen('menu_save_as', async () => {
            console.log('[menu-event] menu_save_as received');
            toast.info('Speichern unter…');
            await saveNow();
            try {
                const newPath = await save({ title: t('project.save'), filters: [{ name: 'Featherworks Project', extensions: ['fwauthor'] }] });
                if (newPath && typeof newPath === 'string') {
                    await invoke('save_project_as', { new_path: newPath });
                    toast.success(t('toast.projectSavedNewPath'));
                }
            } catch(e){ toast.error(t('project.saveError')); console.error(e); }
        });
        const unlistenExport = listen('menu_export_encrypted', ()=> { console.log('[menu-event] menu_export_encrypted received'); toast.info('Export-Dialog…'); setShowExportModal(true); });
        const unlistenImport = listen('menu_import_encrypted', ()=> { console.log('[menu-event] menu_import_encrypted received'); toast.info('Import-Dialog…'); setShowImportModal(true); });
        const unlistenClose = listen('menu_close', () => {
            // Minimal close: clear editor view and go back to welcome
            setProject(null); setView('welcome');
        });
        const unlistenUndo = listen('menu_undo', async () => {
            if (features.patchPipeline && activeSceneId) {
                try {
                    const wc: number | null = await invoke('undo_scene', { req: { scene_id: activeSceneId } });
                    if (wc !== null) { await loadSceneContent(activeSceneId); }
                } catch(e){ console.warn('undo_scene failed', e); }
            } else {
                editorCommandRef.current?.('undo');
            }
        });
        const unlistenRedo = listen('menu_redo', async () => {
            if (features.patchPipeline && activeSceneId) {
                try {
                    const wc: number | null = await invoke('redo_scene', { req: { scene_id: activeSceneId } });
                    if (wc !== null) { await loadSceneContent(activeSceneId); }
                } catch(e){ console.warn('redo_scene failed', e); }
            } else {
                editorCommandRef.current?.('redo');
            }
        });
        const unlistenFind = listen('menu_find', () => setShowSearch(true));
        const unlistenReplace = listen('menu_replace', () => setShowSearch(true));
        const unlistenFindManuscript = listen('menu_find_manuscript', () => {
            setShowSearch(true);
            // TODO: Enable manuscript-wide search mode
            console.log('[menu] Find in Manuscript - not yet implemented');
        });
        const unlistenReplaceManuscript = listen('menu_replace_manuscript', () => {
            setShowSearch(true);
            // TODO: Enable manuscript-wide replace mode
            console.log('[menu] Replace in Manuscript - not yet implemented');
        });
        const unlistenToggleFS = listen('menu_toggle_fullscreen', async () => { const next=!isFullscreen; await appWindow.setFullscreen(next); setIsFullscreen(next); });
        const unlistenOpenPath = listen<string>('menu_open_project_path', (event) => { openProjectByPath(event.payload); });
        const unlistenReportBug = listen('menu_report_bug', () => { setBugReportCategory('bug'); setShowBugReportModal(true); });
        const unlistenSendFeedback = listen('menu_send_feedback', () => { setBugReportCategory('feedback'); setShowBugReportModal(true); });

        return () => {
            console.log('[menu-listeners] Cleaning up menu event listeners...');
            unlistenOpen.then(f => f());
            unlistenNew.then(f => f());
            unlistenSave.then(f => f());
            unlistenSaveAs.then(f => f());
            unlistenClose.then(f => f());
            unlistenUndo.then(f => f());
            unlistenRedo.then(f => f());
            unlistenFind.then(f => f());
            unlistenReplace.then(f => f());
            unlistenFindManuscript.then(f => f());
            unlistenReplaceManuscript.then(f => f());
            unlistenToggleFS.then(f => f());
            unlistenOpenPath.then(f => f());
            unlistenReportBug.then(f => f());
            unlistenSendFeedback.then(f => f());
            unlistenExport.then(f=>f());
            unlistenImport.then(f=>f());
        };
    }, [handleOpenProject, openProjectByPath, saveNow, isFullscreen, features.patchPipeline, activeSceneId, loadSceneContent]);

    // CONDITIONAL RENDERING: All hooks must be declared before any conditional returns
    // View state steuert allein die Willkommensansicht – projekt kann während des Ladens kurz null sein
    const isWelcomeView = view === 'welcome';

    // --- Full App Layout (Header, Sidebar, Editor, Inspector, Footer) ---
    const activeScenes = activeChapterId && !isWelcomeView ? (scenes[activeChapterId] || []) : [];

    // Keyboard navigation for chapter/scene lists
    const handleListKey = useCallback((e: React.KeyboardEvent) => {
        if(isWelcomeView || !chapters.length) return;
        if(e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const chapterIndex = chapters.findIndex(c=> c.id === activeChapterId);
            if(e.altKey) {
                // Switch chapter with Alt + Arrow
                let nextIdx = chapterIndex;
                if(e.key === 'ArrowUp') nextIdx = Math.max(0, chapterIndex - 1);
                if(e.key === 'ArrowDown') nextIdx = Math.min(chapters.length - 1, chapterIndex + 1);
                if(nextIdx !== chapterIndex) handleChapterClick(chapters[nextIdx].id);
                return;
            }
            if(activeChapterId) {
                const list = activeScenes;
                if(!list.length) return;
                const sceneIndex = list.findIndex(s=> s.id === activeSceneId);
                let nextSceneIdx = sceneIndex;
                if(e.key === 'ArrowUp') nextSceneIdx = Math.max(0, sceneIndex - 1);
                if(e.key === 'ArrowDown') nextSceneIdx = Math.min(list.length - 1, sceneIndex + 1);
                if(nextSceneIdx !== sceneIndex) {
                    loadSceneContent(list[nextSceneIdx].id);
                }
            }
        }
    }, [isWelcomeView, chapters, activeChapterId, activeSceneId, activeScenes, loadSceneContent, handleChapterClick]);

    // RENDER: Welcome view or full app layout
    const isWelcome = view === 'welcome';
    const isLibrary = view === 'library';

    if (isLibrary) {
        return (
            <>
                <Toaster position="bottom-right" />
                <ProjectLibrary 
                    onOpenProject={openProjectByPath} 
                    onBack={() => setView('welcome')} 
                />
            </>
        );
    }

    if (isWelcome) {
        return (
            <>
                <Toaster position="bottom-right" />
                <WelcomeView 
                    onOpenProject={handleOpenProject} 
                    onNewProject={handleNewProject} 
                    onOpenRecent={openProjectByPath}
                    onShowLibrary={() => setView('library')}
                />
                {debugErrors.length > 0 && (
                    <div className="debug-panel">
                        <div className="debug-panel-header">
                            <strong>Debug Panel</strong>
                            <button className="small-btn" onClick={()=>setDebugErrors([])}>Clear</button>
                        </div>
                        <div className="mono-pre">
                            {debugErrors.slice(-80).map((l,i)=>(<div key={i}>{l}</div>))}
                        </div>
                    </div>
                )}
                {showNewProjectModal && <NewProjectModal onClose={() => setShowNewProjectModal(false)} onProjectCreate={handleProjectCreated} />}
                {showExportModal && (
                    <div className="modal-overlay">
                        <div className="modal-content export-import-modal">
                            <h2>{t('export.encrypted')}</h2>
                            <div className="modal-form">
                                <div className="form-field">
                                    <label>{t('export.password')}</label>
                                    <input type="password" value={exportPassword} onChange={e=>setExportPassword(e.target.value)} placeholder="••••••••" />
                                </div>
                                <div className="form-field">
                                    <label>{t('export.targetFile')}</label>
                                    <div className="input-with-button">
                                        <input value={exportPath} onChange={e=>setExportPath(e.target.value)} placeholder="/path/project.fwauthor" />
                                        <button className="browse-btn" onClick={async()=>{
                                            try {
                                                const suggested = exportPath || `${project?.title || 'project'}.fwauthor`;
                                                const path = await save({ title: t('export.targetFile'), defaultPath: suggested, filters: [{ name: 'Featherworks Project', extensions: ['fwauthor'] }] });
                                                if (path) setExportPath(path as string);
                                            } catch(e){ console.error('save dialog failed', e); }
                                        }}>{t('browse') || 'Browse'}</button>
                                    </div>
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button className="btn-secondary" onClick={()=>{setShowExportModal(false); setExportPassword('');}}>{t('cancel')}</button>
                                <button className="btn-primary" disabled={!exportPassword || !exportPath} onClick={async ()=>{
                                    try {
                                        await invoke('export_project_encrypted', { req: { password: exportPassword, out_path: exportPath } });
                                        toast.success(t('toast.exportSuccess'));
                                        setShowExportModal(false); setExportPassword('');
                                    } catch(e){ toast.error(t('export.failed')); console.error(e); }
                                }}>{t('toolbar.export')}</button>
                            </div>
                        </div>
                    </div>
                )}
                {showImportModal && (
                    <div className="modal-overlay">
                        <div className="modal-content export-import-modal">
                            <h2>{t('import.encrypted')}</h2>
                            <div className="modal-form">
                                <div className="form-field">
                                    <label>{t('import.containerFile')}</label>
                                    <div className="input-with-button">
                                        <input value={importPath} onChange={e=>setImportPath(e.target.value)} placeholder="/path/project.fwauthor" />
                                        <button className="browse-btn" onClick={async()=>{
                                            try {
                                                const path = await open({ multiple: false, filters: [{ name: 'Featherworks Project', extensions: ['fwauthor'] }] });
                                                if (typeof path === 'string') setImportPath(path);
                                            } catch(e){ console.error('open dialog failed', e); }
                                        }}>{t('browse') || 'Browse'}</button>
                                    </div>
                                </div>
                                <div className="form-field">
                                    <label>{t('import.password')}</label>
                                    <input type="password" value={importPassword} onChange={e=>setImportPassword(e.target.value)} placeholder="••••••••" />
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button className="btn-secondary" onClick={()=>{ setShowImportModal(false); setImportPassword(''); }}>{t('cancel')}</button>
                                <button className="btn-primary" disabled={!importPath || !importPassword} onClick={async ()=>{
                                    try {
                                        const proj: Project = await invoke('import_encrypted_project', { req: { path: importPath, password: importPassword } });
                                        toast.success(t('toast.importSuccess', { title: proj.title }));
                                        setShowImportModal(false); setImportPassword('');
                                        await refetchAll(proj.id);
                                    } catch(e){ toast.error(t('toast.importFailed')); console.error(e); }
                                }}>{t('toolbar.import')}</button>
                            </div>
                        </div>
                    </div>
                )}
                {isLoading && <div className="loading-overlay-global"><div className="spinner"></div></div>}
                
                {/* Bug Report Modal */}
                <BugReportModal 
                    isOpen={showBugReportModal} 
                    onClose={() => setShowBugReportModal(false)} 
                    initialCategory={bugReportCategory}
                />
            </>
        );
    }

    // Editor-Ansicht: Falls view==='editor' aber project noch nicht gesetzt wurde, zeigen wir einen sanften Loader
    if (view === 'editor' && !project) {
        return (
            <>
                <Toaster position="bottom-right" />
                <div className="loading-placeholder">{t('project.loading')}</div>
                {isLoading && <div className="loading-overlay-global"><div className="spinner" /></div>}
            </>
        );
    }

    return (
        <div className={`app-layout responsive${!showLeft? ' no-left':''}${!showRight? ' no-right':''}`}>
            <a href="#main-editor" className="skip-link">{t('project.skipToContent')}</a>
            <Toaster position="bottom-right" />
            <AiSettingsModal />
            {isLoading && <div className="loading-overlay-global"><div className="spinner"></div></div>}
            
            {/* Update Banner */}
            {updateInfo && updateInfo.available && (
                <UpdateBanner updateInfo={updateInfo} onDismiss={dismissUpdate} />
            )}

            {/* Header / Menubar */}
            <div className={`header${isTempImported? ' has-banner':''}`} role="banner">
                {isTempImported && (
                    <div className="temp-import-banner">
                        <span>{t('header.tempImport')}</span>
                        <button className="btn btn-sm" onClick={()=> toast.info(t('header.tempHint'))}>{t('header.hint')}</button>
                    </div>
                )}
                <button 
                    className="header-library-btn" 
                    onClick={async () => {
                        if (isDirty) {
                            const shouldSave = window.confirm(t('header.unsavedChanges'));
                            if (shouldSave) {
                                await saveNow();
                            }
                        }
                        setView('library');
                    }}
                    title={t('header.toLibrary')}
                >
                    📚
                </button>
                <div className="logo">🪶 Featherworks Author</div>
                <div className="menu-bar">
                    <div className="menu-item" onClick={handleNewProject}>{t('toolbar.new')}</div>
                    <div className="menu-item" onClick={handleOpenProject}>{t('toolbar.open')}</div>
                    <div className="menu-item" onClick={() => saveNow()}>{t('toolbar.save')}</div>
                    <div className="menu-item" onClick={()=>setShowExportModal(true)}>{t('toolbar.export')}</div>
                    <div className="menu-item" onClick={()=>setShowImportModal(true)}>{t('toolbar.import')}</div>
                </div>
                <div className="sidebar-toggle-group">
                    <button className="toolbar-btn" title={showLeft? t('toolbar.hideLeftSidebar') : t('toolbar.showLeftSidebar')} onClick={()=> setShowLeft(s=>!s)}>{showLeft? '◀' : '▶'}</button>
                    <button className="toolbar-btn" title={showRight? t('toolbar.hideRightSidebar') : t('toolbar.showRightSidebar')} onClick={()=> setShowRight(s=>!s)}>{showRight? '▶' : '◀'}</button>
                </div>
                {/* View Mode Toggle: Editor / Preview with Dropdown */}
                <div className="view-mode-toggle">
                    <button 
                        className={`toolbar-btn ${mainViewMode === 'editor' ? 'active' : ''}`}
                        onClick={() => setMainViewMode('editor')}
                        title="Schreiben"
                    >
                        ✏️
                    </button>
                    <div className="preview-dropdown-container">
                        <button 
                            ref={previewBtnRef}
                            className={`toolbar-btn ${mainViewMode !== 'editor' ? 'active' : ''}`}
                            onClick={() => {
                                if (mainViewMode === 'editor') {
                                    // If in editor, go to last preview mode or default to CSS
                                    setMainViewMode('preview-css');
                                } else {
                                    // If already in preview, toggle dropdown and calculate position
                                    if (!showPreviewDropdown && previewBtnRef.current) {
                                        const rect = previewBtnRef.current.getBoundingClientRect();
                                        setPreviewDropdownPos({ top: rect.bottom + 4, left: rect.left });
                                    }
                                    setShowPreviewDropdown(!showPreviewDropdown);
                                }
                            }}
                            title="Vorschau"
                        >
                            👁️
                            <span className="dropdown-arrow">▾</span>
                        </button>
                        {showPreviewDropdown && previewDropdownPos && createPortal(
                            <div 
                                ref={previewDropdownRef}
                                className="preview-dropdown"
                                style={{
                                    position: 'fixed',
                                    top: previewDropdownPos.top,
                                    left: previewDropdownPos.left,
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
                                    className={mainViewMode === 'preview-css' ? 'active' : ''}
                                    onClick={() => { setMainViewMode('preview-css'); setShowPreviewDropdown(false); }}
                                    style={{
                                        display: 'block',
                                        width: '100%',
                                        padding: '10px 14px',
                                        background: mainViewMode === 'preview-css' ? 'var(--accent-color, #3b82f6)' : 'transparent',
                                        border: 'none',
                                        borderBottom: '1px solid var(--border-color, #333)',
                                        color: mainViewMode === 'preview-css' ? 'white' : 'var(--text-primary, #f0f0f0)',
                                        fontSize: '13px',
                                        textAlign: 'left',
                                        cursor: 'pointer',
                                    }}
                                >
                                    📐 Layout-Vorschau (Live)
                                </button>
                                <button 
                                    className={mainViewMode === 'preview-pdf' ? 'active' : ''}
                                    onClick={() => { setMainViewMode('preview-pdf'); setShowPreviewDropdown(false); }}
                                    style={{
                                        display: 'block',
                                        width: '100%',
                                        padding: '10px 14px',
                                        background: mainViewMode === 'preview-pdf' ? 'var(--accent-color, #3b82f6)' : 'transparent',
                                        border: 'none',
                                        color: mainViewMode === 'preview-pdf' ? 'white' : 'var(--text-primary, #f0f0f0)',
                                        fontSize: '13px',
                                        textAlign: 'left',
                                        cursor: 'pointer',
                                    }}
                                >
                                    📄 PDF-Vorschau (Exakt)
                                </button>
                            </div>,
                            document.body
                        )}
                    </div>
                </div>
                <div className="layout-spacer" />
                <div className="header-right">
                    <div className="header-project-info">
                        <div className="header-project-main">
                            <span className="header-project-icon">📖</span>
                            <input 
                                aria-label={t('header.title')} 
                                className="header-input header-input-title" 
                                placeholder={t('header.title')}
                                value={project?.title || ''} 
                                onChange={e=>{ project && setProject({...project, title:e.target.value}); }} 
                                onBlur={async ()=>{ if(project) { try { await invoke('update_project_metadata_cmd', { req: { title: project.title, author: project.author, short_name: project.short_name||null, genre: project.genre||null, target_pages: project.target_pages||null } }); toast.success(t('toast.titleSaved')); } catch(e){ toast.error(t('toast.saveFailed', { error: '' })); } } }} 
                            />
                            <span className="header-project-divider">—</span>
                            <span className="header-project-icon-sm">✍️</span>
                            <input 
                                aria-label={t('header.author')} 
                                className="header-input header-input-author" 
                                placeholder={t('header.author')}
                                value={project?.author || ''} 
                                onChange={e=>{ project && setProject({...project, author:e.target.value}); }} 
                                onBlur={async ()=>{ if(project) { try { await invoke('update_project_metadata_cmd', { req: { title: project.title, author: project.author, short_name: project.short_name||null, genre: project.genre||null, target_pages: project.target_pages||null } }); toast.success(t('toast.authorSaved')); } catch(e){ toast.error(t('toast.saveFailed', { error: '' })); } } }} 
                            />
                        </div>
                        {project && project.target_pages && (
                            <div className="header-project-progress">
                                <span className="header-project-icon-sm">📄</span>
                                <span className="header-progress-label">{t('header.targetPages')}</span>
                                {(() => {
                                    const totalWords = Object.values(scenes).flat().reduce((n, s)=> n + (s.word_count||0), 0);
                                    const targetWords = project.target_pages! * 300;
                                    const pct = Math.min(100, Math.round((totalWords/targetWords)*100));
                                    return (
                                        <div className="header-progress-bar-wrap">
                                            <ProgressBar pct={pct} title={t('header.progress', { pct, current: totalWords, target: targetWords })}/>
                                            <span className="header-progress-pct">{pct}%</span>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {/* Banner moved inside header for consistent layout height */}

            {/* Left Sidebar - Show Preview Settings in preview mode, otherwise Chapter Sidebar */}
            {mainViewMode !== 'editor' ? (
              <PreviewSettingsSidebar
                previewMode={mainViewMode === 'preview-pdf' ? 'pdf' : 'css'}
                onBack={() => setMainViewMode('editor')}
              />
            ) : (
              <Sidebar
                chapters={chapters}
                scenes={scenes}
                activeChapterId={activeChapterId}
                activeSceneId={activeSceneId}
                onSelectChapter={(id)=> handleChapterClick(id)}
                onSelectScene={(id)=> loadSceneContent(id)}
                onCreateChapter={handleCreateChapter}
                onCreateScene={(cid)=> handleCreateScene(cid)}
                onRenameChapter={(cid, title)=> handleRenameChapter(cid, title)}
                onRenameScene={(sid, title)=> handleRenameScene(sid, title)}
                onReorderChapters={handleReorderChapters}
                onReorderScenes={handleReorderScenes}
                onSceneStatusChange={handleSceneStatusChange}
                onSceneColorChange={handleSceneColorChange}
                onScenePovChange={handleScenePovChange}
              />
            )}

            {/* Main Editor Area */}
            <main className="editor-area" id="main-editor" role="main" aria-label={t('project.editorArea')}>
                <div className="editor-toolbar">
                    <button className="toolbar-btn mobile-nav-toggle" onClick={()=> setMobileSidebarOpen(o=>!o)} id="mobile-nav-toggle">☰</button>
                    <FormatToolbar 
                        onCommand={(cmd) => editorCommandRef.current?.(cmd)} 
                        editorLanguage={editorSettings?.editor_language || 'de'}
                        onEditorLanguageChange={(lang) => {
                            if (editorSettings) {
                                const newSettings = { ...editorSettings, editor_language: lang };
                                setEditorSettings(newSettings);
                                invoke('save_editor_settings', { settings: newSettings }).catch(console.error);
                            }
                        }}
                    />
                    <div className="divider" />
                    <button className="toolbar-btn" onClick={() => activeChapterId && handleCreateScene(activeChapterId)}>{t('toolbar.sceneAdd')}</button>
                    <button className="toolbar-btn" onClick={saveNow}>{t('toolbar.save')}</button>
                    <button className="toolbar-btn" onClick={()=> setFocusMode(f=>!f)}>{focusMode? t('toolbar.focusOff') : t('toolbar.focusOn')}</button>
                    <button className="toolbar-btn" onClick={async ()=>{ const next=!isFullscreen; await appWindow.setFullscreen(next); setIsFullscreen(next); }}>{isFullscreen? t('toolbar.fullscreenOff') : t('toolbar.fullscreenOn')}</button>
                    <div className="grow" />
                    <span className={`status-indicator${isDirty? ' unsaved':''}`} title={isDirty ? t('status.unsaved') : t('status.saved')} />
                    <span className="word-count-small">{t('status.words')}: {editorWordCount}</span>
                </div>
                <div className="editor-content">

                {showSearch && (
                    <div className="search-panel">
                        <div className="search-row">
                            <input className="search-input" placeholder={t('search.placeholder')} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && (searchScope === 'project' ? handleProjectSearch() : searchApiRef.current?.next())} />
                            <input className="search-input" placeholder={t('search.replacePlaceholder')} value={searchReplace} onChange={e => setSearchReplace(e.target.value)} />
                        </div>
                        <div className="search-row search-options">
                            <label className="search-label"><input type="checkbox" checked={searchRegex} onChange={e => setSearchRegex(e.target.checked)} /> {t('search.regex')}</label>
                            <div className="search-scope">
                                <label className="search-label">
                                    <input type="radio" name="scope" checked={searchScope === 'scene'} onChange={() => setSearchScope('scene')} /> {t('search.scene')}
                                </label>
                                <label className="search-label">
                                    <input type="radio" name="scope" checked={searchScope === 'project'} onChange={() => setSearchScope('project')} /> {t('search.project')}
                                </label>
                            </div>
                        </div>
                        <div className="search-row search-actions">
                            {searchScope === 'scene' ? (
                                <>
                                    <button className="btn btn-sm" onClick={() => searchApiRef.current?.prev()}>{t('search.prevBtn')}</button>
                                    <button className="btn btn-sm" onClick={() => searchApiRef.current?.next()}>{t('search.nextBtn')}</button>
                                    <button className="btn btn-sm" onClick={() => searchApiRef.current?.replaceOne(searchReplace)}>{t('search.replaceBtn')}</button>
                                    <button className="btn btn-sm btn-warning" onClick={() => searchApiRef.current?.replaceAll(searchReplace)}>{t('search.replaceAllScene')}</button>
                                </>
                            ) : (
                                <>
                                    <button className="btn btn-sm btn-primary" onClick={handleProjectSearch} disabled={isSearching}>
                                        {isSearching ? t('search.searching') : t('search.searchProject')}
                                    </button>
                                    <button className="btn btn-sm btn-warning" onClick={handleProjectReplaceAll} disabled={isSearching || !searchQuery}>
                                        {t('search.replaceAllProject')}
                                    </button>
                                </>
                            )}
                            <button className="btn btn-sm btn-ghost" onClick={() => { setShowSearch(false); setProjectSearchResults([]); }}>✕</button>
                        </div>
                        {/* Projekt-Suchergebnisse */}
                        {searchScope === 'project' && projectSearchResults.length > 0 && (
                            <div className="search-results">
                                <div className="search-results-header">
                                    {projectSearchResults.reduce((sum, r) => sum + r.matches, 0)} Treffer in {projectSearchResults.length} Szenen
                                </div>
                                <div className="search-results-list">
                                    {projectSearchResults.map(r => (
                                        <button 
                                            key={r.sceneId} 
                                            className="search-result-item"
                                            onClick={() => loadSceneContent(r.sceneId)}
                                        >
                                            <span className="result-chapter">{r.chapterTitle}</span>
                                            <span className="result-scene">{r.sceneTitle}</span>
                                            <span className="result-count">{r.matches}×</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Main Content Area - switches between Editor and Preview modes */}
                {mainViewMode === 'editor' && (
                    <>
                        <EditorPane
                            content={editorContent}
                            wordCount={editorWordCount}
                            settings={editorSettings as any}
                            isDirty={isDirty}
                            onContentChange={handleEditorChange}
                            findQuery={searchQuery || undefined}
                            regex={searchRegex}
                            onSearchApiReady={(api: any) => { searchApiRef.current = api; }}
                            onCommandApiReady={(runner: (cmd: string) => void) => { editorCommandRef.current = runner; }}
                            onScroll={(scrollTop: number) => setEditorScrollTop(scrollTop)}
                            lektoratHighlight={lektoratHighlight}
                            commentApi$={(api) => { commentApiRef.current = api; }}
                        />
                        
                        {/* Lektorat Sidebar - neben dem Editor */}
                        {activeSceneId && (
                            <LektoratEditorSidebar
                                content={editorContent}
                                sceneId={activeSceneId}
                                editorScrollTop={editorScrollTop}
                        lineHeight={editorSettings ? editorSettings.font_size * editorSettings.line_height : 24}
                        visible={showLektoratSidebar}
                        realtimeLektorat={realtimeLektorat}
                        onToggle={() => setShowLektoratSidebar(!showLektoratSidebar)}
                        onAnnotationClick={(ann) => {
                            if (!editorContent) return;
                            const start = lineColToOffset(editorContent, ann.line, ann.startCol ?? 0);
                            const end = lineColToOffset(editorContent, ann.line, ann.endCol ?? ann.startCol ?? 0);
                            setLektoratHighlight({ from: start, to: Math.max(start, end), id: ann.id });
                        }}
                        onApplySuggestion={(ann) => {
                            if (!ann.suggestion) return;
                            const start = lineColToOffset(editorContent, ann.line, ann.startCol ?? 0);
                            const end = lineColToOffset(editorContent, ann.line, ann.endCol ?? ann.startCol ?? 0);
                            const updated = editorContent.slice(0, start) + ann.suggestion + editorContent.slice(end);
                            handleEditorChange(updated);
                            setLektoratHighlight({ from: start, to: start + ann.suggestion.length, id: ann.id });
                        }}
                        onHighlightText={(line, startCol, endCol) => {
                            const start = lineColToOffset(editorContent, line, startCol ?? 0);
                            const end = lineColToOffset(editorContent, line, endCol ?? startCol ?? 0);
                            setLektoratHighlight({ from: start, to: Math.max(start, end) });
                        }}
                        humanComments={humanComments}
                        onAddComment={(note: string, suggestion?: string) => {
                            const sel = commentApiRef.current?.getSelection();
                            if (!sel || sel.text.trim().length === 0) return;
                            const id = crypto.randomUUID();
                            setHumanComments(prev => [...prev, { id, from: sel.from, to: sel.to, text: sel.text, note, suggestion, status: 'open' }]);
                            setLektoratHighlight({ from: sel.from, to: sel.to, id });
                        }}
                        onApplyComment={(id: string) => {
                            const comment = humanComments.find(c => c.id === id);
                            if (!comment || !comment.suggestion) return;
                            const updated = editorContent.slice(0, comment.from) + comment.suggestion + editorContent.slice(comment.to);
                            handleEditorChange(updated);
                            setHumanComments(prev => prev.map(c => c.id === id ? { ...c, status: 'accepted' } : c));
                            setLektoratHighlight({ from: comment.from, to: comment.from + comment.suggestion.length, id });
                        }}
                        onRejectComment={(id: string) => {
                            setHumanComments(prev => prev.map(c => c.id === id ? { ...c, status: 'rejected' } : c));
                        }}
                        onFocusComment={(id: string) => {
                            const comment = humanComments.find(c => c.id === id);
                            if (!comment) return;
                            setLektoratHighlight({ from: comment.from, to: comment.to, id });
                        }}
                    />
                        )}
                    </>
                )}
                
                {/* CSS Live Preview (embedded) - Settings are in sidebar */}
                {mainViewMode === 'preview-css' && (
                    <div className="embedded-preview-container">
                        <LayoutPreview 
                            key={`preview-${chapters.length}-${Object.keys(scenes).length}`}
                            embedded={true}
                            hideSettings={true}
                            chapters={chapters}
                            scenes={Object.entries(scenes).flatMap(([chapterId, sceneList]) => 
                                sceneList.map(s => ({ ...s, chapter_id: chapterId }))
                            )}
                            projectTitle={project?.title}
                            projectAuthor={project?.author}
                            onBack={() => setMainViewMode('editor')}
                            onExport={() => setShowExportFormatDialog(true)}
                        />
                    </div>
                )}
                
                {/* PDF Preview (embedded) - Settings are in sidebar */}
                {mainViewMode === 'preview-pdf' && (
                    <div className="embedded-preview-container">
                        <PreviewWindow 
                            embedded={true} 
                            hideSettings={true}
                            onBack={() => setMainViewMode('editor')}
                            onExport={() => setShowExportFormatDialog(true)}
                        />
                    </div>
                )}
                </div>
            </main>

            {/* Right Sidebar - Modern Tool Rail + Drawer */}
            {showRight && (
            <div className="right-sidebar-container">
                {/* Tool Drawer Panel */}
                <ToolDrawer
                    activeTool={activeTool}
                    isPinned={pinnedTool !== null}
                    onClose={() => setActiveTool(null)}
                    onPin={() => {
                        if (pinnedTool === activeTool) {
                            setPinnedTool(null);
                        } else {
                            setPinnedTool(activeTool);
                        }
                    }}
                >
                    {activeTool === 'info' && (
                      <>
                        <div className="tool-card">
                            <div className="tool-card-title">{t('info.project')}</div>
                            {project && (
                                <div className="tool-card-content">
                                    <div><strong>{t('info.title')}:</strong> {project.title}</div>
                                    <div><strong>{t('info.author')}:</strong> {project.author}</div>
                                    {project.short_name && <div><strong>{t('info.shortName')}:</strong> {project.short_name}</div>}
                                    {project.genre && <div><strong>{t('info.genre')}:</strong> {project.genre}</div>}
                                    {typeof project.target_pages === 'number' && <div><strong>{t('info.targetPages')}:</strong> {project.target_pages}</div>}
                                </div>
                            )}
                        </div>
                        <div className="tool-card">
                            <div className="tool-card-title">{t('info.scene')}</div>
                            <div className="tool-card-content">
                                <div><strong>{t('info.active')}:</strong> {activeSceneId ? activeSceneId : '—'}</div>
                                <div><strong>{t('info.words')}:</strong> {editorWordCount}</div>
                            </div>
                        </div>
                      </>
                    )}
                    {activeTool === 'editor' && (
                        <>
                        <div className="tool-card">
                            <div className="tool-card-title">{t('info.editor')}</div>
                            {editorSettings && (
                                <div className="editor-settings-grid">
                                    <label className="grid-label">
                                        <span>{t('info.fontFamily')}</span>
                                        <input value={editorSettings.font_family} onChange={(e) => setEditorSettings({ ...editorSettings, font_family: e.target.value })} />
                                    </label>
                                    <label className="grid-label">
                                        <span>{t('info.fontSize')}</span>
                                        <input type="number" min={10} max={48} value={editorSettings.font_size} onChange={(e) => setEditorSettings({ ...editorSettings, font_size: Number(e.target.value) })} />
                                    </label>
                                    <label className="grid-label">
                                        <span>{t('info.lineHeight')}</span>
                                        <input type="number" step={0.1} min={1.2} max={2} value={editorSettings.line_height} onChange={(e) => setEditorSettings({ ...editorSettings, line_height: Number(e.target.value) })} />
                                    </label>
                                    <button type="button" className="btn btn-sm btn-pill" onClick={() => handleSaveEditorSettings({})}>{t('info.saveSettings')}</button>
                                </div>
                            )}
                        </div>
                        
                        <div className="lt-settings-wrapper">
                            <LanguageToolSettings 
                                settings={ltSettings}
                                onChange={setLtSettings}
                            />
                        </div>
                        </>
                    )}
                    {activeTool === 'fontaine' && (
                        <FontainePanel
                          activeSceneId={activeSceneId}
                          sceneContent={editorContent}
                          projectTitle={project?.title}
                          characters={[]}
                          onInsert={(text) => {
                            if (!activeSceneId) return;
                            setEditorContent(prev => prev + (prev.endsWith('\n') ? '' : '\n') + text + '\n');
                            setIsDirty(true);
                          }}
                        />
                    )}
                    {activeTool === 'entities' && (
                        <EntitiesPanel 
                          sceneContent={editorContent}
                          manuscriptContent={editorContent} 
                        />
                    )}
                    {activeTool === 'plot' && (
                        <PlotTimeline 
                          chapters={chapters}
                          scenes={Object.values(scenes).flat().filter(Boolean) as Array<{id: string; title: string; chapter_id: string}>}
                          onSceneSelect={(sceneId) => {
                            // Find and select the scene
                            for (const [chapterId, sceneList] of Object.entries(scenes)) {
                              const scene = sceneList?.find(s => s.id === sceneId);
                              if (scene) {
                                setActiveChapterId(chapterId);
                                setActiveSceneId(sceneId);
                                break;
                              }
                            }
                          }}
                        />
                    )}
                    {activeTool === 'research' && (
                        <ResearchPanel 
                          onInsertText={(text) => {
                            if (!activeSceneId) return;
                            setEditorContent(prev => prev + (prev.endsWith('\n') ? '' : '\n') + text + '\n');
                            setIsDirty(true);
                          }}
                        />
                    )}
                                        {activeTool === 'human' && (
                                                <HumanReviewPanel
                                                    comments={humanComments}
                                                    baseContent={editorContent}
                                                    onAdd={(note, suggestion) => {
                                                        const sel = commentApiRef.current?.getSelection();
                                                        if (!sel || sel.text.trim().length === 0) return;
                                                        const id = crypto.randomUUID();
                                                        setHumanComments(prev => [...prev, { id, from: sel.from, to: sel.to, text: sel.text, note, suggestion, status: 'open' }]);
                                                        setLektoratHighlight({ from: sel.from, to: sel.to, id });
                                                    }}
                                                    onUpdate={(id, patch) => updateHumanComment(id, patch)}
                                                    onApply={(id) => {
                                                        const comment = humanComments.find(c => c.id === id);
                                                        if (!comment || !comment.suggestion) return;
                                                        const updated = editorContent.slice(0, comment.from) + comment.suggestion + editorContent.slice(comment.to);
                                                        handleEditorChange(updated);
                                                        updateHumanComment(id, { status: 'accepted' });
                                                        setLektoratHighlight({ from: comment.from, to: comment.from + comment.suggestion.length, id });
                                                    }}
                                                    onReject={(id) => updateHumanComment(id, { status: 'rejected' })}
                                                    onFocus={(id) => {
                                                        const comment = humanComments.find(c => c.id === id);
                                                        if (!comment) return;
                                                        setLektoratHighlight({ from: comment.from, to: comment.to, id });
                                                    }}
                                                />
                                        )}
                    {activeTool === 'stats' && (
                        <div className="tool-card">
                            <div className="tool-card-title">{t('stats.title')}</div>
                            <div className="tool-card-content">
                                <div>{t('stats.chapters')}: {chapters.length}</div>
                                <div>{t('stats.scenes')}: {Object.values(scenes).reduce((n, arr) => n + (arr?.length || 0), 0)}</div>
                                <div>{t('stats.currentSceneWords')}: {editorWordCount}</div>
                                <div className="muted-small mt-6">{t('stats.comingSoon')}</div>
                            </div>
                        </div>
                    )}
                    {activeTool === 'thesaurus' && (
                        <ThesaurusPanel
                          selectedWord={selectedWord}
                          editorLanguage={editorSettings?.editor_language || 'de'}
                          onReplace={(newWord) => {
                            toast.success(`"${selectedWord}" → "${newWord}"`);
                          }}
                        />
                    )}
                    {activeTool === 'shortcuts' && (
                        <ShortcutsHelp />
                    )}
                    {activeTool === 'proofreading' && (
                        <ProofreadingSettingsPanel
                          editorLanguage={editorSettings?.editor_language || 'de'}
                        />
                    )}
                    {activeTool === 'layout' && (
                        <LayoutEditor
                          projectTitle={project?.title}
                          projectAuthor={project?.author}
                                                    onOpenCssPreview={() => setMainViewMode('preview-css')}
                                                    onOpenPdfPreview={() => setMainViewMode('preview-pdf')}
                        />
                    )}
                </ToolDrawer>
                
                {/* Icon Rail */}
                <ToolRail
                    activeTool={activeTool}
                    pinnedTool={pinnedTool}
                    onToolClick={(id) => {
                        if (activeTool === id && !pinnedTool) {
                            setActiveTool(null);
                        } else {
                            setActiveTool(id);
                        }
                    }}
                    onToolPin={(id) => setPinnedTool(id)}
                />
            </div>
            )}

            <StatusBar 
              chapters={chapters} 
              scenes={scenes} 
              editorWordCount={editorWordCount} 
              isDirty={isDirty} 
              stats={wordStats}
              isSaving={isSaving}
              lastSaved={lastSaved}
              saveNow={saveNow}
            />

            {/* Global Modals - rendered in Editor view */}
            {showNewProjectModal && <NewProjectModal onClose={() => setShowNewProjectModal(false)} onProjectCreate={handleProjectCreated} />}
            {showExportModal && (
                <div className="modal-overlay">
                    <div className="modal-content export-import-modal">
                        <h2>{t('export.encrypted')}</h2>
                        <div className="modal-form">
                            <div className="form-field">
                                <label>{t('export.password')}</label>
                                <input type="password" value={exportPassword} onChange={e=>setExportPassword(e.target.value)} placeholder="••••••••" />
                            </div>
                            <div className="form-field">
                                <label>{t('export.targetFile')}</label>
                                <div className="input-with-button">
                                    <input value={exportPath} onChange={e=>setExportPath(e.target.value)} placeholder="/path/project.fwauthor" />
                                    <button className="browse-btn" onClick={async()=>{
                                        try {
                                            const suggested = exportPath || `${project?.title || 'project'}.fwauthor`;
                                            const path = await save({ title: t('export.targetFile'), defaultPath: suggested, filters: [{ name: 'Featherworks Project', extensions: ['fwauthor'] }] });
                                            if (path) setExportPath(path as string);
                                        } catch(e){ console.error('save dialog failed', e); }
                                    }}>{t('browse') || 'Browse'}</button>
                                </div>
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button className="btn-secondary" onClick={()=>{setShowExportModal(false); setExportPassword('');}}>{t('cancel')}</button>
                            <button className="btn-primary" disabled={!exportPassword || !exportPath} onClick={async ()=>{
                                try {
                                    await invoke('export_project_encrypted', { req: { password: exportPassword, out_path: exportPath } });
                                    toast.success(t('toast.exportSuccess'));
                                    setShowExportModal(false); setExportPassword('');
                                } catch(e){ toast.error(t('export.failed')); console.error(e); }
                            }}>{t('toolbar.export')}</button>
                        </div>
                    </div>
                </div>
            )}
            {showImportModal && (
                <div className="modal-overlay">
                    <div className="modal-content export-import-modal">
                        <h2>{t('import.encrypted')}</h2>
                        <div className="modal-form">
                            <div className="form-field">
                                <label>{t('import.containerFile')}</label>
                                <div className="input-with-button">
                                    <input value={importPath} onChange={e=>setImportPath(e.target.value)} placeholder="/path/project.fwauthor" />
                                    <button className="browse-btn" onClick={async()=>{
                                        try {
                                            const path = await open({ multiple: false, filters: [{ name: 'Featherworks Project', extensions: ['fwauthor'] }] });
                                            if (typeof path === 'string') setImportPath(path);
                                        } catch(e){ console.error('open dialog failed', e); }
                                    }}>{t('browse') || 'Browse'}</button>
                                </div>
                            </div>
                            <div className="form-field">
                                <label>{t('import.password')}</label>
                                <input type="password" value={importPassword} onChange={e=>setImportPassword(e.target.value)} placeholder="••••••••" />
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button className="btn-secondary" onClick={()=>{ setShowImportModal(false); setImportPassword(''); }}>{t('cancel')}</button>
                            <button className="btn-primary" disabled={!importPath || !importPassword} onClick={async ()=>{
                                try {
                                    const proj: Project = await invoke('import_encrypted_project', { req: { path: importPath, password: importPassword } });
                                    toast.success(t('toast.importSuccess', { title: proj.title }));
                                    setShowImportModal(false); setImportPassword('');
                                    await refetchAll(proj.id);
                                } catch(e){ toast.error(t('toast.importFailed')); console.error(e); }
                            }}>{t('toolbar.import')}</button>
                        </div>
                    </div>
                </div>
            )}
            {showBugReportModal && (
                <BugReportModal 
                    isOpen={showBugReportModal} 
                    onClose={() => setShowBugReportModal(false)} 
                    initialCategory={bugReportCategory}
                />
            )}
            {/* Export Format Dialog */}
            <ExportFormatDialog
                isOpen={showExportFormatDialog}
                onClose={() => setShowExportFormatDialog(false)}
                projectTitle={project?.title}
                projectAuthor={project?.author}
            />
        </div>
    );
}

// Robust ErrorBoundary (class-based) to actually catch render errors
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
    componentDidCatch(error: any, info: any) {
        console.error('[ErrorBoundary] Caught render error', error, info);
        // Mirror into window fallback box if present
        try {
            const root = document.getElementById('root');
            if (root) {
                let box = document.getElementById('fw-fallback');
                if (!box) { box = document.createElement('div'); box.id = 'fw-fallback'; box.className='fw-fallback'; root.appendChild(box); }
                box.innerHTML = '<strong>Renderer Fehler (Boundary)</strong><br>' + (error?.message || error);
            }
        } catch {}
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="error-fallback">
                    <h2>Fehler im Renderer</h2>
                    <pre className="mono-pre">{String(this.state.error?.message || this.state.error)}</pre>
                    <button onClick={() => window.location.reload()}>Neu laden</button>
                </div>
            );
        }
        return this.props.children;
    }
}

const container = document.getElementById('root');
if (container) {
    // Check if this is the preview window (hash route)
    const isPreviewRoute = window.location.hash === '#/preview';
    const isPdfPreviewRoute = window.location.hash === '#/preview-pdf';
    const root = createRoot(container);
    if (isPreviewRoute) {
        // CSS-based live preview (fast, instant updates)
        root.render(<LayoutPreview />);
    } else if (isPdfPreviewRoute) {
        // PDF-based preview (exact, but slower)
        root.render(<PreviewWindow />);
    } else {
        root.render(<ErrorBoundary><App /></ErrorBoundary>);
    }
} else {
    console.error('[FW] #root not found');
}
