import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { save, open } from '@tauri-apps/api/dialog';
import { toast } from 'sonner';

interface ExportFormatDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectTitle?: string;
  projectAuthor?: string;
}

type ExportFormat = 'pdf' | 'epub' | 'docx' | 'mobi' | 'indesign-xml';

interface FormatInfo {
  id: ExportFormat;
  name: string;
  icon: string;
  description: string;
  extension: string;
  available: boolean;
  needsCover?: boolean;
}

const FORMATS: FormatInfo[] = [
  {
    id: 'pdf',
    name: 'PDF',
    icon: '📄',
    description: 'Druckfertiges PDF mit professionellem Layout',
    extension: 'pdf',
    available: true,
  },
  {
    id: 'epub',
    name: 'EPUB',
    icon: '📱',
    description: 'E-Book-Format für die meisten Reader',
    extension: 'epub',
    available: true,
    needsCover: true,
  },
  {
    id: 'docx',
    name: 'Word (DOCX)',
    icon: '📝',
    description: 'Microsoft Word-kompatibles Format',
    extension: 'docx',
    available: true,
  },
  {
    id: 'indesign-xml',
    name: 'InDesign XML',
    icon: '🎨',
    description: 'XML-Format optimiert für Adobe InDesign Import',
    extension: 'xml',
    available: true,
  },
  {
    id: 'mobi',
    name: 'MOBI / Kindle',
    icon: '📚',
    description: 'Format für Amazon Kindle (via EPUB-Konvertierung)',
    extension: 'mobi',
    available: false, // TODO: Implement
    needsCover: true,
  },
];

