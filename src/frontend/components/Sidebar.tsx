import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Chapter {
  id: string;
  title: string;
  order: number;
}

interface Scene {
  id: string;
  title: string;
  order: number;
  chapter_id: string;
  word_count?: number;
  status?: SceneStatus;
  color?: SceneColor;
  pov?: string; // Point of View Charakter
}

// Szenen-Status für den Schreibprozess
export type SceneStatus = 'draft' | 'revised' | 'edited' | 'final';
export type SceneColor = 'none' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';

// Status labels are now i18n keys - use t('scene.status.XXX') in components
export const SCENE_STATUS_KEYS: Record<SceneStatus, string> = {
  draft: 'scene.status.draft',
  revised: 'scene.status.revision', 
  edited: 'scene.status.done',
  final: 'scene.status.done'
};

export const SCENE_STATUS_ICONS: Record<SceneStatus, string> = {
  draft: '📝',
  revised: '✍️',
  edited: '✅',
  final: '🎯'
};

export const SCENE_COLORS: Record<SceneColor, string> = {
  none: 'transparent',
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7'
};

// Konfigurationsobjekte für Status und Farbe - Labels sind jetzt i18n keys
const STATUS_CONFIG: Record<SceneStatus, { labelKey: string; color: string; icon: string }> = {
  draft: { labelKey: 'scene.status.draft', color: '#888', icon: '📝' },
  revised: { labelKey: 'scene.status.revision', color: '#f59e0b', icon: '✍️' },
  edited: { labelKey: 'scene.status.done', color: '#22c55e', icon: '✅' },
  final: { labelKey: 'scene.status.done', color: '#3b82f6', icon: '🎯' }
};

const COLOR_CONFIG: Record<SceneColor, { labelKey: string; value: string }> = {
  none: { labelKey: 'color.none', value: 'transparent' },
  red: { labelKey: 'color.red', value: '#ef4444' },
  orange: { labelKey: 'color.orange', value: '#f97316' },
  yellow: { labelKey: 'color.yellow', value: '#eab308' },
  green: { labelKey: 'color.green', value: '#22c55e' },
  blue: { labelKey: 'color.blue', value: '#3b82f6' },
  purple: { labelKey: 'color.purple', value: '#a855f7' }
};

