/* ================================================================
   PDF Pro Tool Suite — Convert Module
   PDF to Images, Images to PDF with layout options
   ================================================================ */

const ConvertTool = (() => {
  'use strict';

  let pdfToImgFile = null;
  let pdfToImgBuffer = null;
  let imgToPdfFiles = []; // { id, file, name, dataUrl }

  function init() {
    const pdfDropzone = document.getElementById('pdfToImgDropzone');
    const imgDropzone = document.getElementById('imgToPdfDropzone');
    const convertBtn = document.getElementById('convertBtn');

    if (!convertBtn) return;

    // Setup tabs
    App.setupTabs('panel-convert');

    if (pdfDropzone) PDFUtils.setupDropzone(pdfDropzone, handlePdfToImg);
    if (imgDropzone) PDFUtils.setupDropzone(imgDropzone, handleImgToPdf);
    convertBtn.addEventListener('click', executeConvert);
  }

  // ── PDF to Images ──
  async function handlePdfToImg(files) {
    const file = files[0];
    if (!PDFUtils.isPDF(file)) {
      App.showToast('Please upload a PDF file', 'warning');
      return;
    }
    pdfToImgFile = file;
    pdfToImgBuffer = await PDFUtils.readFileAsArrayBuffer(file);
    document.getElementById('convertBtn').disabled = false;
    App.showToast(`Loaded "${file.name}"`, 'success');
  }

  async function convertPdfToImages() {
    if (!pdfToImgBuffer) return;

    const format = document.getElementById('pdfToImgFormat').value;
    const scale = parseFloat(document.getElementById('pdfToImgScale').value);
    const pagesInput = document.getElementById('pdfToImgPages').value.trim();

    App.showProgress('convertProgress');

    try {
      const pdfDoc = await PDFUtils.loadPDFForViewing({ data: pdfToImgBuffer.slice(0) });
      const totalPages = pdfDoc.numPages;

      let pagesToConvert;
      if (pagesInput) {
        pagesToConvert = PDFUtils.parsePageRange(pagesInput, totalPages);
      } else {
        pagesToConvert = Array.from({ length: totalPages }, (_, i) => i + 1);
      }

      for (let i = 0; i < pagesToConvert.length; i++) {
        const pageNum = pagesToConvert[i];
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        // Convert canvas to blob and download
        const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
        const quality = format === 'jpeg' ? 0.92 : undefined;

        const blob = await new Promise(resolve => {
          canvas.toBlob(resolve, mimeType, quality);
        });

        const baseName = PDFUtils.stripExtension(pdfToImgFile.name);
        PDFUtils.downloadBlob(blob, `${baseName}_page_${pageNum}.${format}`);

        App.updateProgress('convertProgress', ((i + 1) / pagesToConvert.length) * 100, `Page ${pageNum}/${totalPages}`);

        // Small delay to prevent browser overload
        await PDFUtils.wait(100);
      }

      App.showToast(`Converted ${pagesToConvert.length} page(s) to ${format.toUpperCase()}!`, 'success');

    } catch (err) {
      App.showToast('Conversion failed: ' + err.message, 'error');
    } finally {
      setTimeout(() => App.hideProgress('convertProgress'), 1500);
    }
  }

  // ── Images to PDF ──
  async function handleImgToPdf(files) {
    for (const file of files) {
      if (!PDFUtils.isImage(file)) {
        App.showToast(`"${file.name}" is not an image`, 'warning');
        continue;
      }

      const dataUrl = await PDFUtils.readFileAsDataURL(file);
      imgToPdfFiles.push({
        id: PDFUtils.generateId(),
        file,
        name: file.name,
        size: file.size,
        dataUrl
      });
    }

    renderImgFileList();
    document.getElementById('convertBtn').disabled = false;
    App.showToast(`Added ${files.length} image(s)`, 'success');
  }

  function renderImgFileList() {
    const list = document.getElementById('imgToPdfFileList');
    list.innerHTML = imgToPdfFiles.map((f, i) => `
      <div class="file-item" data-sortable data-file-id="${f.id}" draggable="true">
        <div class="file-drag-handle"><span></span><span></span><span></span></div>
        <div class="file-order">${i + 1}</div>
        <div class="file-icon"><i data-lucide="image"></i></div>
        <div class="file-info">
          <div class="file-name">${f.name}</div>
          <div class="file-meta">${PDFUtils.formatFileSize(f.size)}</div>
        </div>
        <div class="file-actions">
          <button class="file-action-btn danger" onclick="ConvertTool.removeImg('${f.id}')" title="Remove">
            <i data-lucide="x"></i>
          </button>
        </div>
      </div>
    `).join('');

    App.initLucideIcons();
    PDFUtils.makeSortable(list, (order) => {
      const reordered = order.map(id => imgToPdfFiles.find(f => f.id === id)).filter(Boolean);
      imgToPdfFiles = reordered;
      renderImgFileList();
    });
  }

  function removeImg(id) {
    imgToPdfFiles = imgToPdfFiles.filter(f => f.id !== id);
    renderImgFileList();
    if (imgToPdfFiles.length === 0) {
      document.getElementById('convertBtn').disabled = true;
    }
  }

  async function convertImagesToPdf() {
    if (imgToPdfFiles.length === 0) return;

    const pageSize = document.getElementById('imgToPdfSize').value;
    const orientation = document.getElementById('imgToPdfOrientation').value;
    const margin = parseInt(document.getElementById('imgToPdfMargin').value) || 0;
    const fitImage = document.getElementById('imgToPdfFit').checked;

    App.showProgress('convertProgress');

    try {
      const pdfDoc = await PDFUtils.createEmptyPDF();

      // Page dimensions (in points: 1pt = 1/72 inch)
      const sizes = {
        a4: { w: 595.28, h: 841.89 },
        letter: { w: 612, h: 792 },
        legal: { w: 612, h: 1008 },
        fit: null
      };

      for (let i = 0; i < imgToPdfFiles.length; i++) {
        const imgFile = imgToPdfFiles[i];
        const imgBytes = await PDFUtils.readFileAsArrayBuffer(imgFile.file);

        let image;
        const ext = PDFUtils.getExtension(imgFile.name);
        if (ext === 'png') {
          image = await pdfDoc.embedPng(imgBytes);
        } else {
          // For JPEG, WEBP, etc., convert to JPEG
          if (ext === 'jpg' || ext === 'jpeg') {
            image = await pdfDoc.embedJpg(imgBytes);
          } else {
            // Convert to JPEG via canvas
            const img = await loadImage(imgFile.dataUrl);
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const jpegBlob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.95));
            const jpegBuf = await jpegBlob.arrayBuffer();
            image = await pdfDoc.embedJpg(new Uint8Array(jpegBuf));
          }
        }

        let pageW, pageH;

        if (pageSize === 'fit') {
          pageW = image.width + margin * 2;
          pageH = image.height + margin * 2;
        } else {
          const dim = sizes[pageSize];
          if (orientation === 'landscape') {
            pageW = Math.max(dim.w, dim.h);
            pageH = Math.min(dim.w, dim.h);
          } else if (orientation === 'auto') {
            if (image.width > image.height) {
              pageW = Math.max(dim.w, dim.h);
              pageH = Math.min(dim.w, dim.h);
            } else {
              pageW = dim.w;
              pageH = dim.h;
            }
          } else {
            pageW = dim.w;
            pageH = dim.h;
          }
        }

        const page = pdfDoc.addPage([pageW, pageH]);

        let drawW = image.width;
        let drawH = image.height;

        if (fitImage && pageSize !== 'fit') {
          const availW = pageW - margin * 2;
          const availH = pageH - margin * 2;
          const ratio = Math.min(availW / drawW, availH / drawH);
          if (ratio < 1) {
            drawW *= ratio;
            drawH *= ratio;
          }
        }

        const x = (pageW - drawW) / 2;
        const y = (pageH - drawH) / 2;

        page.drawImage(image, { x, y, width: drawW, height: drawH });

        App.updateProgress('convertProgress', ((i + 1) / imgToPdfFiles.length) * 100, `Image ${i + 1}/${imgToPdfFiles.length}`);
      }

      const bytes = await pdfDoc.save();
      PDFUtils.downloadPDF(bytes, 'images_combined.pdf');

      App.showToast(`Created PDF from ${imgToPdfFiles.length} image(s)!`, 'success');

    } catch (err) {
      App.showToast('Conversion failed: ' + err.message, 'error');
    } finally {
      setTimeout(() => App.hideProgress('convertProgress'), 1500);
    }
  }

  async function executeConvert() {
    const activeTab = document.querySelector('#panel-convert .tab-btn.active');
    const mode = activeTab ? activeTab.dataset.tab : 'pdfToImageTab';

    document.getElementById('convertBtn').disabled = true;
    try {
      if (mode === 'pdfToImageTab') {
        await convertPdfToImages();
      } else {
        await convertImagesToPdf();
      }
    } finally {
      document.getElementById('convertBtn').disabled = false;
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

  return {
    removeImg
  };
})();
