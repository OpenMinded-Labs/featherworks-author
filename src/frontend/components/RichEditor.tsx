import * as React from 'react';

export interface HighlightSpan { start:number; end:number; className:string; id?:string; }

interface Props {
  value:string;
  onChange:(v:string)=>void;
  highlights:HighlightSpan[];
  command$?: (runner:(cmd:string)=>void)=>void;
}

// Simple layered editor: textarea for input + overlay for highlights
export const RichEditor:React.FC<Props> = ({ value, onChange, highlights, command$ }:Props) => {
  const taRef = React.useRef<HTMLTextAreaElement|null>(null);
  const [overlayHtml,setOverlayHtml] = React.useState('');
  const [cursor,setCursor] = React.useState(0);

  React.useEffect(()=>{
    if(!command$) return;
    command$((cmd:string)=>{
      const ta = taRef.current; if(!ta) return;
      const start = ta.selectionStart; const end = ta.selectionEnd;
      function wrap(marker:string){
        const sel = value.slice(start,end);
        const before = value.slice(0,start);
        const after = value.slice(end);
        if(sel.startsWith(marker) && sel.endsWith(marker)){
          const inner = sel.slice(marker.length, sel.length-marker.length);
          onChange(before + inner + after);
          requestAnimationFrame(()=>{ if(ta){ ta.selectionStart = start; ta.selectionEnd = start + inner.length; }});
        } else {
          const wrapped = marker + sel + marker;
            onChange(before + wrapped + after);
            requestAnimationFrame(()=>{ if(ta){ ta.selectionStart = start + marker.length; ta.selectionEnd = start + marker.length + sel.length; }});
        }
      }
      switch(cmd){
        case 'bold': wrap('**'); break;
        case 'italic': wrap('*'); break;
        case 'underline': wrap('__'); break;
        case 'strike': wrap('~~'); break;
      }
      ta.focus();
    });
  },[value, command$]);

  React.useEffect(()=>{
    // Build segments
    const safe = (s:string)=>s
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;');
    const sorted = [...highlights].sort((a,b)=> a.start-b.start || b.end-a.end);
    let pos=0; let out='';
    for(const h of sorted){
      if(h.start < pos) continue; // overlap skip simple
      out += safe(value.slice(pos,h.start));
      const chunk = safe(value.slice(h.start,h.end));
      const active = cursor >= h.start && cursor <= h.end;
      out += `<span class="${h.className} ${active? 'hl-active':''}" data-eid="${h.id||''}">${chunk}</span>`;
      pos = h.end;
    }
    out += safe(value.slice(pos));
    // Preserve trailing newline height
    if(value.endsWith('\n')) out += '\n';
    setOverlayHtml(out);
  },[value, highlights, cursor]);

  return (
    <div className="fw-editor-wrapper fw-editor-relative">
      <div className="fw-editor-overlay" aria-hidden="true" dangerouslySetInnerHTML={{__html: overlayHtml||'&nbsp;'}} />
      <textarea ref={taRef}
        className="fw-editor-textarea"
        aria-label="Rich Text Editor"
        spellCheck={false}
        value={value}
        onScroll={e=>{ const o = (e.target as HTMLTextAreaElement); const overlay=o.previousElementSibling as HTMLElement; overlay.scrollTop=o.scrollTop; overlay.scrollLeft=o.scrollLeft; }}
        onKeyUp={e=>{ const t=e.currentTarget; setCursor(t.selectionStart); }}
        onClick={e=>{ const t=e.currentTarget; setCursor(t.selectionStart); }}
        onChange={e=>{ onChange(e.target.value); const t=e.currentTarget; setCursor(t.selectionStart); }} />
      {/* Visible text layer (mirror) handled by overlay; textarea text transparent */}
    </div>
  );
};
