import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/dialog';
import { readBinaryFile } from '@tauri-apps/api/fs';
import { PdfViewer } from './PdfViewer';

// ============================================================================
// Types
// ============================================================================

interface ResearchFolder {
  id: string;
  parentId: string | null;
  name: string;
  orderNum: number;
  itemCount: number;
}

interface ResearchItem {
  id: string;
  folderId: string | null;
  itemType: 'note' | 'url' | 'pdf' | 'image';
  title: string;
  content: string;
  sourceUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  extractedFacts: string | null;
  tags: string[];
  orderNum: number;
  createdAt: string;
}

interface ResearchPanelProps {
  onInsertText?: (text: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export const ResearchPanel: React.FC<ResearchPanelProps> = ({ onInsertText }) => {
  const { t, i18n } = useTranslation();
  const isGerman = i18n.language === 'de';
  
  // State
  const [folders, setFolders] = useState<ResearchFolder[]>([]);
  const [items, setItems] = useState<ResearchItem[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ResearchItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ResearchItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Edit states
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<ResearchItem | null>(null);
  const [editingFolder, setEditingFolder] = useState<ResearchFolder | null>(null);
  
  // Forms
  const [folderForm, setFolderForm] = useState({ name: '' });
  const [itemForm, setItemForm] = useState({
    title: '',
    content: '',
    sourceUrl: '',
    itemType: 'note' as 'note' | 'url',
    tags: '',
  });
  
  // AI Extraction state
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedFacts, setExtractedFacts] = useState<string | null>(null);
  
  // PDF data for preview
  const [pdfData, setPdfData] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);

  // ============================================================================
  // Data Loading
  // ============================================================================
  
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [foldersData, itemsData] = await Promise.all([
        invoke<ResearchFolder[]>('list_research_folders'),
        invoke<ResearchItem[]>('list_research_items', { folderId: selectedFolderId }),
      ]);
      setFolders(foldersData);
      setItems(itemsData);
    } catch (e) {
      console.error('Failed to load research data:', e);
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, [selectedFolderId]);
  
  useEffect(() => {
    loadData();
  }, [loadData]);
  
  // Load PDF data when selecting a PDF item
  useEffect(() => {
    const loadPdfData = async () => {
      if (selectedItem?.itemType === 'pdf') {
        setLoadingPdf(true);
        setPdfData(null);
        try {
          const data = await invoke<string>('get_research_file_data', { id: selectedItem.id });
          setPdfData(data);
        } catch (e) {
          console.error('Failed to load PDF data:', e);
        } finally {
          setLoadingPdf(false);
        }
      } else {
        setPdfData(null);
      }
    };
    
    loadPdfData();
  }, [selectedItem?.id, selectedItem?.itemType]);
  
