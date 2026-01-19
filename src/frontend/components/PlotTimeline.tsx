import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/tauri';

// ============================================================================
// Types
// ============================================================================

interface Subplot {
  id: string;
  name: string;
  description: string;
  color: string;
  isMain: boolean;
  orderNum: number;
}

interface PlotPoint {
  id: string;
  subplotId: string | null;
  title: string;
  description: string;
  structurePosition: string | null;
  positionPercent: number;
  status: 'planned' | 'in-progress' | 'completed';
  orderNum: number;
  linkedSceneIds: string[];
}

interface Scene {
  id: string;
  title: string;
  chapter_id: string;
}

interface Chapter {
  id: string;
  title: string;
  order: number;
}

// Structure templates (predefined story structures)
const STRUCTURE_TEMPLATES = {
  'three-act': {
    name: '3-Akt-Struktur',
    nameEn: 'Three-Act Structure',
    markers: [
      { id: 'setup', name: 'Exposition', nameEn: 'Setup', percent: 0 },
      { id: 'inciting', name: 'Auslösendes Ereignis', nameEn: 'Inciting Incident', percent: 12 },
      { id: 'plot1', name: 'Plot Point 1', nameEn: 'Plot Point 1', percent: 25 },
      { id: 'midpoint', name: 'Midpoint', nameEn: 'Midpoint', percent: 50 },
      { id: 'plot2', name: 'Plot Point 2', nameEn: 'Plot Point 2', percent: 75 },
      { id: 'climax', name: 'Klimax', nameEn: 'Climax', percent: 90 },
      { id: 'resolution', name: 'Auflösung', nameEn: 'Resolution', percent: 100 },
    ]
  },
  'heros-journey': {
    name: 'Heldenreise',
    nameEn: "Hero's Journey",
    markers: [
      { id: 'ordinary', name: 'Gewöhnliche Welt', nameEn: 'Ordinary World', percent: 0 },
      { id: 'call', name: 'Ruf des Abenteuers', nameEn: 'Call to Adventure', percent: 10 },
      { id: 'refusal', name: 'Weigerung', nameEn: 'Refusal of Call', percent: 15 },
      { id: 'mentor', name: 'Begegnung mit Mentor', nameEn: 'Meeting Mentor', percent: 20 },
      { id: 'threshold', name: 'Überschreiten der Schwelle', nameEn: 'Crossing Threshold', percent: 25 },
      { id: 'tests', name: 'Prüfungen', nameEn: 'Tests & Allies', percent: 40 },
      { id: 'cave', name: 'Tiefste Höhle', nameEn: 'Innermost Cave', percent: 50 },
      { id: 'ordeal', name: 'Entscheidende Prüfung', nameEn: 'Ordeal', percent: 60 },
      { id: 'reward', name: 'Belohnung', nameEn: 'Reward', percent: 70 },
      { id: 'road', name: 'Rückweg', nameEn: 'Road Back', percent: 80 },
      { id: 'resurrection', name: 'Auferstehung', nameEn: 'Resurrection', percent: 90 },
      { id: 'elixir', name: 'Rückkehr mit Elixier', nameEn: 'Return with Elixir', percent: 100 },
    ]
  },
  'save-the-cat': {
    name: 'Save the Cat',
    nameEn: 'Save the Cat',
    markers: [
      { id: 'opening', name: 'Eröffnungsbild', nameEn: 'Opening Image', percent: 0 },
      { id: 'theme', name: 'Thema angedeutet', nameEn: 'Theme Stated', percent: 5 },
      { id: 'setup', name: 'Set-Up', nameEn: 'Set-Up', percent: 10 },
      { id: 'catalyst', name: 'Katalysator', nameEn: 'Catalyst', percent: 12 },
      { id: 'debate', name: 'Debatte', nameEn: 'Debate', percent: 17 },
      { id: 'break1', name: 'Break into Two', nameEn: 'Break into Two', percent: 25 },
      { id: 'bstory', name: 'B-Story', nameEn: 'B-Story', percent: 30 },
      { id: 'fun', name: 'Fun & Games', nameEn: 'Fun & Games', percent: 40 },
      { id: 'midpoint', name: 'Midpoint', nameEn: 'Midpoint', percent: 50 },
      { id: 'bad', name: 'Bad Guys Close In', nameEn: 'Bad Guys Close In', percent: 60 },
      { id: 'allislost', name: 'All Is Lost', nameEn: 'All Is Lost', percent: 75 },
      { id: 'soul', name: 'Dark Night of Soul', nameEn: 'Dark Night of Soul', percent: 80 },
      { id: 'break2', name: 'Break into Three', nameEn: 'Break into Three', percent: 85 },
      { id: 'finale', name: 'Finale', nameEn: 'Finale', percent: 95 },
      { id: 'final', name: 'Schlussbild', nameEn: 'Final Image', percent: 100 },
    ]
  },
  'none': {
    name: 'Keine Vorlage',
    nameEn: 'No Template',
    markers: []
  }
};

