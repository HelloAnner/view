window.viewProviderRegistry.register('html', ({ clearOutline, contentEl, escapeHtml, setContentMode }) => ({
  render(data) {
    clearOutline();
    setContentMode('fill');
    contentEl.innerHTML = `<div class="html-preview"><iframe src="${escapeHtml(data.url)}" title="${escapeHtml(data.title)}" sandbox="allow-scripts allow-popups allow-forms" referrerpolicy="no-referrer"></iframe></div>`;
  },
}));
