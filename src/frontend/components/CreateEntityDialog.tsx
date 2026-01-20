import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/dialog';
import { readBinaryFile } from '@tauri-apps/api/fs';

// ============================================================================
// Types
// ============================================================================

// Schema field types for custom entity fields
interface SchemaField {
  name: string;
  type: 'text' | 'number' | 'date' | 'textarea' | 'select';
  label: string;
  placeholder?: string;
  options?: string[];  // For select type
  required?: boolean;
}

interface EntityType {
  id: string;
  name: string;
  name_plural: string;
  icon: string;
  default_color: string;
  is_system: boolean;
  order_num: number;
  schema_json?: string;  // JSON string of SchemaField[]
}

interface CreateEntityDialogProps {
  isOpen: boolean;
  initialName: string;
  onClose: () => void;
  onCreated: (entityId: string, entityName: string) => void;
  onOpenTypeManager: () => void;  // Opens entities panel for type creation
}

type DialogStep = 'select-type' | 'fill-form';

// Default schema fields for system entity types
const DEFAULT_SCHEMAS: Record<string, SchemaField[]> = {
  character: [
    { name: 'age', type: 'text', label: 'Alter', placeholder: 'z.B. 35, Mitte 30, unbekannt' },
    { name: 'gender', type: 'text', label: 'Geschlecht', placeholder: 'z.B. männlich, weiblich, divers' },
    { name: 'occupation', type: 'text', label: 'Beruf / Rolle', placeholder: 'z.B. Detektiv, Königin' },
    { name: 'appearance', type: 'textarea', label: 'Aussehen', placeholder: 'Physische Beschreibung...' },
    { name: 'personality', type: 'textarea', label: 'Persönlichkeit', placeholder: 'Charaktereigenschaften...' },
    { name: 'backstory', type: 'textarea', label: 'Hintergrund', placeholder: 'Wichtige Hintergrundinformationen...' },
    { name: 'goals', type: 'textarea', label: 'Ziele / Motivation', placeholder: 'Was treibt die Figur an?' },
    { name: 'relationships', type: 'textarea', label: 'Beziehungen', placeholder: 'Beziehungen zu anderen Charakteren...' },
  ],
  location: [
    { name: 'type', type: 'text', label: 'Typ', placeholder: 'z.B. Stadt, Wald, Gebäude' },
    { name: 'region', type: 'text', label: 'Region / Land', placeholder: 'Übergeordneter Ort' },
    { name: 'climate', type: 'text', label: 'Klima / Atmosphäre', placeholder: 'z.B. tropisch, düster, gemütlich' },
    { name: 'features', type: 'textarea', label: 'Besonderheiten', placeholder: 'Markante Merkmale des Ortes...' },
    { name: 'history', type: 'textarea', label: 'Geschichte', placeholder: 'Historische Bedeutung...' },
    { name: 'population', type: 'text', label: 'Einwohner', placeholder: 'Wer lebt hier?' },
  ],
  faction: [
    { name: 'type', type: 'text', label: 'Typ', placeholder: 'z.B. Königreich, Gilde, Familie' },
    { name: 'leader', type: 'text', label: 'Anführer', placeholder: 'Wer führt die Fraktion?' },
    { name: 'headquarters', type: 'text', label: 'Hauptquartier', placeholder: 'Wo ist der Sitz?' },
    { name: 'goals', type: 'textarea', label: 'Ziele', placeholder: 'Was will die Fraktion erreichen?' },
    { name: 'values', type: 'textarea', label: 'Werte / Ideologie', placeholder: 'Wofür steht die Fraktion?' },
    { name: 'members', type: 'textarea', label: 'Wichtige Mitglieder', placeholder: 'Bekannte Mitglieder...' },
    { name: 'allies', type: 'text', label: 'Verbündete', placeholder: 'Mit wem sind sie verbündet?' },
    { name: 'enemies', type: 'text', label: 'Feinde', placeholder: 'Wer sind ihre Gegner?' },
  ],
  item: [
    { name: 'type', type: 'text', label: 'Typ', placeholder: 'z.B. Waffe, Artefakt, Schmuck' },
    { name: 'origin', type: 'text', label: 'Herkunft', placeholder: 'Woher stammt es?' },
    { name: 'owner', type: 'text', label: 'Besitzer', placeholder: 'Wem gehört es?' },
    { name: 'powers', type: 'textarea', label: 'Kräfte / Eigenschaften', placeholder: 'Besondere Fähigkeiten...' },
    { name: 'history', type: 'textarea', label: 'Geschichte', placeholder: 'Historischer Hintergrund...' },
    { name: 'appearance', type: 'textarea', label: 'Aussehen', placeholder: 'Wie sieht es aus?' },
  ],
};

