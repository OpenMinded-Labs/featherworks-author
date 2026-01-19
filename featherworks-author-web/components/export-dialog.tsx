"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Download } from "lucide-react"
import {
  exportToFWAuthor,
  exportToRTF,
  exportToPDF,
  downloadFile,
  getExportFilename,
  DEFAULT_TYPESETTING,
  type ExportFormat,
  type TypesettingOptions,
} from "@/lib/export"
import type { Project, Entity } from "@/lib/types"

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  content: string
  entities: Entity[]
  project: Project | null
}

export function ExportDialog({ open, onOpenChange, content, entities, project }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("fwauthor")
  const [typesetting, setTypesetting] = useState<TypesettingOptions>(DEFAULT_TYPESETTING)

  const handleExport = () => {
    switch (format) {
      case "fwauthor": {
        const data = exportToFWAuthor(content, entities, project)
        const filename = getExportFilename(project, "fwauthor")
        downloadFile(data, filename, "application/json")
        break
      }

      case "rtf": {
        const rtfContent = exportToRTF(content, project, typesetting)
        const filename = getExportFilename(project, "rtf")
        downloadFile(rtfContent, filename, "application/rtf")
        break
      }

      case "pdf": {
        exportToPDF(content, project, typesetting)
        break
      }
    }

    onOpenChange(false)
  }

  const updateTypesetting = (key: keyof TypesettingOptions, value: any) => {
    setTypesetting((prev) => ({ ...prev, [key]: value }))
  }

  const updateMargin = (side: keyof TypesettingOptions["margins"], value: number) => {
    setTypesetting((prev) => ({
      ...prev,
      margins: { ...prev.margins, [side]: value },
    }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Projekt exportieren</DialogTitle>
          <DialogDescription>Wählen Sie das Exportformat und die Einstellungen</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label>Exportformat</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fwauthor">.fwauthor (FeatherWorks Format)</SelectItem>
                <SelectItem value="rtf">RTF (Rich Text Format)</SelectItem>
                <SelectItem value="pdf">PDF (Druckversion)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {format === "fwauthor" && "Speichert alle Daten inkl. Entitäten für die Desktop-Version"}
              {format === "rtf" && "Kompatibel mit Word, LibreOffice und anderen Textverarbeitungen"}
              {format === "pdf" && "Professionelles Buchsatz-Layout zum Drucken"}
            </p>
          </div>

          {(format === "rtf" || format === "pdf") && (
            <>
              <div className="border-t pt-4 space-y-4">
                <h4 className="font-medium text-sm">Buchsatz-Einstellungen</h4>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fontSize">Schriftgröße (pt)</Label>
                    <Input
                      id="fontSize"
                      type="number"
                      value={typesetting.fontSize}
                      onChange={(e) => updateTypesetting("fontSize", Number(e.target.value))}
                      min={8}
                      max={18}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="lineHeight">Zeilenhöhe</Label>
                    <Input
                      id="lineHeight"
                      type="number"
                      step="0.1"
                      value={typesetting.lineHeight}
                      onChange={(e) => updateTypesetting("lineHeight", Number(e.target.value))}
                      min={1}
                      max={3}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Seitengröße</Label>
                  <Select value={typesetting.pageSize} onValueChange={(v) => updateTypesetting("pageSize", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A4">A4 (210 × 297 mm)</SelectItem>
                      <SelectItem value="A5">A5 (148 × 210 mm)</SelectItem>
                      <SelectItem value="Letter">Letter (216 × 279 mm)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <Label>Seitenränder (cm)</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="marginTop" className="text-xs">
                        Oben
                      </Label>
                      <Input
                        id="marginTop"
                        type="number"
                        step="0.5"
                        value={typesetting.margins.top}
                        onChange={(e) => updateMargin("top", Number(e.target.value))}
                        min={1}
                        max={5}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="marginBottom" className="text-xs">
                        Unten
                      </Label>
                      <Input
                        id="marginBottom"
                        type="number"
                        step="0.5"
                        value={typesetting.margins.bottom}
                        onChange={(e) => updateMargin("bottom", Number(e.target.value))}
                        min={1}
                        max={5}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="marginLeft" className="text-xs">
                        Links
                      </Label>
                      <Input
                        id="marginLeft"
                        type="number"
                        step="0.5"
                        value={typesetting.margins.left}
                        onChange={(e) => updateMargin("left", Number(e.target.value))}
                        min={1}
                        max={5}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="marginRight" className="text-xs">
                        Rechts
                      </Label>
                      <Input
                        id="marginRight"
                        type="number"
                        step="0.5"
                        value={typesetting.margins.right}
                        onChange={(e) => updateMargin("right", Number(e.target.value))}
                        min={1}
                        max={5}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="pageNumbers"
                      checked={typesetting.includePageNumbers}
                      onCheckedChange={(checked) => updateTypesetting("includePageNumbers", checked)}
                    />
                    <Label htmlFor="pageNumbers" className="text-sm font-normal cursor-pointer">
                      Seitenzahlen anzeigen
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="chapterBreaks"
                      checked={typesetting.chapterStartsNewPage}
                      onCheckedChange={(checked) => updateTypesetting("chapterStartsNewPage", checked)}
                    />
                    <Label htmlFor="chapterBreaks" className="text-sm font-normal cursor-pointer">
                      Kapitel auf neuer Seite beginnen
                    </Label>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Exportieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
