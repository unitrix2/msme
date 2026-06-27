/* ================================================================
   PDF Pro Tool Suite — Viewer & Document Info Module
   View PDF, thumbnails, text extraction, properties
   ================================================================ */

const ViewerTool = (() => {
  'use strict';

  let currentFile = null;
  let currentArrayBuffer = null;
  let pdfDoc = null;
  let pageCount = 0;
  let currentPage = 1;
  let zoomLevel = 1.0;
  let extractedText = '';

  function init() {
    const dropzone = document.getElementById('viewerDropzone');

    if (!dropzone) return;

    PDFUtils.setupDropzone(dropzone, handleFile);

    // Setup tabs
    App.setupTabs('panel-viewer');

    // Page navigation
    const prevBtn = document.getElementById('viewerPrev');
    const nextBtn = document.getElementById('viewerNext');
    if (prevBtn) prevBtn.addEventListener('click', () => goToPage(currentPage - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => goToPage(currentPage + 1));

    // Zoom
    const zoomIn = document.getElementById('viewerZoomIn');
    const zoomOut = document.getElementById('viewerZoomOut');
    if (zoomIn) zoomIn.addEventListener('click', () => setZoom(zoomLevel + 0.25));
    if (zoomOut) zoomOut.addEventListener('click', () => setZoom(zoomLevel - 0.25));

    // Copy text
    const copyBtn = document.getElementById('viewerCopyText');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(extractedText).then(() => {
          App.showToast('Text copied to clipboard!', 'success');
        });
      });
    }

    // Download text
    const dlBtn = document.getElementById('viewerDownloadText');
    if (dlBtn) {
      dlBtn.addEventListener('click', () => {
        if (extractedText) {
          const baseName = currentFile ? PDFUtils.stripExtension(currentFile.name) : 'document';
          PDFUtils.downloadText(extractedText, `${baseName}_text.txt`);
        }
      });
    }
  }

  async function handleFile(files) {
    const file = files[0];
    if (!PDFUtils.isPDF(file)) {
      App.showToast('Please upload a PDF file', 'warning');
      return;
    }

    try {
      currentFile = file;
      currentArrayBuffer = await PDFUtils.readFileAsArrayBuffer(file);
      pdfDoc = await PDFUtils.loadPDFForViewing({ data: currentArrayBuffer.slice(0) });
      pageCount = pdfDoc.numPages;
      currentPage = 1;
      zoomLevel = 1.0;

      // Show workspace
      document.getElementById('viewerWorkspace').style.display = 'block';

      // Render first page
      await renderPage();

      // Generate thumbnails
      await generateThumbnails();

      // Extract text
      await extractAllText();

      // Show properties
      await showProperties();

      App.showToast(`Loaded "${file.name}" — ${pageCount} pages`, 'success');

    } catch (err) {
      App.showToast('Error loading PDF: ' + err.message, 'error');
    }
  }

  async function renderPage() {
    if (!pdfDoc) return;

    const page = await pdfDoc.getPage(currentPage);
    const viewport = page.getViewport({ scale: zoomLevel * 1.5 });

    const canvas = document.getElementById('viewerCanvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Update info
    document.getElementById('viewerPageInfo').textContent = `Page ${currentPage} of ${pageCount}`;
    document.getElementById('viewerZoomLevel').textContent = `${Math.round(zoomLevel * 100)}%`;
  }

  function goToPage(num) {
    if (num < 1 || num > pageCount) return;
    currentPage = num;
    renderPage();
  }

  function setZoom(level) {
    zoomLevel = Math.max(0.25, Math.min(4, level));
    renderPage();
  }

  async function generateThumbnails() {
    const grid = document.getElementById('viewerThumbGrid');
    grid.innerHTML = '';

    const maxThumbs = Math.min(pageCount, 100);

    for (let i = 1; i <= maxThumbs; i++) {
      const thumb = document.createElement('div');
      thumb.className = 'thumbnail-item';
      thumb.dataset.page = i;

      const canvas = await PDFUtils.renderThumbnail(pdfDoc, i, 120);
      canvas.className = 'thumbnail-canvas';
      thumb.appendChild(canvas);

      const label = document.createElement('div');
      label.className = 'thumbnail-label';
      label.textContent = `Page ${i}`;
      thumb.appendChild(label);

      // Click to navigate
      thumb.addEventListener('click', () => {
        currentPage = i;
        renderPage();
        // Switch to viewer tab
        document.querySelector('#viewerTabs .tab-btn[data-tab="viewerView"]').click();
      });

      grid.appendChild(thumb);
    }

    if (pageCount > 100) {
      const more = document.createElement('div');
      more.className = 'text-sm text-muted text-center mt-2';
      more.textContent = `Showing first 100 of ${pageCount} pages`;
      more.style.gridColumn = '1 / -1';
      grid.appendChild(more);
    }
  }

  async function extractAllText() {
    const outputDiv = document.getElementById('viewerExtractedText');
    outputDiv.textContent = 'Extracting text...';
    extractedText = '';

    try {
      for (let i = 1; i <= pageCount; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');

        if (pageCount > 1) {
          extractedText += `\n═══ Page ${i} ═══\n\n`;
        }
        extractedText += pageText + '\n';
      }

      outputDiv.textContent = extractedText.trim() || '(No selectable text found in this PDF. Try OCR for scanned documents.)';

    } catch (err) {
      outputDiv.textContent = 'Error extracting text: ' + err.message;
    }
  }

  async function showProperties() {
    const propsDiv = document.getElementById('viewerPropsTable');
    if (!propsDiv) return;

    try {
      const metadata = await pdfDoc.getMetadata();
      const info = metadata.info || {};

      // Get first page dimensions
      const firstPage = await pdfDoc.getPage(1);
      const viewport = firstPage.getViewport({ scale: 1 });

      const props = [
        { label: 'File Name', value: currentFile.name },
        { label: 'File Size', value: PDFUtils.formatFileSize(currentFile.size) },
        { label: 'Pages', value: pageCount },
        { label: 'Page Size', value: `${Math.round(viewport.width * 0.3528)}mm × ${Math.round(viewport.height * 0.3528)}mm (${Math.round(viewport.width)}pt × ${Math.round(viewport.height)}pt)` },
        { label: 'Title', value: info.Title || '—' },
        { label: 'Author', value: info.Author || '—' },
        { label: 'Subject', value: info.Subject || '—' },
        { label: 'Creator', value: info.Creator || '—' },
        { label: 'Producer', value: info.Producer || '—' },
        { label: 'Creation Date', value: formatPDFDate(info.CreationDate) },
        { label: 'Modified Date', value: formatPDFDate(info.ModDate) },
        { label: 'PDF Version', value: metadata.contentDispositionFilename ? '—' : (info.PDFFormatVersion || '—') },
        { label: 'Encrypted', value: info.IsAcroFormPresent !== undefined ? 'Unknown' : 'No' },
      ];

      propsDiv.innerHTML = `
        <table style="width:100%;border-collapse:collapse;">
          ${props.map(p => `
            <tr style="border-bottom:1px solid var(--border-color);">
              <td style="padding:10px 12px;font-weight:600;color:var(--text-secondary);width:140px;font-size:0.85rem;">${p.label}</td>
              <td style="padding:10px 12px;font-size:0.85rem;color:var(--text-primary);word-break:break-all;">${p.value}</td>
            </tr>
          `).join('')}
        </table>
      `;

    } catch (err) {
      propsDiv.innerHTML = `<p class="text-muted">Could not load properties: ${err.message}</p>`;
    }
  }

  function formatPDFDate(dateStr) {
    if (!dateStr) return '—';
    try {
      // PDF dates are in format D:YYYYMMDDHHmmSS
      const cleaned = dateStr.replace(/^D:/, '');
      const year = cleaned.slice(0, 4);
      const month = cleaned.slice(4, 6);
      const day = cleaned.slice(6, 8);
      const hour = cleaned.slice(8, 10) || '00';
      const min = cleaned.slice(10, 12) || '00';
      return `${year}-${month}-${day} ${hour}:${min}`;
    } catch {
      return dateStr;
    }
  }

  document.addEventListener('DOMContentLoaded', init);
  return {};
})();