// StatusMenu Komponente
const StatusMenu: React.FC<{
  x: number;
  y: number;
  currentStatus?: SceneStatus;
  currentColor?: SceneColor;
  currentPov?: string;
  onStatusChange: (status: SceneStatus) => void;
  onColorChange: (color: SceneColor) => void;
  onPovChange: (pov: string) => void;
  onClose: () => void;
}> = ({ x, y, currentStatus, currentColor, currentPov, onStatusChange, onColorChange, onPovChange, onClose }) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [povInput, setPovInput] = useState(currentPov || '');
  
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);
  
  useLayoutEffect(() => {
    if (menuRef.current) {
      menuRef.current.style.left = `${x}px`;
      menuRef.current.style.top = `${y}px`;
    }
  }, [x, y]);

  return (
    <div 
      ref={menuRef}
      className="status-menu"
    >
      <div className="status-menu-section">
        <span className="status-menu-label">{t('scene.changeStatus')}</span>
        <div className="status-menu-buttons">
          {(Object.keys(STATUS_CONFIG) as SceneStatus[]).map(status => (
            <button
              key={status}
              className={`status-btn ${currentStatus === status ? 'active' : ''}`}
              onClick={() => onStatusChange(status)}
              title={t(STATUS_CONFIG[status].labelKey)}
            >
              {STATUS_CONFIG[status].icon}
            </button>
          ))}
        </div>
      </div>
      <div className="status-menu-section">
        <span className="status-menu-label">{t('scene.color')}</span>
        <div className="status-menu-colors">
          {(Object.keys(COLOR_CONFIG) as SceneColor[]).map(color => (
            <button
              key={color}
              className={`color-btn ${currentColor === color ? 'active' : ''}`}
              onClick={() => onColorChange(color)}
              title={t(COLOR_CONFIG[color].labelKey)}
            >
              <span 
                className={`color-swatch color-${color}`}
                data-color={color}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="status-menu-section">
        <span className="status-menu-label">{t('scene.pov')}</span>
        <div className="status-menu-pov">
          <input
            type="text"
            className="pov-input"
            placeholder={t('scene.povPlaceholder')}
            value={povInput}
            onChange={(e) => setPovInput(e.target.value)}
            onBlur={() => onPovChange(povInput)}
            onKeyDown={(e) => e.key === 'Enter' && onPovChange(povInput)}
          />
        </div>
      </div>
    </div>
  );
};

interface SortableChapterProps {
  chapter: Chapter;
  isActive: boolean;
  isEditing: boolean;
  tempTitle: string;
  scenes: Scene[];
  activeSceneId: string | null;
  onSelect: () => void;
  onStartEdit: () => void;
  onTitleChange: (v: string) => void;
  onFinishEdit: () => void;
  onSelectScene: (id: string) => void;
  onEditScene: (id: string, title: string) => void;
  onCreateScene: () => void;
  editingScene: string | null;
  setEditingScene: (id: string | null) => void;
  sceneTempTitle: string;
  setSceneTempTitle: (v: string) => void;
  onFinishSceneEdit: (id: string) => void;
  onSceneStatusChange?: (sceneId: string, status: SceneStatus) => void;
  onSceneColorChange?: (sceneId: string, color: SceneColor) => void;
  onScenePovChange?: (sceneId: string, pov: string) => void;
}

const SortableChapter: React.FC<SortableChapterProps> = ({
  chapter, isActive, isEditing, tempTitle, scenes, activeSceneId,
  onSelect, onStartEdit, onTitleChange, onFinishEdit, onSelectScene,
  onEditScene, onCreateScene, editingScene, setEditingScene,
  sceneTempTitle, setSceneTempTitle, onFinishSceneEdit,
  onSceneStatusChange, onSceneColorChange, onScenePovChange
}) => {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: chapter.id });
  const liRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (liRef.current) {
      liRef.current.style.transform = CSS.Transform.toString(transform) || '';
      liRef.current.style.transition = transition || '';
    }
  }, [transform, transition]);

  return (
    <li
      ref={(node) => { setNodeRef(node); (liRef as any).current = node; }}
      className={`sidebar-chapter-item ${isDragging ? 'dragging' : ''}`}
    >
      <div className="sidebar-chunk">
        {isEditing ? (
          <>
            <input
              aria-label={t('renameChapter')}
              placeholder={t('scene.newTitle')}
              value={tempTitle}
              onChange={e => onTitleChange(e.target.value)}
              onBlur={onFinishEdit}
              onKeyDown={e => e.key === 'Enter' && onFinishEdit()}
              autoFocus
            />
            <button type="button" className="btn btn-sm" onClick={onFinishEdit}>OK</button>
          </>
        ) : (
          <>
            <span className="drag-handle" {...attributes} {...listeners} title={t('scene.rename')}>⋮⋮</span>
            <button
              className={`sidebar-chapter${isActive ? ' active' : ''}`}
              onClick={onSelect}
            >
              {chapter.title}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onStartEdit} title={t('scene.rename')}>✎</button>
          </>
        )}
      </div>
      <SortableContext items={scenes.map(s => s.id)} strategy={verticalListSortingStrategy}>
        <ul className="sidebar-scene-list">
          {scenes.map(sc => (
            <SortableScene
              key={sc.id}
              scene={sc}
              isActive={activeSceneId === sc.id}
              isEditing={editingScene === sc.id}
              tempTitle={sceneTempTitle}
              onSelect={() => onSelectScene(sc.id)}
              onStartEdit={() => { setEditingScene(sc.id); setSceneTempTitle(sc.title); }}
              onTitleChange={setSceneTempTitle}
              onFinishEdit={() => onFinishSceneEdit(sc.id)}
              onStatusChange={onSceneStatusChange}
              onColorChange={onSceneColorChange}
              onPovChange={onScenePovChange}
            />
          ))}
          <li className="sidebar-scene-row">
            <button type="button" className="btn btn-ghost btn-sm add-scene-btn" onClick={onCreateScene} title={t('newScene')}>+ {t('scenes')}</button>
          </li>
        </ul>
      </SortableContext>
    </li>
  );
};

