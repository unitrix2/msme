/* ================================================================
   Particle Network Animation
   Interactive constellation/network effect with mouse interaction
   Used on MSME Office Tools landing page and PDF tool backgrounds
   ================================================================ */

const ParticleNetwork = (() => {
  'use strict';

  let canvas, ctx;
  let particles = [];
  let mouse = { x: -999, y: -999, active: false };
  let animId = null;
  let resizeTimeout;

  // Configuration
  const config = {
    particleCount: 120,
    particleMinSize: 1,
    particleMaxSize: 3,
    lineDistance: 150,
    mouseDistance: 200,
    speed: 0.4,
    lineOpacity: 0.15,
    particleOpacity: 0.5,
    mouseLineOpacity: 0.3,
    colors: {
      particle: null, // Will use accent color
      line: null,
      mouseLine: null
    }
  };

  function init(canvasId, options = {}) {
    canvas = document.getElementById(canvasId);
    if (!canvas) return;

    ctx = canvas.getContext('2d');
    Object.assign(config, options);

    resize();
    createParticles();
    addEventListeners();
    animate();
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function getAccentColor(opacity = 1) {
    const root = getComputedStyle(document.documentElement);
    const h = root.getPropertyValue('--accent-h')?.trim() || '217';
    const s = root.getPropertyValue('--accent-s')?.trim() || '91%';
    const l = root.getPropertyValue('--accent-l')?.trim() || '60%';
    return `hsla(${h}, ${s}, ${l}, ${opacity})`;
  }

  function getThemeColor(opacity = 1) {
    const theme = document.documentElement.getAttribute('data-theme');
    if (theme === 'dark') {
      return `rgba(255, 255, 255, ${opacity})`;
    }
    return `rgba(100, 120, 160, ${opacity})`;
  }

  function createParticles() {
    particles = [];
    for (let i = 0; i < config.particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * config.speed * 2,
        vy: (Math.random() - 0.5) * config.speed * 2,
        size: config.particleMinSize + Math.random() * (config.particleMaxSize - config.particleMinSize),
        isAccent: Math.random() < 0.3 // 30% of particles use accent color
      });
    }
  }

  function addEventListeners() {
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        resize();
        createParticles();
      }, 200);
    });

    window.addEventListener('mousemove', (e) => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;
    });

    window.addEventListener('mouseleave', () => {
      mouse.active = false;
      mouse.x = -999;
      mouse.y = -999;
    });

    // Touch support
    window.addEventListener('touchmove', (e) => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      mouse.x = touch.clientX - rect.left;
      mouse.y = touch.clientY - rect.top;
      mouse.active = true;
    }, { passive: true });

    window.addEventListener('touchend', () => {
      mouse.active = false;
    });
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update and draw particles
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // Move
      p.x += p.vx;
      p.y += p.vy;

      // Bounce off edges with slight randomness
      if (p.x < 0 || p.x > canvas.width) {
        p.vx *= -1;
        p.x = Math.max(0, Math.min(canvas.width, p.x));
      }
      if (p.y < 0 || p.y > canvas.height) {
        p.vy *= -1;
        p.y = Math.max(0, Math.min(canvas.height, p.y));
      }

      // Mouse repulsion/attraction
      if (mouse.active) {
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < config.mouseDistance) {
          const force = (config.mouseDistance - dist) / config.mouseDistance;
          const angle = Math.atan2(dy, dx);
          p.vx += Math.cos(angle) * force * 0.15;
          p.vy += Math.sin(angle) * force * 0.15;

          // Dampen velocity
          p.vx *= 0.98;
          p.vy *= 0.98;
        }
      }

      // Speed limit
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > config.speed * 3) {
        p.vx = (p.vx / speed) * config.speed * 3;
        p.vy = (p.vy / speed) * config.speed * 3;
      }

      // Draw particle
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.isAccent
        ? getAccentColor(config.particleOpacity)
        : getThemeColor(config.particleOpacity * 0.6);
      ctx.fill();

      // Draw connections between close particles
      for (let j = i + 1; j < particles.length; j++) {
        const p2 = particles[j];
        const dx = p.x - p2.x;
        const dy = p.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < config.lineDistance) {
          const opacity = (1 - dist / config.lineDistance) * config.lineOpacity;

          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = (p.isAccent || p2.isAccent)
            ? getAccentColor(opacity)
            : getThemeColor(opacity);
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }

      // Draw lines from mouse to nearby particles
      if (mouse.active) {
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < config.mouseDistance) {
          const opacity = (1 - dist / config.mouseDistance) * config.mouseLineOpacity;

          ctx.beginPath();
          ctx.moveTo(mouse.x, mouse.y);
          ctx.lineTo(p.x, p.y);
          ctx.strokeStyle = getAccentColor(opacity);
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }
    }

    animId = requestAnimationFrame(animate);
  }

  function destroy() {
    if (animId) cancelAnimationFrame(animId);
    particles = [];
  }

  return { init, destroy, config };
})();
