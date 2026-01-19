export interface Project {
  id: string
  name: string
  description?: string
  createdAt: Date
  updatedAt: Date
  chapters: Chapter[]
}

export interface Chapter {
  id: string
  title: string
  order: number
  scenes: Scene[]
}

export interface Scene {
  id: string
  title: string
  content: string
  order: number
  wordCount: number
}

export interface Entity {
  id: string
  type: "character" | "location" | "object"
  name: string
  description?: string
  details: Record<string, string>
  aliases?: string[]
}

export interface TextIssue {
  id: string
  type: "error" | "repetition" | "vampire-verb"
  message: string
  context: string
  position: number
  suggestion?: string
}

export interface ExportOptions {
  format: "pdf" | "rtf" | "fwauthor"
  includeMetadata: boolean
  typesetting?: {
    fontSize: number
    lineHeight: number
    margins: {
      top: number
      right: number
      bottom: number
      left: number
    }
  }
}
