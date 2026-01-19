import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from './locales/de.json';
import en from './locales/en.json';
import { invoke } from '@tauri-apps/api/tauri';

type Lang = 'de' | 'en';

// Safe localStorage read (Tauri + SSR safety)
function getStoredLang(): Lang {
  try {
    const v = localStorage.getItem('lang');
    if (v === 'de' || v === 'en') return v;
  } catch (_) { /* ignore */ }
  return 'en';
}

const initialLang = getStoredLang();

void i18n
  .use(initReactI18next)
  .init({
    resources: { de: { translation: de }, en: { translation: en } },
    lng: initialLang,
    fallbackLng: 'en',
    supportedLngs: ['de','en'],
    interpolation: { escapeValue: false },
    detection: { order: ['localStorage','navigator'] }
  })
  .then(async () => {
    console.info('[i18n] initialized lang=', i18n.language);
    
    // Sync with backend language setting (the source of truth after restart)
    try {
      const backendLang = await invoke<string>('get_app_language');
      if ((backendLang === 'de' || backendLang === 'en') && backendLang !== i18n.language) {
        console.info('[i18n] Syncing with backend language:', backendLang);
        await i18n.changeLanguage(backendLang);
        try { localStorage.setItem('lang', backendLang); } catch(_) {}
      }
    } catch (e) {
      console.warn('[i18n] Could not sync with backend language:', e);
    }
  })
  .catch(e => console.warn('[i18n] init failed', e));

/**
 * Switch language with full app restart to update native menu
 * 1. Save current scene (if dirty)
 * 2. Store language preference in localStorage AND backend config file
 * 3. Restart the app
 */
export async function switchLanguageWithRestart(lang: Lang, saveNow?: () => Promise<void>) {
  if (i18n.language === lang) return;
  
  console.info('[i18n] Switching language to:', lang, '- will restart app');
  
  try {
    // 1. Save current work if provided
    if (saveNow) {
      console.info('[i18n] Saving current work before restart...');
      await saveNow();
    }
    
    // 2. Store in localStorage for frontend
    try { localStorage.setItem('lang', lang); } catch(_) {}
    
    // 3. Store in backend config file (read by build_menu on restart)
    await invoke('set_app_language', { lang });
    
    // 4. Small delay to ensure save completes
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 5. Restart the app
    console.info('[i18n] Restarting app...');
    await invoke('restart_app');
    
  } catch (e) {
    console.error('[i18n] Failed to switch language:', e);
    // Fallback: just switch without restart
    await i18n.changeLanguage(lang);
    try { localStorage.setItem('lang', lang); } catch(_) {}
  }
}

/**
 * Simple language switch without restart (for cases where menu doesn't matter)
 */
export function switchLanguage(lang: Lang) {
  if (i18n.language === lang) return;
  void i18n.changeLanguage(lang);
  try { localStorage.setItem('lang', lang); } catch(_) {}
}

export default i18n;
