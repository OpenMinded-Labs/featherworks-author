/**
 * ResearchBrowser Component für Featherworks Author
 * 
 * Mini-Browser im Research-Panel für Online-Recherche.
 * Nutzt Tauri shell für externe Links oder WebView für inline-Anzeige.
 * 
 * Features (geplant):
 * - URL-Eingabe und Navigation
 * - Lesezeichen-Verwaltung
 * - Tab-ähnliche Verwaltung mehrerer Quellen
 * - Quick-Capture: Text markieren → in Notizen übernehmen
 * 
 * Status: Rudimentär angelegt - wird in Phase 7+ ausgebaut
 */

import React, { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/tauri';
import { open as shellOpen } from '@tauri-apps/api/shell';

// ============================================================================
// Types
// ============================================================================

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  description?: string;
  favicon?: string;
  folderId?: string;
  tags: string[];
  createdAt: string;
}

export interface BookmarkFolder {
  id: string;
  name: string;
  parentId: string | null;
  orderNum: number;
}

interface ResearchBrowserProps {
  /** Callback wenn Text in Notizen übernommen werden soll */
  onCaptureToNotes?: (text: string, sourceUrl: string) => void;
  /** Callback für URL-Änderungen */
  onUrlChange?: (url: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export const ResearchBrowser: React.FC<ResearchBrowserProps> = ({
  onCaptureToNotes,
  onUrlChange,
}) => {
  const { t, i18n } = useTranslation();
  const isGerman = i18n.language === 'de';
  
  // State
  const [currentUrl, setCurrentUrl] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [bookmarkFolders, setBookmarkFolders] = useState<BookmarkFolder[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Bookmark editing
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [bookmarkForm, setBookmarkForm] = useState({
    title: '',
    description: '',
    tags: '',
  });
  
  const inputRef = useRef<HTMLInputElement>(null);

  // ============================================================================
  // Navigation
  // ============================================================================
  
  const navigateTo = useCallback(async (url: string) => {
    // URL normalisieren
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Für jetzt: Im externen Browser öffnen
      // TODO: WebView-Integration für inline-Anzeige
      await shellOpen(normalizedUrl);
      
      setCurrentUrl(normalizedUrl);
      setUrlInput(normalizedUrl);
      onUrlChange?.(normalizedUrl);
      
      // Auto-Bookmark Vorschlag könnte hier kommen
    } catch (e) {
      console.error('Navigation failed:', e);
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, [onUrlChange]);

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput.trim()) {
      navigateTo(urlInput);
    }
  };

  // ============================================================================
  // Bookmarks (Stubs - DB Integration folgt)
  // ============================================================================
  
  const loadBookmarks = useCallback(async () => {
    try {
      // TODO: Implementiere Backend-Command
      // const data = await invoke<Bookmark[]>('list_bookmarks');
      // setBookmarks(data);
      
      // Placeholder für Demo
      setBookmarks([
        {
          id: '1',
          url: 'https://de.wikipedia.org',
          title: 'Wikipedia',
          description: 'Freie Enzyklopädie',
          tags: ['referenz', 'recherche'],
          createdAt: new Date().toISOString(),
        },
        {
          id: '2',
          url: 'https://www.duden.de',
          title: 'Duden',
          description: 'Deutsche Rechtschreibung',
          tags: ['sprache', 'referenz'],
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (e) {
      console.error('Failed to load bookmarks:', e);
    }
  }, []);

  const addBookmark = useCallback(async () => {
    if (!currentUrl) return;
    
    try {
      // TODO: Implementiere Backend-Command
      // await invoke('create_bookmark', { url: currentUrl, title: urlInput });
      
      // Placeholder
      const newBookmark: Bookmark = {
        id: Date.now().toString(),
        url: currentUrl,
        title: urlInput || currentUrl,
        tags: [],
        createdAt: new Date().toISOString(),
      };
      setBookmarks(prev => [...prev, newBookmark]);
    } catch (e) {
      console.error('Failed to add bookmark:', e);
      setError(String(e));
    }
  }, [currentUrl, urlInput]);

  const deleteBookmark = useCallback(async (id: string) => {
    try {
      // TODO: Implementiere Backend-Command
      // await invoke('delete_bookmark', { id });
      
      setBookmarks(prev => prev.filter(b => b.id !== id));
    } catch (e) {
      console.error('Failed to delete bookmark:', e);
    }
  }, []);

  // ============================================================================
  // Quick Capture (Stub)
  // ============================================================================
  
  const captureSelection = useCallback(async () => {
    // TODO: Implementiere Text-Capture aus WebView
    // Für jetzt: Placeholder Dialog
    
    const selectedText = window.getSelection()?.toString();
    if (selectedText && onCaptureToNotes) {
      onCaptureToNotes(selectedText, currentUrl);
    }
  }, [currentUrl, onCaptureToNotes]);

  // ============================================================================
  // Effects
  // ============================================================================
  
  React.useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  // ============================================================================
  // Render
  // ============================================================================
  
  return (
    <div className="research-browser">
      {/* URL Bar */}
      <div className="browser-toolbar">
        <form onSubmit={handleUrlSubmit} className="url-form">
          <button
            type="button"
            className="browser-btn"
            onClick={() => setShowBookmarks(!showBookmarks)}
            title={isGerman ? 'Lesezeichen' : 'Bookmarks'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          
          <input
            ref={inputRef}
            type="text"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            placeholder={isGerman ? 'URL eingeben oder suchen...' : 'Enter URL or search...'}
            className="url-input"
          />
          
          <button
            type="submit"
            className="browser-btn browser-btn-go"
            disabled={!urlInput.trim() || isLoading}
          >
            {isLoading ? (
              <span className="spinner-small" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            )}
          </button>
          
          {currentUrl && (
            <button
              type="button"
              className="browser-btn"
              onClick={addBookmark}
              title={isGerman ? 'Lesezeichen hinzufügen' : 'Add bookmark'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          )}
        </form>
      </div>

      {/* Bookmarks Dropdown */}
      {showBookmarks && (
        <div className="bookmarks-panel">
          <div className="bookmarks-header">
            <h4>{isGerman ? 'Lesezeichen' : 'Bookmarks'}</h4>
          </div>
          <div className="bookmarks-list">
            {bookmarks.length === 0 ? (
              <p className="bookmarks-empty">
                {isGerman ? 'Keine Lesezeichen vorhanden' : 'No bookmarks yet'}
              </p>
            ) : (
              bookmarks.map(bookmark => (
                <div
                  key={bookmark.id}
                  className="bookmark-item"
                  onClick={() => {
                    setUrlInput(bookmark.url);
                    navigateTo(bookmark.url);
                    setShowBookmarks(false);
                  }}
                >
                  <div className="bookmark-info">
                    <span className="bookmark-title">{bookmark.title}</span>
                    <span className="bookmark-url">{bookmark.url}</span>
                  </div>
                  <button
                    className="bookmark-delete"
                    onClick={e => {
                      e.stopPropagation();
                      deleteBookmark(bookmark.id);
                    }}
                    title={isGerman ? 'Löschen' : 'Delete'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Browser Content Area */}
      <div className="browser-content">
        {error ? (
          <div className="browser-error">
            <p>{error}</p>
          </div>
        ) : currentUrl ? (
          <div className="browser-placeholder">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <p>
              {isGerman 
                ? 'Link wird im externen Browser geöffnet'
                : 'Link opens in external browser'}
            </p>
            <small>{currentUrl}</small>
            <p className="browser-hint">
              {isGerman
                ? 'WebView-Integration in Entwicklung...'
                : 'WebView integration in development...'}
            </p>
          </div>
        ) : (
          <div className="browser-placeholder">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <p>
              {isGerman 
                ? 'Gib eine URL ein um zu recherchieren'
                : 'Enter a URL to start researching'}
            </p>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="browser-actions">
        <button
          className="browser-action-btn"
          onClick={captureSelection}
          disabled={!currentUrl}
          title={isGerman ? 'Auswahl in Notizen speichern' : 'Save selection to notes'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
          </svg>
          <span>{isGerman ? 'In Notizen' : 'To Notes'}</span>
        </button>
      </div>
    </div>
  );
};

export default ResearchBrowser;
