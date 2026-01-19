import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { Toaster, toast } from 'sonner';
import './styles/design-system.css';

// --- Types ---
interface Project {
    id: string;
    title: string;
    chapters: Chapter[];
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
}

interface EditorSettings {
    font_family: string;
    font_size: number;
    line_height: number;
}

type AppView = 'welcome' | 'editor';
type ScenesByChapter = Record<string, Scene[]>;

// --- Components ---

const WelcomeView = ({ onOpenProject }: { onOpenProject: () => void }) => (
    <div className="welcome-container">
        <h1>Featherworks Author</h1>
        <div className="welcome-actions">
            <button onClick={onOpenProject}>Projekt öffnen</button>
            <button onClick={() => toast.info("Noch nicht implementiert.")}>Neues Projekt</button>
        </div>
    </div>
);

const Editor = ({ content, wordCount, settings, isDirty, onContentChange }: { content: string; wordCount: number; settings: EditorSettings | null; isDirty: boolean; onContentChange: (newContent: string) => void; }) => {
    if (!settings) return <div className="editor-placeholder">Editor-Einstellungen werden geladen...</div>;
    const taRef = useRef<HTMLTextAreaElement|null>(null);
    React.useEffect(()=>{
        if(!taRef.current) return;
        const el = taRef.current;
        el.style.fontFamily = settings.font_family;
        el.style.fontSize = `${settings.font_size}px`;
        el.style.lineHeight = String(settings.line_height);
    },[settings]);

    return (
        <div className="editor-wrapper">
            <textarea
                ref={taRef}
                className="editor-textarea"
                value={content}
                onChange={(e) => onContentChange(e.target.value)}
                placeholder="Beginnen Sie zu schreiben..."
            />
            <div className="editor-statusbar">
                <span>Wörter: {wordCount}</span>
                {isDirty && <span className="dirty-indicator"> (Wird gespeichert...)</span>}
            </div>
        </div>
    );
};

