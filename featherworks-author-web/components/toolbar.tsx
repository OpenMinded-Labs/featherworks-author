"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Users, MapPin, Package, FileSearch, Download, Upload, Settings, Menu } from "lucide-react"
import { ExportDialog } from "@/components/export-dialog"
import { CloudStorageDialog } from "@/components/cloud-storage-dialog"
import { OperatorPanel } from "@/components/operator-panel"
import { FeatherLogo } from "@/components/feather-logo"
import { useLanguage } from "@/lib/language-context"
import { useTranslation, type Language } from "@/lib/i18n"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTheme } from "next-themes"
import type { Project, Entity } from "@/lib/types"

interface ToolbarProps {
  currentProject: Project | null
  onSidebarViewChange: (view: "projects" | "characters" | "locations" | "objects" | "analysis") => void
  entities?: Entity[]
  content?: string
}

export function Toolbar({ currentProject, onSidebarViewChange, entities = [], content = "" }: ToolbarProps) {
  const { language, setLanguage } = useLanguage()
  const t = useTranslation(language)
  const { theme, setTheme } = useTheme()
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const [isCloudDialogOpen, setIsCloudDialogOpen] = useState(false)
  const [isOperatorPanelOpen, setIsOperatorPanelOpen] = useState(false)

  return (
    <>
      <div className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <FeatherLogo className="h-5 w-5 text-primary" />
            <span className="font-semibold text-foreground">{t.appName}</span>
          </div>

          <div className="ml-4 flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => onSidebarViewChange("projects")}>
              <Menu className="h-4 w-4 mr-2" />
              {t.projects}
            </Button>

            <Button variant="ghost" size="sm" onClick={() => onSidebarViewChange("characters")}>
              <Users className="h-4 w-4 mr-2" />
              {t.characters}
            </Button>

            <Button variant="ghost" size="sm" onClick={() => onSidebarViewChange("locations")}>
              <MapPin className="h-4 w-4 mr-2" />
              {t.locations}
            </Button>

            <Button variant="ghost" size="sm" onClick={() => onSidebarViewChange("objects")}>
              <Package className="h-4 w-4 mr-2" />
              {t.objects}
            </Button>

            <Button variant="ghost" size="sm" onClick={() => onSidebarViewChange("analysis")}>
              <FileSearch className="h-4 w-4 mr-2" />
              {t.analysis}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select value={language} onValueChange={(val) => setLanguage(val as Language)}>
            <SelectTrigger className="w-[70px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="de">🇩🇪</SelectItem>
              <SelectItem value="en">🇬🇧</SelectItem>
            </SelectContent>
          </Select>

          <Select value={theme} onValueChange={setTheme}>
            <SelectTrigger className="w-[110px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">{t.light}</SelectItem>
              <SelectItem value="dark">{t.dark}</SelectItem>
              <SelectItem value="eco">{t.eco}</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="ghost" size="sm" onClick={() => setIsExportDialogOpen(true)}>
            <Download className="h-4 w-4 mr-2" />
            {t.export}
          </Button>

          <Button variant="ghost" size="sm" onClick={() => setIsCloudDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            {t.cloud}
          </Button>

          <Button variant="ghost" size="sm" onClick={() => setIsOperatorPanelOpen(!isOperatorPanelOpen)}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ExportDialog
        open={isExportDialogOpen}
        onOpenChange={setIsExportDialogOpen}
        content={content}
        entities={entities}
        project={currentProject}
      />

      <CloudStorageDialog
        open={isCloudDialogOpen}
        onOpenChange={setIsCloudDialogOpen}
        content={content}
        entities={entities}
        project={currentProject}
      />

      <OperatorPanel isOpen={isOperatorPanelOpen} onClose={() => setIsOperatorPanelOpen(false)} />
    </>
  )
}
