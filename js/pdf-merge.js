/* ================================================================
   PDF Pro Tool Suite — Merge & Combine Module
   Drag-and-drop multi-file merge with page selection
   ================================================================ */

const MergeTool = (() => {
  'use strict';

  let files = []; // { id, file, name, size, pageCount, arrayBuffer }
  let pageMode = 'all'; // 'all' or 'custom'

  function init() {
    const dropzone = document.getElementById('mergeDropzone');
    const fileList = document.getElementById('mergeFileList');
    const mergeBtn = document.getElementById('mergeBtn');
    const clearBtn = document.getElementById('mergeClearBtn');

    if (!dropzone) return;

    // Setup dropzone
    PDFUtils.setupDropzone(dropzone, handleFiles);

    // Merge button
    mergeBtn.addEventListener('click', mergePDFs);

    // Clear button
    clearBtn.addEventListener('click', clearAll);

    // Page mode chips
    document.querySelectorAll('[data-merge-pages]').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('[data-merge-pages]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        pageMode = chip.dataset.mergePages;
        document.getElementById('mergeCustomPages').classList.toggle('hidden', pageMode !== 'custom');
      });
    });

    // Make file list sortable
    PDFUtils.makeSortable(fileList, (newOrder) => {
      const reordered = newOrder.map(id => files.find(f => f.id === id)).filter(Boolean);
      files = reordered;
      updateFileNumbers();
    });
  }

  async function handleFiles(newFiles) {
    for (const file of newFiles) {
      if (!PDFUtils.isPDF(file)) {
        App.showToast(`"${file.name}" is not a PDF file`, 'warning');
        continue;
      }

      try {
        const arrayBuffer = await PDFUtils.readFileAsArrayBuffer(file);
        const pdfDoc = await PDFUtils.loadPDFForViewing({ data: arrayBuffer.slice(0) });
        const pageCount = pdfDoc.numPages;

        const fileEntry = {
          id: PDFUtils.generateId(),
          file,
          name: file.name,
          size: file.size,
          pageCount,
          arrayBuffer
        };

        files.push(fileEntry);
        App.showToast(`Added "${file.name}" (${pageCount} pages)`, 'success');
      } catch (err) {
        App.showToast(`Error reading "${file.name}": ${err.message}`, 'error');
      }
    }

    renderFileList();
    updateMergeButton();
  }

  function renderFileList() {
    const fileList = document.getElementById('mergeFileList');
    const emptyState = document.getElementById('mergeEmptyState');

    if (files.length === 0) {
      fileList.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    fileList.innerHTML = files.map((f, i) => `
      <div class="file-item" data-sortable data-file-id="${f.id}" draggable="true">
        <div class="file-drag-handle">
          <span></span><span></span><span></span>
        </div>
        <div class="file-order">${i + 1}</div>
        <div class="file-icon"><i data-lucide="file-text"></i></div>
        <div class="file-info">
          <div class="file-name" title="${f.name}">${f.name}</div>
          <div class="file-meta">${f.pageCount} pages · ${PDFUtils.formatFileSize(f.size)}</div>
        </div>
        <div class="file-actions">
          <button class="file-action-btn" onclick="MergeTool.moveUp('${f.id}')" title="Move Up">
            <i data-lucide="chevron-up"></i>
          </button>
          <button class="file-action-btn" onclick="MergeTool.moveDown('${f.id}')" title="Move Down">
            <i data-lucide="chevron-down"></i>
          </button>
          <button class="file-action-btn danger" onclick="MergeTool.removeFile('${f.id}')" title="Remove">
            <i data-lucide="x"></i>
          </button>
        </div>
      </div>
    `).join('');

    App.initLucideIcons();
  }

  function updateFileNumbers() {
    document.querySelectorAll('#mergeFileList .file-order').forEach((el, i) => {
      el.textContent = i + 1;
    });
  }

  function moveUp(fileId) {
    const idx = files.findIndex(f => f.id === fileId);
    if (idx > 0) {
      [files[idx - 1], files[idx]] = [files[idx], files[idx - 1]];
      renderFileList();
    }
  }

  function moveDown(fileId) {
    const idx = files.findIndex(f => f.id === fileId);
    if (idx < files.length - 1) {
      [files[idx], files[idx + 1]] = [files[idx + 1], files[idx]];
      renderFileList();
    }
  }

  function removeFile(fileId) {
    files = files.filter(f => f.id !== fileId);
    renderFileList();
    updateMergeButton();
    App.showToast('File removed', 'info');
  }

  function updateMergeButton() {
    const btn = document.getElementById('mergeBtn');
    btn.disabled = files.length < 2;
  }

  function clearAll() {
    files = [];
    renderFileList();
    updateMergeButton();
    document.getElementById('mergeResult').classList.remove('active');
    document.getElementById('mergeResult').innerHTML = '';
    App.showToast('All files cleared', 'info');
  }

  async function mergePDFs() {
    if (files.length < 2) return;

    const mergeBtn = document.getElementById('mergeBtn');
    mergeBtn.disabled = true;
    App.showProgress('mergeProgress');

    try {
      const mergedPdf = await PDFUtils.createEmptyPDF();
      const totalPages = files.reduce((sum, f) => sum + f.pageCount, 0);
      let processedPages = 0;

      for (const fileEntry of files) {
        const srcDoc = await PDFUtils.loadPDFForEditing(fileEntry.arrayBuffer.slice(0));
        const pageIndices = Array.from({ length: fileEntry.pageCount }, (_, i) => i);
        const copiedPages = await mergedPdf.copyPages(srcDoc, pageIndices);

        for (const page of copiedPages) {
          mergedPdf.addPage(page);
          processedPages++;
          App.updateProgress('mergeProgress', (processedPages / totalPages) * 100, `Merging page ${processedPages}/${totalPages}...`);
        }
      }

      const mergedBytes = await mergedPdf.save();
      App.updateProgress('mergeProgress', 100, 'Complete!');

      // Show result
      const resultDiv = document.getElementById('mergeResult');
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      resultDiv.innerHTML = `
        <div class="result-header">
          <div class="result-title">✅ Merge Complete!</div>
        </div>
        <div class="result-stats mb-3">
          <div class="result-stat">
            <div class="result-stat-value">${files.length}</div>
            <div class="result-stat-label">Files Merged</div>
          </div>
          <div class="result-stat">
            <div class="result-stat-value">${totalPages}</div>
            <div class="result-stat-label">Total Pages</div>
          </div>
          <div class="result-stat">
            <div class="result-stat-value">${PDFUtils.formatFileSize(mergedBytes.length)}</div>
            <div class="result-stat-label">Output Size</div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="MergeTool.downloadResult()">
          <i data-lucide="download"></i> Download Merged PDF
        </button>
      `;
      resultDiv.classList.add('active');
      App.initLucideIcons();

      // Store result for download
      MergeTool._resultBytes = mergedBytes;
      App.showToast('PDFs merged successfully!', 'success');

    } catch (err) {
      App.showToast('Merge failed: ' + err.message, 'error');
    } finally {
      mergeBtn.disabled = false;
      setTimeout(() => App.hideProgress('mergeProgress'), 1500);
    }
  }

  function downloadResult() {
    if (MergeTool._resultBytes) {
      PDFUtils.downloadPDF(MergeTool._resultBytes, 'merged-document.pdf');
    }
  }

  // Initialize when DOM ready
  document.addEventListener('DOMContentLoaded', init);

  return {
    moveUp,
    moveDown,
    removeFile,
    downloadResult,
    _resultBytes: null
  };
})();
