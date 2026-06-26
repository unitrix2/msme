/* ================================================================
   PDF Pro Tool Suite — Watermark & Stamp Module
   Text watermark, image watermark, page numbers, header/footer
   ================================================================ */

const WatermarkTool = (() => {
  'use strict';

  let currentFile = null;
  let currentArrayBuffer = null;
  let pageCount = 0;
  let wmPosition = 'center';

  function init() {
    const dropzone = document.getElementById('watermarkDropzone');
    const btn = document.getElementById('watermarkBtn');

    if (!dropzone) return;

    PDFUtils.setupDropzone(dropzone, handleFile);
    btn.addEventListener('click', applyWatermark);

    // Setup tabs
    App.setupTabs('panel-watermark');

    // Position grid
    document.querySelectorAll('#wmPositionGrid .position-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        document.querySelectorAll('#wmPositionGrid .position-cell').forEach(c => c.classList.remove('active'));
        cell.classList.add('active');
        wmPosition = cell.dataset.pos;
      });
    });

    // Opacity sliders
    const wmOpacity = document.getElementById('wmOpacity');
    if (wmOpacity) {
      wmOpacity.addEventListener('input', () => {
        document.getElementById('wmOpacityValue').textContent = wmOpacity.value;
      });
    }

    const wmImgOpacity = document.getElementById('wmImgOpacity');
    if (wmImgOpacity) {
      wmImgOpacity.addEventListener('input', () => {
        document.getElementById('wmImgOpacityValue').textContent = wmImgOpacity.value;
      });
    }

    const wmImgScale = document.getElementById('wmImgScale');
    if (wmImgScale) {
      wmImgScale.addEventListener('input', () => {
        document.getElementById('wmImgScaleValue').textContent = wmImgScale.value;
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
    const pdfDoc = await PDFUtils.loadPDFForViewing({ data: currentArrayBuffer.slice(0) });
    pageCount = pdfDoc.numPages;

    document.getElementById('watermarkBtn').disabled = false;
    App.showToast(`Loaded "${file.name}" — ${pageCount} pages`, 'success');
  }

  async function applyWatermark() {
    if (!currentArrayBuffer) return;

    const activeTab = document.querySelector('#panel-watermark .tab-btn.active');
    const mode = activeTab ? activeTab.dataset.tab : 'textWatermark';

    const btn = document.getElementById('watermarkBtn');
    btn.disabled = true;

    try {
      const pdfDoc = await PDFUtils.loadPDFForEditing(currentArrayBuffer.slice(0));
      const pages = pdfDoc.getPages();

      switch (mode) {
        case 'textWatermark':
          await addTextWatermark(pdfDoc, pages);
          break;
        case 'imageWatermark':
          await addImageWatermark(pdfDoc, pages);
          break;
        case 'pageNumbers':
          await addPageNumbers(pdfDoc, pages);
          break;
        case 'headerFooter':
          await addHeaderFooter(pdfDoc, pages);
          break;
      }

      const bytes = await pdfDoc.save();
      const baseName = PDFUtils.stripExtension(currentFile.name);
      PDFUtils.downloadPDF(bytes, `${baseName}_watermarked.pdf`);

      App.showToast('Watermark applied successfully!', 'success');

    } catch (err) {
      App.showToast('Watermark failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function addTextWatermark(pdfDoc, pages) {
    const text = document.getElementById('wmText').value || 'WATERMARK';
    const fontSize = parseInt(document.getElementById('wmFontSize').value) || 48;
    const opacity = parseInt(document.getElementById('wmOpacity').value) / 100;
    const colorHex = document.getElementById('wmColor').value;
    const rotation = parseInt(document.getElementById('wmRotation').value) || 0;

    // Parse color
    const r = parseInt(colorHex.slice(1, 3), 16) / 255;
    const g = parseInt(colorHex.slice(3, 5), 16) / 255;
    const b = parseInt(colorHex.slice(5, 7), 16) / 255;

    const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

    for (const page of pages) {
      const { width, height } = page.getSize();
      const textWidth = font.widthOfTextAtSize(text, fontSize);
      const textHeight = fontSize;

      // Calculate position
      const pos = getPosition(wmPosition, width, height, textWidth, textHeight);

      page.drawText(text, {
        x: pos.x,
        y: pos.y,
        size: fontSize,
        font,
        color: PDFLib.rgb(r, g, b),
        opacity,
        rotate: PDFLib.degrees(rotation),
      });
    }
  }

  async function addImageWatermark(pdfDoc, pages) {
    const imageFile = document.getElementById('wmImage').files[0];
    if (!imageFile) {
      App.showToast('Please select a watermark image', 'warning');
      return;
    }

    const imgBytes = await PDFUtils.readFileAsArrayBuffer(imageFile);
    let image;
    if (imageFile.type === 'image/png') {
      image = await pdfDoc.embedPng(imgBytes);
    } else {
      image = await pdfDoc.embedJpg(imgBytes);
    }

    const opacity = parseInt(document.getElementById('wmImgOpacity').value) / 100;
    const scale = parseInt(document.getElementById('wmImgScale').value) / 100;

    const imgWidth = image.width * scale;
    const imgHeight = image.height * scale;

    for (const page of pages) {
      const { width, height } = page.getSize();
      const x = (width - imgWidth) / 2;
      const y = (height - imgHeight) / 2;

      page.drawImage(image, {
        x,
        y,
        width: imgWidth,
        height: imgHeight,
        opacity,
      });
    }
  }

  async function addPageNumbers(pdfDoc, pages) {
    const format = document.getElementById('pnFormat').value;
    const startFrom = parseInt(document.getElementById('pnStart').value) || 1;
    const position = document.getElementById('pnPosition').value;
    const fontSize = parseInt(document.getElementById('pnFontSize').value) || 12;
    const prefix = document.getElementById('pnPrefix').value;
    const suffix = document.getElementById('pnSuffix').value;

    const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

    pages.forEach((page, idx) => {
      const { width, height } = page.getSize();
      const pageNum = startFrom + idx;
      let numText;

      switch (format) {
        case 'roman':
          numText = toRoman(pageNum);
          break;
        case 'alpha':
          numText = toAlpha(pageNum);
          break;
        default:
          numText = pageNum.toString();
      }

      const fullText = `${prefix}${numText}${suffix}`;
      const textWidth = font.widthOfTextAtSize(fullText, fontSize);
      const margin = 30;

      let x, y;
      switch (position) {
        case 'bottom-left':
          x = margin; y = margin;
          break;
        case 'bottom-center':
          x = (width - textWidth) / 2; y = margin;
          break;
        case 'bottom-right':
          x = width - textWidth - margin; y = margin;
          break;
        case 'top-left':
          x = margin; y = height - margin - fontSize;
          break;
        case 'top-center':
          x = (width - textWidth) / 2; y = height - margin - fontSize;
          break;
        case 'top-right':
          x = width - textWidth - margin; y = height - margin - fontSize;
          break;
        default:
          x = (width - textWidth) / 2; y = margin;
      }

      page.drawText(fullText, {
        x,
        y,
        size: fontSize,
        font,
        color: PDFLib.rgb(0.3, 0.3, 0.3),
      });
    });
  }

  async function addHeaderFooter(pdfDoc, pages) {
    const headerText = document.getElementById('hfHeader').value;
    const footerText = document.getElementById('hfFooter').value;
    const fontSize = parseInt(document.getElementById('hfFontSize').value) || 10;
    const margin = parseInt(document.getElementById('hfMargin').value) || 30;

    if (!headerText && !footerText) {
      App.showToast('Please enter header or footer text', 'warning');
      return;
    }

    const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    const today = new Date().toLocaleDateString();

    pages.forEach((page, idx) => {
      const { width, height } = page.getSize();
      const pageNum = idx + 1;

      if (headerText) {
        const processed = headerText
          .replace(/\{page\}/g, pageNum)
          .replace(/\{date\}/g, today)
          .replace(/\{total\}/g, pages.length);
        const tw = font.widthOfTextAtSize(processed, fontSize);

        page.drawText(processed, {
          x: (width - tw) / 2,
          y: height - margin,
          size: fontSize,
          font,
          color: PDFLib.rgb(0.3, 0.3, 0.3),
        });
      }

      if (footerText) {
        const processed = footerText
          .replace(/\{page\}/g, pageNum)
          .replace(/\{date\}/g, today)
          .replace(/\{total\}/g, pages.length);
        const tw = font.widthOfTextAtSize(processed, fontSize);

        page.drawText(processed, {
          x: (width - tw) / 2,
          y: margin,
          size: fontSize,
          font,
          color: PDFLib.rgb(0.3, 0.3, 0.3),
        });
      }
    });
  }

  // Helper: Get position coordinates
  function getPosition(pos, pageW, pageH, objW, objH) {
    const margin = 40;
    const positions = {
      'top-left': { x: margin, y: pageH - objH - margin },
      'top-center': { x: (pageW - objW) / 2, y: pageH - objH - margin },
      'top-right': { x: pageW - objW - margin, y: pageH - objH - margin },
      'center-left': { x: margin, y: (pageH - objH) / 2 },
      'center': { x: (pageW - objW) / 2, y: (pageH - objH) / 2 },
      'center-right': { x: pageW - objW - margin, y: (pageH - objH) / 2 },
      'bottom-left': { x: margin, y: margin },
      'bottom-center': { x: (pageW - objW) / 2, y: margin },
      'bottom-right': { x: pageW - objW - margin, y: margin },
    };
    return positions[pos] || positions['center'];
  }

  // Helper: Number to Roman numerals
  function toRoman(num) {
    const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
    const syms = ['m', 'cm', 'd', 'cd', 'c', 'xc', 'l', 'xl', 'x', 'ix', 'v', 'iv', 'i'];
    let result = '';
    for (let i = 0; i < vals.length; i++) {
      while (num >= vals[i]) {
        result += syms[i];
        num -= vals[i];
      }
    }
    return result;
  }

  // Helper: Number to alphabet
  function toAlpha(num) {
    let result = '';
    while (num > 0) {
      num--;
      result = String.fromCharCode(97 + (num % 26)) + result;
      num = Math.floor(num / 26);
    }
    return result;
  }

  document.addEventListener('DOMContentLoaded', init);
  return {};
})();
