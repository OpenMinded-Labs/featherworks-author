import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';

// ============================================================================
// Types
// ============================================================================

interface EntityType {
  id: string;
  name: string;
  name_plural: string;
  icon: string;
  default_color: string;
  is_system: boolean;
  order_num: number;
}

interface Entity {
  id: string;
  type_id: string;
  name: string;
  aliases: string;
  description: string;
  notes: string;
  color: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

interface SuggestedEntity {
  name: string;
  type: string;
  description: string;
  aliases?: string[]; // Spitznamen, Nachnamen etc. aus der KI-Extraktion
}

// Entity image metadata (without blob data)
interface EntityImageMeta {
  id: string;
  entity_id: string;
  name: string;
  file_name: string;
  mime_type: string;
  order_num: number;
  created_at: string;
}

// Entity image with data URL for display
interface EntityImageData {
  id: string;
  entity_id: string;
  name: string;
  file_name: string;
  mime_type: string;
  data_url: string;
  order_num: number;
  created_at: string;
}

interface EntitiesPanelProps {
  onEntitySelect?: (entity: Entity) => void;
  manuscriptContent?: string;  // Full manuscript text for AI scanning
  sceneContent?: string;       // Current scene text for focused scanning
}

// ============================================================================
// Component
// ============================================================================

export const EntitiesPanel: React.FC<EntitiesPanelProps> = ({ onEntitySelect, manuscriptContent, sceneContent }) => {
  const { t, i18n } = useTranslation();
  
  // State
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // Edit modal state
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    aliases: '',
    description: '',
    notes: '',
    color: '',
  });
  
  // Custom type modal
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [newType, setNewType] = useState({ name: '', name_plural: '', icon: '📌', default_color: '#667eea' });
  
  // AI Scan state
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState('');
  const [suggestedEntities, setSuggestedEntities] = useState<SuggestedEntity[]>([]);
  const [showScanResults, setShowScanResults] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const extractionJobIdRef = useRef<string | null>(null);
  
  // Delete confirmation modal state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState<string>('');

  // Entity images state
  const [entityImages, setEntityImages] = useState<EntityImageData[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [editingImageId, setEditingImageId] = useState<string | null>(null);
  const [editingImageName, setEditingImageName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ============================================================================
  // Data Loading
  // ============================================================================

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [types, ents] = await Promise.all([
        invoke<EntityType[]>('list_entity_types'),
        invoke<Entity[]>('list_entities', { typeId: selectedTypeId }),
      ]);
      setEntityTypes(types);
      setEntities(ents);
    } catch (err) {
      console.error('Failed to load entities:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedTypeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load AI enable flag
  useEffect(() => {
    invoke<{ enabled?: boolean }>('get_ai_provider_settings')
      .then(s => setAiEnabled(s.enabled !== false))
      .catch(() => setAiEnabled(true));
  }, []);

  // Entity extraction event listeners (using new chunked backend)
  useEffect(() => {
    const unsubscribers: Array<Promise<() => void>> = [];

    // Scene extraction progress (world_scan_progress is also listened in StatusBar for footer display)
    unsubscribers.push(listen('world_scan_progress', (evt) => {
      const payload = evt.payload as { job_id?: string; phase?: string; progress_percent?: number };
      if (payload?.job_id && payload.job_id === extractionJobIdRef.current) {
        setScanProgress(payload.phase || t('entities.scan.analyzing'));
      }
    }));

    unsubscribers.push(listen('entity_extraction_progress', (evt) => {
      const payload = evt.payload as { job_id?: string; current_chunk?: number; total_chunks?: number };
      if (payload?.job_id && payload.job_id === extractionJobIdRef.current) {
        const current = payload.current_chunk ?? 0;
        const total = payload.total_chunks ?? 0;
        setScanProgress(t('entities.scan.analyzing') + ` (${current}/${total})`);
      }
    }));

    unsubscribers.push(listen('entity_extraction_done', (evt) => {
      const payload = evt.payload as { job_id?: string; entities?: Array<{ name: string; entity_type: string; description: string; aliases?: string[] }> };
      if (payload?.job_id && payload.job_id === extractionJobIdRef.current) {
        const rawEntities = payload.entities || [];
        
        // Type mapping for flexible LLM outputs (Person, Place, etc.)
        const typeMap: Record<string, string> = {
          'character': 'character',
          'charakter': 'character',
          'person': 'character',
          'location': 'location',
          'ort': 'location',
          'place': 'location',
          'faction': 'faction',
          'fraktion': 'faction',
          'organisation': 'faction',
          'organization': 'faction',
          'gruppe': 'faction',
          'group': 'faction',
          'item': 'item',
          'gegenstand': 'item',
          'objekt': 'item',
          'object': 'item',
        };
        
        const mappedEntities: SuggestedEntity[] = rawEntities.map(e => ({
          name: e.name,
          type: typeMap[(e.entity_type || 'character').toLowerCase()] || 'character',
          description: e.description || '',
          aliases: e.aliases || [] // Pass aliases from extraction
        }));
        
        setSuggestedEntities(mappedEntities);
        if (mappedEntities.length > 0) {
          setShowScanResults(true);
        }
        setIsScanning(false);
        extractionJobIdRef.current = null;
        setScanProgress('');
        // Reload entities to show newly saved ones
        loadData();
      }
    }));

    unsubscribers.push(listen('entity_extraction_error', (evt) => {
      const payload = evt.payload as { job_id?: string; error?: string };
      if (payload?.job_id && payload.job_id === extractionJobIdRef.current) {
        console.error('Entity extraction error:', payload.error);
        setScanProgress(t('entities.scan.error'));
        setIsScanning(false);
        extractionJobIdRef.current = null;
      }
    }));
    
    // Manuscript upsert progress events
    unsubscribers.push(listen('entity_upsert_progress', (evt) => {
      const payload = evt.payload as { job_id?: string; scene?: number; total_scenes?: number };
      if (payload?.job_id && payload.job_id === extractionJobIdRef.current) {
        const scene = payload.scene ?? 0;
        const total = payload.total_scenes ?? 0;
        setScanProgress(`${t('entities.scan.analyzing')} (${scene}/${total} Szenen)`);
      }
    }));
    
    unsubscribers.push(listen('entity_upsert_done', (evt) => {
      const payload = evt.payload as { job_id?: string; new_count?: number; updated_count?: number };
      if (payload?.job_id && payload.job_id === extractionJobIdRef.current) {
        const newCount = payload.new_count ?? 0;
        const updatedCount = payload.updated_count ?? 0;
        setScanProgress(`✓ ${newCount} neue, ${updatedCount} aktualisiert`);
        setIsScanning(false);
        extractionJobIdRef.current = null;
        // Reload entities to show newly saved ones
        loadData();
        // Clear progress after a moment
        setTimeout(() => setScanProgress(''), 3000);
      }
    }));

    return () => {
      unsubscribers.forEach(unsubPromise => unsubPromise.then(unsub => unsub()));
    };
  }, [t, loadData]);

  // ============================================================================
  // Filtering
  // ============================================================================

  const filteredEntities = entities.filter(e => {
    if (selectedTypeId && e.type_id !== selectedTypeId) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.name.toLowerCase().includes(q) ||
      e.aliases.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q)
    );
  });

  // Group by type for display
  const groupedEntities = filteredEntities.reduce((acc, entity) => {
    const typeId = entity.type_id;
    if (!acc[typeId]) acc[typeId] = [];
    acc[typeId].push(entity);
    return acc;
  }, {} as Record<string, Entity[]>);

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  const handleCreate = async () => {
    if (!editForm.name.trim()) return;
    try {
      await invoke('create_entity', {
        req: {
          type_id: selectedTypeId || 'character',
          name: editForm.name.trim(),
          aliases: editForm.aliases.trim(),
          description: editForm.description.trim(),
          notes: editForm.notes.trim(),
          color: editForm.color || null,
          metadata_json: '{}',
        }
      });
      setIsCreating(false);
      setEditForm({ name: '', aliases: '', description: '', notes: '', color: '' });
      loadData();
    } catch (err) {
      console.error('Failed to create entity:', err);
    }
  };

  const handleUpdate = async () => {
    if (!editingEntity || !editForm.name.trim()) return;
    try {
      await invoke('update_entity', {
        req: {
          id: editingEntity.id,
          name: editForm.name.trim(),
          aliases: editForm.aliases.trim(),
          description: editForm.description.trim(),
          notes: editForm.notes.trim(),
          color: editForm.color || null,
          metadata_json: editingEntity.metadata_json,
        }
      });
      setEditingEntity(null);
      loadData();
    } catch (err) {
      console.error('Failed to update entity:', err);
    }
  };

  const handleDelete = async (id: string) => {
    // Show confirmation modal instead of using confirm()
    const entityToDelete = entities.find(e => e.id === id);
    if (entityToDelete) {
      setDeleteConfirmName(entityToDelete.name);
      setDeleteConfirmId(id);
    }
  };
  
  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await invoke('delete_entity', { id: deleteConfirmId });
      setDeleteConfirmId(null);
      setDeleteConfirmName('');
      loadData();
    } catch (err) {
      console.error('Failed to delete entity:', err);
      setDeleteConfirmId(null);
      setDeleteConfirmName('');
    }
  };
  
  const cancelDelete = () => {
    setDeleteConfirmId(null);
    setDeleteConfirmName('');
  };

  // ============================================================================
  // Entity Image Management
  // ============================================================================

  // Load images when editing an entity
  const loadEntityImages = async (entityId: string) => {
    setIsLoadingImages(true);
    try {
      const imageMetas = await invoke<EntityImageMeta[]>('list_entity_images', { entityId });
      // Load full image data for each
      const fullImages = await Promise.all(
        imageMetas.map(meta => invoke<EntityImageData>('get_entity_image', { imageId: meta.id }))
      );
      setEntityImages(fullImages);
    } catch (err) {
      console.error('Failed to load entity images:', err);
      setEntityImages([]);
    } finally {
      setIsLoadingImages(false);
    }
  };

  // Handle file selection for image upload
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !editingEntity) return;

    // Check file type
    if (!file.type.startsWith('image/')) {
      alert(t('entities.images.invalidType'));
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert(t('entities.images.tooLarge'));
      return;
    }

    // Check image count limit
    if (entityImages.length >= 3) {
      alert(t('entities.images.maxReached'));
      return;
    }

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1]; // Remove data:image/...;base64, prefix
        
        // Suggest a name based on entity type
        const typeInfo = entityTypes.find(t => t.id === editingEntity.type_id);
        const suggestedName = typeInfo?.id === 'character' 
          ? (entityImages.length === 0 ? 'Portrait' : entityImages.length === 1 ? 'Ganzkörper' : 'Bild')
          : typeInfo?.id === 'location'
          ? (entityImages.length === 0 ? 'Karte' : 'Ansicht')
          : `Bild ${entityImages.length + 1}`;

        await invoke('add_entity_image', {
          req: {
            entity_id: editingEntity.id,
            name: suggestedName,
            file_name: file.name,
            mime_type: file.type,
            base64_data: base64,
          }
        });
        
        // Reload images
        loadEntityImages(editingEntity.id);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Failed to upload image:', err);
      alert(t('entities.images.uploadFailed'));
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Update image name
  const handleUpdateImageName = async (imageId: string, newName: string) => {
    try {
      await invoke('update_entity_image_name', { imageId, name: newName });
      setEditingImageId(null);
      setEditingImageName('');
      if (editingEntity) {
        loadEntityImages(editingEntity.id);
      }
    } catch (err) {
      console.error('Failed to update image name:', err);
    }
  };

  // Delete image
  const handleDeleteImage = async (imageId: string) => {
    try {
      await invoke('delete_entity_image', { imageId });
      if (editingEntity) {
        loadEntityImages(editingEntity.id);
      }
    } catch (err) {
      console.error('Failed to delete image:', err);
    }
  };

  // Load images when entity is selected for editing
  useEffect(() => {
    if (editingEntity && !isCreating) {
      loadEntityImages(editingEntity.id);
    } else {
      setEntityImages([]);
    }
  }, [editingEntity, isCreating]);

  const handleCreateType = async () => {
    if (!newType.name.trim() || !newType.name_plural.trim()) return;
    try {
      await invoke('create_entity_type', { req: newType });
      setShowTypeModal(false);
      setNewType({ name: '', name_plural: '', icon: '📌', default_color: '#667eea' });
      loadData();
    } catch (err) {
      console.error('Failed to create entity type:', err);
    }
  };

  // ============================================================================
  // AI Entity Scan (using new 2-pass chunked backend)
  // ============================================================================

  // Scan current scene only
  const handleScanScene = async () => {
    if (!aiEnabled) return;
    const content = sceneContent || manuscriptContent;
    if (!content || content.length < 50) {
      alert(t('entities.scan.noContent'));
      return;
    }

    setIsScanning(true);
    setScanProgress(t('entities.scan.analyzing'));
    setSuggestedEntities([]);

    try {
      const typeNames = entityTypes.map(et => et.name);
      if (typeNames.length === 0) {
        typeNames.push('Charakter', 'Ort', 'Fraktion', 'Gegenstand');
      }

      const jobId = await invoke<string>('extract_entities_ai', {
        req: {
          text: content,
          entityTypes: typeNames,
          lang: i18n.language.startsWith('de') ? 'de' : 'en'
        }
      });
      
      extractionJobIdRef.current = jobId;
    } catch (err) {
      console.error('AI scene scan failed:', err);
      setScanProgress(t('entities.scan.error'));
      setIsScanning(false);
    }
  };

  // Scan entire manuscript (uses backend that fetches all scenes from DB)
  const handleScanManuscript = async () => {
    if (!aiEnabled) return;

    setIsScanning(true);
    setScanProgress(t('entities.scan.analyzing'));
    setSuggestedEntities([]);

    try {
      // Use the backend command that fetches all scenes from DB
      const jobId = await invoke<string>('extract_entities_manuscript_upsert');
      
      extractionJobIdRef.current = jobId;
    } catch (err) {
      console.error('AI manuscript scan failed:', err);
      setScanProgress(t('entities.scan.error'));
      setIsScanning(false);
    }
  };

  // Legacy function for backwards compatibility
  const handleAiScan = handleScanScene;

  const handleAddSuggested = async (suggestion: SuggestedEntity) => {
    // Map type string to type_id
    const typeMap: Record<string, string> = {
      'character': 'character',
      'location': 'location',
      'faction': 'faction',
      'item': 'item',
    };
    const typeId = typeMap[suggestion.type] || 'character';
    
    try {
      // Use save_extracted_entity which uses upsert - updates existing entities instead of creating duplicates
      const result = await invoke<{ entity: Entity; was_updated: boolean }>('save_extracted_entity', {
        req: {
          typeId: typeId,
          name: suggestion.name,
          aliases: suggestion.aliases || [], // Pass aliases from extraction
          description: suggestion.description,
          notes: '',
        }
      });
      
      // Log if entity was updated vs created
      if (result.was_updated) {
        console.log(`Entity "${suggestion.name}" was updated (already existed)`);
      } else {
        console.log(`Entity "${suggestion.name}" was created`);
      }
      
      // Remove from suggestions
      setSuggestedEntities(prev => prev.filter(s => s.name !== suggestion.name));
      loadData();
    } catch (err) {
      console.error('Failed to add suggested entity:', err);
    }
  };

  const handleDismissSuggested = (name: string) => {
    setSuggestedEntities(prev => prev.filter(s => s.name !== name));
  };

  // ============================================================================
  // UI Helpers
  // ============================================================================

  const openEditModal = (entity: Entity) => {
    setEditingEntity(entity);
    setEditForm({
      name: entity.name,
      aliases: entity.aliases,
      description: entity.description,
      notes: entity.notes,
      color: entity.color || '',
    });
  };

  const openCreateModal = (typeId?: string) => {
    setIsCreating(true);
    if (typeId) setSelectedTypeId(typeId);
    setEditForm({ name: '', aliases: '', description: '', notes: '', color: '' });
  };

  const getTypeById = (id: string) => entityTypes.find(t => t.id === id);
  
  const getEntityColor = (entity: Entity) => {
    if (entity.color) return entity.color;
    const type = getTypeById(entity.type_id);
    return type?.default_color || '#667eea';
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="entities-panel">
      {/* Header */}
      <div className="entities-header">
        <div className="panel-title">{t('entities.title')}</div>
        <div className="entities-header-actions">
          {/* Scene Scan Button */}
          {(sceneContent || manuscriptContent) && (sceneContent?.length || 0) > 50 && (
            <button 
              className="btn btn-sm btn-secondary entity-scan-btn" 
              onClick={handleScanScene}
              disabled={isScanning || !aiEnabled}
              title={t('entities.scan.sceneTitle')}
            >
              {isScanning ? '⏳' : '🔍'} {t('entities.scan.sceneButton')}
            </button>
          )}
          {/* Manuscript Scan Button - always show when AI is available */}
          <button 
            className="btn btn-sm btn-secondary entity-scan-btn" 
            onClick={handleScanManuscript}
            disabled={isScanning || !aiEnabled}
            title={t('entities.scan.manuscriptTitle')}
          >
            {isScanning ? '⏳' : '📚'} {t('entities.scan.manuscriptButton')}
          </button>
          <button 
            className="btn btn-sm btn-icon" 
            onClick={() => openCreateModal()}
            title={t('entities.addNew')}
          >
            ➕
          </button>
        </div>
      </div>
      
      {/* Scan Progress */}
      {isScanning && (
        <div className="entity-scan-progress">
          <span className="entity-scan-spinner">⏳</span>
          <span>{scanProgress}</span>
        </div>
      )}
      
      {/* Scan Results */}
      {showScanResults && suggestedEntities.length > 0 && (
        <div className="entity-scan-results">
          <div className="entity-scan-results-header">
            <span>✨ {t('entities.scan.found', { count: suggestedEntities.length })}</span>
            <button 
              className="btn btn-xs btn-ghost"
              onClick={() => setShowScanResults(false)}
            >
              ✕
            </button>
          </div>
          <div className="entity-suggestions-list">
            {suggestedEntities.map((s, idx) => (
              <div key={idx} className="entity-suggestion-card">
                <div className="entity-suggestion-info">
                  <span className="entity-suggestion-type">{s.type}</span>
                  <span className="entity-suggestion-name">{s.name}</span>
                  <span className="entity-suggestion-desc">{s.description}</span>
                </div>
                <div className="entity-suggestion-actions">
                  <button 
                    className="btn btn-xs btn-primary"
                    onClick={() => handleAddSuggested(s)}
                    title={t('entities.scan.add')}
                  >
                    ➕
                  </button>
                  <button 
                    className="btn btn-xs btn-ghost"
                    onClick={() => handleDismissSuggested(s.name)}
                    title={t('entities.scan.dismiss')}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Type Filter Tabs */}
      <div className="entities-type-tabs">
        <button
          className={`type-tab ${!selectedTypeId ? 'active' : ''}`}
          onClick={() => setSelectedTypeId(null)}
        >
          {t('entities.all')}
        </button>
        {entityTypes.map(type => (
          <button
            key={type.id}
            className={`type-tab ${selectedTypeId === type.id ? 'active' : ''}`}
            onClick={() => setSelectedTypeId(type.id)}
            data-tab-color={type.default_color}
          >
            <span className="type-icon">{type.icon}</span>
            <span className="type-name">{type.name_plural}</span>
          </button>
        ))}
        <button
          className="type-tab type-tab-add"
          onClick={() => setShowTypeModal(true)}
          title={t('entities.addType')}
        >
          ➕
        </button>
      </div>

      {/* Search */}
      <div className="entities-search">
        <input
          type="text"
          placeholder={t('entities.search')}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="search-input"
        />
      </div>

      {/* Entity List */}
      <div className="entities-list">
        {isLoading ? (
          <div className="entities-loading">{t('loading')}</div>
        ) : filteredEntities.length === 0 ? (
          <div className="entities-empty">
            <p>{t('entities.noEntities')}</p>
            <button className="btn btn-sm" onClick={() => openCreateModal()}>
              {t('entities.createFirst')}
            </button>
          </div>
        ) : selectedTypeId ? (
          // Single type view
          <div className="entity-group">
            {filteredEntities.map(entity => (
              <EntityCard
                key={entity.id}
                entity={entity}
                type={getTypeById(entity.type_id)}
                color={getEntityColor(entity)}
                onEdit={() => openEditModal(entity)}
                onDelete={() => handleDelete(entity.id)}
                onClick={() => onEntitySelect?.(entity)}
              />
            ))}
          </div>
        ) : (
          // Grouped view
          Object.entries(groupedEntities).map(([typeId, ents]) => {
            const type = getTypeById(typeId);
            if (!type) return null;
            return (
              <div key={typeId} className="entity-group">
                <div className="entity-group-header">
                  <span className="type-icon">{type.icon}</span>
                  <span className="type-name">{type.name_plural}</span>
                  <span className="entity-count">({ents.length})</span>
                  <button 
                    className="btn btn-xs btn-ghost"
                    onClick={() => { setSelectedTypeId(typeId); openCreateModal(typeId); }}
                  >
                    ➕
                  </button>
                </div>
                {ents.map(entity => (
                  <EntityCard
                    key={entity.id}
                    entity={entity}
                    type={type}
                    color={getEntityColor(entity)}
                    onEdit={() => openEditModal(entity)}
                    onDelete={() => handleDelete(entity.id)}
                    onClick={() => onEntitySelect?.(entity)}
                  />
                ))}
              </div>
            );
          })
        )}
      </div>

      {/* Edit/Create Modal */}
      {(editingEntity || isCreating) && (
        <div className="modal-overlay" onClick={() => { setEditingEntity(null); setIsCreating(false); }}>
          <div className="modal entity-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{isCreating ? t('entities.create') : t('entities.edit')}</h3>
              <button className="modal-close" onClick={() => { setEditingEntity(null); setIsCreating(false); }}>×</button>
            </div>
            <div className="modal-body">
              {isCreating && (
                <div className="form-group">
                  <label>{t('entities.type')}</label>
                  <select 
                    value={selectedTypeId || 'character'} 
                    onChange={e => setSelectedTypeId(e.target.value)}
                    className="settings-select"
                    title={t('entities.type')}
                  >
                    {entityTypes.map(t => (
                      <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>{t('entities.name')} *</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="settings-input"
                  autoFocus
                  placeholder={t('entities.name')}
                  title={t('entities.name')}
                />
              </div>
              <div className="form-group">
                <label>{t('entities.aliases')}</label>
                <input
                  type="text"
                  value={editForm.aliases}
                  onChange={e => setEditForm(f => ({ ...f, aliases: e.target.value }))}
                  className="settings-input"
                  placeholder={t('entities.aliasesPlaceholder')}
                />
              </div>
              <div className="form-group">
                <label>{t('entities.description')}</label>
                <textarea
                  value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  className="settings-textarea"
                  rows={3}
                  placeholder={t('entities.description')}
                  title={t('entities.description')}
                />
              </div>
              <div className="form-group">
                <label>{t('entities.notes')}</label>
                <textarea
                  value={editForm.notes}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  className="settings-textarea"
                  rows={2}
                  placeholder={t('entities.notes')}
                  title={t('entities.notes')}
                />
              </div>
              <div className="form-group">
                <label>{t('entities.color')}</label>
                <div className="color-picker-row">
                  <input
                    type="color"
                    value={editForm.color || '#667eea'}
                    onChange={e => setEditForm(f => ({ ...f, color: e.target.value }))}
                    className="color-picker"
                    title={t('entities.color')}
                  />
                  <button 
                    className="btn btn-xs btn-ghost"
                    onClick={() => setEditForm(f => ({ ...f, color: '' }))}
                  >
                    {t('entities.useDefault')}
                  </button>
                </div>
              </div>

              {/* Entity Images Section - only for editing existing entities */}
              {!isCreating && editingEntity && (
                <div className="form-group entity-images-section">
                  <label>{t('entities.images.title')} ({entityImages.length}/3)</label>
                  
                  {isLoadingImages ? (
                    <div className="entity-images-loading">
                      <span className="spinner-small"></span>
                    </div>
                  ) : (
                    <>
                      {/* Image Gallery */}
                      {entityImages.length > 0 && (
                        <div className="entity-images-grid">
                          {entityImages.map((img) => (
                            <div key={img.id} className="entity-image-item">
                              <img 
                                src={img.data_url} 
                                alt={img.name}
                                className="entity-image-preview"
                              />
                              <div className="entity-image-info">
                                {editingImageId === img.id ? (
                                  <input
                                    type="text"
                                    value={editingImageName}
                                    onChange={e => setEditingImageName(e.target.value)}
                                    onBlur={() => handleUpdateImageName(img.id, editingImageName)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handleUpdateImageName(img.id, editingImageName);
                                      if (e.key === 'Escape') { setEditingImageId(null); setEditingImageName(''); }
                                    }}
                                    className="entity-image-name-input"
                                    autoFocus
                                  />
                                ) : (
                                  <span 
                                    className="entity-image-name"
                                    onClick={() => { setEditingImageId(img.id); setEditingImageName(img.name); }}
                                    title={t('entities.images.clickToRename')}
                                  >
                                    {img.name}
                                  </span>
                                )}
                                <button
                                  className="entity-image-delete"
                                  onClick={() => handleDeleteImage(img.id)}
                                  title={t('entities.images.delete')}
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Upload Button */}
                      {entityImages.length < 3 && (
                        <div className="entity-image-upload">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            style={{ display: 'none' }}
                            id="entity-image-input"
                          />
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            📷 {t('entities.images.upload')}
                          </button>
                          <span className="entity-image-hint">
                            {t('entities.images.hint')}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => { setEditingEntity(null); setIsCreating(false); }}>
                {t('cancel')}
              </button>
              <button 
                className="btn btn-primary" 
                onClick={isCreating ? handleCreate : handleUpdate}
                disabled={!editForm.name.trim()}
              >
                {isCreating ? t('create') : t('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Type Modal */}
      {showTypeModal && (
        <div className="modal-overlay" onClick={() => setShowTypeModal(false)}>
          <div className="modal entity-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('entities.createType')}</h3>
              <button className="modal-close" onClick={() => setShowTypeModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>{t('entities.typeName')} *</label>
                <input
                  type="text"
                  value={newType.name}
                  onChange={e => setNewType(t => ({ ...t, name: e.target.value }))}
                  className="settings-input"
                  placeholder="z.B. Fraktion"
                  autoFocus
                  title={t('entities.typeName')}
                />
              </div>
              <div className="form-group">
                <label>{t('entities.typeNamePlural')} *</label>
                <input
                  type="text"
                  value={newType.name_plural}
                  onChange={e => setNewType(t => ({ ...t, name_plural: e.target.value }))}
                  className="settings-input"
                  placeholder="z.B. Fraktionen"
                  title={t('entities.typeNamePlural')}
                />
              </div>
              <div className="form-group">
                <label>{t('entities.typeIcon')}</label>
                <input
                  type="text"
                  value={newType.icon}
                  onChange={e => setNewType(t => ({ ...t, icon: e.target.value }))}
                  className="settings-input icon-input"
                  maxLength={2}
                  title={t('entities.typeIcon')}
                />
              </div>
              <div className="form-group">
                <label>{t('entities.typeColor')}</label>
                <input
                  type="color"
                  value={newType.default_color}
                  onChange={e => setNewType(t => ({ ...t, default_color: e.target.value }))}
                  className="color-picker"
                  title={t('entities.typeColor')}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowTypeModal(false)}>
                {t('cancel')}
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleCreateType}
                disabled={!newType.name.trim() || !newType.name_plural.trim()}
              >
                {t('create')}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🗑️ {t('entities.confirmDeleteTitle', 'Löschen bestätigen')}</h3>
              <button className="modal-close" onClick={cancelDelete}>×</button>
            </div>
            <div className="modal-body">
              <p>{t('entities.confirmDeleteMessage', 'Möchten Sie "{name}" wirklich löschen?').replace('{name}', deleteConfirmName)}</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={cancelDelete}>
                {t('cancel', 'Abbrechen')}
              </button>
              <button className="btn btn-danger" onClick={confirmDelete}>
                {t('delete', 'Löschen')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Entity Card Sub-Component
// ============================================================================

interface EntityCardProps {
  entity: Entity;
  type?: EntityType;
  color: string;
  onEdit: () => void;
  onDelete: () => void;
  onClick?: () => void;
}

const EntityCard: React.FC<EntityCardProps> = ({ entity, type, color, onEdit, onDelete, onClick }) => {
  return (
    <div 
      className="entity-card" 
      data-entity-color={color}
      onClick={onClick}
    >
      <div className="entity-card-header">
        <span className="entity-icon">{type?.icon || '📌'}</span>
        <span className="entity-name">{entity.name}</span>
        <div className="entity-actions">
          <button className="btn btn-xs btn-ghost" onClick={e => { e.stopPropagation(); onEdit(); }} title="Bearbeiten">✏️</button>
          <button className="btn btn-xs btn-ghost" onClick={e => { e.stopPropagation(); onDelete(); }} title="Löschen">🗑️</button>
        </div>
      </div>
      {entity.aliases && (
        <div className="entity-aliases">
          <span className="muted-small">Auch: {entity.aliases}</span>
        </div>
      )}
      {entity.description && (
        <div className="entity-description">
          <p>{entity.description.length > 120 ? entity.description.slice(0, 120) + '…' : entity.description}</p>
        </div>
      )}
    </div>
  );
};

export default EntitiesPanel;
