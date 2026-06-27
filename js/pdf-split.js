/* ================================================================
   PDF Pro Tool Suite — Split & Extract Module
   Split by range, into pages, extract, delete pages
   ================================================================ */

const SplitTool = (() => {
  'use strict';

  let currentFile = null;
  let currentArrayBuffer = null;
  let pageCount = 0;

  function init() {
    const dropzone = document.getElementById('splitDropzone');
    const splitBtn = document.getElementById('splitBtn');

    if (!dropzone) return;

    PDFUtils.setupDropzone(dropzone, handleFile);
    splitBtn.addEventListener('click', executeSplit);

    // Setup tabs
    App.setupTabs('panel-split');
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

      // Show file info
      const fileInfo = document.getElementById('splitFileInfo');
      fileInfo.classList.remove('hidden');
      fileInfo.innerHTML = `
        <div class="file-item">
          <div class="file-icon"><i data-lucide="file-text"></i></div>
          <div class="file-info">
            <div class="file-name">${file.name}</div>
            <div class="file-meta">${pageCount} pages · ${PDFUtils.formatFileSize(file.size)}</div>
          </div>
        </div>
      `;
      App.initLucideIcons();

      // Render thumbnails
      await renderThumbnails(pdfDoc);

      document.getElementById('splitBtn').disabled = false;
      App.showToast(`Loaded "${file.name}" — ${pageCount} pages`, 'success');

    } catch (err) {
      App.showToast('Error loading PDF: ' + err.message, 'error');
    }
  }

  async function renderThumbnails(pdfDoc) {
    const grid = document.getElementById('splitPageThumbnails');
    grid.innerHTML = '';

    const maxThumbs = Math.min(pageCount, 50);
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

      thumb.addEventListener('click', () => {
        thumb.classList.toggle('selected');
      });

      grid.appendChild(thumb);
    }

    if (pageCount > 50) {
      const more = document.createElement('div');
      more.className = 'text-sm text-muted text-center mt-2';
      more.textContent = `Showing first 50 of ${pageCount} pages`;
      grid.appendChild(more);
    }
  }

  async function executeSplit() {
    if (!currentArrayBuffer) return;

    const activeTab = document.querySelector('#panel-split .tab-btn.active');
    const mode = activeTab ? activeTab.dataset.tab : 'splitByRange';

    const splitBtn = document.getElementById('splitBtn');
    splitBtn.disabled = true;
    App.showProgress('splitProgress');

    try {
      switch (mode) {
        case 'splitByRange':
          await splitByRange();
          break;
        case 'splitIntoPages':
          await splitIntoPages();
          break;
        case 'extractPages':
          await extractPages();
          break;
        case 'deletePages':
          await deletePages();
          break;
      }
    } catch (err) {
      App.showToast('Split failed: ' + err.message, 'error');
    } finally {
      splitBtn.disabled = false;
      setTimeout(() => App.hideProgress('splitProgress'), 1500);
    }
  }

  async function splitByRange() {
    const rangeStr = document.getElementById('splitRangeInput').value.trim();
    if (!rangeStr) {
      App.showToast('Please enter page ranges', 'warning');
      return;
    }

    const ranges = rangeStr.split(',').map(s => s.trim()).filter(Boolean);
    let fileCount = 0;

    for (let i = 0; i < ranges.length; i++) {
      const pages = PDFUtils.parsePageRange(ranges[i], pageCount);
      if (pages.length === 0) continue;

      const srcDoc = await PDFUtils.loadPDFForEditing(currentArrayBuffer.slice(0));
      const newDoc = await PDFUtils.createEmptyPDF();
      const indices = pages.map(p => p - 1);
      const copiedPages = await newDoc.copyPages(srcDoc, indices);
      copiedPages.forEach(page => newDoc.addPage(page));

      const bytes = await newDoc.save();
      const baseName = PDFUtils.stripExtension(currentFile.name);
      PDFUtils.downloadPDF(bytes, `${baseName}_pages_${ranges[i].replace(/\s/g, '')}.pdf`);
      fileCount++;

      App.updateProgress('splitProgress', ((i + 1) / ranges.length) * 100);
    }

    App.showToast(`Split into ${fileCount} file(s)!`, 'success');
  }

  async function splitIntoPages() {
    for (let i = 0; i < pageCount; i++) {
      const srcDoc = await PDFUtils.loadPDFForEditing(currentArrayBuffer.slice(0));
      const newDoc = await PDFUtils.createEmptyPDF();
      const [page] = await newDoc.copyPages(srcDoc, [i]);
      newDoc.addPage(page);

      const bytes = await newDoc.save();
      const baseName = PDFUtils.stripExtension(currentFile.name);
      PDFUtils.downloadPDF(bytes, `${baseName}_page_${i + 1}.pdf`);

      App.updateProgress('splitProgress', ((i + 1) / pageCount) * 100, `Page ${i + 1}/${pageCount}`);
    }

    App.showToast(`Split into ${pageCount} individual pages!`, 'success');
  }

  async function extractPages() {
    const rangeStr = document.getElementById('extractPagesInput').value.trim();
    if (!rangeStr) {
      // Use selected thumbnails
      const selected = document.querySelectorAll('#splitPageThumbnails .thumbnail-item.selected');
      if (selected.length === 0) {
        App.showToast('Please enter page numbers or select pages', 'warning');
        return;
      }
      const pages = Array.from(selected).map(el => parseInt(el.dataset.page));
      await extractSpecificPages(pages);
    } else {
      const pages = PDFUtils.parsePageRange(rangeStr, pageCount);
      await extractSpecificPages(pages);
    }
  }

  async function extractSpecificPages(pages) {
    if (pages.length === 0) return;

    const srcDoc = await PDFUtils.loadPDFForEditing(currentArrayBuffer.slice(0));
    const newDoc = await PDFUtils.createEmptyPDF();
    const indices = pages.map(p => p - 1);
    const copiedPages = await newDoc.copyPages(srcDoc, indices);
    copiedPages.forEach(page => newDoc.addPage(page));

    const bytes = await newDoc.save();
    const baseName = PDFUtils.stripExtension(currentFile.name);
    PDFUtils.downloadPDF(bytes, `${baseName}_extracted.pdf`);

    App.updateProgress('splitProgress', 100);
    App.showToast(`Extracted ${pages.length} page(s)!`, 'success');
  }

  async function deletePages() {
    const rangeStr = document.getElementById('deletePagesInput').value.trim();
    let pagesToDelete;

    if (!rangeStr) {
      const selected = document.querySelectorAll('#splitPageThumbnails .thumbnail-item.selected');
      if (selected.length === 0) {
        App.showToast('Please enter page numbers or select pages to delete', 'warning');
        return;
      }
      pagesToDelete = new Set(Array.from(selected).map(el => parseInt(el.dataset.page)));
    } else {
      pagesToDelete = new Set(PDFUtils.parsePageRange(rangeStr, pageCount));
    }

    const pagesToKeep = [];
    for (let i = 1; i <= pageCount; i++) {
      if (!pagesToDelete.has(i)) pagesToKeep.push(i - 1);
    }

    if (pagesToKeep.length === 0) {
      App.showToast('Cannot delete all pages!', 'error');
      return;
    }

    const srcDoc = await PDFUtils.loadPDFForEditing(currentArrayBuffer.slice(0));
    const newDoc = await PDFUtils.createEmptyPDF();
    const copiedPages = await newDoc.copyPages(srcDoc, pagesToKeep);
    copiedPages.forEach(page => newDoc.addPage(page));

    const bytes = await newDoc.save();
    const baseName = PDFUtils.stripExtension(currentFile.name);
    PDFUtils.downloadPDF(bytes, `${baseName}_modified.pdf`);

    App.updateProgress('splitProgress', 100);
    App.showToast(`Deleted ${pagesToDelete.size} page(s), saved ${pagesToKeep.length} page(s)!`, 'success');
  }

  document.addEventListener('DOMContentLoaded', init);

  return {};
})();