interface PlotTimelineProps {
  chapters?: Chapter[];
  scenes?: Scene[];
  onSceneSelect?: (sceneId: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export const PlotTimeline: React.FC<PlotTimelineProps> = ({ chapters = [], scenes = [], onSceneSelect }) => {
  const { t, i18n } = useTranslation();
  const isGerman = i18n.language === 'de';
  
  // State
  const [subplots, setSubplots] = useState<Subplot[]>([]);
  const [plotPoints, setPlotPoints] = useState<PlotPoint[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<keyof typeof STRUCTURE_TEMPLATES>('three-act');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'timeline' | 'list'>('timeline');
  
  // Edit states
  const [editingPoint, setEditingPoint] = useState<PlotPoint | null>(null);
  const [editingSubplot, setEditingSubplot] = useState<Subplot | null>(null);
  const [isCreatingPoint, setIsCreatingPoint] = useState(false);
  const [isCreatingSubplot, setIsCreatingSubplot] = useState(false);
  const [newPointPosition, setNewPointPosition] = useState<number>(50);
  
  // Drag state for timeline
  const [draggedPoint, setDraggedPoint] = useState<PlotPoint | null>(null);
  const [dragOffset, setDragOffset] = useState<number>(0);
  const timelineRef = useRef<HTMLDivElement>(null);
  
  // Drag state for list reordering
  const [listDraggedId, setListDraggedId] = useState<string | null>(null);
  const [listDragOverId, setListDragOverId] = useState<string | null>(null);
  
  // Scene linking state
  const [linkingPointId, setLinkingPointId] = useState<string | null>(null);
  
  // Form state for new/edit
  const [pointForm, setPointForm] = useState({
    title: '',
    description: '',
    subplotId: null as string | null,
    status: 'planned' as 'planned' | 'in-progress' | 'completed',
  });
  
  const [subplotForm, setSubplotForm] = useState({
    name: '',
    description: '',
    color: '#667eea',
  });

  // ============================================================================
  // Data Loading
  // ============================================================================
  
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [subplotsData, pointsData] = await Promise.all([
        invoke<Subplot[]>('list_subplots'),
        invoke<PlotPoint[]>('list_plot_points'),
      ]);
      setSubplots(subplotsData);
      setPlotPoints(pointsData);
    } catch (e) {
      console.error('Failed to load plot data:', e);
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Keep editingPoint in sync when plotPoints refresh so linked scenes appear immediately
  useEffect(() => {
    if (editingPoint) {
      const refreshed = plotPoints.find(p => p.id === editingPoint.id);
      if (refreshed) setEditingPoint(refreshed);
    }
  }, [plotPoints, editingPoint]);

  // ============================================================================
  // Subplot CRUD
  // ============================================================================
  
  const handleCreateSubplot = async () => {
    if (!subplotForm.name.trim()) return;
    try {
      await invoke('create_subplot', {
        name: subplotForm.name,
        color: subplotForm.color,
      });
      setSubplotForm({ name: '', description: '', color: '#667eea' });
      setIsCreatingSubplot(false);
      loadData();
    } catch (e) {
      console.error('Failed to create subplot:', e);
    }
  };
  
  const handleUpdateSubplot = async () => {
    if (!editingSubplot || !subplotForm.name.trim()) return;
    try {
      await invoke('update_subplot', {
        id: editingSubplot.id,
        name: subplotForm.name,
        description: subplotForm.description,
        color: subplotForm.color,
      });
      setEditingSubplot(null);
      loadData();
    } catch (e) {
      console.error('Failed to update subplot:', e);
    }
  };
  
  const handleDeleteSubplot = async (id: string) => {
    if (!confirm(isGerman ? 'Subplot wirklich löschen?' : 'Really delete subplot?')) return;
    try {
      await invoke('delete_subplot', { id });
      loadData();
    } catch (e) {
      console.error('Failed to delete subplot:', e);
      alert(String(e));
    }
  };

  // ============================================================================
  // PlotPoint CRUD
  // ============================================================================
  
  const handleCreatePlotPoint = async () => {
    if (!pointForm.title.trim()) return;
    try {
      await invoke('create_plot_point', {
        subplotId: pointForm.subplotId,
        title: pointForm.title,
        positionPercent: newPointPosition,
      });
      setPointForm({ title: '', description: '', subplotId: null, status: 'planned' });
      setIsCreatingPoint(false);
      loadData();
    } catch (e) {
      console.error('Failed to create plot point:', e);
    }
  };
  
  const handleUpdatePlotPoint = async () => {
    if (!editingPoint || !pointForm.title.trim()) return;
    try {
      await invoke('update_plot_point', {
        id: editingPoint.id,
        title: pointForm.title,
        description: pointForm.description,
        subplotId: pointForm.subplotId,
        positionPercent: editingPoint.positionPercent,
        structurePosition: editingPoint.structurePosition,
        status: pointForm.status,
      });
      setEditingPoint(null);
      loadData();
    } catch (e) {
      console.error('Failed to update plot point:', e);
    }
  };
  
  const handleDeletePlotPoint = async (id: string) => {
    if (!confirm(isGerman ? 'Plotpunkt wirklich löschen?' : 'Really delete plot point?')) return;
    try {
      await invoke('delete_plot_point', { id });
      loadData();
    } catch (e) {
      console.error('Failed to delete plot point:', e);
    }
  };
  
  const handleMovePoint = async (id: string, newPercent: number) => {
    try {
      await invoke('move_plot_point', {
        id,
        newPositionPercent: Math.max(0, Math.min(100, newPercent)),
      });
      loadData();
    } catch (e) {
      console.error('Failed to move plot point:', e);
    }
  };

  // ============================================================================
  // Scene Linking
  // ============================================================================
  
  const handleLinkScene = async (sceneId: string) => {
    if (!linkingPointId) return;
    try {
      await invoke('link_scene_to_plot', {
        plotPointId: linkingPointId,
        sceneId,
      });
      setLinkingPointId(null);
      // Optimistic update so UI reflects the link immediately
      setPlotPoints(prev => prev.map(p =>
        p.id === linkingPointId
          ? { ...p, linkedSceneIds: Array.from(new Set([...(p.linkedSceneIds || []), sceneId])) }
          : p
      ));
      if (editingPoint && editingPoint.id === linkingPointId) {
        setEditingPoint({ ...editingPoint, linkedSceneIds: Array.from(new Set([...(editingPoint.linkedSceneIds || []), sceneId])) });
      }
      loadData();
    } catch (e) {
      console.error('Failed to link scene:', e);
    }
  };
  
  const handleUnlinkScene = async (plotPointId: string, sceneId: string) => {
    try {
      await invoke('unlink_scene_from_plot', {
        plotPointId,
        sceneId,
      });
      loadData();
    } catch (e) {
      console.error('Failed to unlink scene:', e);
    }
  };

  // ============================================================================
  // Drag & Drop (Timeline view - horizontal position)
  // ============================================================================
  
  const handleDragStart = (e: React.MouseEvent, point: PlotPoint) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pointX = (point.positionPercent / 100) * rect.width;
    setDragOffset(clickX - pointX);
    setDraggedPoint(point);
  };
  
  const handleDragMove = (e: React.MouseEvent) => {
    if (!draggedPoint || !timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - dragOffset;
    const percent = (x / rect.width) * 100;
    
    // Update local state for smooth dragging
    setPlotPoints(prev => prev.map(p => 
      p.id === draggedPoint.id 
        ? { ...p, positionPercent: Math.max(0, Math.min(100, percent)) }
        : p
    ));
  };
  
  const handleDragEnd = () => {
    if (!draggedPoint) return;
    const point = plotPoints.find(p => p.id === draggedPoint.id);
    if (point) {
      handleMovePoint(point.id, point.positionPercent);
    }
    setDraggedPoint(null);
    setDragOffset(0);
  };

  // ============================================================================
  // Drag & Drop (List view - reorder)
  // ============================================================================

  const handleListDragStart = (e: React.DragEvent, pointId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', pointId);
    setListDraggedId(pointId);
  };

  const handleListDragOver = (e: React.DragEvent, pointId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (pointId !== listDraggedId) {
      setListDragOverId(pointId);
    }
  };

  const handleListDragLeave = () => {
    setListDragOverId(null);
  };

  const handleListDrop = async (e: React.DragEvent, targetId: string, subplotId: string | null) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    
    if (sourceId === targetId) {
      setListDraggedId(null);
      setListDragOverId(null);
      return;
    }
    
    // Get points for this subplot, sorted by order
    const subplotPoints = plotPoints
      .filter(p => p.subplotId === subplotId)
      .sort((a, b) => a.orderNum - b.orderNum);
    
    // Find indices
    const sourceIndex = subplotPoints.findIndex(p => p.id === sourceId);
    const targetIndex = subplotPoints.findIndex(p => p.id === targetId);
    
    if (sourceIndex === -1 || targetIndex === -1) return;
    
    // Reorder array
    const newOrder = [...subplotPoints];
    const [removed] = newOrder.splice(sourceIndex, 1);
    newOrder.splice(targetIndex, 0, removed);
    
    // Get new IDs in order
    const orderedIds = newOrder.map(p => p.id);
    
    // Save to backend
    try {
      await invoke('reorder_plot_points', { ids: orderedIds });
      loadData();
    } catch (err) {
      console.error('Failed to reorder plot points:', err);
    }
    
    setListDraggedId(null);
    setListDragOverId(null);
  };

  const handleListDragEnd = () => {
    setListDraggedId(null);
    setListDragOverId(null);
  };

  // ============================================================================
  // Helpers
  // ============================================================================
  
  const getTemplate = () => STRUCTURE_TEMPLATES[selectedTemplate];
  
  const getSubplotColor = (subplotId: string | null): string => {
    if (!subplotId) return '#9ca3af';
    const subplot = subplots.find(s => s.id === subplotId);
    return subplot?.color || '#667eea';
  };
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return '✓';
      case 'in-progress': return '◐';
      default: return '○';
    }
  };
  