export const ExportFormatDialog: React.FC<ExportFormatDialogProps> = ({
  isOpen,
  onClose,
  projectTitle = 'Mein Buch',
  projectAuthor = '',
}) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');
  const [exporting, setExporting] = useState(false);
  const [coverPath, setCoverPath] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedFormatInfo = FORMATS.find(f => f.id === selectedFormat);
  const needsCover = selectedFormatInfo?.needsCover ?? false;

  const handleSelectCover = async () => {
    const selected = await open({
      multiple: false,
      filters: [
        { name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }
      ],
      title: 'Cover-Bild auswählen',
    });
    
    if (selected && typeof selected === 'string') {
      setCoverPath(selected);
    }
  };

  const handleRemoveCover = () => {
    setCoverPath(null);
  };

  const handleExport = async () => {
    const format = FORMATS.find(f => f.id === selectedFormat);
    if (!format) return;

    // Warn if EPUB without cover (but allow it)
    if (selectedFormat === 'epub' && !coverPath) {
      const proceed = window.confirm(
        'Du hast kein Cover ausgewählt. E-Books ohne Cover werden von vielen Shops abgelehnt.\n\nTrotzdem fortfahren?'
      );
      if (!proceed) return;
    }

    // Show save dialog
    const defaultName = `${projectTitle.replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, '')}.${format.extension}`;
    const filePath = await save({
      defaultPath: defaultName,
      filters: [
        { name: format.name, extensions: [format.extension] }
      ],
    });

    if (!filePath) return; // User cancelled

    setExporting(true);
    try {
      switch (selectedFormat) {
        case 'pdf':
          await invoke('export_project_pdf', {
            outputPath: filePath,
          });
          break;
        case 'epub':
          await invoke('export_project_epub', {
            outputPath: filePath,
            coverPath: coverPath,
          });
          break;
        case 'docx':
          await invoke('export_project_docx', {
            outputPath: filePath,
          });
          break;
        case 'indesign-xml':
          await invoke('export_project_indesign_xml', {
            outputPath: filePath,
          });
          break;
        case 'mobi':
          // MOBI requires Calibre/kindlegen - show info
          toast.error('MOBI-Export wird noch nicht unterstützt. Exportiere als EPUB und konvertiere mit Calibre.');
          setExporting(false);
          return;
      }
      toast.success(`${format.name} erfolgreich exportiert!`);
      onClose();
    } catch (error: any) {
      console.error('Export error:', error);
      toast.error(`Export fehlgeschlagen: ${error?.message || error}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="export-dialog-overlay" onClick={onClose}>
      <div className="export-dialog" onClick={e => e.stopPropagation()}>
        <header className="export-dialog-header">
          <h2>📤 Exportieren</h2>
          <button className="close-btn" onClick={onClose} title="Schließen">×</button>
        </header>

        <div className="export-dialog-body">
          <p className="export-dialog-subtitle">Wähle ein Format für deinen Export:</p>
          
          <div className="format-grid">
            {FORMATS.map(format => (
              <button
                key={format.id}
                className={`format-option ${selectedFormat === format.id ? 'selected' : ''} ${!format.available ? 'disabled' : ''}`}
                onClick={() => format.available && setSelectedFormat(format.id)}
                disabled={!format.available}
              >
                <span className="format-icon">{format.icon}</span>
                <span className="format-name">{format.name}</span>
                <span className="format-desc">{format.description}</span>
                {!format.available && <span className="format-badge">Bald verfügbar</span>}
              </button>
            ))}
          </div>

          {/* Cover Selection for EPUB */}
          {needsCover && (
            <div className="cover-section">
              <h3>📷 E-Book Cover</h3>
              <p className="cover-hint">Ein ansprechendes Cover ist wichtig für den Verkauf deines E-Books.</p>
              
              {coverPath ? (
                <div className="cover-preview">
                  <div className="cover-image-container">
                    <img 
                      src={`asset://localhost/${coverPath}`} 
                      alt="Cover Preview" 
                      className="cover-image"
                      onError={(e) => {
                        // Fallback if asset protocol doesn't work
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <div className="cover-filename">{coverPath.split('/').pop()}</div>
                  </div>
                  <div className="cover-actions">
                    <button className="cover-btn change" onClick={handleSelectCover}>
                      🔄 Ändern
                    </button>
                    <button className="cover-btn remove" onClick={handleRemoveCover}>
                      🗑️ Entfernen
                    </button>
                  </div>
                </div>
              ) : (
                <button className="cover-select-btn" onClick={handleSelectCover}>
                  <span className="cover-select-icon">🖼️</span>
                  <span className="cover-select-text">Cover-Bild auswählen</span>
                  <span className="cover-select-hint">PNG, JPG, WEBP • Empfohlen: 1600×2400px</span>
                </button>
              )}
            </div>
          )}
        </div>

        <footer className="export-dialog-footer">
          <button className="cancel-btn" onClick={onClose} disabled={exporting}>
            Abbrechen
          </button>
          <button 
            className="export-btn" 
            onClick={handleExport} 
            disabled={exporting || !FORMATS.find(f => f.id === selectedFormat)?.available}
          >
            {exporting ? '⏳ Exportiere...' : `📤 Als ${FORMATS.find(f => f.id === selectedFormat)?.name} exportieren`}
          </button>
        </footer>
      </div>

      <style>{`
        .export-dialog-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          backdrop-filter: blur(4px);
        }

        .export-dialog {
          background: var(--bg-secondary, #1e1e1e);
          border: 1px solid var(--border-color, #333);
          border-radius: 16px;
          width: 90%;
          max-width: 520px;
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
          overflow: hidden;
        }

        .export-dialog-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid var(--border-color, #333);
        }

        .export-dialog-header h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .export-dialog-header .close-btn {
          background: none;
          border: none;
          font-size: 24px;
          color: var(--text-muted, #888);
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 6px;
          transition: all 0.15s;
        }

        .export-dialog-header .close-btn:hover {
          background: var(--bg-tertiary, #2a2a2a);
          color: var(--text-primary, #f0f0f0);
        }

        .export-dialog-body {
          padding: 24px;
        }

        .export-dialog-subtitle {
          margin: 0 0 16px 0;
          color: var(--text-secondary, #aaa);
          font-size: 14px;
        }

        .format-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .format-option {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px 16px;
          background: var(--bg-tertiary, #2a2a2a);
          border: 2px solid transparent;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
          text-align: center;
        }

        .format-option:hover:not(.disabled) {
          background: var(--bg-hover, #333);
          border-color: var(--border-color, #444);
        }

        .format-option.selected {
          border-color: var(--accent-color, #3b82f6);
          background: rgba(59, 130, 246, 0.1);
        }

        .format-option.disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .format-icon {
          font-size: 32px;
          margin-bottom: 8px;
        }

        .format-name {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary, #f0f0f0);
          margin-bottom: 4px;
        }

        .format-desc {
          font-size: 11px;
          color: var(--text-muted, #888);
          line-height: 1.4;
        }

        .format-badge {
          position: absolute;
          top: 8px;
          right: 8px;
          background: var(--warning-color, #f59e0b);
          color: #000;
          font-size: 9px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 4px;
          text-transform: uppercase;
        }

        /* Cover Section */
        .cover-section {
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid var(--border-color, #333);
        }

        .cover-section h3 {
          margin: 0 0 8px 0;
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary, #f0f0f0);
        }

        .cover-hint {
          margin: 0 0 16px 0;
          font-size: 12px;
          color: var(--text-muted, #888);
        }

        .cover-select-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 100%;
          padding: 24px;
          background: var(--bg-tertiary, #2a2a2a);
          border: 2px dashed var(--border-color, #444);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
          gap: 8px;
        }

        .cover-select-btn:hover {
          border-color: var(--accent-color, #3b82f6);
          background: rgba(59, 130, 246, 0.05);
        }

        .cover-select-icon {
          font-size: 32px;
        }

        .cover-select-text {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary, #f0f0f0);
        }

        .cover-select-hint {
          font-size: 11px;
          color: var(--text-muted, #888);
        }

        .cover-preview {
          display: flex;
          gap: 16px;
          align-items: flex-start;
        }

        .cover-image-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .cover-image {
          max-width: 120px;
          max-height: 180px;
          border-radius: 4px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          object-fit: cover;
        }

        .cover-filename {
          font-size: 11px;
          color: var(--text-muted, #888);
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .cover-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .cover-btn {
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.15s;
          border: 1px solid var(--border-color, #444);
          background: var(--bg-tertiary, #2a2a2a);
          color: var(--text-primary, #f0f0f0);
        }

        .cover-btn:hover {
          background: var(--bg-hover, #333);
        }

        .cover-btn.remove:hover {
          background: rgba(239, 68, 68, 0.2);
          border-color: #ef4444;
          color: #ef4444;
        }

        .export-dialog-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 16px 24px;
          border-top: 1px solid var(--border-color, #333);
          background: var(--bg-tertiary, #1a1a1a);
        }

        .export-dialog-footer button {
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }

        .cancel-btn {
          background: var(--bg-tertiary, #333);
          border: 1px solid var(--border-color, #444);
          color: var(--text-primary, #f0f0f0);
        }

        .cancel-btn:hover:not(:disabled) {
          background: var(--bg-hover, #3a3a3a);
        }

        .export-btn {
          background: var(--accent-color, #3b82f6);
          border: none;
          color: white;
        }

        .export-btn:hover:not(:disabled) {
          background: var(--accent-hover, #2563eb);
        }

        .export-btn:disabled,
        .cancel-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

export default ExportFormatDialog;
