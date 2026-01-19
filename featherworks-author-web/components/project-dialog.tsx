"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/lib/language-context"
import type { Project } from "@/lib/types"

interface ProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project?: Project | null
  onSave: (project: Project) => void
  onDelete?: (projectId: string) => void
}

export function ProjectDialog({ open, onOpenChange, project, onSave, onDelete }: ProjectDialogProps) {
  const { t } = useLanguage()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  useEffect(() => {
    if (project) {
      setName(project.name)
      setDescription(project.description || "")
    } else {
      setName("")
      setDescription("")
    }
  }, [project, open])

  const handleSave = () => {
    const newProject: Project = {
      id: project?.id || crypto.randomUUID(),
      name,
      description,
      createdAt: project?.createdAt || new Date(),
      updatedAt: new Date(),
      chapters: project?.chapters || [
        {
          id: crypto.randomUUID(),
          title: t.defaultChapterTitle,
          order: 0,
          scenes: [
            {
              id: crypto.randomUUID(),
              title: "Scene 1",
              content: "",
              order: 0,
              wordCount: 0,
            },
          ],
        },
      ],
    }

    onSave(newProject)
    onOpenChange(false)
  }

  const handleDelete = () => {
    if (project && onDelete) {
      onDelete(project.id)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{project ? t.edit : t.createProject}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">{t.projectName}</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.projectName}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-description">{t.projectDescription}</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t.projectDescription}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          {project && onDelete && (
            <Button variant="destructive" onClick={handleDelete}>
              {t.deleteProject}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            {t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
