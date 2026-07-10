window.viewProviderRegistry.register('binary', ({ clearOutline, contentEl, escapeHtml, setContentMode }) => ({
  render(data) {
    clearOutline();
    setContentMode('document');
    contentEl.innerHTML = `
      <div class="binary-preview">
        <h2>${escapeHtml(data.title)}</h2>
        <p>${escapeHtml(data.mime)} · ${escapeHtml(data.readableSize)}</p>
        <a href="${escapeHtml(data.url)}" download>Download file</a>
      </div>`;
  },
}));
