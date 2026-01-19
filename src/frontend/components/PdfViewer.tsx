import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface PdfViewerProps {
  /** Base64-encoded PDF data or file path */
  pdfData?: string;
  /** URL to PDF file */
  pdfUrl?: string;
  /** Optional max height */
  maxHeight?: number;
  /** Callback when page changes */
  onPageChange?: (page: number, total: number) => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  pdfData,
  pdfUrl,
  maxHeight = 600,
  onPageChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load PDF
  useEffect(() => {
    const loadPdf = async () => {
      setLoading(true);
      setError(null);
      
      try {
        let loadingTask: pdfjsLib.PDFDocumentLoadingTask;
        
        if (pdfData) {
          // Decode base64 if needed
          const data = pdfData.startsWith('data:') 
            ? atob(pdfData.split(',')[1])
            : atob(pdfData);
          
          const uint8Array = new Uint8Array(data.length);
          for (let i = 0; i < data.length; i++) {
            uint8Array[i] = data.charCodeAt(i);
          }
          loadingTask = pdfjsLib.getDocument({ data: uint8Array });
        } else if (pdfUrl) {
          loadingTask = pdfjsLib.getDocument(pdfUrl);
        } else {
          throw new Error('No PDF data or URL provided');
        }
        
        const pdfDoc = await loadingTask.promise;
        setPdf(pdfDoc);
        setTotalPages(pdfDoc.numPages);
        setCurrentPage(1);
      } catch (e) {
        console.error('Failed to load PDF:', e);
        setError(e instanceof Error ? e.message : 'Failed to load PDF');
      } finally {
        setLoading(false);
      }
    };
    
    if (pdfData || pdfUrl) {
      loadPdf();
    }
    
    return () => {
      pdf?.destroy();
    };
  }, [pdfData, pdfUrl]);

  // Render current page
  useEffect(() => {
    const renderPage = async () => {
      if (!pdf || !canvasRef.current) return;
      
      try {
        const page = await pdf.getPage(currentPage);
        const viewport = page.getViewport({ scale });
        
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({
          canvasContext: context,
          viewport,
          canvas: canvas,
        }).promise;
        
        onPageChange?.(currentPage, totalPages);
      } catch (e) {
        console.error('Failed to render page:', e);
      }
    };
    
    renderPage();
  }, [pdf, currentPage, scale, totalPages, onPageChange]);

  // Auto-fit scale on load
  useEffect(() => {
    if (!pdf || !containerRef.current) return;
    
    const fitToWidth = async () => {
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.0 });
      const containerWidth = containerRef.current?.clientWidth || 400;
      const newScale = (containerWidth - 20) / viewport.width;
      setScale(Math.min(newScale, 1.5)); // Cap at 1.5x
    };
    
    fitToWidth();
  }, [pdf]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 bg-muted rounded">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex items-center justify-center h-40 bg-muted rounded text-sm text-red-500">
        {error}
      </div>
    );
  }
  
  if (!pdf) {
    return (
      <div className="flex items-center justify-center h-40 bg-muted rounded text-sm text-muted-foreground">
        No PDF loaded
      </div>
    );
  }

  return (
    <div className="pdf-viewer" ref={containerRef}>
      {/* Controls */}
      <div className="flex items-center justify-between gap-2 p-2 bg-muted rounded-t border-b border-border">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="px-2 py-1 text-sm bg-background rounded disabled:opacity-50"
            title="Previous page"
          >
            ◀
          </button>
          <span className="text-sm px-2">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="px-2 py-1 text-sm bg-background rounded disabled:opacity-50"
            title="Next page"
          >
            ▶
          </button>
        </div>
        
        <div className="flex items-center gap-1">
          <button
            onClick={() => setScale(s => Math.max(0.5, s - 0.25))}
            className="px-2 py-1 text-sm bg-background rounded"
            title="Zoom out"
          >
            −
          </button>
          <span className="text-xs px-1">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale(s => Math.min(2, s + 0.25))}
            className="px-2 py-1 text-sm bg-background rounded"
            title="Zoom in"
          >
            +
          </button>
        </div>
      </div>
      
      {/* Canvas */}
      <div 
        className="overflow-auto bg-gray-200 rounded-b"
        style={{ maxHeight }}
      >
        <canvas 
          ref={canvasRef}
          className="mx-auto block"
        />
      </div>
    </div>
  );
};

export default PdfViewer;
