/* ================================================================
   PDF Pro Tool Suite — OCR Module
   Hindi + English OCR with Tesseract.js
   Features: Extract Text + Make Searchable/Readable PDF
   ================================================================ */

const OCRTool = (() => {
  'use strict';

  let currentFile = null;
  let currentArrayBuffer = null;
  let isPdfFile = false;
  let selectedLang = 'eng';
  let ocrMode = 'text'; // 'text' or 'searchable'
  let ocrResult = '';
  let searchablePdfBytes = null;

  function init() {
    const dropzone = document.getElementById('ocrDropzone');
    const ocrBtn = document.getElementById('ocrBtn');

    if (!dropzone) return;

    PDFUtils.setupDropzone(dropzone, handleFile);
    ocrBtn.addEventListener('click', startOCR);

    // Language chips
    document.querySelectorAll('[data-ocr-lang]').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('[data-ocr-lang]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        selectedLang = chip.dataset.ocrLang;
      });
    });

    // Output mode chips
    document.querySelectorAll('[data-ocr-mode]').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('[data-ocr-mode]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        ocrMode = chip.dataset.ocrMode;
        document.getElementById('ocrSearchableInfo').classList.toggle('hidden', ocrMode !== 'searchable');
      });
    });

    // Copy button
    const copyBtn = document.getElementById('ocrCopyBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(ocrResult).then(() => {
          App.showToast('Text copied to clipboard!', 'success');
        });
      });
    }

    // Download TXT button
    const dlBtn = document.getElementById('ocrDownloadBtn');
    if (dlBtn) {
      dlBtn.addEventListener('click', () => {
        PDFUtils.downloadText(ocrResult, 'ocr_result.txt');
      });
    }

    // Download Searchable PDF button
    const pdfBtn = document.getElementById('ocrSearchablePdfBtn');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', () => {
        if (searchablePdfBytes) {
          const baseName = currentFile ? PDFUtils.stripExtension(currentFile.name) : 'document';
          PDFUtils.downloadPDF(searchablePdfBytes, `${baseName}_searchable.pdf`);
        }
      });
    }
  }

  async function handleFile(files) {
    const file = files[0];
    currentFile = file;

    if (PDFUtils.isPDF(file)) {
      isPdfFile = true;
      currentArrayBuffer = await PDFUtils.readFileAsArrayBuffer(file);
      document.getElementById('ocrPageSelectGroup').style.display = 'block';
    } else if (PDFUtils.isImage(file)) {
      isPdfFile = false;
      currentArrayBuffer = null;
      document.getElementById('ocrPageSelectGroup').style.display = 'none';
    } else {
      App.showToast('Please upload a PDF or image file', 'warning');
      return;
    }

    document.getElementById('ocrBtn').disabled = false;
    App.showToast(`Loaded "${file.name}"`, 'success');
  }

  async function startOCR() {
    if (!currentFile) return;

    const ocrBtn = document.getElementById('ocrBtn');
    ocrBtn.disabled = true;
    searchablePdfBytes = null;
    App.showProgress('ocrProgress');
    App.updateProgress('ocrProgress', 5, 'Initializing OCR engine...');

    try {
      // ── Step 1: Prepare page images ──
      let pageImages = []; // { canvas, pageNum, origWidth, origHeight }

      if (isPdfFile) {
        const pdfDoc = await PDFUtils.loadPDFForViewing({ data: currentArrayBuffer.slice(0) });
        const totalPages = pdfDoc.numPages;

        const pageInput = document.getElementById('ocrPageSelect').value.trim();
        let pagesToOCR;
        if (pageInput) {
          pagesToOCR = PDFUtils.parsePageRange(pageInput, totalPages);
        } else {
          pagesToOCR = Array.from({ length: totalPages }, (_, i) => i + 1);
        }

        App.updateProgress('ocrProgress', 10, 'Rendering pages...');

        for (let i = 0; i < pagesToOCR.length; i++) {
          const pageNum = pagesToOCR[i];
          const page = await pdfDoc.getPage(pageNum);

          // Original page size (for searchable PDF)
          const origViewport = page.getViewport({ scale: 1 });

          // High-res render for OCR accuracy
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          await page.render({ canvasContext: ctx, viewport }).promise;

          pageImages.push({
            canvas,
            pageNum,
            origWidth: origViewport.width,
            origHeight: origViewport.height
          });

          App.updateProgress('ocrProgress', 10 + (i / pagesToOCR.length) * 15, `Rendering page ${pageNum}...`);
        }
      } else {
        // Single image file
        const img = await loadImage(await PDFUtils.readFileAsDataURL(currentFile));
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        pageImages.push({
          canvas,
          pageNum: 1,
          origWidth: img.naturalWidth,
          origHeight: img.naturalHeight
        });
      }

      // ── Step 2: Initialize Tesseract Worker ──
      App.updateProgress('ocrProgress', 25, 'Loading OCR engine & language data...');

      const workerOptions = {};

      // Try local tessdata first
      try {
        const testFetch = await fetch('tessdata/eng.traineddata.gz', { method: 'HEAD' });
        if (testFetch.ok) {
          workerOptions.langPath = 'tessdata';
        }
      } catch (e) {
        // Will use CDN
      }

      const worker = await Tesseract.createWorker(selectedLang, 1, {
        ...workerOptions,
        logger: (m) => {
          if (m.status === 'recognizing text') {
            const pct = 30 + m.progress * 50;
            App.updateProgress('ocrProgress', pct, `Recognizing text... ${Math.round(m.progress * 100)}%`);
          }
        }
      });

      // ── Step 3: Run OCR on each page ──
      let fullText = '';
      let totalConfidence = 0;
      let confidenceCount = 0;
      let allPageOCRData = []; // For searchable PDF: { pageIdx, words, canvas, origW, origH }

      for (let i = 0; i < pageImages.length; i++) {
        const { canvas, pageNum, origWidth, origHeight } = pageImages[i];

        App.updateProgress('ocrProgress', 30 + ((i / pageImages.length) * 50), `OCR processing page ${pageNum}...`);

        const result = await worker.recognize(canvas);

        if (pageImages.length > 1) {
          fullText += `\n═══ Page ${pageNum} ═══\n\n`;
        }
        fullText += result.data.text;
        totalConfidence += result.data.confidence;
        confidenceCount++;

        // Store word-level data for searchable PDF
        allPageOCRData.push({
          pageNum,
          words: result.data.words || [],
          lines: result.data.lines || [],
          canvas,
          origWidth,
          origHeight,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height
        });
      }

      await worker.terminate();

      // ── Step 4: Generate output ──
      ocrResult = fullText.trim();
      const avgConfidence = Math.round(totalConfidence / confidenceCount);

      // If searchable PDF mode, build the PDF
      if (ocrMode === 'searchable' && isPdfFile) {
        App.updateProgress('ocrProgress', 85, 'Building searchable PDF...');
        searchablePdfBytes = await buildSearchablePDF(allPageOCRData);
        App.updateProgress('ocrProgress', 100, 'Searchable PDF ready!');
      } else if (ocrMode === 'searchable' && !isPdfFile) {
        App.updateProgress('ocrProgress', 85, 'Building searchable PDF from image...');
        searchablePdfBytes = await buildSearchablePDF(allPageOCRData);
        App.updateProgress('ocrProgress', 100, 'Searchable PDF ready!');
      } else {
        App.updateProgress('ocrProgress', 100, 'Complete!');
      }

      // ── Step 5: Display results ──
      const resultCard = document.getElementById('ocrResultCard');
      resultCard.classList.remove('hidden');

      const outputDiv = document.getElementById('ocrOutput');
      outputDiv.textContent = ocrResult || '(No text detected)';

      // Confidence badge
      const confEl = document.getElementById('ocrConfidence');
      let confClass = 'high';
      if (avgConfidence < 60) confClass = 'low';
      else if (avgConfidence < 80) confClass = 'medium';
      confEl.className = `ocr-confidence ${confClass}`;
      confEl.textContent = `${avgConfidence}% Confidence`;

      // Show/hide searchable PDF button
      const pdfBtn = document.getElementById('ocrSearchablePdfBtn');
      if (pdfBtn) {
        pdfBtn.classList.toggle('hidden', !searchablePdfBytes);
      }

      // Show/hide text buttons based on mode
      document.getElementById('ocrCopyBtn').classList.toggle('hidden', false);
      document.getElementById('ocrDownloadBtn').classList.toggle('hidden', false);

      App.initLucideIcons();

      if (searchablePdfBytes) {
        App.showToast(`OCR complete! Searchable PDF ready (${avgConfidence}% confidence)`, 'success');
      } else {
        App.showToast(`OCR complete! ${avgConfidence}% confidence`, 'success');
      }

    } catch (err) {
      App.showToast('OCR failed: ' + err.message, 'error');
      console.error('OCR Error:', err);
    } finally {
      ocrBtn.disabled = false;
      setTimeout(() => App.hideProgress('ocrProgress'), 2000);
    }
  }

  // ── Sanitize text for WinAnsi encoding (Helvetica font) ──
  // Removes control characters, newlines, tabs, and replaces
  // non-WinAnsi characters (Hindi/Devanagari etc.) with spaces
  function sanitizeForWinAnsi(text) {
    if (!text) return '';

    // Step 1: Replace newlines, tabs, carriage returns with space
    let clean = text.replace(/[\r\n\t\f\v]/g, ' ');

    // Step 2: Remove all control characters (0x00-0x1F, 0x7F)
    clean = clean.replace(/[\x00-\x1F\x7F]/g, '');

    // Step 3: Replace non-WinAnsi characters with space
    // WinAnsi supports: 0x20-0x7E (basic ASCII) + 0xA0-0xFF (Latin extended)
    // Everything else (Hindi, Chinese, emoji, etc.) gets replaced with space
    let result = '';
    for (let i = 0; i < clean.length; i++) {
      const code = clean.charCodeAt(i);
      if ((code >= 0x20 && code <= 0x7E) || (code >= 0xA0 && code <= 0xFF)) {
        result += clean[i];
      } else {
        result += ' '; // preserve character width/position
      }
    }

    // Step 4: Collapse multiple consecutive spaces into one
    result = result.replace(/  +/g, ' ').trim();

    return result;
  }

  // ── Build Searchable PDF ──
  // Creates a PDF where each page has the original image as background
  // and an invisible text layer on top for search/select/copy.
  // The image preserves the visual (including Hindi text),
  // while the invisible text layer enables search for Latin text.
  async function buildSearchablePDF(allPageOCRData) {
    const pdfDoc = await PDFUtils.createEmptyPDF();

    // Embed a standard font for the text layer
    const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

    for (const pageData of allPageOCRData) {
      const { canvas, origWidth, origHeight, canvasWidth, canvasHeight, words, lines } = pageData;

      // ── Embed the page image as background ──
      const jpegBlob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/jpeg', 0.92);
      });
      const jpegBuffer = await jpegBlob.arrayBuffer();
      const pageImage = await pdfDoc.embedJpg(new Uint8Array(jpegBuffer));

      // Use original page dimensions (or image dimensions for image files)
      const pageWidth = origWidth;
      const pageHeight = origHeight;

      const page = pdfDoc.addPage([pageWidth, pageHeight]);

      // Draw the original image as background (full page)
      page.drawImage(pageImage, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      });

      // ── Overlay invisible text layer using word-level data ──
      // Word-level gives better positioning accuracy than line-level
      const scaleX = pageWidth / canvasWidth;
      const scaleY = pageHeight / canvasHeight;

      // Prefer word-level data, fall back to line-level
      const textItems = (words && words.length > 0) ? words : (lines || []);

      for (const item of textItems) {
        const rawText = item.text;
        if (!rawText || rawText.trim() === '') continue;

        // Sanitize text for WinAnsi encoding
        const safeText = sanitizeForWinAnsi(rawText);
        if (!safeText || safeText.trim() === '') continue;

        const bbox = item.bbox;
        if (!bbox) continue;

        // Convert OCR coordinates to PDF coordinates
        // OCR: origin top-left, Y increases downward
        // PDF: origin bottom-left, Y increases upward
        const x = bbox.x0 * scaleX;
        const y = pageHeight - (bbox.y1 * scaleY); // flip Y

        // Calculate font size from bounding box height
        const bboxHeightPx = bbox.y1 - bbox.y0;
        let fontSize = bboxHeightPx * scaleY * 0.7;
        fontSize = Math.max(3, Math.min(fontSize, 72)); // clamp

        // Adjust font size to match bounding box width
        try {
          const textWidth = font.widthOfTextAtSize(safeText, fontSize);
          const targetWidth = (bbox.x1 - bbox.x0) * scaleX;

          if (textWidth > 0 && targetWidth > 0) {
            const widthRatio = targetWidth / textWidth;
            fontSize = fontSize * widthRatio;
            fontSize = Math.max(2, Math.min(fontSize, 72));
          }
        } catch (e) {
          // If width calculation fails, keep estimated size
        }

        try {
          // Draw text invisibly (opacity 0)
          // Text is there for search/select but not visible to the eye
          page.drawText(safeText, {
            x: x,
            y: y,
            size: fontSize,
            font: font,
            color: PDFLib.rgb(0, 0, 0),
            opacity: 0, // Invisible! This is the key
          });
        } catch (e) {
          // If it still fails, skip this item silently
          console.warn('Skipped text item:', rawText.substring(0, 30), e.message);
        }
      }
    }

    return await pdfDoc.save();
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