// ============================================================================
// Component
// ============================================================================

export const CreateEntityDialog: React.FC<CreateEntityDialogProps> = ({
  isOpen,
  initialName,
  onClose,
  onCreated,
  onOpenTypeManager,
}) => {
  const { t } = useTranslation();
  
  // State
  const [step, setStep] = useState<DialogStep>('select-type');
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [selectedType, setSelectedType] = useState<EntityType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form state - base fields
  const [formData, setFormData] = useState({
    name: '',
    aliases: '',
    description: '',
    notes: '',
    color: '',
  });
  
  // Custom fields from schema (metadata_json)
  const [customFields, setCustomFields] = useState<Record<string, string>>({});
  
  // Image upload state
  const [pendingImages, setPendingImages] = useState<Array<{
    name: string;
    fileName: string;
    mimeType: string;
    data: number[];
    preview: string;
  }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get schema fields for selected type
  const getSchemaFields = (): SchemaField[] => {
    if (!selectedType) return [];
    
    // First try to parse schema_json from entity type
    if (selectedType.schema_json) {
      try {
        const parsed = JSON.parse(selectedType.schema_json);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {
        console.warn('Failed to parse schema_json:', e);
      }
    }
    
    // Fall back to default schemas for system types
    return DEFAULT_SCHEMAS[selectedType.id] || [];
  };

  // Load entity types when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadEntityTypes();
      setStep('select-type');
      setSelectedType(null);
      setFormData({
        name: initialName,
        aliases: '',
        description: '',
        notes: '',
        color: '',
      });
      setCustomFields({});
      setPendingImages([]);
    }
  }, [isOpen, initialName]);

  const loadEntityTypes = async () => {
    try {
      setIsLoading(true);
      const types = await invoke<EntityType[]>('list_entity_types');
      setEntityTypes(types);
    } catch (err) {
      console.error('Failed to load entity types:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectType = (type: EntityType) => {
    setSelectedType(type);
    setFormData(prev => ({
      ...prev,
      color: type.default_color,
    }));
    // Reset custom fields
    setCustomFields({});
    setStep('fill-form');
  };

  const handleCreateNewType = () => {
    onClose();
    onOpenTypeManager();
  };

  const handleBack = () => {
    setStep('select-type');
    setSelectedType(null);
    setCustomFields({});
    setPendingImages([]);
  };

  // Image handling - for file input (web-style)
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = () => {
        const arrayBuffer = reader.result as ArrayBuffer;
        const data = new Uint8Array(arrayBuffer);
        const preview = URL.createObjectURL(file);
        
        setPendingImages(prev => [...prev, {
          name: file.name.replace(/\.[^.]+$/, ''),
          fileName: file.name,
          mimeType: file.type || 'image/jpeg',
          data: Array.from(data),
          preview
        }]);
      };
      reader.readAsArrayBuffer(file);
    }
    
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  // Image handling - for Tauri file dialog
  const handleAddImage = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp']
        }]
      });
      
      if (!selected) return;
      
      const files = Array.isArray(selected) ? selected : [selected];
      
      for (const filePath of files) {
        const data = await readBinaryFile(filePath);
        const fileName = filePath.split('/').pop() || 'image';
        const ext = fileName.split('.').pop()?.toLowerCase() || 'jpg';
        const mimeType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        
        // Create preview URL
        const blob = new Blob([new Uint8Array(data).buffer], { type: mimeType });
        const preview = URL.createObjectURL(blob);
        
        setPendingImages(prev => [...prev, {
          name: fileName.replace(/\.[^.]+$/, ''),
          fileName,
          mimeType,
          data: Array.from(data),
          preview
        }]);
      }
    } catch (err) {
      console.error('Failed to load image:', err);
    }
  };

  const handleRemoveImage = (index: number) => {
    setPendingImages(prev => {
      const removed = prev[index];
      if (removed?.preview) {
        URL.revokeObjectURL(removed.preview);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSave = async () => {
    if (!selectedType || !formData.name.trim()) return;
    
    try {
      setIsSaving(true);
      
      // Build metadata_json from custom fields
      const metadataJson = JSON.stringify(customFields);
      
      const entityId = await invoke<string>('create_entity', {
        typeId: selectedType.id,
        name: formData.name.trim(),
        aliases: formData.aliases.trim(),
        description: formData.description.trim(),
        notes: formData.notes.trim(),
        color: formData.color || null,
        metadataJson: metadataJson,
      });
      
      // Upload pending images
      for (const img of pendingImages) {
        try {
          await invoke('add_entity_image', {
            req: {
              entity_id: entityId,
              name: img.name,
              file_name: img.fileName,
              mime_type: img.mimeType,
              data: img.data,
            }
          });
        } catch (imgErr) {
          console.error('Failed to upload image:', imgErr);
        }
      }
      
      // Clean up preview URLs
      pendingImages.forEach(img => {
        if (img.preview) URL.revokeObjectURL(img.preview);
      });
      
      // Invalidate entity cache for highlighting
      window.dispatchEvent(new CustomEvent('entity-cache-invalidated'));
      
      onCreated(entityId, formData.name.trim());
      onClose();
    } catch (err) {
      console.error('Failed to create entity:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="entity-dialog-overlay" onClick={onClose}>
      <div 
        className="entity-dialog glass-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Step 1: Select Entity Type */}
        {step === 'select-type' && (
          <>
            <div className="entity-dialog-header">
              <span className="entity-dialog-icon">📚</span>
              <div className="entity-dialog-title-group">
                <h3>{t('entityDialog.selectType')}</h3>
                <span className="entity-dialog-subtitle">„{initialName}"</span>
              </div>
            </div>
            
            <div className="entity-dialog-types">
              {isLoading ? (
                <div className="entity-dialog-loading">...</div>
              ) : (
                entityTypes.map((type) => (
                  <button
                    key={type.id}
                    className="entity-type-option"
                    onClick={() => handleSelectType(type)}
                  >
                    <span 
                      className="type-icon" 
                      style={{ backgroundColor: type.default_color + '20', color: type.default_color }}
                    >
                      {type.icon}
                    </span>
                    <div className="type-content">
                      <span className="type-name">{type.name}</span>
                    </div>
                    <span className="type-arrow">→</span>
                  </button>
                ))
              )}
              
              {/* Create new type option */}
              <button
                className="entity-type-option entity-type-new"
                onClick={handleCreateNewType}
              >
                <span className="type-icon type-icon-new">✨</span>
                <div className="type-content">
                  <span className="type-name">{t('entityDialog.createNewType')}</span>
                  <span className="type-desc">{t('entityDialog.createNewTypeDesc')}</span>
                </div>
                <span className="type-arrow">→</span>
              </button>
            </div>
            
            <button className="entity-dialog-cancel" onClick={onClose}>
              {t('cancel')}
            </button>
          </>
        )}

        {/* Step 2: Fill Entity Form */}
        {step === 'fill-form' && selectedType && (
          <>
            <div className="entity-dialog-header">
              <button className="entity-dialog-back" onClick={handleBack}>
                ←
              </button>
              <span 
                className="entity-dialog-icon" 
                style={{ backgroundColor: selectedType.default_color + '20', color: selectedType.default_color }}
              >
                {selectedType.icon}
              </span>
              <div className="entity-dialog-title-group">
                <h3>{selectedType.name} {t('entityDialog.create')}</h3>
              </div>
            </div>
            
            <div className="entity-dialog-form">
              {/* Base Fields - Always shown */}
              <div className="form-field">
                <label>{t('entityDialog.name')} *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={t('entityDialog.namePlaceholder')}
                  autoFocus
                />
              </div>
              
              <div className="form-field">
                <label>{t('entityDialog.aliases')}</label>
                <input
                  type="text"
                  value={formData.aliases}
                  onChange={(e) => setFormData(prev => ({ ...prev, aliases: e.target.value }))}
                  placeholder={t('entityDialog.aliasesPlaceholder')}
                />
                <span className="form-hint">{t('entityDialog.aliasesHint')}</span>
              </div>
              
              {/* Dynamic Schema Fields */}
              {getSchemaFields().length > 0 && (
                <div className="form-section-divider">
                  <span>{t('entityDialog.additionalFields')}</span>
                </div>
              )}
              
              {getSchemaFields().map((field) => (
                <div className="form-field" key={field.name}>
                  <label>
                    {field.label}
                    {field.required && ' *'}
                  </label>
                  {field.type === 'textarea' ? (
                    <textarea
                      value={customFields[field.name] || ''}
                      onChange={(e) => setCustomFields(prev => ({ ...prev, [field.name]: e.target.value }))}
                      placeholder={field.placeholder}
                      rows={3}
                    />
                  ) : field.type === 'select' && field.options ? (
                    <select
                      value={customFields[field.name] || ''}
                      onChange={(e) => setCustomFields(prev => ({ ...prev, [field.name]: e.target.value }))}
                    >
                      <option value="">{field.placeholder || 'Auswählen...'}</option>
                      {field.options.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                      value={customFields[field.name] || ''}
                      onChange={(e) => setCustomFields(prev => ({ ...prev, [field.name]: e.target.value }))}
                      placeholder={field.placeholder}
                    />
                  )}
                </div>
              ))}
              
              {/* Standard fields after schema fields */}
              <div className="form-section-divider">
                <span>{t('entityDialog.notes')}</span>
              </div>
              
              <div className="form-field">
                <label>{t('entityDialog.description')}</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder={t('entityDialog.descriptionPlaceholder')}
                  rows={3}
                />
              </div>
              
              <div className="form-field">
                <label>{t('entityDialog.notes')}</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder={t('entityDialog.notesPlaceholder')}
                  rows={2}
                />
              </div>
              
              <div className="form-field form-field-color">
                <label>{t('entityDialog.color')}</label>
                <div className="color-picker-row">
                  <input
                    type="color"
                    value={formData.color || selectedType.default_color}
                    onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                    title={t('entityDialog.color')}
                  />
                  <span className="color-preview" style={{ backgroundColor: formData.color || selectedType.default_color }}>
                    {formData.color || selectedType.default_color}
                  </span>
                </div>
              </div>
              
              {/* Image Upload Section */}
              <div className="form-section-divider">
                <span>{t('entityDialog.images')}</span>
              </div>
              
              <div className="form-field">
                <label>{t('entityDialog.addImages')}</label>
                <div className="image-upload-area">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageSelect}
                    id="entity-image-input"
                    style={{ display: 'none' }}
                  />
                  <label htmlFor="entity-image-input" className="image-upload-btn">
                    📷 {t('entityDialog.selectImages')}
                  </label>
                  
                  {pendingImages.length > 0 && (
                    <div className="image-preview-grid">
                      {pendingImages.map((img, idx) => (
                        <div key={idx} className="image-preview-item">
                          <img src={img.preview} alt={img.name} />
                          <button 
                            type="button"
                            className="image-remove-btn"
                            onClick={() => handleRemoveImage(idx)}
                            title={t('entityDialog.removeImage')}
                          >
                            ×
                          </button>
                          <span className="image-name">{img.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="entity-dialog-actions">
              <button className="entity-dialog-cancel" onClick={onClose}>
                {t('cancel')}
              </button>
              <button 
                className="entity-dialog-save"
                onClick={handleSave}
                disabled={!formData.name.trim() || isSaving}
              >
                {isSaving ? '...' : t('entityDialog.save')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CreateEntityDialog;