interface SortableSceneProps {
  scene: Scene;
  isActive: boolean;
  isEditing: boolean;
  tempTitle: string;
  onSelect: () => void;
  onStartEdit: () => void;
  onTitleChange: (v: string) => void;
  onFinishEdit: () => void;
  onStatusChange?: (sceneId: string, status: SceneStatus) => void;
  onColorChange?: (sceneId: string, color: SceneColor) => void;
  onPovChange?: (sceneId: string, pov: string) => void;
}

// Tooltip für Szenen-Info
const SceneTooltip: React.FC<{ scene: Scene; visible: boolean; x: number; y: number }> = ({ scene, visible, x, y }) => {
  const { t } = useTranslation();
  const tipRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (tipRef.current && visible) {
      tipRef.current.style.position = 'fixed';
      tipRef.current.style.left = `${x + 10}px`;
      tipRef.current.style.top = `${y - 10}px`;
      tipRef.current.style.zIndex = '1000';
    }
  }, [x, y, visible]);
  
  if (!visible) return null;
  
  const wordCount = scene.word_count || 0;
  const charCount = wordCount * 5; // Schätzung: ~5 Zeichen pro Wort
  const readingTime = Math.ceil(wordCount / 200); // ~200 Wörter/Minute
  const statusKey = scene.status ? SCENE_STATUS_KEYS[scene.status] : 'scene.status.draft';
  const statusIcon = scene.status ? SCENE_STATUS_ICONS[scene.status] : '📝';
  
  return (
    <div 
      className="scene-tooltip"
      ref={tipRef}
    >
      <div className="scene-tooltip-title">{scene.title}</div>
      <div className="scene-tooltip-stats">
        <div><span className="stat-label">{t('operator.status')}:</span> <span className="stat-value">{statusIcon} {t(statusKey)}</span></div>
        <div><span className="stat-label">{t('status.words')}:</span> <span className="stat-value">{wordCount.toLocaleString()}</span></div>
        <div><span className="stat-label">{t('status.chars')}:</span> <span className="stat-value">~{charCount.toLocaleString()}</span></div>
        <div><span className="stat-label">{t('status.readingTime')}:</span> <span className="stat-value">{readingTime}</span></div>
      </div>
    </div>
  );
};

