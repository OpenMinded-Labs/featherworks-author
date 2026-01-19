"use client"

import { useLanguage } from "@/lib/language-context"

export function Footer() {
  const { language } = useLanguage()
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t border-border bg-card px-4 py-2">
      <div className="flex items-center justify-center text-xs text-muted-foreground">
        <span>© {currentYear} Van de Loo Media Design & Digital Solutions. All rights reserved.</span>
      </div>
    </footer>
  )
}
