/* ================================================================
   PDF Pro Tool Suite — Main App Controller
   Theme management, navigation, toasts, and app initialization
   ================================================================ */

const App = (() => {
  'use strict';

  // ── State ──
  let currentTool = 'home';
  let theme = localStorage.getItem('pdf-tool-theme') || 'dark';
  let accent = localStorage.getItem('pdf-tool-accent') || 'red';

  // ── DOM References ──
  const root = document.documentElement;

  // ── Initialize ──
  function init() {
    applyTheme(theme);
    applyAccent(accent);
    setupNavigation();
    setupThemeToggle();
    setupAccentPicker();
    setupMobileMenu();
    initLucideIcons();

    // Show home by default
    navigateTo('home');

    console.log('✨ PDF Pro Tool Suite initialized');
  }

  // ── Theme Management ──
  function applyTheme(t) {
    theme = t;
    root.setAttribute('data-theme', t);
    localStorage.setItem('pdf-tool-theme', t);

    // Update icon
    const themeIcon = document.querySelector('#themeToggleBtn i');
    if (themeIcon) {
      themeIcon.setAttribute('data-lucide', t === 'dark' ? 'sun' : 'moon');
      initLucideIcons();
    }
  }

  function toggleTheme() {
    applyTheme(theme === 'dark' ? 'light' : 'dark');
    showToast(theme === 'dark' ? '🌙 Dark mode enabled' : '☀️ Light mode enabled', 'info');
  }

  function setupThemeToggle() {
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.addEventListener('click', toggleTheme);
  }

  // ── Accent Color Management ──
  function applyAccent(color) {
    accent = color;
    root.setAttribute('data-accent', color);
    localStorage.setItem('pdf-tool-accent', color);

    // Update active dot
    document.querySelectorAll('.accent-dot').forEach(dot => {
      dot.classList.toggle('active', dot.dataset.color === color);
    });
  }

  function setupAccentPicker() {
    document.querySelectorAll('.accent-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        applyAccent(dot.dataset.color);
      });
    });
  }

  // ── Navigation ──
  function setupNavigation() {
    document.querySelectorAll('.nav-item[data-tool]').forEach(item => {
      item.addEventListener('click', () => {
        navigateTo(item.dataset.tool);

        // Close mobile sidebar
        document.querySelector('.sidebar')?.classList.remove('open');
      });
    });
  }

  function navigateTo(toolId) {
    currentTool = toolId;

    // Update sidebar active state
    document.querySelectorAll('.nav-item[data-tool]').forEach(item => {
      item.classList.toggle('active', item.dataset.tool === toolId);
    });

    // Update tool panels
    document.querySelectorAll('.tool-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === 'panel-' + toolId);
    });

    // Update header title
    const activeNav = document.querySelector(`.nav-item[data-tool="${toolId}"]`);
    const headerTitle = document.getElementById('headerTitle');
    if (headerTitle && activeNav) {
      headerTitle.textContent = activeNav.querySelector('.nav-text')?.textContent || 'PDF Pro Tool Suite';
    }
  }

  // ── Mobile Menu ──
  function setupMobileMenu() {
    const menuBtn = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    if (menuBtn && sidebar) {
      menuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
      });
    }
  }

  // ── Toast Notifications ──
  function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ── Lucide Icons ──
  function initLucideIcons() {
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  // ── Tab System ──
  function setupTabs(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabGroup = btn.closest('.tabs');
        const tabId = btn.dataset.tab;

        // Update buttons
        tabGroup.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update content
        const parent = container;
        parent.querySelectorAll('.tab-content').forEach(content => {
          content.classList.toggle('active', content.id === tabId);
        });
      });
    });
  }

  // ── Progress UI ──
  function updateProgress(wrapperId, percent, label = '') {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;

    const fill = wrapper.querySelector('.progress-fill');
    const pctLabel = wrapper.querySelector('.progress-pct');
    const textLabel = wrapper.querySelector('.progress-text');

    if (fill) fill.style.width = percent + '%';
    if (pctLabel) pctLabel.textContent = Math.round(percent) + '%';
    if (textLabel && label) textLabel.textContent = label;
  }

  function showProgress(wrapperId) {
    const wrapper = document.getElementById(wrapperId);
    if (wrapper) wrapper.style.display = 'block';
  }

  function hideProgress(wrapperId) {
    const wrapper = document.getElementById(wrapperId);
    if (wrapper) wrapper.style.display = 'none';
  }

  // ── Public API ──
  return {
    init,
    navigateTo,
    showToast,
    setupTabs,
    updateProgress,
    showProgress,
    hideProgress,
    initLucideIcons,
    get currentTool() { return currentTool; },
    get theme() { return theme; },
    get accent() { return accent; }
  };
})();

// ── Initialize app when DOM is ready ──
document.addEventListener('DOMContentLoaded', App.init);
