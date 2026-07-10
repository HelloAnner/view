window.viewProviderRegistry.register('pdf', ({ clearOutline, contentEl, escapeHtml, setContentMode }) => ({
  render(data) {
    clearOutline();
    setContentMode('fill');
    contentEl.innerHTML = `<div class="pdf-preview"><embed src="${escapeHtml(data.url)}" type="application/pdf"></div>`;
  },
}));
