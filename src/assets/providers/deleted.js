window.viewProviderRegistry.register('deleted', ({ clearOutline, contentEl, escapeHtml, setContentMode }) => ({
  render(data) {
    clearOutline();
    setContentMode('document');
    contentEl.innerHTML = `
      <div class="binary-preview">
        <h2>${escapeHtml(data.title)}</h2>
        <p>This file was deleted from the working tree.</p>
      </div>`;
  },
}));
