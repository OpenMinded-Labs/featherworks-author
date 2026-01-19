import type { Entity, Project } from "./types"

// Local storage keys
const ENTITIES_KEY = "featherworks_entities"
const PROJECTS_KEY = "featherworks_projects"

// Entity storage functions
export function saveEntities(entities: Entity[]): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(ENTITIES_KEY, JSON.stringify(entities))
  }
}

export function loadEntities(): Entity[] {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(ENTITIES_KEY)
    return stored ? JSON.parse(stored) : []
  }
  return []
}

export function saveEntity(entity: Entity): void {
  const entities = loadEntities()
  const index = entities.findIndex((e) => e.id === entity.id)

  if (index >= 0) {
    entities[index] = entity
  } else {
    entities.push(entity)
  }

  saveEntities(entities)
}

export function deleteEntity(entityId: string): void {
  const entities = loadEntities()
  saveEntities(entities.filter((e) => e.id !== entityId))
}

// Project storage functions
export function saveProjects(projects: Project[]): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
  }
}

export function loadProjects(): Project[] {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(PROJECTS_KEY)
    return stored ? JSON.parse(stored) : []
  }
  return []
}

export function saveProject(project: Project): void {
  const projects = loadProjects()
  const index = projects.findIndex((p) => p.id === project.id)

  if (index >= 0) {
    projects[index] = project
  } else {
    projects.push(project)
  }

  saveProjects(projects)
}

export function deleteProject(projectId: string): void {
  const projects = loadProjects()
  saveProjects(projects.filter((p) => p.id !== projectId))
}
