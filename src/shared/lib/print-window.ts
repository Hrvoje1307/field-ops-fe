/**
 * Opens a window right away (inside the click, so the browser lets it through) to be
 * filled once an authenticated document has been fetched. Null when blocked.
 */
export function openDocumentWindow(): Window | null {
  return window.open('', '_blank')
}

/**
 * Shows an HTML document in a window from `openDocumentWindow()` as a blob URL (the
 * document was fetched with the bearer token; a plain link would go without it).
 */
export function showHtml(target: Window | null, html: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  if (target && !target.closed) {
    target.location.href = url
  } else {
    window.open(url, '_blank')
  }
  // The window has its own reference by now
  window.setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 60_000)
}

/** A window that was opened for a document that could not be fetched. */
export function closeDocumentWindow(target: Window | null): void {
  if (target && !target.closed) target.close()
}
