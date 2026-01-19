"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Bold, Italic, Heading1, Heading2, Heading3 } from "lucide-react"
import { EntityTooltip } from "@/components/entity-tooltip"
import { highlightEntities } from "@/lib/text-recognition"
import { analyzeText } from "@/lib/text-analysis"
import type { Project, Entity, TextIssue } from "@/lib/types"
import { useLanguage } from "@/lib/language-context"

interface EditorPaneProps {
  project: Project | null
  entities: Entity[]
  onIssuesChange: (issues: TextIssue[]) => void
}

export function EditorPane({ project, entities, onIssuesChange }: EditorPaneProps) {
  const { t } = useLanguage()
  const [content, setContent] = useState("")
  const [hoveredEntity, setHoveredEntity] = useState<Entity | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const editorRef = useRef<HTMLDivElement>(null)
  const [isComposing, setIsComposing] = useState(false)

  const applyFormat = (command: string, value?: string) => {
    document.execCommand(command, false, value)
    editorRef.current?.focus()
  }

  useEffect(() => {
    if (editorRef.current && !isComposing) {
      const selection = window.getSelection()
      const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
      const startOffset = range?.startOffset || 0
      const startContainer = range?.startContainer

      const highlightedContent = highlightEntities(content, entities)
      if (editorRef.current.innerHTML !== highlightedContent) {
        editorRef.current.innerHTML = highlightedContent

        // Restore cursor position
        if (startContainer && range) {
          try {
            const newRange = document.createRange()
            newRange.setStart(startContainer, Math.min(startOffset, startContainer.textContent?.length || 0))
            newRange.collapse(true)
            selection?.removeAllRanges()
            selection?.addRange(newRange)
          } catch (e) {
            // Cursor restoration failed, ignore
          }
        }
      }
    }
  }, [content, entities, isComposing])

  const handleInput = () => {
    if (editorRef.current) {
      const text = editorRef.current.innerText
      setContent(text)

      const issues = analyzeText(text)
      onIssuesChange(issues)
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    const entityElement = target.closest(".entity-highlight")

    if (entityElement) {
      const entityId = entityElement.getAttribute("data-entity-id")
      const entity = entities.find((e) => e.id === entityId)

      if (entity) {
        setHoveredEntity(entity)
        const rect = entityElement.getBoundingClientRect()
        setTooltipPosition({
          x: rect.left + rect.width / 2,
          y: rect.top - 10,
        })
      }
    } else {
      setHoveredEntity(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-background">
      <div className="border-b border-border bg-card px-4 py-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => applyFormat("bold")}>
            <Bold className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => applyFormat("italic")}>
            <Italic className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-2" />
          <Button variant="ghost" size="sm" onClick={() => applyFormat("formatBlock", "h1")}>
            <Heading1 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => applyFormat("formatBlock", "h2")}>
            <Heading2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => applyFormat("formatBlock", "h3")}>
            <Heading3 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto" onMouseMove={handleMouseMove}>
        <div className="max-w-4xl mx-auto px-8 py-12">
          {!project ? (
            <div className="text-center py-20">
              <h2 className="text-2xl font-semibold text-foreground mb-2">{t.welcomeTitle}</h2>
              <p className="text-muted-foreground">{t.welcomeSubtitle}</p>
            </div>
          ) : (
            <Card className="min-h-[600px] p-8 bg-editor-bg">
              <div
                ref={editorRef}
                contentEditable
                className="editor-content outline-none"
                onInput={handleInput}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => {
                  setIsComposing(false)
                  handleInput()
                }}
                suppressContentEditableWarning
              >
                <h1>{t.defaultChapterTitle}</h1>
                <p>{t.editorPlaceholder}</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {hoveredEntity && <EntityTooltip entity={hoveredEntity} position={tooltipPosition} />}
    </div>
  )
}
