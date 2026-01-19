"use client"

import { Card } from "@/components/ui/card"
import { Users, MapPin, Package } from "lucide-react"
import type { Entity } from "@/lib/types"

interface EntityTooltipProps {
  entity: Entity
  position: { x: number; y: number }
}

export function EntityTooltip({ entity, position }: EntityTooltipProps) {
  const getIcon = () => {
    switch (entity.type) {
      case "character":
        return <Users className="h-4 w-4" />
      case "location":
        return <MapPin className="h-4 w-4" />
      case "object":
        return <Package className="h-4 w-4" />
    }
  }

  const getTypeLabel = () => {
    switch (entity.type) {
      case "character":
        return "Charakter"
      case "location":
        return "Ort"
      case "object":
        return "Gegenstand"
    }
  }

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: "translate(-50%, -100%)",
      }}
    >
      <Card className="w-80 p-4 shadow-lg border-2 border-primary/20 bg-popover">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-primary">{getIcon()}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-sm text-popover-foreground">{entity.name}</h4>
              <span className="text-xs text-muted-foreground">({getTypeLabel()})</span>
            </div>

            {entity.description && <p className="text-sm text-muted-foreground mb-3">{entity.description}</p>}

            {entity.details && Object.keys(entity.details).length > 0 && (
              <div className="space-y-1.5 border-t border-border pt-2">
                {Object.entries(entity.details)
                  .filter(([_, value]) => value)
                  .slice(0, 3)
                  .map(([key, value]) => (
                    <div key={key} className="text-xs">
                      <span className="font-medium text-popover-foreground capitalize">{key}: </span>
                      <span className="text-muted-foreground">{value}</span>
                    </div>
                  ))}
              </div>
            )}

            {entity.aliases && entity.aliases.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">Auch bekannt als:</span> {entity.aliases.join(", ")}
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
