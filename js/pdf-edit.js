/* ================================================================
   PDF Pro Tool Suite — Edit & Annotate Module
   Text, drawing, shapes, signatures, images on PDF pages
   ================================================================ */

const EditTool = (() => {
  'use strict';

  let currentFile = null;
  let currentArrayBuffer = null;
  let pdfViewDoc = null;
  let pageCount = 0;
  let currentPage = 1;
  let currentEditTool = 'select';

  // Drawing state
  let isDrawing = false;
  let drawCtx = null;
  let pdfCanvas = null;
  let drawCanvas = null;
  let lastX = 0, lastY = 0;

  // Annotations per page
  let annotations = {}; // { pageNum: [{ type, data }] }

  // Signature pad
  let signCanvas = null;
  let signCtx = null;
  let isSigning = false;

  function init() {
    const dropzone = document.getElementById('editDropzone');
    const saveBtn = document.getElementById('editSaveBtn');

    if (!dropzone) return;

    PDFUtils.setupDropzone(dropzone, handleFile);
    saveBtn.addEventListener('click', savePDF);

    // Tool buttons
    document.querySelectorAll('[data-edit-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.editTool;

        if (tool === 'undo') { undoLastAction(); return; }
        if (tool === 'clear') { clearPage(); return; }

        document.querySelectorAll('[data-edit-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentEditTool = tool;

        // Show/hide text input
        document.getElementById('editTextInput').classList.toggle('hidden', tool !== 'text');
        document.getElementById('editSignPad').classList.toggle('hidden', tool !== 'sign');

        // Update cursor
        if (drawCanvas) {
          drawCanvas.style.cursor = tool === 'select' ? 'default' :
                                    tool === 'text' ? 'text' : 'crosshair';
        }
      });
    });

    // Page navigation
    const prevBtn = document.getElementById('editPrevPage');
    const nextBtn = document.getElementById('editNextPage');
    if (prevBtn) prevBtn.addEventListener('click', () => goToPage(currentPage - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => goToPage(currentPage + 1));

    // Text add button
    const textAddBtn = document.getElementById('editTextAdd');
    if (textAddBtn) textAddBtn.addEventListener('click', addTextAnnotation);

    // Initialize signature pad
    initSignaturePad();
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
      pdfViewDoc = await PDFUtils.loadPDFForViewing({ data: currentArrayBuffer.slice(0) });
      pageCount = pdfViewDoc.numPages;
      currentPage = 1;
      annotations = {};

      // Show workspace
      document.getElementById('editWorkspace').style.display = 'block';
      document.getElementById('editSaveBtn').disabled = false;

      pdfCanvas = document.getElementById('editPdfCanvas');
      drawCanvas = document.getElementById('editDrawCanvas');
      drawCtx = drawCanvas.getContext('2d');

      setupDrawingEvents();
      await renderCurrentPage();

      App.showToast(`Loaded "${file.name}" — ${pageCount} pages`, 'success');
    } catch (err) {
      App.showToast('Error loading PDF: ' + err.message, 'error');
    }
  }

  async function renderCurrentPage() {
    if (!pdfViewDoc) return;

    const page = await pdfViewDoc.getPage(currentPage);
    const viewport = page.getViewport({ scale: 1.5 });

    pdfCanvas.width = viewport.width;
    pdfCanvas.height = viewport.height;
    drawCanvas.width = viewport.width;
    drawCanvas.height = viewport.height;

    const ctx = pdfCanvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Restore annotations for this page
    restoreAnnotations();

    // Update page info
    document.getElementById('editPageInfo').textContent = `Page ${currentPage} of ${pageCount}`;
    App.initLucideIcons();
  }

  function goToPage(num) {
    if (num < 1 || num > pageCount) return;
    saveCurrentPageAnnotations();
    currentPage = num;
    renderCurrentPage();
  }

  function setupDrawingEvents() {
    drawCanvas.addEventListener('mousedown', startDraw);
    drawCanvas.addEventListener('mousemove', draw);
    drawCanvas.addEventListener('mouseup', endDraw);
    drawCanvas.addEventListener('mouseleave', endDraw);

    // Touch support
    drawCanvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = drawCanvas.getBoundingClientRect();
      startDraw({ offsetX: touch.clientX - rect.left, offsetY: touch.clientY - rect.top });
    });

    drawCanvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = drawCanvas.getBoundingClientRect();
      draw({ offsetX: touch.clientX - rect.left, offsetY: touch.clientY - rect.top });
    });

    drawCanvas.addEventListener('touchend', endDraw);
  }

  function startDraw(e) {
    if (currentEditTool === 'select' || currentEditTool === 'text' || currentEditTool === 'sign' || currentEditTool === 'image') return;

    isDrawing = true;
    lastX = e.offsetX;
    lastY = e.offsetY;

    const color = document.getElementById('editColor').value;
    const lineWidth = parseInt(document.getElementById('editStroke').value);

    drawCtx.strokeStyle = color;
    drawCtx.lineWidth = lineWidth;
    drawCtx.lineCap = 'round';
    drawCtx.lineJoin = 'round';

    if (currentEditTool === 'highlight') {
      drawCtx.globalAlpha = 0.3;
      drawCtx.lineWidth = lineWidth * 4;
    } else {
      drawCtx.globalAlpha = 1;
    }

    drawCtx.beginPath();
    drawCtx.moveTo(lastX, lastY);
  }

  function draw(e) {
    if (!isDrawing) return;

    if (currentEditTool === 'draw' || currentEditTool === 'highlight') {
      drawCtx.lineTo(e.offsetX, e.offsetY);
      drawCtx.stroke();
    }

    lastX = e.offsetX;
    lastY = e.offsetY;
  }

  function endDraw(e) {
    if (!isDrawing) return;
    isDrawing = false;

    if (currentEditTool === 'rect' && e.offsetX !== undefined) {
      drawRect(lastX, lastY, e.offsetX - lastX, e.offsetY - lastY);
    } else if (currentEditTool === 'circle' && e.offsetX !== undefined) {
      drawCircle(lastX, lastY, e.offsetX, e.offsetY);
    } else if (currentEditTool === 'arrow' && e.offsetX !== undefined) {
      drawArrow(lastX, lastY, e.offsetX, e.offsetY);
    }

    drawCtx.globalAlpha = 1;
    saveCurrentPageAnnotations();
  }

  function drawRect(x, y, w, h) {
    const color = document.getElementById('editColor').value;
    const lineWidth = parseInt(document.getElementById('editStroke').value);
    drawCtx.strokeStyle = color;
    drawCtx.lineWidth = lineWidth;
    drawCtx.strokeRect(x, y, w, h);
  }

  function drawCircle(x1, y1, x2, y2) {
    const color = document.getElementById('editColor').value;
    const lineWidth = parseInt(document.getElementById('editStroke').value);
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const rx = Math.abs(x2 - x1) / 2;
    const ry = Math.abs(y2 - y1) / 2;

    drawCtx.strokeStyle = color;
    drawCtx.lineWidth = lineWidth;
    drawCtx.beginPath();
    drawCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    drawCtx.stroke();
  }

  function drawArrow(x1, y1, x2, y2) {
    const color = document.getElementById('editColor').value;
    const lineWidth = parseInt(document.getElementById('editStroke').value);
    const headLen = 15;
    const angle = Math.atan2(y2 - y1, x2 - x1);

    drawCtx.strokeStyle = color;
    drawCtx.fillStyle = color;
    drawCtx.lineWidth = lineWidth;

    drawCtx.beginPath();
    drawCtx.moveTo(x1, y1);
    drawCtx.lineTo(x2, y2);
    drawCtx.stroke();

    drawCtx.beginPath();
    drawCtx.moveTo(x2, y2);
    drawCtx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
    drawCtx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
    drawCtx.closePath();
    drawCtx.fill();
  }

  function addTextAnnotation() {
    const text = document.getElementById('editTextValue').value.trim();
    const size = parseInt(document.getElementById('editTextSize').value) || 16;
    const color = document.getElementById('editColor').value;

    if (!text) {
      App.showToast('Please enter text', 'warning');
      return;
    }

    // Place text in center of visible area
    drawCtx.font = `${size}px Inter, sans-serif`;
    drawCtx.fillStyle = color;
    drawCtx.fillText(text, drawCanvas.width / 4, drawCanvas.height / 2);

    saveCurrentPageAnnotations();
    document.getElementById('editTextValue').value = '';
    App.showToast('Text added! Drag to position.', 'info');
  }

  // ── Signature Pad ──
  function initSignaturePad() {
    signCanvas = document.getElementById('signatureCanvas');
    if (!signCanvas) return;

    signCtx = signCanvas.getContext('2d');
    signCtx.strokeStyle = '#000';
    signCtx.lineWidth = 2;
    signCtx.lineCap = 'round';

    signCanvas.addEventListener('mousedown', (e) => {
      isSigning = true;
      signCtx.beginPath();
      signCtx.moveTo(e.offsetX, e.offsetY);
    });

    signCanvas.addEventListener('mousemove', (e) => {
      if (!isSigning) return;
      signCtx.lineTo(e.offsetX, e.offsetY);
      signCtx.stroke();
    });

    signCanvas.addEventListener('mouseup', () => { isSigning = false; });
    signCanvas.addEventListener('mouseleave', () => { isSigning = false; });

    const clearBtn = document.getElementById('signClear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        signCtx.clearRect(0, 0, signCanvas.width, signCanvas.height);
      });
    }

    const applyBtn = document.getElementById('signApply');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        // Draw signature onto the edit canvas
        drawCtx.drawImage(signCanvas, drawCanvas.width / 4, drawCanvas.height * 0.7, 200, 75);
        saveCurrentPageAnnotations();
        App.showToast('Signature placed on page!', 'success');
      });
    }
  }

  // ── Annotation Management ──
  function saveCurrentPageAnnotations() {
    annotations[currentPage] = drawCanvas.toDataURL();
  }

  function restoreAnnotations() {
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    const saved = annotations[currentPage];
    if (saved) {
      const img = new Image();
      img.onload = () => drawCtx.drawImage(img, 0, 0);
      img.src = saved;
    }
  }

  function undoLastAction() {
    // Simple undo: clear current annotations
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    delete annotations[currentPage];
    App.showToast('Last action undone', 'info');
  }

  function clearPage() {
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    delete annotations[currentPage];
    App.showToast('Page cleared', 'info');
  }

  // ── Save PDF ──
  async function savePDF() {
    if (!currentArrayBuffer) return;

    const saveBtn = document.getElementById('editSaveBtn');
    saveBtn.disabled = true;

    try {
      // Save current page annotations first
      saveCurrentPageAnnotations();

      const pdfDoc = await PDFUtils.loadPDFForEditing(currentArrayBuffer.slice(0));
      const pages = pdfDoc.getPages();

      for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        const annotationData = annotations[pageNum];
        if (!annotationData) continue;

        // Load annotation image
        const img = await loadImage(annotationData);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // Check if there are any non-transparent pixels
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let hasContent = false;
        for (let i = 3; i < imageData.data.length; i += 4) {
          if (imageData.data[i] > 0) { hasContent = true; break; }
        }

        if (!hasContent) continue;

        // Convert to PNG and embed
        const pngBlob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        const pngBuffer = await pngBlob.arrayBuffer();
        const pngImage = await pdfDoc.embedPng(new Uint8Array(pngBuffer));

        const page = pages[pageNum - 1];
        const { width, height } = page.getSize();

        page.drawImage(pngImage, {
          x: 0,
          y: 0,
          width,
          height,
          opacity: 1,
        });
      }

      const bytes = await pdfDoc.save();
      const baseName = PDFUtils.stripExtension(currentFile.name);
      PDFUtils.downloadPDF(bytes, `${baseName}_edited.pdf`);

      App.showToast('PDF saved with annotations!', 'success');

    } catch (err) {
      App.showToast('Save failed: ' + err.message, 'error');
    } finally {
      saveBtn.disabled = false;
    }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  document.addEventListener('DOMContentLoaded', init);
  return {};
})();
