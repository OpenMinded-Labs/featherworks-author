import type { Project, Entity } from "./types"

/**
 * Export formats
 */
export type ExportFormat = "pdf" | "rtf" | "fwauthor"

/**
 * Typesetting options for book layout
 */
export interface TypesettingOptions {
  fontSize: number
  lineHeight: number
  fontFamily: string
  pageSize: "A4" | "A5" | "Letter" | "Custom"
  margins: {
    top: number
    right: number
    bottom: number
    left: number
  }
  includePageNumbers: boolean
  includeHeaders: boolean
  chapterStartsNewPage: boolean
}

/**
 * Default typesetting options
 */
export const DEFAULT_TYPESETTING: TypesettingOptions = {
  fontSize: 12,
  lineHeight: 1.8,
  fontFamily: "Georgia, serif",
  pageSize: "A5",
  margins: {
    top: 2.5,
    right: 2,
    bottom: 2.5,
    left: 2,
  },
  includePageNumbers: true,
  includeHeaders: false,
  chapterStartsNewPage: true,
}

/**
 * Exports content to .fwauthor format (JSON with custom extension)
 */
export function exportToFWAuthor(content: string, entities: Entity[], project: Project | null): string {
  const exportData = {
    version: "1.0.0",
    format: "featherworks-author",
    exportDate: new Date().toISOString(),
    project: project || {
      id: "untitled",
      name: "Untitled Project",
      createdAt: new Date(),
      updatedAt: new Date(),
      chapters: [],
    },
    content: content,
    entities: entities,
    metadata: {
      wordCount: content.split(/\s+/).filter((w) => w.length > 0).length,
      characterCount: content.length,
    },
  }

  return JSON.stringify(exportData, null, 2)
}

/**
 * Downloads a file with the given content
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Exports to RTF format
 */
export function exportToRTF(content: string, project: Project | null, options: TypesettingOptions): string {
  const projectName = project?.name || "Untitled"

  // Clean HTML tags from content
  const cleanContent = content.replace(/<[^>]*>/g, "")

  // RTF header
  let rtf = "{\\rtf1\\ansi\\deff0\n"

  // Font table
  rtf += "{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}{\\f1\\fswiss\\fcharset0 Arial;}}\n"

  // Color table
  rtf += "{\\colortbl;\\red0\\green0\\blue0;\\red128\\green128\\blue128;}\n"

  // Document formatting
  const fontSize = options.fontSize * 2 // RTF uses half-points
  const lineSpacing = Math.round(options.lineHeight * 240) // RTF line spacing

  rtf += `\\fs${fontSize}\\sl${lineSpacing}\\slmult1\n`

  // Margins (in twips: 1 inch = 1440 twips)
  const marginTop = Math.round(options.margins.top * 1440)
  const marginRight = Math.round(options.margins.right * 1440)
  const marginBottom = Math.round(options.margins.bottom * 1440)
  const marginLeft = Math.round(options.margins.left * 1440)

  rtf += `\\margt${marginTop}\\margr${marginRight}\\margb${marginBottom}\\margl${marginLeft}\n`

  // Title
  rtf += `\\qc\\b\\fs${fontSize + 8} ${escapeRTF(projectName)}\\b0\\fs${fontSize}\\par\\par\n`

  // Content - split by paragraphs
  const paragraphs = cleanContent.split(/\n\n+/)

  paragraphs.forEach((para) => {
    if (para.trim()) {
      // Check if it's a heading
      if (para.trim().startsWith("Kapitel") || para.trim().match(/^[A-Z\s]+$/)) {
        if (options.chapterStartsNewPage) {
          rtf += "\\page\n"
        }
        rtf += `\\qc\\b\\fs${fontSize + 4} ${escapeRTF(para.trim())}\\b0\\fs${fontSize}\\par\\par\n`
      } else {
        rtf += `\\qj ${escapeRTF(para.trim())}\\par\\par\n`
      }
    }
  })

  rtf += "}"

  return rtf
}

/**
 * Escapes special characters for RTF
 */
function escapeRTF(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/{/g, "\\{").replace(/}/g, "\\}").replace(/\n/g, "\\par\n")
}

/**
 * Exports to PDF format (using HTML and print CSS)
 */
export function exportToPDF(content: string, project: Project | null, options: TypesettingOptions): void {
  const projectName = project?.name || "Untitled"

  // Create a new window for printing
  const printWindow = window.open("", "_blank")

  if (!printWindow) {
    alert("Bitte erlauben Sie Pop-ups für den PDF-Export")
    return
  }

  // Build HTML with print styles
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${projectName}</title>
      <style>
        @page {
          size: ${options.pageSize === "A4" ? "A4" : options.pageSize === "A5" ? "A5" : "Letter"};
          margin: ${options.margins.top}cm ${options.margins.right}cm ${options.margins.bottom}cm ${options.margins.left}cm;
          
          ${
            options.includePageNumbers
              ? `
          @bottom-center {
            content: counter(page);
            font-size: 10pt;
            font-family: ${options.fontFamily};
          }
          `
              : ""
          }
        }
        
        body {
          font-family: ${options.fontFamily};
          font-size: ${options.fontSize}pt;
          line-height: ${options.lineHeight};
          text-align: justify;
          color: #000;
        }
        
        h1 {
          font-size: ${options.fontSize + 8}pt;
          text-align: center;
          margin-top: 0;
          margin-bottom: 2em;
          font-weight: bold;
          ${options.chapterStartsNewPage ? "page-break-before: always;" : ""}
        }
        
        h1:first-child {
          page-break-before: avoid;
        }
        
        h2 {
          font-size: ${options.fontSize + 4}pt;
          margin-top: 1.5em;
          margin-bottom: 0.75em;
          font-weight: bold;
        }
        
        h3 {
          font-size: ${options.fontSize + 2}pt;
          margin-top: 1.25em;
          margin-bottom: 0.5em;
          font-weight: bold;
        }
        
        p {
          margin-bottom: 1em;
          text-indent: 1.5em;
        }
        
        p:first-child,
        h1 + p,
        h2 + p,
        h3 + p {
          text-indent: 0;
        }
        
        .title-page {
          text-align: center;
          page-break-after: always;
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-height: 80vh;
        }
        
        .title {
          font-size: ${options.fontSize + 12}pt;
          font-weight: bold;
          margin-bottom: 2em;
        }
        
        .entity-highlight {
          background: none;
          border: none;
        }
        
        @media print {
          body {
            background: white;
          }
        }
      </style>
    </head>
    <body>
      <div class="title-page">
        <div class="title">${projectName}</div>
      </div>
      ${content}
    </body>
    </html>
  `

  printWindow.document.write(html)
  printWindow.document.close()

  // Wait for content to load, then print
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print()
    }, 250)
  }
}

/**
 * Gets the appropriate filename for export
 */
export function getExportFilename(project: Project | null, format: ExportFormat): string {
  const projectName = project?.name || "untitled"
  const sanitized = projectName.replace(/[^a-z0-9]/gi, "_").toLowerCase()
  const timestamp = new Date().toISOString().split("T")[0]

  switch (format) {
    case "pdf":
      return `${sanitized}_${timestamp}.pdf`
    case "rtf":
      return `${sanitized}_${timestamp}.rtf`
    case "fwauthor":
      return `${sanitized}_${timestamp}.fwauthor`
  }
}
