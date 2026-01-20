import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { switchLanguageWithRestart } from '../i18n';

export interface EditorSettings {
  font_family: string;
  font_size: number;
  line_height: number;
  paragraph_spacing?: number;
  page_padding?: number;
  editor_language?: 'de' | 'en';  // NEW: separate editor language
  typewriter_mode?: boolean;  // Keep cursor vertically centered
  typewriter_sound?: boolean;  // Typewriter key sounds
  typewriter_volume?: number;  // Sound volume 0-100
}

interface Props {
  settings: EditorSettings | null;
  onSave: (settings: EditorSettings) => void;
  saveNow?: () => Promise<void>;
}

const FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter (Sans-Serif)' },
  { value: 'Georgia', label: 'Georgia (Serif)' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Palatino', label: 'Palatino' },
  { value: 'Garamond', label: 'Garamond' },
  { value: 'Merriweather', label: 'Merriweather' },
  { value: 'Lora', label: 'Lora' },
  { value: 'Source Serif Pro', label: 'Source Serif Pro' },
  { value: 'Monaco', label: 'Monaco (Mono)' },
  { value: 'Consolas', label: 'Consolas (Mono)' },
];

export const EditorSettingsPanel: React.FC<Props> = ({ settings, onSave, saveNow }) => {
  const { t, i18n } = useTranslation();
  const [local, setLocal] = useState<EditorSettings>({
    font_family: 'Georgia',
    font_size: 16,
    line_height: 1.6,
    paragraph_spacing: 1.2,
    page_padding: 56,
    editor_language: 'de',  // Default editor language
  });

  const previewRef = useRef<HTMLDivElement>(null);
  const paragraphRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (settings) {
      setLocal({
        ...local,
        ...settings,
      });
    }
  }, [settings]);

  // Apply styles via refs to avoid inline style lint errors
  useEffect(() => {
    if (previewRef.current) {
      previewRef.current.style.fontFamily = local.font_family;
      previewRef.current.style.fontSize = `${local.font_size}px`;
      previewRef.current.style.lineHeight = String(local.line_height);
    }
    if (paragraphRef.current) {
      paragraphRef.current.style.marginBottom = `${local.paragraph_spacing || 1.2}em`;
    }
  }, [local]);

  const handleChange = <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => {
    const next = { ...local, [key]: value };
    setLocal(next);
    // Live preview: save immediately on change
    onSave(next);
  };

  const handleLanguageChange = (lang: 'de' | 'en') => {
    switchLanguageWithRestart(lang, saveNow);
  };

  const handleEditorLanguageChange = (lang: 'de' | 'en') => {
    // Editor language changes immediately without restart
    const next = { ...local, editor_language: lang };
    setLocal(next);
    onSave(next);
  };

  return (
    <div className="editor-settings-panel">
      <h3 className="panel-title">{t('settings.editorTitle')}</h3>

      {/* UI Language Selector entfernt: Die Sprache der Benutzeroberfläche wird jetzt im nativen Menü umgestellt. */}

      {/* Editor Language Selector - affects spellcheck, synonyms, no restart */}
      <div className="settings-group">
        <label className="settings-label" htmlFor="editor-language">
          {t('settings.editorLanguage')}
          <span 
            className="info-icon" 
            title={t('settings.editorLanguage.tooltip')}
            aria-label={t('settings.editorLanguage.tooltip')}
          >
            ℹ️
          </span>
        </label>
        <select
          id="editor-language"
          value={local.editor_language || 'de'}
          onChange={e => handleEditorLanguageChange(e.target.value as 'de' | 'en')}
          className="settings-select"
        >
          <option value="de">{t('settings.editorLanguage.de')}</option>
          <option value="en">{t('settings.editorLanguage.en')}</option>
        </select>
        <span className="settings-hint">{t('settings.editorLanguage.hint')}</span>
      </div>

      {/* Typewriter Mode Toggle - moved up for visibility */}
      <div className="settings-group">
        <label className="settings-label settings-checkbox-label">
          <input
            type="checkbox"
            checked={local.typewriter_mode || false}
            onChange={e => handleChange('typewriter_mode', e.target.checked)}
            className="settings-checkbox"
          />
          <span className="checkbox-text">
            {t('settings.typewriterMode', 'Schreibmaschinen-Modus')}
          </span>
        </label>
        <span className="settings-hint">
          {t('settings.typewriterModeHint', 'Hält den Cursor vertikal zentriert beim Schreiben')}
        </span>
      </div>

      {/* Typewriter Sound - only enabled when typewriter mode is on */}
      <div className={`settings-group settings-indent ${!local.typewriter_mode ? 'settings-disabled' : ''}`}>
        <label className="settings-label settings-checkbox-label">
          <input
            type="checkbox"
            checked={local.typewriter_sound || false}
            onChange={e => handleChange('typewriter_sound', e.target.checked)}
            className="settings-checkbox"
            disabled={!local.typewriter_mode}
          />
          <span className="checkbox-text">
            🔊 {t('settings.typewriterSound', 'Schreibmaschinen-Geräusche')}
          </span>
        </label>
        <span className="settings-hint">
          {t('settings.typewriterSoundHint', 'Tastenklick-Sounds beim Tippen')}
        </span>
      </div>

      {/* Sound Volume - only enabled when sound is on */}
      <div className={`settings-group settings-indent ${(!local.typewriter_mode || !local.typewriter_sound) ? 'settings-disabled' : ''}`}>
        <label className="settings-label" htmlFor="typewriter-volume">
          {t('settings.typewriterVolume', 'Lautstärke')}: {local.typewriter_volume ?? 50}%
        </label>
        <input
          id="typewriter-volume"
          type="range"
          min={0}
          max={100}
          step={5}
          value={local.typewriter_volume ?? 50}
          onChange={e => handleChange('typewriter_volume', Number(e.target.value))}
          className="settings-slider"
          disabled={!local.typewriter_mode || !local.typewriter_sound}
        />
      </div>
      
      <div className="settings-group">
        <label className="settings-label" htmlFor="font-family">
          {t('settings.font')}
        </label>
        <select
          id="font-family"
          value={local.font_family}
          onChange={e => handleChange('font_family', e.target.value)}
          className="settings-select"
        >
          {FONT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-group">
        <label className="settings-label" htmlFor="font-size">
          {t('settings.fontSize')}: {local.font_size}px
        </label>
        <input
          id="font-size"
          type="range"
          min={12}
          max={28}
          step={1}
          value={local.font_size}
          onChange={e => handleChange('font_size', Number(e.target.value))}
          className="settings-slider"
        />
      </div>

      <div className="settings-group">
        <label className="settings-label" htmlFor="line-height">
          {t('settings.lineHeight')}: {local.line_height.toFixed(1)}
        </label>
        <input
          id="line-height"
          type="range"
          min={1.2}
          max={2.4}
          step={0.1}
          value={local.line_height}
          onChange={e => handleChange('line_height', Number(e.target.value))}
          className="settings-slider"
        />
      </div>

      <div className="settings-group">
        <label className="settings-label" htmlFor="paragraph-spacing">
          {t('settings.paragraphSpacing')}: {(local.paragraph_spacing || 1.2).toFixed(1)}em
        </label>
        <input
          id="paragraph-spacing"
          type="range"
          min={0.5}
          max={3}
          step={0.1}
          value={local.paragraph_spacing || 1.2}
          onChange={e => handleChange('paragraph_spacing', Number(e.target.value))}
          className="settings-slider"
        />
      </div>

      <div className="settings-group">
        <label className="settings-label" htmlFor="page-padding">
          {t('settings.pageMargin')}: {local.page_padding || 56}px
        </label>
        <input
          id="page-padding"
          type="range"
          min={16}
          max={120}
          step={4}
          value={local.page_padding || 56}
          onChange={e => handleChange('page_padding', Number(e.target.value))}
          className="settings-slider"
        />
      </div>

      <div className="settings-preview" ref={previewRef}>
        <p ref={paragraphRef}>
          {i18n.language === 'de' 
            ? 'Dies ist eine Vorschau des Textes. So wird der Editor aussehen, wenn du schreibst.'
            : 'This is a text preview. This is how the editor will look when you write.'}
        </p>
        <p>
          {i18n.language === 'de'
            ? 'Der zweite Absatz zeigt den Absatzabstand. Probiere verschiedene Einstellungen aus!'
            : 'The second paragraph shows paragraph spacing. Try different settings!'}
        </p>
      </div>
    </div>
  );
};