  const getSceneTitle = (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    return scene?.title || sceneId;
  };

  // ============================================================================
  // Render
  // ============================================================================
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="p-4 text-red-500">
        {isGerman ? 'Fehler: ' : 'Error: '}{error}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h2 className="text-lg font-semibold">
          {isGerman ? 'Plot-Timeline' : 'Plot Timeline'}
        </h2>
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex rounded overflow-hidden border border-border">
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-2 py-1 text-sm ${viewMode === 'timeline' ? 'bg-primary text-white' : 'bg-muted hover:bg-muted/80'}`}
              title={isGerman ? 'Timeline-Ansicht' : 'Timeline View'}
            >
              📊
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-2 py-1 text-sm ${viewMode === 'list' ? 'bg-primary text-white' : 'bg-muted hover:bg-muted/80'}`}
              title={isGerman ? 'Listen-Ansicht (Drag & Drop)' : 'List View (Drag & Drop)'}
            >
              ☰
            </button>
          </div>
          
          {/* Template Selector */}
          {viewMode === 'timeline' && (
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value as keyof typeof STRUCTURE_TEMPLATES)}
              className="text-sm bg-muted border border-border rounded px-2 py-1"
              title={isGerman ? 'Story-Struktur' : 'Story Structure'}
            >
              {Object.entries(STRUCTURE_TEMPLATES).map(([key, template]) => (
                <option key={key} value={key}>
                  {isGerman ? template.name : template.nameEn}
                </option>
              ))}
            </select>
          )}
          
          {/* Add Subplot Button */}
          <button
            onClick={() => {
              setSubplotForm({ name: '', description: '', color: '#667eea' });
              setIsCreatingSubplot(true);
            }}
            className="px-2 py-1 text-sm bg-muted hover:bg-muted/80 rounded flex items-center gap-1"
            title={isGerman ? 'Neuer Subplot' : 'New Subplot'}
          >
            <span>+</span>
            <span className="hidden sm:inline">{isGerman ? 'Subplot' : 'Subplot'}</span>
          </button>
        </div>
      </div>
      
      {/* Subplots Legend */}
      <div className="flex flex-wrap gap-2 p-2 border-b border-border bg-muted/30">
        {subplots.map(subplot => (
          <div
            key={subplot.id}
            className="flex items-center gap-1 px-2 py-1 rounded text-sm cursor-pointer hover:bg-muted"
            onClick={() => {
              setSubplotForm({
                name: subplot.name,
                description: subplot.description,
                color: subplot.color,
              });
              setEditingSubplot(subplot);
            }}
          >
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: subplot.color }}
            />
            <span>{subplot.name}</span>
            {subplot.isMain && (
              <span className="text-xs text-muted-foreground">
                ({isGerman ? 'Haupt' : 'Main'})
              </span>
            )}
          </div>
        ))}
        {subplots.length === 0 && (
          <span className="text-sm text-muted-foreground italic">
            {isGerman ? 'Keine Subplots. Klicke "+Subplot" zum Erstellen.' : 'No subplots. Click "+Subplot" to create one.'}
          </span>
        )}
      </div>
      
      {/* Timeline View */}
      {viewMode === 'timeline' && (
      <div 
        className="flex-1 overflow-x-auto p-4"
        onMouseMove={handleDragMove}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
      >
        <div 
          ref={timelineRef}
          className="relative min-w-[800px] h-full min-h-[300px]"
        >
          {/* Structure Markers */}
          {getTemplate().markers.map(marker => (
            <div
              key={marker.id}
              className="absolute top-0 bottom-0 border-l border-dashed border-muted-foreground/30"
              style={{ left: `${marker.percent}%` }}
            >
              <div className="absolute -top-0 -translate-x-1/2 text-xs text-muted-foreground whitespace-nowrap bg-background px-1">
                {isGerman ? marker.name : marker.nameEn}
              </div>
            </div>
          ))}
          
          {/* Percentage Scale */}
          <div className="absolute bottom-0 left-0 right-0 h-6 border-t border-border">
            {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(pct => (
              <div
                key={pct}
                className="absolute text-xs text-muted-foreground"
                style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
              >
                {pct}%
              </div>
            ))}
          </div>
          
          {/* Subplot Lanes */}
          <div className="absolute top-8 bottom-8 left-0 right-0">
            {subplots.map((subplot, idx) => (
              <div
                key={subplot.id}
                className="absolute left-0 right-0 h-16 border-b border-border/50"
                style={{ top: `${idx * 72}px` }}
              >
                {/* Lane Label */}
                <div 
                  className="absolute -left-2 top-1/2 -translate-y-1/2 -rotate-90 origin-left text-xs text-muted-foreground whitespace-nowrap"
                  style={{ color: subplot.color }}
                >
                  {subplot.name}
                </div>
                
                {/* Plot Points in this lane */}
                {plotPoints
                  .filter(p => p.subplotId === subplot.id)
                  .map(point => (
                    <div
                      key={point.id}
                      className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-grab active:cursor-grabbing
                        ${draggedPoint?.id === point.id ? 'opacity-70 scale-110' : ''}
                        ${linkingPointId === point.id ? 'ring-2 ring-primary' : ''}`}
                      style={{ left: `${point.positionPercent}%` }}
                      onMouseDown={(e) => handleDragStart(e, point)}
                      onClick={(e) => {
                        if (!draggedPoint) {
                          e.stopPropagation();
                          setPointForm({
                            title: point.title,
                            description: point.description,
                            subplotId: point.subplotId,
                            status: point.status as 'planned' | 'in-progress' | 'completed',
                          });
                          setEditingPoint(point);
                        }
                      }}
                    >
                      {/* Point Card */}
                      <div
                        className="px-2 py-1 rounded-md shadow-md text-xs min-w-[80px] max-w-[120px]"
                        style={{ 
                          backgroundColor: subplot.color,
                          color: 'white',
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <span>{getStatusIcon(point.status)}</span>
                          <span className="truncate font-medium">{point.title}</span>
                        </div>
                        {point.linkedSceneIds.length > 0 && (
                          <div className="text-[10px] opacity-80 mt-0.5">
                            🔗 {point.linkedSceneIds.length} {isGerman ? 'Szene(n)' : 'scene(s)'}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            ))}
            
            {/* Unassigned Plot Points (no subplot) */}
            {plotPoints.filter(p => !p.subplotId).length > 0 && (
              <div
                className="absolute left-0 right-0 h-16 border-b border-border/50 bg-muted/20"
                style={{ top: `${subplots.length * 72}px` }}
              >
                <div className="absolute -left-2 top-1/2 -translate-y-1/2 -rotate-90 origin-left text-xs text-muted-foreground whitespace-nowrap">
                  {isGerman ? 'Unzugeordnet' : 'Unassigned'}
                </div>
                {plotPoints
                  .filter(p => !p.subplotId)
                  .map(point => (
                    <div
                      key={point.id}
                      className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-grab active:cursor-grabbing
                        ${draggedPoint?.id === point.id ? 'opacity-70 scale-110' : ''}`}
                      style={{ left: `${point.positionPercent}%` }}
                      onMouseDown={(e) => handleDragStart(e, point)}
                      onClick={(e) => {
                        if (!draggedPoint) {
                          e.stopPropagation();
                          setPointForm({
                            title: point.title,
                            description: point.description,
                            subplotId: point.subplotId,
                            status: point.status as 'planned' | 'in-progress' | 'completed',
                          });
                          setEditingPoint(point);
                        }
                      }}
                    >
                      <div className="px-2 py-1 rounded-md shadow-md text-xs min-w-[80px] max-w-[120px] bg-gray-500 text-white">
                        <div className="flex items-center gap-1">
                          <span>{getStatusIcon(point.status)}</span>
                          <span className="truncate font-medium">{point.title}</span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
          
          {/* Click to Add Plot Point */}
          <div 
            className="absolute top-8 bottom-8 left-0 right-0 cursor-crosshair"
            style={{ pointerEvents: draggedPoint ? 'none' : 'auto' }}
            onClick={(e) => {
              if (!timelineRef.current || draggedPoint) return;
              const rect = timelineRef.current.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const percent = (x / rect.width) * 100;
              setNewPointPosition(Math.round(percent));
              setPointForm({ title: '', description: '', subplotId: subplots[0]?.id || null, status: 'planned' });
              setIsCreatingPoint(true);
            }}
          />
        </div>
      </div>
      )}
      
      {/* List View */}
      {viewMode === 'list' && (
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-sm text-muted-foreground mb-4">
            {isGerman 
              ? '↕️ Ziehe Plotpunkte um sie neu zu ordnen. Klicke zum Bearbeiten.'
              : '↕️ Drag plot points to reorder. Click to edit.'}
          </p>
          
          {/* Group by subplot */}
          {[...subplots, { id: null as string | null, name: isGerman ? 'Unzugeordnet' : 'Unassigned', color: '#9ca3af', isMain: false, description: '', orderNum: 999 }].map(subplot => {
            const subplotPoints = plotPoints
              .filter(p => p.subplotId === subplot.id)
              .sort((a, b) => a.orderNum - b.orderNum);
            
            if (subplotPoints.length === 0 && subplot.id !== null) return null;
            
            return (
              <div key={subplot.id || 'unassigned'} className="mb-6">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: subplot.color }} />
                  {subplot.name}
                  <span className="text-muted-foreground font-normal">({subplotPoints.length})</span>
                </h3>
                
                <div className="space-y-1">
                  {subplotPoints.map((point, idx) => (
                    <div
                      key={point.id}
                      draggable
                      onDragStart={(e) => handleListDragStart(e, point.id)}
                      onDragOver={(e) => handleListDragOver(e, point.id)}
                      onDragLeave={handleListDragLeave}
                      onDrop={(e) => handleListDrop(e, point.id, subplot.id)}
                      onDragEnd={handleListDragEnd}
                      onClick={() => {
                        setPointForm({
                          title: point.title,
                          description: point.description,
                          subplotId: point.subplotId,
                          status: point.status as 'planned' | 'in-progress' | 'completed',
                        });
                        setEditingPoint(point);
                      }}
                      className={`
                        flex items-center gap-3 p-2 rounded-lg border cursor-grab active:cursor-grabbing
                        transition-all duration-150
                        ${listDraggedId === point.id ? 'opacity-50 scale-95' : ''}
                        ${listDragOverId === point.id ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground/50'}
                      `}
                    >
                      <span className="text-muted-foreground cursor-grab">⋮⋮</span>
                      <span className="text-xs text-muted-foreground w-8">{Math.round(point.positionPercent)}%</span>
                      <span className="w-5">{getStatusIcon(point.status)}</span>
                      <span className="flex-1 font-medium truncate">{point.title}</span>
                      {point.linkedSceneIds.length > 0 && (
                        <span className="text-xs text-muted-foreground">🔗 {point.linkedSceneIds.length}</span>
                      )}
                    </div>
                  ))}
                  
                  {subplotPoints.length === 0 && (
                    <p className="text-sm text-muted-foreground italic py-2">
                      {isGerman ? 'Keine Plotpunkte' : 'No plot points'}
                    </p>
                  )}
                </div>
                
                {/* Add Plot Point to this Subplot */}
                <button
                  onClick={() => {
                    setNewPointPosition(50);
                    setPointForm({ title: '', description: '', subplotId: subplot.id, status: 'planned' });
                    setIsCreatingPoint(true);
                  }}
                  className="mt-2 px-3 py-1 text-sm text-muted-foreground hover:text-foreground border border-dashed border-border rounded hover:border-muted-foreground"
                >
                  + {isGerman ? 'Plotpunkt hinzufügen' : 'Add plot point'}
                </button>
              </div>
            );
          })}
        </div>
      )}
      
      {/* Scene Linking Mode Banner */}
      {linkingPointId && (
        <div className="p-2 bg-primary/20 border-t border-primary text-sm flex items-center justify-between">
          <span>
            {isGerman 
              ? '📎 Wähle eine Szene zum Verknüpfen...' 
              : '📎 Select a scene to link...'}
          </span>
          <button
            onClick={() => setLinkingPointId(null)}
            className="px-2 py-1 bg-muted rounded hover:bg-muted/80"
          >
            {isGerman ? 'Abbrechen' : 'Cancel'}
          </button>
        </div>
      )}
      
      {/* Scene List for Linking */}
      {linkingPointId && scenes.length > 0 && (
        <div className="max-h-40 overflow-y-auto border-t border-border p-2 bg-muted/50">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {scenes.map(scene => {
              const point = plotPoints.find(p => p.id === linkingPointId);
              const isLinked = point?.linkedSceneIds.includes(scene.id);
              return (
                <button
                  key={scene.id}
                  onClick={() => handleLinkScene(scene.id)}
                  className={`px-2 py-1 text-sm rounded text-left truncate ${
                    isLinked 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-background hover:bg-muted border border-border'
                  }`}
                >
                  {isLinked && '✓ '}{scene.title}
                </button>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Create/Edit Plot Point Modal */}
      {(isCreatingPoint || editingPoint) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setIsCreatingPoint(false); setEditingPoint(null); }}>
          <div className="bg-background rounded-lg shadow-xl p-4 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">
              {editingPoint 
                ? (isGerman ? 'Plotpunkt bearbeiten' : 'Edit Plot Point')
                : (isGerman ? 'Neuer Plotpunkt' : 'New Plot Point')
              }
              {isCreatingPoint && ` @ ${newPointPosition}%`}
            </h3>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">
                  {isGerman ? 'Titel' : 'Title'}
                </label>
                <input
                  type="text"
                  value={pointForm.title}
                  onChange={(e) => setPointForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background"
                  placeholder={isGerman ? 'z.B. "Held trifft Mentor"' : 'e.g. "Hero meets mentor"'}
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">
                  {isGerman ? 'Beschreibung' : 'Description'}
                </label>
                <textarea
                  value={pointForm.description}
                  onChange={(e) => setPointForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background resize-none"
                  rows={3}
                  placeholder={isGerman ? 'Was passiert hier?' : 'What happens here?'}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">
                  {isGerman ? 'Subplot' : 'Subplot'}
                </label>
                <select
                  value={pointForm.subplotId || ''}
                  onChange={(e) => setPointForm(f => ({ ...f, subplotId: e.target.value || null }))}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background"
                >
                  <option value="">{isGerman ? '-- Kein Subplot --' : '-- No Subplot --'}</option>
                  {subplots.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">
                  {isGerman ? 'Status' : 'Status'}
                </label>
                <select
                  value={pointForm.status}
                  onChange={(e) => setPointForm(f => ({ ...f, status: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background"
                >
                  <option value="planned">{isGerman ? '○ Geplant' : '○ Planned'}</option>
                  <option value="in-progress">{isGerman ? '◐ In Arbeit' : '◐ In Progress'}</option>
                  <option value="completed">{isGerman ? '✓ Fertig' : '✓ Completed'}</option>
                </select>
              </div>
            </div>
            
            {/* Linked Scenes (edit mode only) */}
            {editingPoint && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">
                    {isGerman ? 'Verknüpfte Szenen' : 'Linked Scenes'}
                  </label>
                  <button
                    onClick={() => setLinkingPointId(editingPoint.id)}
                    className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded"
                  >
                    + {isGerman ? 'Szene verknüpfen' : 'Link Scene'}
                  </button>
                </div>
                {editingPoint.linkedSceneIds.length > 0 ? (
                  <div className="space-y-1">
                    {editingPoint.linkedSceneIds.map(sceneId => (
                      <div key={sceneId} className="flex items-center justify-between text-sm bg-muted rounded px-2 py-1">
                        <span 
                          className="cursor-pointer hover:text-primary"
                          onClick={() => onSceneSelect?.(sceneId)}
                        >
                          {getSceneTitle(sceneId)}
                        </span>
                        <button
                          onClick={() => handleUnlinkScene(editingPoint.id, sceneId)}
                          className="text-red-500 hover:text-red-700"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    {isGerman ? 'Keine Szenen verknüpft' : 'No scenes linked'}
                  </p>
                )}
              </div>
            )}
            
            <div className="flex justify-between mt-6">
              <div>
                {editingPoint && (
                  <button
                    onClick={() => handleDeletePlotPoint(editingPoint.id)}
                    className="px-4 py-2 text-red-500 hover:text-red-700"
                  >
                    {isGerman ? 'Löschen' : 'Delete'}
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setIsCreatingPoint(false); setEditingPoint(null); }}
                  className="px-4 py-2 bg-muted hover:bg-muted/80 rounded-md"
                >
                  {isGerman ? 'Abbrechen' : 'Cancel'}
                </button>
                <button
                  onClick={editingPoint ? handleUpdatePlotPoint : handleCreatePlotPoint}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  {editingPoint 
                    ? (isGerman ? 'Speichern' : 'Save')
                    : (isGerman ? 'Erstellen' : 'Create')
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Create/Edit Subplot Modal */}
      {(isCreatingSubplot || editingSubplot) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setIsCreatingSubplot(false); setEditingSubplot(null); }}>
          <div className="bg-background rounded-lg shadow-xl p-4 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">
              {editingSubplot 
                ? (isGerman ? 'Subplot bearbeiten' : 'Edit Subplot')
                : (isGerman ? 'Neuer Subplot' : 'New Subplot')
              }
            </h3>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">
                  {isGerman ? 'Name' : 'Name'}
                </label>
                <input
                  type="text"
                  value={subplotForm.name}
                  onChange={(e) => setSubplotForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background"
                  placeholder={isGerman ? 'z.B. "Liebesgeschichte"' : 'e.g. "Love Story"'}
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">
                  {isGerman ? 'Beschreibung' : 'Description'}
                </label>
                <textarea
                  value={subplotForm.description}
                  onChange={(e) => setSubplotForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background resize-none"
                  rows={2}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">
                  {isGerman ? 'Farbe' : 'Color'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={subplotForm.color}
                    onChange={(e) => setSubplotForm(f => ({ ...f, color: e.target.value }))}
                    className="w-10 h-10 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={subplotForm.color}
                    onChange={(e) => setSubplotForm(f => ({ ...f, color: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-border rounded-md bg-background font-mono text-sm"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex justify-between mt-6">
              <div>
                {editingSubplot && !editingSubplot.isMain && (
                  <button
                    onClick={() => handleDeleteSubplot(editingSubplot.id)}
                    className="px-4 py-2 text-red-500 hover:text-red-700"
                  >
                    {isGerman ? 'Löschen' : 'Delete'}
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setIsCreatingSubplot(false); setEditingSubplot(null); }}
                  className="px-4 py-2 bg-muted hover:bg-muted/80 rounded-md"
                >
                  {isGerman ? 'Abbrechen' : 'Cancel'}
                </button>
                <button
                  onClick={editingSubplot ? handleUpdateSubplot : handleCreateSubplot}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  {editingSubplot 
                    ? (isGerman ? 'Speichern' : 'Save')
                    : (isGerman ? 'Erstellen' : 'Create')
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlotTimeline;
