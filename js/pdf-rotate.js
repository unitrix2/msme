/* ================================================================
   PDF Pro Tool Suite — Page Operations Module
   Rotate, reorder, reverse page order
   ================================================================ */

const PagesTool = (() => {
  'use strict';

  let currentFile = null;
  let currentArrayBuffer = null;
  let pageCount = 0;
  let rotationDegrees = 90;
  let rotateScope = 'all';
  let reorderMap = []; // current page order

  function init() {
    const dropzone = document.getElementById('pagesDropzone');
    const btn = document.getElementById('pagesBtn');

    if (!dropzone) return;

    PDFUtils.setupDropzone(dropzone, handleFile);
    btn.addEventListener('click', applyChanges);

    // Setup tabs
    App.setupTabs('panel-pages');

    // Rotation chips
    document.querySelectorAll('[data-rotate]').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('[data-rotate]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        rotationDegrees = parseInt(chip.dataset.rotate);
      });
    });

    // Rotate scope chips
    document.querySelectorAll('[data-rotate-scope]').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('[data-rotate-scope]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        rotateScope = chip.dataset.rotateScope;
        document.getElementById('rotateCustomPages').classList.toggle('hidden', rotateScope !== 'custom');
      });
    });
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
      const pdfDoc = await PDFUtils.loadPDFForViewing({ data: currentArrayBuffer.slice(0) });
      pageCount = pdfDoc.numPages;
      reorderMap = Array.from({ length: pageCount }, (_, i) => i);

      // Render thumbnails for reorder
      await renderReorderGrid(pdfDoc);

      document.getElementById('pagesBtn').disabled = false;
      App.showToast(`Loaded "${file.name}" — ${pageCount} pages`, 'success');
    } catch (err) {
      App.showToast('Error loading PDF: ' + err.message, 'error');
    }
  }

  async function renderReorderGrid(pdfDoc) {
    const grid = document.getElementById('reorderGrid');
    grid.innerHTML = '';

    const maxThumbs = Math.min(pageCount, 50);
    for (let i = 1; i <= maxThumbs; i++) {
      const thumb = document.createElement('div');
      thumb.className = 'thumbnail-item';
      thumb.draggable = true;
      thumb.dataset.sortable = '';
      thumb.dataset.pageIdx = i - 1;

      const canvas = await PDFUtils.renderThumbnail(pdfDoc, i, 110);
      canvas.className = 'thumbnail-canvas';
      thumb.appendChild(canvas);

      const label = document.createElement('div');
      label.className = 'thumbnail-label';
      label.textContent = `Page ${i}`;
      thumb.appendChild(label);

      grid.appendChild(thumb);
    }

    // Make sortable
    PDFUtils.makeSortable(grid, (order) => {
      // order isn't used since we're reordering by position
    });
  }

  async function applyChanges() {
    if (!currentArrayBuffer) return;

    const activeTab = document.querySelector('#panel-pages .tab-btn.active');
    const mode = activeTab ? activeTab.dataset.tab : 'rotateTab';

    const btn = document.getElementById('pagesBtn');
    btn.disabled = true;
    App.showProgress('pagesProgress');

    try {
      switch (mode) {
        case 'rotateTab':
          await rotatePages();
          break;
        case 'reorderTab':
          await reorderPages();
          break;
        case 'reverseTab':
          await reversePages();
          break;
      }
    } catch (err) {
      App.showToast('Operation failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      setTimeout(() => App.hideProgress('pagesProgress'), 1500);
    }
  }

  async function rotatePages() {
    const srcDoc = await PDFUtils.loadPDFForEditing(currentArrayBuffer.slice(0));
    const pages = srcDoc.getPages();

    let targetPages;
    if (rotateScope === 'all') {
      targetPages = pages.map((_, i) => i);
    } else {
      const input = document.getElementById('rotatePageInput').value.trim();
      if (!input) {
        App.showToast('Please enter page numbers', 'warning');
        return;
      }
      targetPages = PDFUtils.parsePageRange(input, pageCount).map(p => p - 1);
    }

    for (const idx of targetPages) {
      const page = pages[idx];
      const currentRotation = page.getRotation().angle;
      page.setRotation(PDFLib.degrees(currentRotation + rotationDegrees));
      App.updateProgress('pagesProgress', ((targetPages.indexOf(idx) + 1) / targetPages.length) * 100);
    }

    const bytes = await srcDoc.save();
    const baseName = PDFUtils.stripExtension(currentFile.name);
    PDFUtils.downloadPDF(bytes, `${baseName}_rotated.pdf`);

    App.showToast(`Rotated ${targetPages.length} page(s) by ${rotationDegrees}°!`, 'success');
  }

  async function reorderPages() {
    const grid = document.getElementById('reorderGrid');
    const items = grid.querySelectorAll('[data-sortable]');
    const newOrder = Array.from(items).map(item => parseInt(item.dataset.pageIdx));

    const srcDoc = await PDFUtils.loadPDFForEditing(currentArrayBuffer.slice(0));
    const newDoc = await PDFUtils.createEmptyPDF();
    const copiedPages = await newDoc.copyPages(srcDoc, newOrder);
    copiedPages.forEach(page => newDoc.addPage(page));

    const bytes = await newDoc.save();
    const baseName = PDFUtils.stripExtension(currentFile.name);
    PDFUtils.downloadPDF(bytes, `${baseName}_reordered.pdf`);

    App.updateProgress('pagesProgress', 100);
    App.showToast('Pages reordered successfully!', 'success');
  }

  async function reversePages() {
    const srcDoc = await PDFUtils.loadPDFForEditing(currentArrayBuffer.slice(0));
    const newDoc = await PDFUtils.createEmptyPDF();
    const indices = Array.from({ length: pageCount }, (_, i) => pageCount - 1 - i);
    const copiedPages = await newDoc.copyPages(srcDoc, indices);
    copiedPages.forEach(page => newDoc.addPage(page));

    const bytes = await newDoc.save();
    const baseName = PDFUtils.stripExtension(currentFile.name);
    PDFUtils.downloadPDF(bytes, `${baseName}_reversed.pdf`);

    App.updateProgress('pagesProgress', 100);
    App.showToast('Page order reversed!', 'success');
  }

  document.addEventListener('DOMContentLoaded', init);
  return {};
})();