// Kontext-Menü für Szenen-Status
const SceneContextMenu: React.FC<{
  visible: boolean;
  x: number;
  y: number;
  scene: Scene;
  onStatusChange: (status: SceneStatus) => void;
  onColorChange: (color: SceneColor) => void;
  onClose: () => void;
}> = ({ visible, x, y, scene, onStatusChange, onColorChange, onClose }) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!visible) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    setTimeout(() => document.addEventListener('click', handleClickOutside), 10);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [visible, onClose]);
  
  if (!visible) return null;
  useLayoutEffect(() => {
    if (menuRef.current) {
      menuRef.current.style.position = 'fixed';
      menuRef.current.style.left = `${x}px`;
      menuRef.current.style.top = `${y}px`;
      menuRef.current.style.zIndex = '1001';
    }
  }, [x, y]);
  
  return (
    <div 
      ref={menuRef}
      className="scene-context-menu"
    >
      <div className="context-menu-section">
        <div className="context-menu-label">{t('operator.status')}</div>
        {(Object.keys(SCENE_STATUS_KEYS) as SceneStatus[]).map(status => (
          <button
            key={status}
            className={`context-menu-item ${scene.status === status ? 'active' : ''}`}
            onClick={() => { onStatusChange(status); onClose(); }}
          >
            {SCENE_STATUS_ICONS[status]} {t(SCENE_STATUS_KEYS[status])}
          </button>
        ))}
      </div>
      <div className="context-menu-divider" />
      <div className="context-menu-section">
        <div className="context-menu-label">{t('scene.changeStatus')}</div>
        <div className="color-picker-row">
          {(Object.keys(SCENE_COLORS) as SceneColor[]).map(color => (
            <button
              key={color}
              className={`color-dot ${scene.color === color ? 'active' : ''}`}
              data-color={color}
              onClick={() => { onColorChange(color); onClose(); }}
              title={color === 'none' ? t('scene.noScene') : color}
              type="button"
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const SortableScene: React.FC<SortableSceneProps> = ({
  scene, isActive, isEditing, tempTitle, onSelect, onStartEdit, onTitleChange, onFinishEdit,
  onStatusChange, onColorChange, onPovChange
}) => {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id });
  const liRef = useRef<HTMLLIElement>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const hoverTimeoutRef = useRef<number | null>(null);
  
  // Rechtsklick für Kontextmenü
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setShowStatusMenu(true);
  };

  useEffect(() => {
    if (liRef.current) {
      liRef.current.style.transform = CSS.Transform.toString(transform) || '';
      liRef.current.style.transition = transition || '';
    }
  }, [transform, transition]);
  
  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setTooltipPos({ x: rect.right, y: rect.top });
    // Verzögerung bevor Tooltip erscheint
    hoverTimeoutRef.current = window.setTimeout(() => {
      setShowTooltip(true);
    }, 400);
  };
  
  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setShowTooltip(false);
  };

  return (
    <li
      ref={(node) => { setNodeRef(node); (liRef as any).current = node; }}
      className={`sidebar-scene-row ${isDragging ? 'dragging' : ''}`}
    >
      {isEditing ? (
        <>
          <input
            aria-label={t('renameScene')}
            placeholder={t('scene.newTitle')}
            value={tempTitle}
            onChange={e => onTitleChange(e.target.value)}
            onBlur={onFinishEdit}
            onKeyDown={e => e.key === 'Enter' && onFinishEdit()}
            autoFocus
          />
          <button type="button" className="btn btn-sm" onClick={onFinishEdit}>OK</button>
        </>
      ) : (
        <>
          {/* Farbindikator */}
          {scene.color && scene.color !== 'none' && (
            <span 
              className={`scene-color-dot color-${scene.color}`} 
              data-color={scene.color}
              title={t(COLOR_CONFIG[scene.color]?.labelKey || 'color.none')}
            />
          )}
          <span className="drag-handle scene-handle" {...attributes} {...listeners} title={t('scene.rename')}>⋮</span>
          <button
            className={`sidebar-scene${isActive ? ' active' : ''}`}
            onClick={onSelect}
            onContextMenu={handleContextMenu}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {scene.title}
            {/* POV-Badge */}
            {scene.pov && (
              <span className="scene-pov-badge" title={`POV: ${scene.pov}`}>
                {scene.pov}
              </span>
            )}
            {/* Status-Badge */}
            {scene.status && scene.status !== 'draft' && (
              <span 
                className={`scene-status-badge status-${scene.status}`}
                data-status={scene.status}
                title={t(STATUS_CONFIG[scene.status]?.labelKey || 'scene.status.draft')}
              >
                {scene.status === 'revised' ? '✓' : scene.status === 'final' ? '✓✓' : ''}
              </span>
            )}
            {scene.word_count !== undefined && scene.word_count > 0 && (
              <span className="scene-word-badge">{scene.word_count}</span>
            )}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onStartEdit} title={t('scene.rename')}>✎</button>
          <SceneTooltip scene={scene} visible={showTooltip} x={tooltipPos.x} y={tooltipPos.y} />
          {showStatusMenu && (
            <StatusMenu
              x={menuPos.x}
              y={menuPos.y}
              currentStatus={scene.status}
              currentColor={scene.color}
              currentPov={scene.pov}
              onStatusChange={(status: SceneStatus) => {
                onStatusChange?.(scene.id, status);
                setShowStatusMenu(false);
              }}
              onColorChange={(color: SceneColor) => {
                onColorChange?.(scene.id, color);
                setShowStatusMenu(false);
              }}
              onPovChange={(pov: string) => {
                onPovChange?.(scene.id, pov);
                setShowStatusMenu(false);
              }}
              onClose={() => setShowStatusMenu(false)}
            />
          )}
        </>
      )}
    </li>
  );
};

