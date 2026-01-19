import React from 'react';

interface CharacterPlaceholder { id:string; name:string; role?:string }

// Placeholder – später aus DB / Analyse abgeleitet
const mockCharacters: CharacterPlaceholder[] = [
  { id:'c1', name:'(Platzhalter) Protagonist', role:'Hauptfigur' },
  { id:'c2', name:'(Platzhalter) Antagonist', role:'Gegenspieler' }
];

export const CharactersPanel:React.FC = () => {
  return (
    <div className="flex-col-gap-8 full-height">
  <div className="panel-title">Charaktere <span className="muted muted-aux">Beta</span></div>
      <div className="panel-sub">Später: Beziehungen, Entwicklungsbögen, Konsistenzprüfungen.</div>
      <div className="panel-body">
        {mockCharacters.map(c => (
          <div key={c.id} className="character-card">
            <div className="char-name">{c.name}</div>
            {c.role && <div className="muted-small">{c.role}</div>}
            <div className="panel-note">* Eigenschaften folgen</div>
          </div>
        ))}
      </div>
  <button type="button" className="btn btn-sm" disabled aria-disabled>Neu (kommt)</button>
    </div>
  );
};