  // Search
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const results = await invoke<ResearchItem[]>('search_research', { query: searchQuery });
      setSearchResults(results);
    } catch (e) {
      console.error('Search failed:', e);
    }
  };
  
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        handleSearch();
      } else {
        setSearchResults(null);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ============================================================================
  // Folder CRUD
  // ============================================================================
  
  const handleCreateFolder = async () => {
    if (!folderForm.name.trim()) return;
    try {
      await invoke('create_research_folder', {
        name: folderForm.name,
        parentId: selectedFolderId,
      });
      setFolderForm({ name: '' });
      setIsCreatingFolder(false);
      loadData();
    } catch (e) {
      console.error('Failed to create folder:', e);
    }
  };
  
  const handleUpdateFolder = async () => {
    if (!editingFolder || !folderForm.name.trim()) return;
    try {
      await invoke('update_research_folder', {
        id: editingFolder.id,
        name: folderForm.name,
      });
      setEditingFolder(null);
      loadData();
    } catch (e) {
      console.error('Failed to update folder:', e);
    }
  };
  
  const handleDeleteFolder = async (id: string) => {
    if (!confirm(isGerman ? 'Ordner wirklich löschen? Enthaltene Einträge werden nicht gelöscht.' : 'Really delete folder? Items inside will not be deleted.')) return;
    try {
      await invoke('delete_research_folder', { id });
      if (selectedFolderId === id) setSelectedFolderId(null);
      loadData();
    } catch (e) {
      console.error('Failed to delete folder:', e);
    }
  };

  // ============================================================================
  // Item CRUD
  // ============================================================================
  
  const handleCreateItem = async () => {
    if (!itemForm.title.trim()) return;
    try {
      await invoke('create_research_item', {
        folderId: selectedFolderId,
        itemType: itemForm.itemType,
        title: itemForm.title,
        content: itemForm.content,
        sourceUrl: itemForm.sourceUrl || null,
      });
      setItemForm({ title: '', content: '', sourceUrl: '', itemType: 'note', tags: '' });
      setIsCreatingItem(false);
      loadData();
    } catch (e) {
      console.error('Failed to create item:', e);
    }
  };
  
  const handleUpdateItem = async () => {
    if (!editingItem || !itemForm.title.trim()) return;
    try {
      const tags = itemForm.tags.split(',').map(t => t.trim()).filter(t => t);
      await invoke('update_research_item', {
        id: editingItem.id,
        title: itemForm.title,
        content: itemForm.content,
        sourceUrl: itemForm.sourceUrl || null,
        tags,
      });
      setEditingItem(null);
      loadData();
    } catch (e) {
      console.error('Failed to update item:', e);
    }
  };
  
  const handleDeleteItem = async (id: string) => {
    if (!confirm(isGerman ? 'Eintrag wirklich löschen?' : 'Really delete item?')) return;
    try {
      await invoke('delete_research_item', { id });
      if (selectedItem?.id === id) setSelectedItem(null);
      loadData();
    } catch (e) {
      console.error('Failed to delete item:', e);
    }
  };

  // ============================================================================
  // AI Extraction (via Fontaine)
  // ============================================================================
  
  const handleExtractFacts = async (item: ResearchItem) => {
    if (!item.content) return;
    setIsExtracting(true);
    try {
      // Use the AI chat to extract key facts
      // This would call the Fontaine system with a specific extraction prompt
      // For now, we'll store the extracted facts locally
      
      // Placeholder: In production, this would call:
      // const facts = await invoke('extract_research_facts', { content: item.content });
      
      // For now, just show the content
      setExtractedFacts(`${isGerman ? 'Fakten aus' : 'Facts from'}: ${item.title}\n\n${item.content.substring(0, 500)}...`);
    } catch (e) {
      console.error('Failed to extract facts:', e);
    } finally {
      setIsExtracting(false);
    }
  };

  // ============================================================================
  // PDF Import
  // ============================================================================
  
  const handleImportPdf = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'PDF',
          extensions: ['pdf']
        }]
      });
      
      if (!selected || Array.isArray(selected)) return;
      
      // Read the file
      const bytes = await readBinaryFile(selected);
      
      // Convert to base64
      let binary = '';
      const len = bytes.length;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      
      // Extract filename from path
      const fileName = selected.split('/').pop() || selected.split('\\').pop() || 'document.pdf';
      const title = fileName.replace('.pdf', '');
      
      // Create research file item with PDF
      await invoke('create_research_file', {
        folderId: selectedFolderId,
        itemType: 'pdf',
        title: title,
        fileName: fileName,
        mimeType: 'application/pdf',
        fileData: base64,
      });
      
      loadData();
    } catch (e) {
      console.error('Failed to import PDF:', e);
    }
  };

  // ============================================================================
  // Helpers
  // ============================================================================
  
  const getItemIcon = (type: string) => {
    switch (type) {
      case 'url': return '🔗';
      case 'pdf': return '📄';
      case 'image': return '🖼️';
      default: return '📝';
    }
  };
  
  const getFolderTree = (parentId: string | null = null, depth = 0): ResearchFolder[] => {
    const children = folders.filter(f => f.parentId === parentId);
    return children.flatMap(f => [f, ...getFolderTree(f.id, depth + 1)]);
  };
  
  const getFolderDepth = (folderId: string): number => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder || !folder.parentId) return 0;
    return 1 + getFolderDepth(folder.parentId);
  };
  
  const displayItems = searchResults || items;

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
      {/* Header with Search */}
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {isGerman ? 'Recherche' : 'Research'}
          </h2>
          <div className="flex gap-1">
            <button
              onClick={() => {
                setFolderForm({ name: '' });
                setIsCreatingFolder(true);
              }}
              className="px-2 py-1 text-sm bg-muted hover:bg-muted/80 rounded"
              title={isGerman ? 'Neuer Ordner' : 'New Folder'}
            >
              📁+
            </button>
            <button
              onClick={handleImportPdf}
              className="px-2 py-1 text-sm bg-muted hover:bg-muted/80 rounded"
              title={isGerman ? 'PDF importieren' : 'Import PDF'}
            >
              📄+
            </button>
            <button
              onClick={() => {
                setItemForm({ title: '', content: '', sourceUrl: '', itemType: 'note', tags: '' });
                setIsCreatingItem(true);
              }}
              className="px-2 py-1 text-sm bg-primary text-primary-foreground hover:bg-primary/90 rounded"
              title={isGerman ? 'Neuer Eintrag' : 'New Item'}
            >
              +
            </button>
          </div>
        </div>
        
        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={isGerman ? 'Recherche durchsuchen...' : 'Search research...'}
          className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background"
        />
      </div>
      
      <div className="flex flex-1 overflow-hidden">
        {/* Folder Tree */}
        <div className="w-1/3 border-r border-border overflow-y-auto">
          {/* All Items */}
          <button
            onClick={() => setSelectedFolderId(null)}
            className={`w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2
              ${selectedFolderId === null ? 'bg-muted font-medium' : ''}`}
          >
            <span>📚</span>
            <span>{isGerman ? 'Alle Einträge' : 'All Items'}</span>
          </button>
          
          {/* Folders */}
          {getFolderTree().map(folder => (
            <div
              key={folder.id}
              className={`group flex items-center justify-between hover:bg-muted
                ${selectedFolderId === folder.id ? 'bg-muted font-medium' : ''}`}
              style={{ paddingLeft: `${(getFolderDepth(folder.id) + 1) * 12}px` }}
            >
              <button
                onClick={() => setSelectedFolderId(folder.id)}
                className="flex-1 py-2 text-left text-sm flex items-center gap-2"
              >
                <span>📁</span>
                <span className="truncate">{folder.name}</span>
                {folder.itemCount > 0 && (
                  <span className="text-xs text-muted-foreground">({folder.itemCount})</span>
                )}
              </button>
              <div className="hidden group-hover:flex pr-2 gap-1">
                <button
                  onClick={() => {
                    setFolderForm({ name: folder.name });
                    setEditingFolder(folder);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleDeleteFolder(folder.id)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
          
          {folders.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground italic">
              {isGerman ? 'Keine Ordner. Klicke 📁+ zum Erstellen.' : 'No folders. Click 📁+ to create one.'}
            </div>
          )}
        </div>
        
        {/* Items List */}
        <div className="flex-1 overflow-y-auto">
          {searchResults && (
            <div className="px-3 py-2 bg-muted/50 text-sm border-b border-border flex items-center justify-between">
              <span>{searchResults.length} {isGerman ? 'Ergebnisse' : 'results'}</span>
              <button
                onClick={() => { setSearchQuery(''); setSearchResults(null); }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ✕ {isGerman ? 'Suche löschen' : 'Clear search'}
              </button>
            </div>
          )}
          
          {displayItems.length > 0 ? (
            <div className="divide-y divide-border">
              {displayItems.map(item => (
                <div
                  key={item.id}
                  className={`p-3 cursor-pointer hover:bg-muted/50 ${selectedItem?.id === item.id ? 'bg-muted' : ''}`}
                  onClick={() => setSelectedItem(item)}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-lg">{getItemIcon(item.itemType)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{item.title}</div>
                      {item.content && (
                        <div className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {item.content.substring(0, 100)}...
                        </div>
                      )}
                      {item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {item.tags.map((tag, i) => (
                            <span key={i} className="px-1.5 py-0.5 text-xs bg-primary/20 text-primary rounded">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-muted-foreground">
              {searchQuery 
                ? (isGerman ? 'Keine Ergebnisse gefunden.' : 'No results found.')
                : (isGerman ? 'Keine Einträge. Klicke + zum Erstellen.' : 'No items. Click + to create one.')
              }
            </div>
          )}
        </div>
      </div>
      
      {/* Item Detail View */}
      {selectedItem && (
        <div className="border-t border-border p-4 max-h-[40%] overflow-y-auto bg-muted/30">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                {getItemIcon(selectedItem.itemType)}
                {selectedItem.title}
              </h3>
              {selectedItem.sourceUrl && (
                <a 
                  href={selectedItem.sourceUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  {selectedItem.sourceUrl}
                </a>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleExtractFacts(selectedItem)}
                disabled={isExtracting}
                className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                title={isGerman ? 'Fakten extrahieren (KI)' : 'Extract facts (AI)'}
              >
                {isExtracting ? '⏳' : '🧠'} {isGerman ? 'Fakten' : 'Facts'}
              </button>
              <button
                onClick={() => {
                  setItemForm({
                    title: selectedItem.title,
                    content: selectedItem.content,
                    sourceUrl: selectedItem.sourceUrl || '',
                    itemType: selectedItem.itemType as 'note' | 'url',
                    tags: selectedItem.tags.join(', '),
                  });
                  setEditingItem(selectedItem);
                }}
                className="px-2 py-1 text-xs bg-muted rounded hover:bg-muted/80"
              >
                ✏️ {isGerman ? 'Bearbeiten' : 'Edit'}
              </button>
              <button
                onClick={() => handleDeleteItem(selectedItem.id)}
                className="px-2 py-1 text-xs text-red-500 hover:text-red-700"
              >
                🗑️
              </button>
              {onInsertText && selectedItem.content && (
                <button
                  onClick={() => onInsertText(selectedItem.content)}
                  className="px-2 py-1 text-xs bg-muted rounded hover:bg-muted/80"
                  title={isGerman ? 'In Editor einfügen' : 'Insert into editor'}
                >
                  📋 {isGerman ? 'Einfügen' : 'Insert'}
                </button>
              )}
            </div>
          </div>
          
          {/* PDF Preview for PDF items */}
          {selectedItem.itemType === 'pdf' && (
            <div className="mt-4">
              {loadingPdf ? (
                <div className="flex items-center justify-center p-8 text-muted-foreground">
                  {isGerman ? 'PDF wird geladen...' : 'Loading PDF...'}
                </div>
              ) : pdfData ? (
                <PdfViewer 
                  pdfData={pdfData}
                  maxHeight={400}
                />
              ) : (
                <div className="flex items-center justify-center p-8 text-muted-foreground">
                  {isGerman ? 'PDF konnte nicht geladen werden' : 'Failed to load PDF'}
                </div>
              )}
            </div>
          )}
          
          {/* Text content for non-PDF items */}
          {selectedItem.itemType !== 'pdf' && (
            <div className="text-sm whitespace-pre-wrap">
              {selectedItem.content || (isGerman ? '(Kein Inhalt)' : '(No content)')}
            </div>
          )}
          
          {/* Extracted Facts */}
          {(selectedItem.extractedFacts || extractedFacts) && (
            <div className="mt-4 p-3 bg-background rounded border border-border">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                🧠 {isGerman ? 'Extrahierte Fakten' : 'Extracted Facts'}
              </h4>
              <div className="text-sm whitespace-pre-wrap text-muted-foreground">
                {selectedItem.extractedFacts || extractedFacts}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Create/Edit Folder Modal */}
      {(isCreatingFolder || editingFolder) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setIsCreatingFolder(false); setEditingFolder(null); }}>
          <div className="bg-background rounded-lg shadow-xl p-4 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">
              {editingFolder 
                ? (isGerman ? 'Ordner umbenennen' : 'Rename Folder')
                : (isGerman ? 'Neuer Ordner' : 'New Folder')
              }
            </h3>
            
            <input
              type="text"
              value={folderForm.name}
              onChange={(e) => setFolderForm({ name: e.target.value })}
              placeholder={isGerman ? 'Ordnername...' : 'Folder name...'}
              className="w-full px-3 py-2 border border-border rounded-md bg-background mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  editingFolder ? handleUpdateFolder() : handleCreateFolder();
                }
              }}
            />
            
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setIsCreatingFolder(false); setEditingFolder(null); }}
                className="px-4 py-2 bg-muted hover:bg-muted/80 rounded-md"
              >
                {isGerman ? 'Abbrechen' : 'Cancel'}
              </button>
              <button
                onClick={editingFolder ? handleUpdateFolder : handleCreateFolder}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                {editingFolder 
                  ? (isGerman ? 'Speichern' : 'Save')
                  : (isGerman ? 'Erstellen' : 'Create')
                }
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Create/Edit Item Modal */}
      {(isCreatingItem || editingItem) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setIsCreatingItem(false); setEditingItem(null); }}>
          <div className="bg-background rounded-lg shadow-xl p-4 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">
              {editingItem 
                ? (isGerman ? 'Eintrag bearbeiten' : 'Edit Item')
                : (isGerman ? 'Neuer Eintrag' : 'New Item')
              }
            </h3>
            
            <div className="space-y-3">
              {!editingItem && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {isGerman ? 'Typ' : 'Type'}
                  </label>
                  <select
                    value={itemForm.itemType}
                    onChange={(e) => setItemForm(f => ({ ...f, itemType: e.target.value as 'note' | 'url' }))}
                    className="w-full px-3 py-2 border border-border rounded-md bg-background"
                  >
                    <option value="note">📝 {isGerman ? 'Notiz' : 'Note'}</option>
                    <option value="url">🔗 {isGerman ? 'URL / Webclip' : 'URL / Web Clip'}</option>
                  </select>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium mb-1">
                  {isGerman ? 'Titel' : 'Title'}
                </label>
                <input
                  type="text"
                  value={itemForm.title}
                  onChange={(e) => setItemForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background"
                  placeholder={isGerman ? 'Titel des Eintrags...' : 'Item title...'}
                  autoFocus
                />
              </div>
              
              {itemForm.itemType === 'url' && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    URL
                  </label>
                  <input
                    type="url"
                    value={itemForm.sourceUrl}
                    onChange={(e) => setItemForm(f => ({ ...f, sourceUrl: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-md bg-background"
                    placeholder="https://..."
                  />
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium mb-1">
                  {isGerman ? 'Inhalt / Notizen' : 'Content / Notes'}
                </label>
                <textarea
                  value={itemForm.content}
                  onChange={(e) => setItemForm(f => ({ ...f, content: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background resize-none"
                  rows={6}
                  placeholder={isGerman ? 'Text, Zitate, Notizen...' : 'Text, quotes, notes...'}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">
                  {isGerman ? 'Tags (kommagetrennt)' : 'Tags (comma-separated)'}
                </label>
                <input
                  type="text"
                  value={itemForm.tags}
                  onChange={(e) => setItemForm(f => ({ ...f, tags: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background"
                  placeholder={isGerman ? 'z.B. Mittelalter, Waffen, Kleidung' : 'e.g. Medieval, Weapons, Clothing'}
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => { setIsCreatingItem(false); setEditingItem(null); }}
                className="px-4 py-2 bg-muted hover:bg-muted/80 rounded-md"
              >
                {isGerman ? 'Abbrechen' : 'Cancel'}
              </button>
              <button
                onClick={editingItem ? handleUpdateItem : handleCreateItem}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                {editingItem 
                  ? (isGerman ? 'Speichern' : 'Save')
                  : (isGerman ? 'Erstellen' : 'Create')
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResearchPanel;
