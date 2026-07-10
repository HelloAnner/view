window.viewProviderRegistry.register('image', (dependencies) => {
  const { clearOutline, contentEl, escapeHtml, setContentMode } = dependencies;
  let resizeObserver = null;
  let state = { scale: 1, panX: 0, panY: 0, mode: 'fit', width: 0, height: 0 };

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function updateTransform() {
    const canvas = contentEl.querySelector('.image-canvas');
    const image = canvas?.querySelector('img');
    if (!canvas || !image) return;
    image.style.setProperty('--image-scale', String(state.scale));
    image.style.setProperty('--pan-x', `${state.panX}px`);
    image.style.setProperty('--pan-y', `${state.panY}px`);
    const zoomLabel = contentEl.querySelector('.image-zoom');
    if (zoomLabel) zoomLabel.textContent = `${Math.round(state.scale * 100)}%`;
    contentEl.querySelector('[data-image-action="fit"]')?.classList.toggle('is-active', state.mode === 'fit');
    contentEl.querySelector('[data-image-action="actual"]')?.classList.toggle('is-active', state.mode === 'actual');
  }

  function applyState(nextState) {
    state = { ...state, ...nextState };
    updateTransform();
  }

  function fitImage() {
    const canvas = contentEl.querySelector('.image-canvas');
    const image = canvas?.querySelector('img');
    if (!canvas || !image?.naturalWidth || !image?.naturalHeight) return;
    const availableWidth = Math.max(1, canvas.clientWidth - 56);
    const availableHeight = Math.max(1, canvas.clientHeight - 56);
    state = {
      ...state,
      scale: Math.min(availableWidth / image.naturalWidth, availableHeight / image.naturalHeight, 1),
      panX: 0,
      panY: 0,
      mode: 'fit',
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
    updateTransform();
  }

  function setZoom(scale, mode = 'custom') {
    state = { ...state, scale: clamp(scale, 0.1, 8), mode };
    updateTransform();
  }

  return {
    render(data) {
      clearOutline();
      setContentMode('media');
      state = { scale: 1, panX: 0, panY: 0, mode: 'fit', width: 0, height: 0 };
      contentEl.innerHTML = `
        <div class="image-workbench">
          <div class="image-canvas" tabindex="0" aria-label="Image canvas">
            <img src="${escapeHtml(data.url)}" alt="${escapeHtml(data.title)}" draggable="false">
          </div>
          <footer class="image-toolbar">
            <div class="image-controls" role="group" aria-label="Image zoom controls">
              <button class="image-tool-button" type="button" data-image-action="fit">Fit</button>
              <button class="image-tool-button" type="button" data-image-action="actual">100%</button>
              <button class="image-tool-button" type="button" data-image-action="out" aria-label="Zoom out">−</button>
              <span class="image-zoom">100%</span>
              <button class="image-tool-button" type="button" data-image-action="in" aria-label="Zoom in">+</button>
            </div>
            <span class="image-meta">Loading dimensions… · ${escapeHtml(data.readableSize)}</span>
          </footer>
        </div>`;

      const canvas = contentEl.querySelector('.image-canvas');
      const image = canvas.querySelector('img');
      const meta = contentEl.querySelector('.image-meta');
      const onImageLoad = () => {
        state.width = image.naturalWidth;
        state.height = image.naturalHeight;
        meta.textContent = `${image.naturalWidth.toLocaleString()} × ${image.naturalHeight.toLocaleString()} px · ${data.readableSize}`;
        fitImage();
      };
      if (image.complete && image.naturalWidth) onImageLoad();
      else image.addEventListener('load', onImageLoad, { once: true });

      contentEl.querySelector('.image-controls').addEventListener('click', (event) => {
        const action = event.target.closest('[data-image-action]')?.dataset.imageAction;
        if (action === 'fit') fitImage();
        if (action === 'actual') setZoom(1, 'actual');
        if (action === 'in') setZoom(state.scale * 1.25);
        if (action === 'out') setZoom(state.scale / 1.25);
      });

      let dragStart = null;
      canvas.addEventListener('pointerdown', (event) => {
        dragStart = { x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY };
        canvas.setPointerCapture(event.pointerId);
      });
      canvas.addEventListener('pointermove', (event) => {
        if (!dragStart) return;
        state.panX = dragStart.panX + event.clientX - dragStart.x;
        state.panY = dragStart.panY + event.clientY - dragStart.y;
        state.mode = 'custom';
        updateTransform();
      });
      canvas.addEventListener('pointerup', () => { dragStart = null; });
      canvas.addEventListener('pointercancel', () => { dragStart = null; });
      canvas.addEventListener('wheel', (event) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        setZoom(state.scale * Math.exp(-event.deltaY * 0.002));
      }, { passive: false });
      canvas.addEventListener('keydown', (event) => {
        if (event.key === '+' || event.key === '=') setZoom(state.scale * 1.25);
        else if (event.key === '-') setZoom(state.scale / 1.25);
        else if (event.key === '0') setZoom(1, 'actual');
        else if (event.key.toLowerCase() === 'f') fitImage();
        else return;
        event.preventDefault();
      });

      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(() => {
        if (state.mode === 'fit') fitImage();
      });
      resizeObserver.observe(canvas);
    },
    captureState() {
      return { ...state };
    },
    restoreState(savedState) {
      if (!savedState) return;
      const image = contentEl.querySelector('.image-canvas img');
      if (image?.complete) applyState(savedState);
      else image?.addEventListener('load', () => applyState(savedState), { once: true });
    },
    destroy() {
      resizeObserver?.disconnect();
      resizeObserver = null;
    },
  };
});
