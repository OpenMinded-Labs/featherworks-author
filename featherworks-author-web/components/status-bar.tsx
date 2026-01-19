"use client"

import { useEffect, useState } from "react"
import { getTextStatistics } from "@/lib/text-analysis"
import { useLanguage } from "@/lib/language-context"
import { useTranslation } from "@/lib/i18n"
import type { Project } from "@/lib/types"

interface StatusBarProps {
  project: Project | null
  issueCount: number
}

export function StatusBar({ project, issueCount }: StatusBarProps) {
  const { language } = useLanguage()
  const t = useTranslation(language)

  const [stats, setStats] = useState({
    words: 0,
    characters: 0,
    sentences: 0,
    readingTimeMinutes: 0,
  })

  useEffect(() => {
    const updateStats = () => {
      const editorElement = document.querySelector(".editor-content")
      if (editorElement) {
        const text = editorElement.textContent || ""
        const newStats = getTextStatistics(text)
        setStats(newStats)
      }
    }

    updateStats()
    const interval = setInterval(updateStats, 2000)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex h-8 items-center justify-between border-t border-border bg-card px-4 text-xs text-muted-foreground">
      <div className="flex items-center gap-4">
        <span>
          {t.words}: {stats.words}
        </span>
        <span>
          {t.characters}: {stats.characters}
        </span>
        <span>
          {language === "de" ? "Sätze" : "Sentences"}: {stats.sentences}
        </span>
        <span>
          {language === "de" ? "Lesezeit" : "Reading time"}: ~{stats.readingTimeMinutes}{" "}
          {language === "de" ? "Min." : "min."}
        </span>
        {issueCount > 0 && (
          <span className="text-warning-foreground font-medium">
            {issueCount}{" "}
            {language === "de" ? (issueCount === 1 ? "Problem" : "Probleme") : issueCount === 1 ? "Issue" : "Issues"}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        {project && <span>{project.name}</span>}
        <span>{language === "de" ? "Bereit" : "Ready"}</span>
      </div>
    </div>
  )
}
