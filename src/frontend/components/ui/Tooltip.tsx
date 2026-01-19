/**
 * Tooltip Component für Featherworks Author
 * 
 * Universelle Tooltip-Komponente mit i18n-Support für alle Icon-Buttons.
 * 
 * Verwendung:
 * <Tooltip content="tooltip.save" shortcut="⌘S">
 *   <button><SaveIcon /></button>
 * </Tooltip>
 */

import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import './Tooltip.css';

export interface TooltipProps {
  /** Der Tooltip-Text oder i18n-Key */
  content: string;
  /** Optionaler Keyboard-Shortcut der angezeigt wird */
  shortcut?: string;
  /** Position des Tooltips */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Verzögerung bevor Tooltip erscheint (ms) */
  delay?: number;
  /** Child-Element das den Tooltip triggert */
  children: ReactNode;
  /** Deaktiviert den Tooltip */
  disabled?: boolean;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  shortcut,
  position = 'top',
  delay = 500,
  children,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const showTooltip = () => {
    if (disabled) return;
    
    timeoutRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setCoords(calculatePosition(rect, position));
      }
      setIsVisible(true);
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // i18n-Lookup: Wenn content mit "tooltip." beginnt, übersetzen
  const tooltipText = content.startsWith('tooltip.') ? t(content) : content;

  return (
    <div
      ref={triggerRef}
      className="tooltip-trigger"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      {isVisible && (
        <div
          className={`tooltip tooltip-${position}`}
          style={{ left: coords.x, top: coords.y }}
          role="tooltip"
        >
          <span className="tooltip-content">{tooltipText}</span>
          {shortcut && <span className="tooltip-shortcut">{shortcut}</span>}
        </div>
      )}
    </div>
  );
};

function calculatePosition(
  rect: DOMRect,
  position: 'top' | 'bottom' | 'left' | 'right'
): { x: number; y: number } {
  const offset = 8;
  
  switch (position) {
    case 'top':
      return {
        x: rect.left + rect.width / 2,
        y: rect.top - offset,
      };
    case 'bottom':
      return {
        x: rect.left + rect.width / 2,
        y: rect.bottom + offset,
      };
    case 'left':
      return {
        x: rect.left - offset,
        y: rect.top + rect.height / 2,
      };
    case 'right':
      return {
        x: rect.right + offset,
        y: rect.top + rect.height / 2,
      };
    default:
      return { x: 0, y: 0 };
  }
}

export default Tooltip;
