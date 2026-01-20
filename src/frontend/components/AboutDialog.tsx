import React from 'react';
import { useTranslation } from 'react-i18next';
import '../styles/about-dialog.css';

interface License {
  name: string;
  version?: string;
  license: string;
  url?: string;
  description?: string;
}

const LICENSES: License[] = [
  // Core Technologies
  { name: 'Tauri', version: '1.x', license: 'MIT/Apache-2.0', url: 'https://tauri.app', description: 'Desktop framework' },
  { name: 'React', version: '18.x', license: 'MIT', url: 'https://react.dev', description: 'UI library' },
  { name: 'Rust', license: 'MIT/Apache-2.0', url: 'https://rust-lang.org', description: 'Backend language' },
  
  // AI/LLM
  { name: 'Phi-3-mini-128K-Instruct', license: 'MIT', url: 'https://huggingface.co/microsoft/Phi-3-mini-128k-instruct', description: 'Microsoft AI model (Fontaine)' },
  { name: 'llama.cpp', license: 'MIT', url: 'https://github.com/ggerganov/llama.cpp', description: 'LLM inference engine' },
  { name: 'llm (Rust)', license: 'Apache-2.0', url: 'https://github.com/rustformers/llm', description: 'LLM bindings' },
  
  // Editor
  { name: 'CodeMirror', version: '6.x', license: 'MIT', url: 'https://codemirror.net', description: 'Text editor' },
  
  // i18n & UI
  { name: 'react-i18next', license: 'MIT', url: 'https://react.i18next.com', description: 'Internationalization' },
  { name: '@dnd-kit', license: 'MIT', url: 'https://dndkit.com', description: 'Drag and drop' },
  
  // Spellcheck & Language
  { name: 'Hunspell', license: 'LGPL/GPL/MPL', url: 'https://hunspell.github.io', description: 'Spell checker' },
  { name: 'OpenThesaurus', license: 'LGPL', url: 'https://www.openthesaurus.de', description: 'German thesaurus' },
  { name: 'LanguageTool', license: 'LGPL-2.1', url: 'https://languagetool.org', description: 'Grammar checker (optional)' },
  
  // Database & Storage
  { name: 'SQLite', license: 'Public Domain', url: 'https://sqlite.org', description: 'Database engine' },
  { name: 'rusqlite', license: 'MIT', url: 'https://github.com/rusqlite/rusqlite', description: 'SQLite bindings' },
  
  // Export
  { name: 'jsPDF', license: 'MIT', url: 'https://github.com/parallax/jsPDF', description: 'PDF generation' },
  { name: 'docx', license: 'MIT', url: 'https://github.com/dolanmiu/docx', description: 'DOCX generation' },
  
  // Fonts
  { name: 'Inter', license: 'OFL-1.1', url: 'https://rsms.me/inter', description: 'UI font' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutDialog: React.FC<Props> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  
  if (!isOpen) return null;
  
  const appVersion = '1.0.0'; // TODO: Get from Tauri
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal about-dialog" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label={t('close')}>×</button>
        
        <div className="about-header">
          <img src="/icon.png" alt="FeatherWorks Author" className="about-logo" />
          <div className="about-title-section">
            <h2 className="about-title">FeatherWorks Author</h2>
            <p className="about-version">Version {appVersion}</p>
            <p className="about-tagline">{t('about.tagline', 'Dein KI-Schreibassistent für Romane und Geschichten')}</p>
          </div>
        </div>
        
        <div className="about-content">
          <section className="about-section">
            <h3>{t('about.licenses', 'Open-Source-Lizenzen')}</h3>
            <p className="about-licenses-intro">
              {t('about.licensesIntro', 'FeatherWorks Author nutzt folgende Open-Source-Komponenten:')}
            </p>
            
            <div className="licenses-list">
              {LICENSES.map((lib, idx) => (
                <div key={idx} className="license-item">
                  <div className="license-name">
                    {lib.url ? (
                      <a href={lib.url} target="_blank" rel="noopener noreferrer">
                        {lib.name}
                      </a>
                    ) : lib.name}
                    {lib.version && <span className="license-version">{lib.version}</span>}
                  </div>
                  <div className="license-info">
                    <span className="license-badge">{lib.license}</span>
                    {lib.description && <span className="license-desc">{lib.description}</span>}
                  </div>
                </div>
              ))}
            </div>
          </section>
          
          <section className="about-section">
            <h3>{t('about.credits', 'Danksagungen')}</h3>
            <p>
              {t('about.creditsText', 'Vielen Dank an alle Entwickler und Mitwirkenden der Open-Source-Projekte, die FeatherWorks Author ermöglichen.')}
            </p>
          </section>
          
          <section className="about-section about-legal">
            <p className="about-copyright">
              © 2024-2026 FeatherWorks. {t('about.allRightsReserved', 'Alle Rechte vorbehalten.')}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
