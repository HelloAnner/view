window.viewProviderRegistry.register('code', (dependencies) => {
  const {
    clearOutline,
    contentEl,
    escapeHtml,
    getCurrentPath,
    setContentMode,
    showToast,
    updateFileLocation,
    wrapBtn,
  } = dependencies;
  const wrapKey = 'view-code-wrap';

  function highlightedLines(html) {
    const source = document.createElement('div');
    source.innerHTML = html;
    const lines = [document.createElement('span')];

    function appendText(text, ancestors) {
      const chunks = text.replace(/\r/g, '').split('\n');
      chunks.forEach((chunk, index) => {
        if (chunk) {
          let parent = lines[lines.length - 1];
          for (const ancestor of ancestors) {
            const clone = ancestor.cloneNode(false);
            parent.appendChild(clone);
            parent = clone;
          }
          parent.appendChild(document.createTextNode(chunk));
        }
        if (index < chunks.length - 1) lines.push(document.createElement('span'));
      });
    }

    function walk(node, ancestors = []) {
      if (node.nodeType === Node.TEXT_NODE) {
        appendText(node.textContent || '', ancestors);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const nextAncestors = [...ancestors, node];
      node.childNodes.forEach((child) => walk(child, nextAncestors));
    }

    source.childNodes.forEach((node) => walk(node));
    return lines.map((line) => line.innerHTML);
  }

  function setWrap(enabled) {
    contentEl.querySelector('.code-grid')?.classList.toggle('is-wrapped', enabled);
    wrapBtn.classList.toggle('is-active', enabled);
    wrapBtn.setAttribute('aria-pressed', String(enabled));
    localStorage.setItem(wrapKey, String(enabled));
  }

  function revealHash(hash, updateLocation = true) {
    contentEl.querySelectorAll('.code-line.is-target').forEach((line) => line.classList.remove('is-target'));
    const target = contentEl.querySelector(`#${CSS.escape(hash)}`);
    target?.classList.add('is-target');
    const currentPath = getCurrentPath();
    if (updateLocation && currentPath) updateFileLocation(currentPath, hash);
  }

  return {
    render(data) {
      clearOutline();
      const lines = highlightedLines(data.html);
      const language = escapeHtml(data.language || 'plaintext');
      const rows = lines.map((line, index) => {
        const number = index + 1;
        return `<div class="code-line" id="L${number}" data-line="${number}">
          <span class="line-number" data-line="${number}" aria-hidden="true">${number}</span>
          <code class="line-code hljs language-${language}">${line}</code>
        </div>`;
      }).join('');

      setContentMode('code');
      contentEl.innerHTML = `
        <div class="code-workbench">
          <div class="code-scroll" tabindex="0" aria-label="Read-only source code">
            <div class="code-grid">${rows}</div>
          </div>
          <footer class="editor-statusbar">
            <div class="status-group">
              <span>${escapeHtml(data.language || 'plaintext')}</span>
              <span>${Number(data.lineCount).toLocaleString()} lines</span>
              <span class="status-secondary">${escapeHtml(data.encoding || 'UTF-8')}</span>
            </div>
            <div class="status-group">
              <span class="status-secondary">${escapeHtml(data.readableSize)}</span>
              ${data.truncated ? '<span class="truncated-label">Truncated preview</span>' : ''}
              <span class="read-only-label">Read only</span>
            </div>
          </footer>
        </div>`;

      setWrap(localStorage.getItem(wrapKey) === 'true');
      if (data.truncated) showToast('Large file: showing a truncated source preview');
      contentEl.querySelector('.code-grid')?.addEventListener('click', (event) => {
        const link = event.target.closest('.line-number');
        if (!link) return;
        event.preventDefault();
        revealHash(`L${link.dataset.line}`);
      });
    },
    revealHash,
    toggleWrap() {
      setWrap(wrapBtn.getAttribute('aria-pressed') !== 'true');
    },
  };
});