// --- Main App Component ---
function App() {
    const [view, setView] = useState<AppView>('welcome');
    const [project, setProject] = useState<Project | null>(null);
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [scenes, setScenes] = useState<ScenesByChapter>({});
    const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
    const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
    const [editorContent, setEditorContent] = useState('');
    const [editorWordCount, setEditorWordCount] = useState(0);
    const [isDirty, setIsDirty] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [editorSettings, setEditorSettings] = useState<EditorSettings | null>(null);

    const saveTimeoutRef = useRef<number | null>(null);

    const saveNow = useCallback(() => {
        if (!isDirty || !activeSceneId) return;

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        invoke("update_scene_content", { id: activeSceneId, content: editorContent, wordCount: editorWordCount })
            .then(() => {
                setIsDirty(false);
                toast.success("Gespeichert!");
                setScenes(prev => {
                    const newScenes = { ...prev };
                    if (activeChapterId && newScenes[activeChapterId]) {
                        const sceneIdx = newScenes[activeChapterId].findIndex(s => s.id === activeSceneId);
                        if (sceneIdx !== -1) {
                            newScenes[activeChapterId][sceneIdx].word_count = editorWordCount;
                        }
                    }
                    return newScenes;
                });
            })
            .catch(e => {
                console.error("Save failed", e);
                toast.error("Automatisches Speichern fehlgeschlagen.");
            });
    }, [isDirty, activeSceneId, activeChapterId, editorContent, editorWordCount]);

    const loadSceneContent = useCallback(async (sceneId: string) => {
        if (isDirty) saveNow();
        setIsLoading(true);
        try {
            const [content, wordCount]: [string, number] = await invoke("get_scene_content", { id: sceneId });
            setEditorContent(content);
            setEditorWordCount(wordCount);
            setActiveSceneId(sceneId);
            setIsDirty(false);
        } catch (e) {
            toast.error("Szeneninhalt konnte nicht geladen werden.");
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, [isDirty, saveNow]);

    const refetchAll = useCallback(async (projectId: string, targetChapterId?: string | null, targetSceneId?: string | null) => {
        setIsLoading(true);
        console.log(`[refetchAll] project=${projectId} chapter=${targetChapterId} scene=${targetSceneId}`);
        try {
            const proj: Project = await invoke("get_project");
            const sortedChapters = (proj.chapters || []).sort((a, b) => a.order - b.order);
            setProject(proj);
            setChapters(sortedChapters);

            const scenesByChapter: ScenesByChapter = {};
            for (const chapter of sortedChapters) {
                scenesByChapter[chapter.id] = await invoke("list_scenes", { chapterId: chapter.id });
            }
            setScenes(scenesByChapter);

            const finalChapterId = targetChapterId || sortedChapters[0]?.id || null;
            setActiveChapterId(finalChapterId);

            const finalSceneId = targetSceneId || (finalChapterId ? scenesByChapter[finalChapterId]?.[0]?.id : null);
            if (finalSceneId) {
                await loadSceneContent(finalSceneId);
            } else {
                setEditorContent('');
                setEditorWordCount(0);
                setActiveSceneId(null);
            }
            setView('editor');
        } catch (e) {
            toast.error("Projekt konnte nicht geladen werden.");
            console.error(e);
            setView('welcome');
        } finally {
            setIsLoading(false);
        }
    }, [loadSceneContent]);

    const handleOpenProject = useCallback(async () => {
        try {
            const path: string | null = await invoke("open_project_dialog");
            if (path) {
                setIsLoading(true);
                const proj: Project = await invoke("open_project", { path });
                await refetchAll(proj.id);
            }
        } catch (e) {
            toast.error(`Projekt konnte nicht geöffnet werden: ${e}`);
            setIsLoading(false);
        }
    }, [refetchAll]);

    const handleCreateScene = async (chapterId: string) => {
        if (!project) return;
        try {
            const newScene: Scene = await invoke("create_scene", { req: { chapter_id: chapterId, title: "Neue Szene" } });
            toast.success(`Szene "${newScene.title}" wurde erstellt.`);
            await refetchAll(project.id, chapterId, newScene.id);
        } catch (e) {
            toast.error(`Szene konnte nicht erstellt werden: ${e}`);
            console.error(e);
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

    useEffect(() => {
        invoke("load_settings").then(s => setEditorSettings(s as EditorSettings)).catch(console.error);
        const unlisten = listen('menu:open', handleOpenProject);
        return () => { unlisten.then(f => f()); };
    }, [handleOpenProject]);

    if (view === 'welcome' || !project) {
        return (
            <>
                <Toaster position="bottom-right" />
                <WelcomeView onOpenProject={handleOpenProject} />
                {isLoading && <div className="loading-overlay-global"><div className="spinner"></div></div>}
            </>
        );
    }

    return (
        <div className="app-shell">
            <Toaster position="bottom-right" />
            {isLoading && <div className="loading-overlay-global"><div className="spinner"></div></div>}
            <div className="sidebar">
                <div className="project-title">{project.title}</div>
                <div className="sidebar-actions"><button>Kapitel +</button></div>
                <div className="chapter-list">
                    {chapters.map(chapter => (
                        <div key={chapter.id} className={`chapter-item ${activeChapterId === chapter.id ? 'active' : ''}`}>
                            <div className="chapter-header" onClick={() => handleChapterClick(chapter.id)}>
                                <span>{chapter.title}</span>
                                <button className="add-scene-btn" onClick={(e) => { e.stopPropagation(); handleCreateScene(chapter.id); }}>+</button>
                            </div>
                            {activeChapterId === chapter.id && (
                                <div className="scene-list">
                                    {(scenes[chapter.id] || []).sort((a, b) => a.order - b.order).map(scene => (
                                        <div key={scene.id} onClick={() => loadSceneContent(scene.id)} className={`scene-item ${activeSceneId === scene.id ? 'active' : ''}`}>
                                            <span>{scene.title}</span>
                                            <span className="word-count">{scene.word_count}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                <div className="sidebar-footer">
                    <button onClick={() => project && refetchAll(project.id, activeChapterId, activeSceneId)}>Force Refetch</button>
                </div>
            </div>
            <div className="main-content">
                <Editor
                    content={editorContent}
                    wordCount={editorWordCount}
                    settings={editorSettings}
                    isDirty={isDirty}
                    onContentChange={handleEditorChange}
                />
            </div>
        </div>
    );
}

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<App />);
}
