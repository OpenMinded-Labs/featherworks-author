/**
 * Theme Service - Verwaltet Farbmodi (Light, Dark, Sepia)
 * 
 * Speichert die Auswahl im LocalStorage und wendet sie beim App-Start an.
 */

export type Theme = 'light' | 'dark' | 'sepia';

const STORAGE_KEY = 'featherworks-theme';
const DEFAULT_THEME: Theme = 'light';

/**
 * Gibt das aktuell aktive Theme zurück
 */
export function getCurrentTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'sepia') {
    return stored;
  }
  
  // Falls nichts gespeichert, System-Präferenz prüfen
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  
  return DEFAULT_THEME;
}

/**
 * Setzt das Theme und speichert es
 */
export function setTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}

/**
 * Wendet das Theme auf das DOM an
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  
  // Entferne alle Theme-Attribute
  root.removeAttribute('data-theme');
  
  // Setze neues Theme (light braucht kein Attribut, da es der Default ist)
  if (theme !== 'light') {
    root.setAttribute('data-theme', theme);
  }
  
  // Meta-Tag für Browser-Chrome anpassen
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    const colors: Record<Theme, string> = {
      light: '#fefefe',
      dark: '#1a1a1a',
      sepia: '#f4ecd8'
    };
    metaThemeColor.setAttribute('content', colors[theme]);
  }
}

/**
 * Wechselt zum nächsten Theme im Zyklus
 */
export function cycleTheme(): Theme {
  const current = getCurrentTheme();
  const themes: Theme[] = ['light', 'dark', 'sepia'];
  const currentIndex = themes.indexOf(current);
  const nextIndex = (currentIndex + 1) % themes.length;
  const nextTheme = themes[nextIndex];
  setTheme(nextTheme);
  return nextTheme;
}

/**
 * Initialisiert das Theme beim App-Start
 */
export function initTheme(): Theme {
  const theme = getCurrentTheme();
  applyTheme(theme);
  
  // Optional: Auf System-Änderungen reagieren
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      // Nur reagieren wenn kein explizites Theme gesetzt wurde
      if (!localStorage.getItem(STORAGE_KEY)) {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }
  
  return theme;
}

/**
 * Gibt Theme-Informationen für die UI zurück
 */
export function getThemeInfo(theme: Theme): { icon: string; label: string; labelDe: string } {
  const info: Record<Theme, { icon: string; label: string; labelDe: string }> = {
    light: { icon: '☀️', label: 'Light', labelDe: 'Hell' },
    dark: { icon: '🌙', label: 'Dark', labelDe: 'Dunkel' },
    sepia: { icon: '📜', label: 'Sepia', labelDe: 'Naturpapier' }
  };
  return info[theme];
}

/**
 * Gibt alle verfügbaren Themes zurück
 */
export function getAllThemes(): Theme[] {
  return ['light', 'dark', 'sepia'];
}
