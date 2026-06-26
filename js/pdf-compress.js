/* ================================================================
   PDF Pro Tool Suite — Compress & Optimize Module
   Quality-based compression with image re-encoding
   ================================================================ */

const CompressTool = (() => {
  'use strict';

  let currentFile = null;
  let currentArrayBuffer = null;
  let qualityLevel = 'medium';

  function init() {
    const dropzone = document.getElementById('compressDropzone');
    const btn = document.getElementById('compressBtn');
    const slider = document.getElementById('compressQualitySlider');

    if (!dropzone) return;

    PDFUtils.setupDropzone(dropzone, handleFile);
    btn.addEventListener('click', compressPDF);

    // Quality chips
    document.querySelectorAll('[data-quality]').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('[data-quality]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        qualityLevel = chip.dataset.quality;

        const presets = { low: 30, medium: 60, high: 85 };
        slider.value = presets[qualityLevel];
        document.getElementById('compressQualityValue').textContent = slider.value;
      });
    });

    // Quality slider
    if (slider) {
      slider.addEventListener('input', () => {
        document.getElementById('compressQualityValue').textContent = slider.value;
      });
    }
  }

  async function handleFile(files) {
    const file = files[0];
    if (!PDFUtils.isPDF(file)) {
      App.showToast('Please upload a PDF file', 'warning');
      return;
    }

    currentFile = file;
    currentArrayBuffer = await PDFUtils.readFileAsArrayBuffer(file);
    document.getElementById('compressBtn').disabled = false;
    App.showToast(`Loaded "${file.name}" (${PDFUtils.formatFileSize(file.size)})`, 'success');
  }

  async function compressPDF() {
    if (!currentArrayBuffer) return;

    const btn = document.getElementById('compressBtn');
    btn.disabled = true;
    App.showProgress('compressProgress');
    App.updateProgress('compressProgress', 10, 'Loading PDF...');

    try {
      const quality = parseInt(document.getElementById('compressQualitySlider').value) / 100;
      const grayscale = document.getElementById('compressGrayscale').checked;
      const removeMetadata = document.getElementById('compressMetadata').checked;

      // Load PDF with pdf-lib
      const pdfDoc = await PDFUtils.loadPDFForEditing(currentArrayBuffer.slice(0));

      App.updateProgress('compressProgress', 30, 'Processing pages...');

      // Use pdf.js to render each page, then re-encode as image and rebuild
      const viewDoc = await PDFUtils.loadPDFForViewing({ data: currentArrayBuffer.slice(0) });
      const totalPages = viewDoc.numPages;

      const newDoc = await PDFUtils.createEmptyPDF();

      for (let i = 1; i <= totalPages; i++) {
        const page = await viewDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });

        // Render page to canvas
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        if (grayscale) {
          ctx.filter = 'grayscale(100%)';
        }

        await page.render({ canvasContext: ctx, viewport }).promise;

        // Re-encode as JPEG with quality
        const jpegBlob = await new Promise(resolve => {
          canvas.toBlob(resolve, 'image/jpeg', quality);
        });
        const jpegBuffer = await jpegBlob.arrayBuffer();
        const jpegImage = await newDoc.embedJpg(new Uint8Array(jpegBuffer));

        // Get original page dimensions
        const origPage = pdfDoc.getPages()[i - 1];
        const { width: origWidth, height: origHeight } = origPage.getSize();

        // Create new page with original dimensions
        const newPage = newDoc.addPage([origWidth, origHeight]);
        newPage.drawImage(jpegImage, {
          x: 0,
          y: 0,
          width: origWidth,
          height: origHeight,
        });

        App.updateProgress('compressProgress', 30 + (i / totalPages) * 60, `Page ${i}/${totalPages}...`);
      }

      // Remove metadata if requested
      if (removeMetadata) {
        newDoc.setTitle('');
        newDoc.setAuthor('');
        newDoc.setSubject('');
        newDoc.setKeywords([]);
        newDoc.setProducer('');
        newDoc.setCreator('');
      }

      App.updateProgress('compressProgress', 95, 'Saving...');

      const compressedBytes = await newDoc.save();

      App.updateProgress('compressProgress', 100, 'Complete!');

      // Calculate stats
      const originalSize = currentFile.size;
      const compressedSize = compressedBytes.length;
      const reduction = ((1 - compressedSize / originalSize) * 100).toFixed(1);

      // Show result
      const resultDiv = document.getElementById('compressResult');
      resultDiv.innerHTML = `
        <div class="result-header">
          <div class="result-title">${compressedSize < originalSize ? '✅ Compression Successful!' : '⚠️ Compression Complete'}</div>
        </div>
        <div class="result-stats mb-3">
          <div class="result-stat">
            <div class="result-stat-value">${PDFUtils.formatFileSize(originalSize)}</div>
            <div class="result-stat-label">Original Size</div>
          </div>
          <div class="result-stat">
            <div class="result-stat-value">${PDFUtils.formatFileSize(compressedSize)}</div>
            <div class="result-stat-label">Compressed Size</div>
          </div>
          <div class="result-stat">
            <div class="result-stat-value" style="color:${compressedSize < originalSize ? 'hsl(160,84%,39%)' : 'hsl(0,84%,60%)'}">${reduction}%</div>
            <div class="result-stat-label">${compressedSize < originalSize ? 'Reduced' : 'Change'}</div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="CompressTool.downloadResult()">
          <i data-lucide="download"></i> Download Compressed PDF
        </button>
      `;
      resultDiv.classList.add('active');
      App.initLucideIcons();

      CompressTool._resultBytes = compressedBytes;
      App.showToast(`Compressed! ${reduction}% size reduction`, 'success');

    } catch (err) {
      App.showToast('Compression failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      setTimeout(() => App.hideProgress('compressProgress'), 1500);
    }
  }

  function downloadResult() {
    if (CompressTool._resultBytes) {
      const baseName = PDFUtils.stripExtension(currentFile.name);
      PDFUtils.downloadPDF(CompressTool._resultBytes, `${baseName}_compressed.pdf`);
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    downloadResult,
    _resultBytes: null
  };
})();
