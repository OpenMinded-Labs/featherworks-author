"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Trash2 } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { useTranslation } from "@/lib/i18n"
import type { Entity } from "@/lib/types"

interface EntityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entity: Entity | null
  entityType: "character" | "location" | "object"
  onSave: (entity: Entity) => void
  onDelete?: (entityId: string) => void
}

export function EntityDialog({ open, onOpenChange, entity, entityType, onSave, onDelete }: EntityDialogProps) {
  const { language } = useLanguage()
  const t = useTranslation(language)

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [aliases, setAliases] = useState("")
  const [customFields, setCustomFields] = useState<Record<string, string>>({})

  useEffect(() => {
    if (entity) {
      setName(entity.name)
      setDescription(entity.description || "")
      setAliases(entity.aliases?.join(", ") || "")
      setCustomFields(entity.details || {})
    } else {
      setName("")
      setDescription("")
      setAliases("")
      setCustomFields(getDefaultFields())
    }
  }, [entity, entityType, language])

  const getDefaultFields = (): Record<string, string> => {
    if (language === "de") {
      switch (entityType) {
        case "character":
          return {
            alter: "",
            aussehen: "",
            persönlichkeit: "",
            hintergrund: "",
          }
        case "location":
          return {
            region: "",
            beschreibung: "",
            atmosphäre: "",
          }
        case "object":
          return {
            typ: "",
            eigenschaften: "",
            bedeutung: "",
          }
      }
    } else {
      switch (entityType) {
        case "character":
          return {
            age: "",
            appearance: "",
            personality: "",
            background: "",
          }
        case "location":
          return {
            region: "",
            description: "",
            atmosphere: "",
          }
        case "object":
          return {
            type: "",
            properties: "",
            significance: "",
          }
      }
    }
  }

  const getTitle = () => {
    const typeNames =
      language === "de"
        ? { character: "Charakter", location: "Ort", object: "Gegenstand" }
        : { character: "Character", location: "Location", object: "Object" }

    const action = language === "de" ? (entity ? "bearbeiten" : "erstellen") : entity ? "Edit" : "Create"

    return entity ? `${action} ${typeNames[entityType]}` : `${typeNames[entityType]} ${action}`
  }

  const handleCustomFieldChange = (key: string, value: string) => {
    setCustomFields((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    const newEntity: Entity = {
      id: entity ? entity.id : crypto.randomUUID(),
      name,
      description,
      aliases: aliases.split(", ").filter((alias) => alias.trim()),
      details: customFields,
    }
    onSave(newEntity)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
          <DialogDescription>
            {language === "de"
              ? "Fügen Sie Details hinzu, die automatisch im Text erkannt werden."
              : "Add details that will be automatically recognized in the text."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t.name} *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={language === "de" ? "Name eingeben..." : "Enter name..."}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{language === "de" ? "Kurzbeschreibung" : "Short Description"}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={language === "de" ? "Eine kurze Beschreibung..." : "A short description..."}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="aliases">
              {t.aliases} ({language === "de" ? "kommagetrennt" : "comma-separated"})
            </Label>
            <Input
              id="aliases"
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder={t.aliasesPlaceholder}
            />
            <p className="text-xs text-muted-foreground">
              {language === "de"
                ? "Alternative Namen, die im Text erkannt werden sollen"
                : "Alternative names to be recognized in the text"}
            </p>
          </div>

          <div className="border-t pt-4 space-y-4">
            <h4 className="font-medium text-sm">{language === "de" ? "Zusätzliche Details" : "Additional Details"}</h4>
            {Object.entries(customFields).map(([key, value]) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={key} className="capitalize">
                  {key}
                </Label>
                <Textarea
                  id={key}
                  value={value}
                  onChange={(e) => handleCustomFieldChange(key, e.target.value)}
                  placeholder={`${language === "de" ? "Eingeben" : "Enter"} ${key}...`}
                  rows={2}
                />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <div>
            {entity && onDelete && (
              <Button variant="destructive" size="sm" onClick={() => onDelete(entity.id)}>
                <Trash2 className="h-4 w-4 mr-2" />
                {t.delete}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t.cancel}
            </Button>
            <Button onClick={handleSave} disabled={!name.trim()}>
              {t.save}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
