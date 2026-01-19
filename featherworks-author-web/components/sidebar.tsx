"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card } from "@/components/ui/card"
import { Plus, Search, AlertCircle, AlertTriangle } from "lucide-react"
import { EntityDialog } from "@/components/entity-dialog"
import { ProjectDialog } from "@/components/project-dialog"
import { ChapterSceneManager } from "@/components/chapter-scene-manager"
import { useLanguage } from "@/lib/language-context"
import type { Project, Entity, TextIssue } from "@/lib/types"

interface SidebarProps {
  view: "projects" | "characters" | "locations" | "objects" | "analysis"
  currentProject: Project | null
  currentChapterId: string | null
  currentSceneId: string | null
  projects: Project[]
  entities: Entity[]
  issues: TextIssue[]
  onProjectChange: (project: Project) => void
  onProjectsChange: (projects: Project[]) => void
  onChapterSelect: (chapterId: string) => void
  onSceneSelect: (sceneId: string) => void
  onEntitiesChange: (entities: Entity[]) => void
}

export function Sidebar({
  view,
  currentProject,
  currentChapterId,
  currentSceneId,
  projects,
  entities,
  issues,
  onProjectChange,
  onProjectsChange,
  onChapterSelect,
  onSceneSelect,
  onEntitiesChange,
}: SidebarProps) {
  const { t } = useLanguage()

  const [isEntityDialogOpen, setIsEntityDialogOpen] = useState(false)
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false)
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const filteredEntities = entities.filter((e) => {
    const matchesType =
      (view === "characters" && e.type === "character") ||
      (view === "locations" && e.type === "location") ||
      (view === "objects" && e.type === "object")

    const matchesSearch =
      searchQuery === "" ||
      e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.description?.toLowerCase().includes(searchQuery.toLowerCase())

    return matchesType && matchesSearch
  })

  const handleCreateEntity = () => {
    setSelectedEntity(null)
    setIsEntityDialogOpen(true)
  }

  const handleEditEntity = (entity: Entity) => {
    setSelectedEntity(entity)
    setIsEntityDialogOpen(true)
  }

  const handleSaveEntity = (entity: Entity) => {
    if (selectedEntity) {
      onEntitiesChange(entities.map((e) => (e.id === entity.id ? entity : e)))
    } else {
      onEntitiesChange([...entities, entity])
    }
    setIsEntityDialogOpen(false)
  }

  const handleDeleteEntity = (entityId: string) => {
    onEntitiesChange(entities.filter((e) => e.id !== entityId))
    setIsEntityDialogOpen(false)
  }

  const getEntityType = (): "character" | "location" | "object" => {
    if (view === "characters") return "character"
    if (view === "locations") return "location"
    return "object"
  }

  const handleCreateProject = () => {
    setSelectedProject(null)
    setIsProjectDialogOpen(true)
  }

  const handleEditProject = (project: Project) => {
    setSelectedProject(project)
    setIsProjectDialogOpen(true)
  }

  const handleSaveProject = (project: Project) => {
    const existingIndex = projects.findIndex((p) => p.id === project.id)
    if (existingIndex >= 0) {
      onProjectsChange(projects.map((p) => (p.id === project.id ? project : p)))
    } else {
      onProjectsChange([...projects, project])
    }
    onProjectChange(project)
    setIsProjectDialogOpen(false)
  }

  const handleDeleteProject = (projectId: string) => {
    onProjectsChange(projects.filter((p) => p.id !== projectId))
    if (currentProject?.id === projectId) {
      onProjectChange(projects[0] || null)
    }
    setIsProjectDialogOpen(false)
  }

  const handleProjectUpdate = (updatedProject: Project) => {
    onProjectsChange(projects.map((p) => (p.id === updatedProject.id ? updatedProject : p)))
    onProjectChange(updatedProject)
  }

  const errorIssues = issues.filter((i) => i.type === "error")
  const repetitionIssues = issues.filter((i) => i.type === "repetition")
  const vampireVerbIssues = issues.filter((i) => i.type === "vampire-verb")

  return (
    <div className="w-80 border-r border-border bg-sidebar">
      <div className="flex h-full flex-col">
        <div className="border-b border-sidebar-border p-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t.searchPlaceholder}
                className="pl-9 bg-background"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {view === "projects" && (
              <Button size="sm" variant="default" onClick={handleCreateProject}>
                <Plus className="h-4 w-4" />
              </Button>
            )}
            {view !== "projects" && view !== "analysis" && (
              <Button size="sm" variant="default" onClick={handleCreateEntity}>
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            {view === "projects" && (
              <>
                {currentProject && (
                  <ChapterSceneManager
                    project={currentProject}
                    currentChapterId={currentChapterId}
                    currentSceneId={currentSceneId}
                    onChapterSelect={onChapterSelect}
                    onSceneSelect={onSceneSelect}
                    onProjectUpdate={handleProjectUpdate}
                  />
                )}

                <div className="pt-4 mt-4 border-t border-border">
                  <h3 className="text-sm font-medium text-foreground mb-2">{t.projects}</h3>
                  {projects.length === 0 ? (
                    <Card
                      className="p-4 hover:bg-accent cursor-pointer transition-colors"
                      onClick={handleCreateProject}
                    >
                      <h3 className="font-medium text-card-foreground">{t.newProject}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{t.startWriting}</p>
                    </Card>
                  ) : (
                    projects.map((project) => (
                      <Card
                        key={project.id}
                        className={`p-3 mb-2 cursor-pointer transition-colors ${
                          currentProject?.id === project.id ? "bg-accent" : "hover:bg-accent/50"
                        }`}
                        onClick={() => handleEditProject(project)}
                      >
                        <h4 className="font-medium text-sm text-card-foreground">{project.name}</h4>
                        {project.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{project.description}</p>
                        )}
                      </Card>
                    ))
                  )}
                </div>
              </>
            )}

            {(view === "characters" || view === "locations" || view === "objects") && (
              <>
                {filteredEntities.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    {searchQuery
                      ? t.noResultsFound
                      : view === "characters"
                        ? t.noCharacters
                        : view === "locations"
                          ? t.noLocations
                          : t.noObjects}
                  </div>
                ) : (
                  filteredEntities.map((entity) => (
                    <Card
                      key={entity.id}
                      className="p-3 hover:bg-accent cursor-pointer transition-colors"
                      onClick={() => handleEditEntity(entity)}
                    >
                      <h4 className="font-medium text-sm text-card-foreground">{entity.name}</h4>
                      {entity.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{entity.description}</p>
                      )}
                      {entity.aliases && entity.aliases.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {t.alias}: {entity.aliases.join(", ")}
                        </p>
                      )}
                    </Card>
                  ))
                )}
              </>
            )}

            {view === "analysis" && (
              <div className="space-y-4">
                <Card className="p-4">
                  <h3 className="font-medium text-sm text-card-foreground mb-3">{t.textAnalysis}</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">{t.errorsFillerWords}:</span>
                      <span className="font-medium text-destructive">{errorIssues.length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">{t.repetitions}:</span>
                      <span className="font-medium text-warning-foreground">{repetitionIssues.length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">{t.vampireVerbs}:</span>
                      <span className="font-medium text-warning-foreground">{vampireVerbIssues.length}</span>
                    </div>
                  </div>
                </Card>

                {issues.length > 0 && (
                  <div className="space-y-3">
                    {errorIssues.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-2">
                          <AlertCircle className="h-3 w-3" />
                          {t.errorsFillerWords}
                        </h4>
                        {errorIssues.slice(0, 5).map((issue) => (
                          <Card key={issue.id} className="p-3 hover:bg-accent cursor-pointer transition-colors">
                            <div className="flex items-start gap-2">
                              <div className="mt-0.5 h-2 w-2 rounded-full bg-destructive flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-card-foreground font-medium">{issue.message}</p>
                                {issue.suggestion && (
                                  <p className="text-xs text-muted-foreground mt-1">{issue.suggestion}</p>
                                )}
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}

                    {repetitionIssues.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-2">
                          <AlertTriangle className="h-3 w-3" />
                          {t.wordRepetition}
                        </h4>
                        {repetitionIssues.slice(0, 5).map((issue) => (
                          <Card key={issue.id} className="p-3 hover:bg-accent cursor-pointer transition-colors">
                            <div className="flex items-start gap-2">
                              <div className="mt-0.5 h-2 w-2 rounded-full bg-warning flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-card-foreground font-medium">{issue.message}</p>
                                {issue.suggestion && (
                                  <p className="text-xs text-muted-foreground mt-1">{issue.suggestion}</p>
                                )}
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}

                    {vampireVerbIssues.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-2">
                          <AlertTriangle className="h-3 w-3" />
                          {t.vampireVerbs}
                        </h4>
                        {vampireVerbIssues.slice(0, 5).map((issue) => (
                          <Card key={issue.id} className="p-3 hover:bg-accent cursor-pointer transition-colors">
                            <div className="flex items-start gap-2">
                              <div className="mt-0.5 h-2 w-2 rounded-full bg-warning flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-card-foreground font-medium">{issue.message}</p>
                                <p className="text-xs text-muted-foreground mt-1 truncate">{issue.context}</p>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {issues.length === 0 && (
                  <Card className="p-4 text-center">
                    <p className="text-sm text-muted-foreground">{t.noIssues}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t.textLooksGreat}</p>
                  </Card>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <EntityDialog
        open={isEntityDialogOpen}
        onOpenChange={setIsEntityDialogOpen}
        entity={selectedEntity}
        entityType={getEntityType()}
        onSave={handleSaveEntity}
        onDelete={selectedEntity ? handleDeleteEntity : undefined}
      />

      <ProjectDialog
        open={isProjectDialogOpen}
        onOpenChange={setIsProjectDialogOpen}
        project={selectedProject}
        onSave={handleSaveProject}
        onDelete={selectedProject ? handleDeleteProject : undefined}
      />
    </div>
  )
}
