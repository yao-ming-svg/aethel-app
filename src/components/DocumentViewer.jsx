import { useEffect, useState, useCallback, useRef } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import mammoth from 'mammoth'
import { useAuth } from '../context/AuthContext'
import { getResourceBlob } from '../lib/resourceBlobStore'
import styles from './DocumentViewer.module.css'

// Set up PDF.js worker from public directory
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

const DEFAULT_ZOOM = 1
const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const ZOOM_STEP = 0.2

export default function DocumentViewer({ resource, onClose }) {
  const { user } = useAuth()
  const [content, setContent] = useState(null)
  const [pageSize, setPageSize] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [pdfDoc, setPdfDoc] = useState(null)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const renderSequence = useRef(0)

  const isPDF = resource?.mime === 'application/pdf'
  const isDOCX = resource?.mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

  const loadContent = useCallback(async () => {
    if (!resource?.id || !user?.id) return

    let pdfQueuedForRender = false
    const loadId = renderSequence.current + 1
    renderSequence.current = loadId
    setLoading(true)
    setError(null)
    setContent(null)
    setPageSize(null)
    setPdfDoc(null)
    setCurrentPage(1)
    setTotalPages(0)

    try {
      const blob = await getResourceBlob(user.id, resource.id)
      if (renderSequence.current !== loadId) return

      if (!blob) {
        setError('File not found in storage.')
        return
      }

      if (isPDF) {
        const arrayBuffer = blob instanceof ArrayBuffer ? blob : await blob.arrayBuffer?.()
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise
        if (renderSequence.current !== loadId) return

        setPdfDoc(pdf)
        setTotalPages(pdf.numPages)
        pdfQueuedForRender = true
      } else if (isDOCX) {
        const result = await mammoth.convertToHtml({ arrayBuffer: blob })
        if (renderSequence.current !== loadId) return

        setContent(result.value)
        setTotalPages(1)
      } else {
        setError('Unsupported file format.')
      }
    } catch (err) {
      if (renderSequence.current !== loadId) return

      console.error('Error loading document:', err)
      setError(err.message || 'Failed to load document.')
    } finally {
      if (!pdfQueuedForRender && renderSequence.current === loadId) {
        setLoading(false)
      }
    }
  }, [resource, user, isPDF, isDOCX])

  const renderPdfPage = useCallback(
    async (pageNumber, scale) => {
      if (!pdfDoc) return

      const renderId = renderSequence.current + 1
      renderSequence.current = renderId
      setLoading(true)
      setError(null)

      try {
        const page = await pdfDoc.getPage(pageNumber)
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')

        if (!context) {
          throw new Error('Could not prepare PDF page.')
        }

        const outputScale = window.devicePixelRatio || 1
        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)

        await page.render({
          canvasContext: context,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        }).promise

        if (renderSequence.current !== renderId) return

        setPageSize({ width: viewport.width, height: viewport.height })
        setContent(canvas.toDataURL())
      } catch (err) {
        if (renderSequence.current !== renderId) return

        console.error('Error rendering page:', err)
        setError('Failed to load page.')
      } finally {
        if (renderSequence.current === renderId) {
          setLoading(false)
        }
      }
    },
    [pdfDoc],
  )

  const handlePageChange = useCallback(
    (newPage) => {
      if (newPage < 1 || newPage > totalPages || !pdfDoc || newPage === currentPage) return

      setCurrentPage(newPage)
    },
    [currentPage, pdfDoc, totalPages],
  )

  const handleZoomIn = useCallback(() => {
    setZoom((currentZoom) => Math.min(currentZoom + ZOOM_STEP, MAX_ZOOM))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom((currentZoom) => Math.max(currentZoom - ZOOM_STEP, MIN_ZOOM))
  }, [])

  const handleZoomReset = useCallback(() => {
    setZoom(DEFAULT_ZOOM)
  }, [])

  useEffect(() => {
    if (!isPDF || !pdfDoc) return

    renderPdfPage(currentPage, zoom)
  }, [currentPage, isPDF, pdfDoc, renderPdfPage, zoom])

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && resource) {
        onClose()
      }
      // Zoom shortcuts: Ctrl/Cmd + Plus/Minus or just Plus/Minus
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault()
          handleZoomIn()
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault()
          handleZoomOut()
        } else if (e.key === '0') {
          e.preventDefault()
          handleZoomReset()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [resource, onClose, handleZoomIn, handleZoomOut, handleZoomReset])

  useEffect(() => {
    loadContent()
  }, [loadContent])

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.container}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="viewer-title"
      >
        <div className={styles.header}>
          <h2 id="viewer-title" className={styles.title}>
            {resource?.name}
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close document viewer"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        <div className={`${styles.content} ${isPDF ? styles.pdfContent : ''}`}>
          {loading && (
            <div className={styles.loading}>
              <div className={styles.spinner}></div>
              <p>Loading document...</p>
            </div>
          )}

          {error && (
            <div className={styles.error}>
              <p>Error: {error}</p>
              <button type="button" className="btn btn-outline" onClick={loadContent}>
                Retry
              </button>
            </div>
          )}

          {!loading && !error && content && (
            <>
              {isPDF ? (
                <div className={styles.pdfWrapper}>
                  <img
                    src={content}
                    alt={`${resource.name} - Page ${currentPage}`}
                    className={styles.pdfPage}
                    style={pageSize ? { width: `${pageSize.width}px`, height: `${pageSize.height}px` } : undefined}
                  />
                </div>
              ) : (
                <div
                  className={styles.docxContent}
                  dangerouslySetInnerHTML={{ __html: content }}
                  role="document"
                />
              )}
            </>
          )}
        </div>

        {isPDF && totalPages > 0 && (
          <div className={styles.footer}>
            <div className={styles.footerSection}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1 || loading}
                title="Previous page (Arrow Left)"
              >
                ← Previous
              </button>
              <div className={styles.pageInfo}>
                Page{' '}
                <input
                  type="number"
                  min="1"
                  max={totalPages}
                  value={currentPage}
                  onChange={(e) => {
                    const page = parseInt(e.target.value) || 1
                    handlePageChange(page)
                  }}
                  className={styles.pageInput}
                  title="Go to page"
                  disabled={loading}
                />{' '}
                of <span>{totalPages}</span>
              </div>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages || loading}
                title="Next page (Arrow Right)"
              >
                Next →
              </button>
            </div>

            <div className={styles.footerSection}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleZoomOut}
                disabled={zoom <= MIN_ZOOM || loading}
                title="Zoom out (Ctrl+Minus)"
              >
                −
              </button>
              <div className={styles.zoomInfo}>
                {Math.round(zoom * 100)}%
              </div>
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleZoomIn}
                disabled={zoom >= MAX_ZOOM || loading}
                title="Zoom in (Ctrl+Plus)"
              >
                +
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleZoomReset}
                disabled={loading}
                title="Reset zoom (Ctrl+0)"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
