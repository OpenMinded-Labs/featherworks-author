/**
 * EntityTooltip Component
 * Shows entity details on hover in the editor
 */

import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getEntityDetails } from '../entityHighlightService';

export interface EntityTooltipInfo {
  entityId: string;
  entityName: string;
  typeId: string;
  color: string;
  x: number;
  y: number;
}

interface Props {
  info: EntityTooltipInfo | null;
  onClose: () => void;
}

interface EntityDetails {
  id: string;
  name: string;
  type: string;
  description: string;
  notes: string;
  color: string;
}

const TYPE_ICONS: Record<string, string> = {
  character: '👤',
  location: '📍',
  faction: '⚔️',
  item: '💎',
};

const TYPE_LABELS: Record<string, string> = {
  character: 'entities.types.character',
  location: 'entities.types.location',
  faction: 'entities.types.faction',
  item: 'entities.types.item',
};

export const EntityTooltip: React.FC<Props> = ({ info, onClose }) => {
  const { t } = useTranslation();
  const [details, setDetails] = useState<EntityDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const colorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!info) {
      setDetails(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getEntityDetails(info.entityId).then(d => {
      if (!cancelled) {
        setDetails(d);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [info?.entityId]);

  // Calculate safe position - don't go under sidepanel (340px from right) or off-screen
  const tooltipWidth = 280;
  const tooltipHeight = 150;
  const sidepanelWidth = 360; // Right sidepanel
  const safeX = info ? Math.min(info.x, window.innerWidth - sidepanelWidth - tooltipWidth - 20) : 0;
  const safeY = info ? Math.min(info.y, window.innerHeight - tooltipHeight - 20) : 0;

  useLayoutEffect(() => {
    if (!info) return;
    const el = tooltipRef.current;
    if (el) {
      el.style.position = 'fixed';
      el.style.left = `${Math.max(10, safeX)}px`;
      el.style.top = `${Math.max(10, safeY)}px`;
      el.style.zIndex = '99999';
    }
    if (colorRef.current) {
      colorRef.current.style.backgroundColor = info.color;
    }
  }, [info, safeX, safeY]);

  if (!info) return null;

  const icon = TYPE_ICONS[info.typeId] || '📎';
  const typeLabel = TYPE_LABELS[info.typeId] || info.typeId;

  return (
    <div
      className="entity-tooltip"
      ref={tooltipRef}
      onMouseLeave={onClose}
    >
      <div className="entity-tooltip-header">
        <span 
          className="entity-tooltip-color" 
          ref={colorRef}
        />
        <span className="entity-tooltip-icon">{icon}</span>
        <span className="entity-tooltip-name">{info.entityName}</span>
      </div>
      
      <div className="entity-tooltip-type">
        {t(typeLabel)}
      </div>

      {loading ? (
        <div className="entity-tooltip-loading">...</div>
      ) : details ? (
        <>
          {details.description && (
            <div className="entity-tooltip-description">
              {details.description}
            </div>
          )}
          {details.notes && (
            <div className="entity-tooltip-notes">
              <span className="entity-tooltip-notes-label">{t('entities.notes')}:</span>
              <span>{details.notes.substring(0, 100)}{details.notes.length > 100 ? '...' : ''}</span>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
};

export default EntityTooltip;
