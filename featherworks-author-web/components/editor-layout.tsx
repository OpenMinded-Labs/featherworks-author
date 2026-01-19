"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { EditorPane } from "@/components/editor-pane"
import { Toolbar } from "@/components/toolbar"
import { StatusBar } from "@/components/status-bar"
import { Footer } from "@/components/footer"
import { loadEntities, saveEntities } from "@/lib/storage"
import type { Project, Entity, TextIssue } from "@/lib/types"

export function EditorLayout() {
  const [projects, setProjects] = useState<Project[]>([])
  const [currentProject, setCurrentProject] = useState<Project | null>(null)
  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null)
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null)
  const [entities, setEntities] = useState<Entity[]>([])
  const [issues, setIssues] = useState<TextIssue[]>([])
  const [content, setContent] = useState("")
  const [sidebarView, setSidebarView] = useState<"projects" | "characters" | "locations" | "objects" | "analysis">(
    "projects",
  )

  useEffect(() => {
    const loadedEntities = loadEntities()
    setEntities(loadedEntities)

    const savedProjects = localStorage.getItem("featherworks-projects")
    if (savedProjects) {
      const parsedProjects = JSON.parse(savedProjects)
      setProjects(parsedProjects)
      if (parsedProjects.length > 0) {
        setCurrentProject(parsedProjects[0])
        if (parsedProjects[0].chapters.length > 0) {
          setCurrentChapterId(parsedProjects[0].chapters[0].id)
          if (parsedProjects[0].chapters[0].scenes.length > 0) {
            setCurrentSceneId(parsedProjects[0].chapters[0].scenes[0].id)
          }
        }
      }
    }
  }, [])

  useEffect(() => {
    if (projects.length > 0) {
      localStorage.setItem("featherworks-projects", JSON.stringify(projects))
    }
  }, [projects])

  useEffect(() => {
    const updateContent = () => {
      const editorElement = document.querySelector(".editor-content")
      if (editorElement) {
        setContent(editorElement.innerHTML)
      }
    }

    const interval = setInterval(updateContent, 1000)
    return () => clearInterval(interval)
  }, [])

  const handleEntitiesChange = (newEntities: Entity[]) => {
    setEntities(newEntities)
    saveEntities(newEntities)
  }

  const handleProjectsChange = (newProjects: Project[]) => {
    setProjects(newProjects)
  }

  const handleChapterSelect = (chapterId: string) => {
    setCurrentChapterId(chapterId)
    // Auto-select first scene in the chapter
    if (currentProject) {
      const chapter = currentProject.chapters.find((c) => c.id === chapterId)
      if (chapter && chapter.scenes.length > 0) {
        setCurrentSceneId(chapter.scenes[0].id)
      }
    }
  }

  const handleSceneSelect = (sceneId: string) => {
    setCurrentSceneId(sceneId)
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <Toolbar
        currentProject={currentProject}
        onSidebarViewChange={setSidebarView}
        entities={entities}
        content={content}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          view={sidebarView}
          currentProject={currentProject}
          currentChapterId={currentChapterId}
          currentSceneId={currentSceneId}
          projects={projects}
          entities={entities}
          issues={issues}
          onProjectChange={setCurrentProject}
          onProjectsChange={handleProjectsChange}
          onChapterSelect={handleChapterSelect}
          onSceneSelect={handleSceneSelect}
          onEntitiesChange={handleEntitiesChange}
        />

        <EditorPane
          project={currentProject}
          currentChapterId={currentChapterId}
          currentSceneId={currentSceneId}
          entities={entities}
          onIssuesChange={setIssues}
        />
      </div>

      <StatusBar project={currentProject} issueCount={issues.length} />
      <Footer />
    </div>
  )
}
