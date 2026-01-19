"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Plus, Trash2, ChevronRight, ChevronDown } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import type { Project, Chapter, Scene } from "@/lib/types"

interface ChapterSceneManagerProps {
  project: Project
  currentChapterId: string | null
  currentSceneId: string | null
  onChapterSelect: (chapterId: string) => void
  onSceneSelect: (sceneId: string) => void
  onProjectUpdate: (project: Project) => void
}

export function ChapterSceneManager({
  project,
  currentChapterId,
  currentSceneId,
  onChapterSelect,
  onSceneSelect,
  onProjectUpdate,
}: ChapterSceneManagerProps) {
  const { t } = useLanguage()
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set([project.chapters[0]?.id]))

  const toggleChapter = (chapterId: string) => {
    const newExpanded = new Set(expandedChapters)
    if (newExpanded.has(chapterId)) {
      newExpanded.delete(chapterId)
    } else {
      newExpanded.add(chapterId)
    }
    setExpandedChapters(newExpanded)
  }

  const addChapter = () => {
    const newChapter: Chapter = {
      id: crypto.randomUUID(),
      title: `${t.chapters} ${project.chapters.length + 1}`,
      order: project.chapters.length,
      scenes: [
        {
          id: crypto.randomUUID(),
          title: "Scene 1",
          content: "",
          order: 0,
          wordCount: 0,
        },
      ],
    }

    onProjectUpdate({
      ...project,
      chapters: [...project.chapters, newChapter],
      updatedAt: new Date(),
    })
  }

  const addScene = (chapterId: string) => {
    const updatedChapters = project.chapters.map((chapter) => {
      if (chapter.id === chapterId) {
        const newScene: Scene = {
          id: crypto.randomUUID(),
          title: `Scene ${chapter.scenes.length + 1}`,
          content: "",
          order: chapter.scenes.length,
          wordCount: 0,
        }
        return {
          ...chapter,
          scenes: [...chapter.scenes, newScene],
        }
      }
      return chapter
    })

    onProjectUpdate({
      ...project,
      chapters: updatedChapters,
      updatedAt: new Date(),
    })
  }

  const deleteChapter = (chapterId: string) => {
    if (project.chapters.length === 1) return

    onProjectUpdate({
      ...project,
      chapters: project.chapters.filter((c) => c.id !== chapterId),
      updatedAt: new Date(),
    })
  }

  const deleteScene = (chapterId: string, sceneId: string) => {
    const updatedChapters = project.chapters.map((chapter) => {
      if (chapter.id === chapterId && chapter.scenes.length > 1) {
        return {
          ...chapter,
          scenes: chapter.scenes.filter((s) => s.id !== sceneId),
        }
      }
      return chapter
    })

    onProjectUpdate({
      ...project,
      chapters: updatedChapters,
      updatedAt: new Date(),
    })
  }

  const updateChapterTitle = (chapterId: string, title: string) => {
    const updatedChapters = project.chapters.map((chapter) =>
      chapter.id === chapterId ? { ...chapter, title } : chapter,
    )

    onProjectUpdate({
      ...project,
      chapters: updatedChapters,
      updatedAt: new Date(),
    })
  }

  const updateSceneTitle = (chapterId: string, sceneId: string, title: string) => {
    const updatedChapters = project.chapters.map((chapter) => {
      if (chapter.id === chapterId) {
        return {
          ...chapter,
          scenes: chapter.scenes.map((scene) => (scene.id === sceneId ? { ...scene, title } : scene)),
        }
      }
      return chapter
    })

    onProjectUpdate({
      ...project,
      chapters: updatedChapters,
      updatedAt: new Date(),
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-foreground">{t.chapters}</h3>
        <Button size="sm" variant="ghost" onClick={addChapter}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {project.chapters.map((chapter) => (
        <div key={chapter.id} className="space-y-1">
          <Card
            className={`p-2 cursor-pointer transition-colors ${
              currentChapterId === chapter.id ? "bg-accent" : "hover:bg-accent/50"
            }`}
          >
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => toggleChapter(chapter.id)}>
                {expandedChapters.has(chapter.id) ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>

              <Input
                value={chapter.title}
                onChange={(e) => updateChapterTitle(chapter.id, e.target.value)}
                className="h-7 text-sm flex-1 bg-transparent border-none focus-visible:ring-0 px-1"
                onClick={() => onChapterSelect(chapter.id)}
              />

              {project.chapters.length > 1 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-destructive"
                  onClick={() => deleteChapter(chapter.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </Card>

          {expandedChapters.has(chapter.id) && (
            <div className="ml-6 space-y-1">
              {chapter.scenes.map((scene) => (
                <Card
                  key={scene.id}
                  className={`p-2 cursor-pointer transition-colors ${
                    currentSceneId === scene.id ? "bg-accent" : "hover:bg-accent/50"
                  }`}
                  onClick={() => {
                    onChapterSelect(chapter.id)
                    onSceneSelect(scene.id)
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={scene.title}
                      onChange={(e) => updateSceneTitle(chapter.id, scene.id, e.target.value)}
                      className="h-6 text-xs flex-1 bg-transparent border-none focus-visible:ring-0 px-1"
                    />

                    {chapter.scenes.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 w-5 p-0 text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteScene(chapter.id, scene.id)
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </Card>
              ))}

              <Button size="sm" variant="ghost" className="w-full h-7 text-xs" onClick={() => addScene(chapter.id)}>
                <Plus className="h-3 w-3 mr-1" />
                {t.newScene}
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
