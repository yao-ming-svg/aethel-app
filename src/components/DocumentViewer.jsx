import { useEffect, useState, useCallback, useLayoutEffect, useRef } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import mammoth from 'mammoth'
import { useAuth } from '../context/AuthContext'
import { getResourceBlob } from '../lib/resourceBlobStore'
import styles from './DocumentViewer.module.css'

// Set up PDF.js worker from public directory
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

const DEFAULT_ZOOM = 1
const MIN_ZOOM = 0.6
const MAX_ZOOM = 2
const ZOOM_STEP = 0.2
const PAGE_RENDER_BUFFER = 3

function clampPage(pageNumber, totalPages) {
  return Math.min(Math.max(pageNumber, 1), totalPages || 1)
}

function pageRange(start, end) {
  return Array.from({ length: Math.max(end - start + 1, 0) }, (_, index) => start + index)
}

function clampRatio(value) {
  return Math.min(Math.max(value, 0), 1)
}

export default function DocumentViewer({ resource, onClose }) {
  const { user } = useAuth()
  const [docxContent, setDocxContent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [pdfDoc, setPdfDoc] = useState(null)
  const [pdfPageSizes, setPdfPageSizes] = useState([])
  const [renderedPages, setRenderedPages] = useState({})
  const [visiblePageRange, setVisiblePageRange] = useState({ start: 1, end: 1 })
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)

  const contentRef = useRef(null)
  const pageRefs = useRef(new Map())
  const pendingPageRenders = useRef(new Set())
  const loadSequence = useRef(0)
  const scrollRaf = useRef(null)
  const zoomAnchorRef = useRef(null)
  const currentPageRef = useRef(currentPage)
  const renderedPagesRef = useRef(renderedPages)
  const visiblePageRangeRef = useRef(visiblePageRange)
  const zoomRef = useRef(zoom)

  const isPDF = resource?.mime === 'application/pdf'
  const isDOCX = resource?.mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

  useEffect(() => {
    currentPageRef.current = currentPage
  }, [currentPage])

  useEffect(() => {
    renderedPagesRef.current = renderedPages
  }, [renderedPages])

  useEffect(() => {
    visiblePageRangeRef.current = visiblePageRange
  }, [visiblePageRange])

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  const setPageRef = useCallback((pageNumber, node) => {
    if (node) {
      pageRefs.current.set(pageNumber, node)
    } else {
      pageRefs.current.delete(pageNumber)
    }
  }, [])

  const updateVisiblePages = useCallback(() => {
    const scroller = contentRef.current
    if (!scroller || pdfPageSizes.length === 0) return

    const viewportRect = scroller.getBoundingClientRect()
    const viewportCenter = viewportRect.top + viewportRect.height / 2
    let firstVisible = null
    let lastVisible = null
    let closestPage = currentPageRef.current
    let closestDistance = Number.POSITIVE_INFINITY

    pdfPageSizes.forEach(({ pageNumber }) => {
      const node = pageRefs.current.get(pageNumber)
      if (!node) return

      const pageRect = node.getBoundingClientRect()
      const isVisible = pageRect.bottom >= viewportRect.top && pageRect.top <= viewportRect.bottom
      const pageCenter = pageRect.top + pageRect.height / 2
      const distance = Math.abs(pageCenter - viewportCenter)

      if (isVisible) {
        firstVisible = firstVisible === null ? pageNumber : Math.min(firstVisible, pageNumber)
        lastVisible = lastVisible === null ? pageNumber : Math.max(lastVisible, pageNumber)
      }

      if (distance < closestDistance) {
        closestDistance = distance
        closestPage = pageNumber
      }
    })

    const rangeStartPage = firstVisible ?? closestPage
    const rangeEndPage = lastVisible ?? closestPage
    const nextRange = {
      start: clampPage(rangeStartPage - PAGE_RENDER_BUFFER, totalPages),
      end: clampPage(rangeEndPage + PAGE_RENDER_BUFFER, totalPages),
    }

    setCurrentPage((previous) => (previous === closestPage ? previous : closestPage))
    setVisiblePageRange((previous) =>
      previous.start === nextRange.start && previous.end === nextRange.end ? previous : nextRange,
    )
  }, [pdfPageSizes, totalPages])

  const handlePdfScroll = useCallback(() => {
    if (scrollRaf.current) return

    scrollRaf.current = window.requestAnimationFrame(() => {
      scrollRaf.current = null
      updateVisiblePages()
    })
  }, [updateVisiblePages])

  const captureZoomAnchor = useCallback(() => {
    const scroller = contentRef.current
    if (!isPDF || !scroller || pdfPageSizes.length === 0) {
      zoomAnchorRef.current = null
      return
    }

    const scrollerRect = scroller.getBoundingClientRect()
    const centerX = scrollerRect.left + scroller.clientWidth / 2
    const centerY = scrollerRect.top + scroller.clientHeight / 2
    let closestAnchor = null
    let closestDistance = Number.POSITIVE_INFINITY

    pdfPageSizes.forEach(({ pageNumber }) => {
      const node = pageRefs.current.get(pageNumber)
      if (!node) return

      const pageRect = node.getBoundingClientRect()
      const anchorX = clampRatio((centerX - pageRect.left) / pageRect.width)
      const anchorY = clampRatio((centerY - pageRect.top) / pageRect.height)
      const nearestX = pageRect.left + pageRect.width * anchorX
      const nearestY = pageRect.top + pageRect.height * anchorY
      const distance = Math.hypot(centerX - nearestX, centerY - nearestY)

      if (distance < closestDistance) {
        closestDistance = distance
        closestAnchor = {
          pageNumber,
          anchorX,
          anchorY,
        }
      }
    })

    zoomAnchorRef.current = closestAnchor
  }, [isPDF, pdfPageSizes])

  const loadContent = useCallback(async () => {
    if (!resource?.id || !user?.id) return

    const loadId = loadSequence.current + 1
    loadSequence.current = loadId
    pendingPageRenders.current.clear()
    pageRefs.current.clear()
    zoomAnchorRef.current = null
    setLoading(true)
    setError(null)
    setDocxContent(null)
    setPdfDoc(null)
    setPdfPageSizes([])
    setRenderedPages({})
    setCurrentPage(1)
    setTotalPages(0)
    setVisiblePageRange({ start: 1, end: 1 })

    try {
      const blob = await getResourceBlob(user.id, resource.id)
      if (loadSequence.current !== loadId) return

      if (!blob) {
        setError('File not found in storage.')
        return
      }

      if (isPDF) {
        const arrayBuffer = blob instanceof ArrayBuffer ? blob : await blob.arrayBuffer?.()
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise
        if (loadSequence.current !== loadId) return

        const firstPage = await pdf.getPage(1)
        if (loadSequence.current !== loadId) return

        const firstPageViewport = firstPage.getViewport({ scale: 1 })
        const pageSizes = Array.from({ length: pdf.numPages }, (_, index) => ({
          pageNumber: index + 1,
          width: firstPageViewport.width,
          height: firstPageViewport.height,
        }))
        firstPage.cleanup?.()

        setPdfDoc(pdf)
        setTotalPages(pdf.numPages)
        setPdfPageSizes(pageSizes)
        setVisiblePageRange({ start: 1, end: Math.min(pdf.numPages, 1 + PAGE_RENDER_BUFFER) })
      } else if (isDOCX) {
        const result = await mammoth.convertToHtml({ arrayBuffer: blob })
        if (loadSequence.current !== loadId) return

        setDocxContent(result.value)
        setTotalPages(1)
      } else {
        setError('Unsupported file format.')
      }
    } catch (err) {
      if (loadSequence.current !== loadId) return

      console.error('Error loading document:', err)
      setError(err.message || 'Failed to load document.')
    } finally {
      if (loadSequence.current === loadId) {
        setLoading(false)
      }
    }
  }, [resource, user, isPDF, isDOCX])

  const renderPdfPage = useCallback(
    async (pageNumber, scale, loadId) => {
      if (!pdfDoc) return

      const renderKey = `${pageNumber}:${scale}`
      if (pendingPageRenders.current.has(renderKey)) return

      pendingPageRenders.current.add(renderKey)
      let page = null

      try {
        page = await pdfDoc.getPage(pageNumber)
        const baseViewport = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')

        if (!context) {
          throw new Error('Could not prepare PDF page.')
        }

        const outputScale = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)

        await page.render({
          canvasContext: context,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        }).promise

        const currentRange = visiblePageRangeRef.current
        if (
          loadSequence.current !== loadId ||
          zoomRef.current !== scale ||
          pageNumber < currentRange.start ||
          pageNumber > currentRange.end
        ) {
          return
        }

        setPdfPageSizes((previous) =>
          previous.map((pageSize) => {
            if (pageSize.pageNumber !== pageNumber) return pageSize

            const widthChanged = Math.abs(pageSize.width - baseViewport.width) > 0.5
            const heightChanged = Math.abs(pageSize.height - baseViewport.height) > 0.5
            return widthChanged || heightChanged
              ? { pageNumber, width: baseViewport.width, height: baseViewport.height }
              : pageSize
          }),
        )

        const src = canvas.toDataURL()
        setRenderedPages((previous) => ({
          ...previous,
          [pageNumber]: {
            src,
            zoom: scale,
          },
        }))
      } catch (err) {
        if (loadSequence.current === loadId) {
          console.error(`Error rendering PDF page ${pageNumber}:`, err)
        }
      } finally {
        page?.cleanup?.()
        pendingPageRenders.current.delete(renderKey)
      }
    },
    [pdfDoc],
  )

  useEffect(() => {
    if (!isPDF || !pdfDoc || pdfPageSizes.length === 0 || loading) return

    const activePages = pageRange(visiblePageRange.start, visiblePageRange.end)
    const activePageSet = new Set(activePages)

    setRenderedPages((previous) => {
      let changed = false
      const next = {}

      Object.entries(previous).forEach(([pageNumber, renderedPage]) => {
        const numericPage = Number(pageNumber)
        if (activePageSet.has(numericPage) && renderedPage.zoom === zoom) {
          next[numericPage] = renderedPage
        } else {
          changed = true
        }
      })

      return changed ? next : previous
    })

    activePages.forEach((pageNumber) => {
      const renderedPage = renderedPagesRef.current[pageNumber]
      if (renderedPage?.zoom === zoom) return

      renderPdfPage(pageNumber, zoom, loadSequence.current)
    })
  }, [isPDF, pdfDoc, pdfPageSizes.length, loading, renderPdfPage, visiblePageRange, zoom])

  useEffect(() => {
    if (!isPDF || pdfPageSizes.length === 0) return undefined

    const raf = window.requestAnimationFrame(updateVisiblePages)
    return () => window.cancelAnimationFrame(raf)
  }, [isPDF, pdfPageSizes.length, updateVisiblePages, zoom])

  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current
    const scroller = contentRef.current
    if (!anchor) return

    if (!scroller) {
      zoomAnchorRef.current = null
      return
    }

    const node = pageRefs.current.get(anchor.pageNumber)
    if (!node) {
      zoomAnchorRef.current = null
      return
    }

    zoomAnchorRef.current = null

    const scrollerRect = scroller.getBoundingClientRect()
    const pageRect = node.getBoundingClientRect()
    const targetX = pageRect.left + pageRect.width * anchor.anchorX
    const targetY = pageRect.top + pageRect.height * anchor.anchorY
    const centerX = scrollerRect.left + scroller.clientWidth / 2
    const centerY = scrollerRect.top + scroller.clientHeight / 2

    scroller.scrollLeft += targetX - centerX
    scroller.scrollTop += targetY - centerY
  }, [zoom])

  useEffect(() => {
    return () => {
      if (scrollRaf.current) {
        window.cancelAnimationFrame(scrollRaf.current)
      }
    }
  }, [])

  const scrollToPage = useCallback(
    (pageNumber) => {
      const nextPage = clampPage(pageNumber, totalPages)
      const node = pageRefs.current.get(nextPage)

      setCurrentPage(nextPage)
      setVisiblePageRange({
        start: clampPage(nextPage - PAGE_RENDER_BUFFER, totalPages),
        end: clampPage(nextPage + PAGE_RENDER_BUFFER, totalPages),
      })

      node?.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'smooth' })
    },
    [totalPages],
  )

  const handleZoomIn = useCallback(() => {
    const nextZoom = Math.min(zoom + ZOOM_STEP, MAX_ZOOM)
    if (nextZoom === zoom) return

    captureZoomAnchor()
    setZoom(nextZoom)
  }, [captureZoomAnchor, zoom])

  const handleZoomOut = useCallback(() => {
    const nextZoom = Math.max(zoom - ZOOM_STEP, MIN_ZOOM)
    if (nextZoom === zoom) return

    captureZoomAnchor()
    setZoom(nextZoom)
  }, [captureZoomAnchor, zoom])

  const handleZoomReset = useCallback(() => {
    if (zoom === DEFAULT_ZOOM) return

    captureZoomAnchor()
    setZoom(DEFAULT_ZOOM)
  }, [captureZoomAnchor, zoom])

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && resource) {
        onClose()
      }

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
            x
          </button>
        </div>

        <div
          ref={contentRef}
          className={`${styles.content} ${isPDF ? styles.pdfContent : ''}`}
          onScroll={isPDF ? handlePdfScroll : undefined}
        >
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

          {!loading && !error && (
            <>
              {isPDF ? (
                <div className={styles.pdfDocument}>
                  {pdfPageSizes.map((page) => {
                    const renderedPage = renderedPages[page.pageNumber]
                    const pageWidth = page.width * zoom
                    const pageHeight = page.height * zoom
                    const isInRenderWindow =
                      page.pageNumber >= visiblePageRange.start && page.pageNumber <= visiblePageRange.end

                    return (
                      <div
                        key={page.pageNumber}
                        ref={(node) => setPageRef(page.pageNumber, node)}
                        className={styles.pdfPageFrame}
                        style={{ width: `${pageWidth}px`, height: `${pageHeight}px` }}
                        aria-label={`Page ${page.pageNumber}`}
                      >
                        {renderedPage?.zoom === zoom ? (
                          <img
                            src={renderedPage.src}
                            alt={`${resource.name} - Page ${page.pageNumber}`}
                            className={styles.pdfPage}
                          />
                        ) : (
                          <div className={styles.pdfPlaceholder}>
                            {isInRenderWindow ? (
                              <>
                                <div className={styles.pageSpinner}></div>
                                <span>Loading page {page.pageNumber}...</span>
                              </>
                            ) : (
                              <span>Page {page.pageNumber}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                docxContent && (
                  <div
                    className={styles.docxContent}
                    dangerouslySetInnerHTML={{ __html: docxContent }}
                    role="document"
                  />
                )
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
                onClick={() => scrollToPage(currentPage - 1)}
                disabled={currentPage <= 1 || loading}
                title="Previous page"
              >
                Previous
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
                    scrollToPage(page)
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
                onClick={() => scrollToPage(currentPage + 1)}
                disabled={currentPage >= totalPages || loading}
                title="Next page"
              >
                Next
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
                -
              </button>
              <div className={styles.zoomInfo}>{Math.round(zoom * 100)}%</div>
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