export const Sidebar: React.FC<{
  chapters: Chapter[];
  scenes: Record<string, Scene[]>;
  activeChapterId: string | null;
  activeSceneId: string | null;
  onSelectChapter: (id: string) => void;
  onSelectScene: (id: string) => void;
  onCreateChapter: () => void;
  onCreateScene: (chapterId: string) => void;
  onRenameChapter: (chapterId: string, newTitle: string) => void;
  onRenameScene: (sceneId: string, newTitle: string) => void;
  onReorderChapters?: (orderedIds: string[]) => void;
  onReorderScenes?: (chapterId: string, orderedIds: string[]) => void;
  onSceneStatusChange?: (sceneId: string, status: SceneStatus) => void;
  onSceneColorChange?: (sceneId: string, color: SceneColor) => void;
  onScenePovChange?: (sceneId: string, pov: string) => void;
}> = ({
  chapters, scenes, activeChapterId, activeSceneId,
  onSelectChapter, onSelectScene, onCreateChapter, onCreateScene,
  onRenameChapter, onRenameScene, onReorderChapters, onReorderScenes,
  onSceneStatusChange, onSceneColorChange, onScenePovChange
}) => {
  const { t } = useTranslation();
  const [editingChapter, setEditingChapter] = useState<string | null>(null);
  const [editingScene, setEditingScene] = useState<string | null>(null);
  const [tempTitle, setTempTitle] = useState('');
  const [sceneTempTitle, setSceneTempTitle] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    // Check if it's a chapter drag
    const chapterIds = chapters.map(c => c.id);
    if (chapterIds.includes(active.id as string) && chapterIds.includes(over.id as string)) {
      const oldIndex = chapterIds.indexOf(active.id as string);
      const newIndex = chapterIds.indexOf(over.id as string);
      const newOrder = arrayMove(chapterIds, oldIndex, newIndex);
      onReorderChapters?.(newOrder);
      return;
    }

    // Check if it's a scene drag within same chapter
    for (const [chapterId, chapterScenes] of Object.entries(scenes)) {
      const sceneIds = chapterScenes.map(s => s.id);
      if (sceneIds.includes(active.id as string)) {
        if (sceneIds.includes(over.id as string)) {
          const oldIndex = sceneIds.indexOf(active.id as string);
          const newIndex = sceneIds.indexOf(over.id as string);
          const newOrder = arrayMove(sceneIds, oldIndex, newIndex);
          onReorderScenes?.(chapterId, newOrder);
        }
        return;
      }
    }
  };

  return (
    <aside className="sidebar-left" aria-label={t('sidebar.chaptersAndScenes')}>
      <div className="sidebar-header">
        <div className="sidebar-title">{t('chapters')}</div>
        <button type="button" className="btn btn-sm" onClick={onCreateChapter} aria-label={t('newChapter')}>+</button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={chapters.map(c => c.id)} strategy={verticalListSortingStrategy}>
          <ul className="sidebar-list">
            {chapters.map(ch => (
              <SortableChapter
                key={ch.id}
                chapter={ch}
                isActive={activeChapterId === ch.id}
                isEditing={editingChapter === ch.id}
                tempTitle={tempTitle}
                scenes={scenes[ch.id] || []}
                activeSceneId={activeSceneId}
                onSelect={() => onSelectChapter(ch.id)}
                onStartEdit={() => { setEditingChapter(ch.id); setTempTitle(ch.title); }}
                onTitleChange={setTempTitle}
                onFinishEdit={() => { setEditingChapter(null); onRenameChapter(ch.id, tempTitle); }}
                onSelectScene={onSelectScene}
                onEditScene={(id, title) => { setEditingScene(id); setSceneTempTitle(title); }}
                onCreateScene={() => onCreateScene(ch.id)}
                editingScene={editingScene}
                setEditingScene={setEditingScene}
                sceneTempTitle={sceneTempTitle}
                setSceneTempTitle={setSceneTempTitle}
                onFinishSceneEdit={(id) => { setEditingScene(null); onRenameScene(id, sceneTempTitle); }}
                onSceneStatusChange={onSceneStatusChange}
                onSceneColorChange={onSceneColorChange}
                onScenePovChange={onScenePovChange}
              />
            ))}
          </ul>
        </SortableContext>
        <DragOverlay>
          {activeId ? (
            <div className="drag-overlay-item">
              {chapters.find(c => c.id === activeId)?.title ||
                Object.values(scenes).flat().find(s => s.id === activeId)?.title || '...'}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </aside>
  );
};
