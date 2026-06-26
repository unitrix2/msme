/* ================================================================
   PDF Pro Tool Suite — Shared Utilities
   Common functions used across all tool modules
   ================================================================ */

const PDFUtils = (() => {
  'use strict';

  // ── File Size Formatting ──
  function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 2 : 0) + ' ' + units[i];
  }

  // ── Read File as ArrayBuffer ──
  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file: ' + file.name));
      reader.readAsArrayBuffer(file);
    });
  }

  // ── Read File as DataURL ──
  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file: ' + file.name));
      reader.readAsDataURL(file);
    });
  }

  // ── Read File as Text ──
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file: ' + file.name));
      reader.readAsText(file);
    });
  }

  // ── Download Blob as File ──
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ── Download PDF bytes ──
  function downloadPDF(pdfBytes, filename) {
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    downloadBlob(blob, filename);
  }

  // ── Download text as file ──
  function downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, filename);
  }

  // ── Render PDF page to canvas using pdf.js ──
  async function renderPageToCanvas(pdfDoc, pageNum, canvas, scale = 1) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
  }

  // ── Render PDF page as thumbnail ──
  async function renderThumbnail(pdfDoc, pageNum, maxWidth = 150) {
    const page = await pdfDoc.getPage(pageNum);
    const origViewport = page.getViewport({ scale: 1 });
    const scale = maxWidth / origViewport.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
  }

  // ── Load PDF with pdf.js for viewing ──
  async function loadPDFForViewing(source) {
    const loadingTask = pdfjsLib.getDocument(source);
    return await loadingTask.promise;
  }

  // ── Load PDF with pdf-lib for editing ──
  async function loadPDFForEditing(arrayBuffer) {
    return await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  }

  // ── Create empty PDF document ──
  async function createEmptyPDF() {
    return await PDFLib.PDFDocument.create();
  }

  // ── Parse page range string (e.g., "1-3, 5, 7-10") ──
  function parsePageRange(rangeStr, totalPages) {
    const pages = new Set();
    const parts = rangeStr.split(',').map(s => s.trim()).filter(Boolean);

    for (const part of parts) {
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-').map(s => s.trim());
        const start = Math.max(1, parseInt(startStr) || 1);
        const end = Math.min(totalPages, parseInt(endStr) || totalPages);
        for (let i = start; i <= end; i++) {
          pages.add(i);
        }
      } else {
        const pageNum = parseInt(part);
        if (pageNum >= 1 && pageNum <= totalPages) {
          pages.add(pageNum);
        }
      }
    }

    return Array.from(pages).sort((a, b) => a - b);
  }

  // ── Validate file is PDF ──
  function isPDF(file) {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }

  // ── Validate file is image ──
  function isImage(file) {
    return file.type.startsWith('image/');
  }

  // ── Generate unique ID ──
  function generateId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  // ── Create drag-and-drop sortable list ──
  function makeSortable(container, onReorder) {
    let dragItem = null;
    let dragIndex = -1;

    container.addEventListener('dragstart', (e) => {
      const item = e.target.closest('[data-sortable]');
      if (!item) return;
      dragItem = item;
      dragIndex = [...container.children].indexOf(item);
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', '');
    });

    container.addEventListener('dragend', (e) => {
      const item = e.target.closest('[data-sortable]');
      if (item) item.classList.remove('dragging');
      container.querySelectorAll('[data-sortable]').forEach(el => {
        el.classList.remove('drag-target');
      });
      dragItem = null;
    });

    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const target = e.target.closest('[data-sortable]');
      if (!target || target === dragItem) return;

      container.querySelectorAll('[data-sortable]').forEach(el => {
        el.classList.remove('drag-target');
      });
      target.classList.add('drag-target');
    });

    container.addEventListener('drop', (e) => {
      e.preventDefault();
      const target = e.target.closest('[data-sortable]');
      if (!target || target === dragItem) return;

      const items = [...container.children];
      const dropIndex = items.indexOf(target);

      if (dragIndex < dropIndex) {
        target.after(dragItem);
      } else {
        target.before(dragItem);
      }

      if (onReorder) {
        onReorder(getItemOrder(container));
      }
    });
  }

  function getItemOrder(container) {
    return [...container.querySelectorAll('[data-sortable]')].map(el => el.dataset.fileId);
  }

  // ── Setup dropzone with drag events ──
  function setupDropzone(dropzone, onFiles) {
    const input = dropzone.querySelector('input[type="file"]');

    ['dragenter', 'dragover'].forEach(evt => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(evt => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('drag-over');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0 && onFiles) onFiles(files);
    });

    if (input) {
      input.addEventListener('change', () => {
        const files = Array.from(input.files);
        if (files.length > 0 && onFiles) onFiles(files);
        input.value = '';
      });
    }
  }

  // ── Image to Canvas for compression ──
  function imageToCanvas(imgElement, quality, maxDimension) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      let w = imgElement.naturalWidth || imgElement.width;
      let h = imgElement.naturalHeight || imgElement.height;

      if (maxDimension && (w > maxDimension || h > maxDimension)) {
        const ratio = Math.min(maxDimension / w, maxDimension / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imgElement, 0, 0, w, h);
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });
  }

  // ── Canvas to ArrayBuffer ──
  function canvasToArrayBuffer(canvas, type = 'image/png', quality = 0.92) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        blob.arrayBuffer().then(resolve);
      }, type, quality);
    });
  }

  // ── Debounce utility ──
  function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  // ── Get file extension ──
  function getExtension(filename) {
    return filename.split('.').pop().toLowerCase();
  }

  // ── Strip extension ──
  function stripExtension(filename) {
    return filename.replace(/\.[^.]+$/, '');
  }

  // ── Wait ms ──
  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  return {
    formatFileSize,
    readFileAsArrayBuffer,
    readFileAsDataURL,
    readFileAsText,
    downloadBlob,
    downloadPDF,
    downloadText,
    renderPageToCanvas,
    renderThumbnail,
    loadPDFForViewing,
    loadPDFForEditing,
    createEmptyPDF,
    parsePageRange,
    isPDF,
    isImage,
    generateId,
    makeSortable,
    setupDropzone,
    imageToCanvas,
    canvasToArrayBuffer,
    debounce,
    getExtension,
    stripExtension,
    wait
  };
})();
