window.viewProviderRegistry.register('markdown', (dependencies) => {
  const { buildOutline, contentEl, setContentMode } = dependencies;

  function sanitizeHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    const blockedTags = new Set([
      'script', 'style', 'iframe', 'object', 'embed', 'meta', 'link', 'base',
      'form', 'textarea', 'select', 'option', 'button', 'svg', 'math',
    ]);

    for (const element of [...template.content.querySelectorAll('*')]) {
      const tag = element.tagName.toLowerCase();
      if (blockedTags.has(tag)) {
        element.remove();
        continue;
      }
      if (tag === 'input' && !(element.type === 'checkbox' && element.disabled)) {
        element.remove();
        continue;
      }

      for (const attribute of [...element.attributes]) {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim();
        if (name.startsWith('on') || ['style', 'srcdoc', 'formaction'].includes(name)) {
          element.removeAttribute(attribute.name);
          continue;
        }
        if (['href', 'src', 'xlink:href'].includes(name)) {
          const safeDataImage = name === 'src' && /^data:image\/(png|gif|jpeg|webp|avif);/i.test(value);
          const unsafeScheme = /^(javascript|vbscript|data):/i.test(value);
          if (unsafeScheme && !safeDataImage) element.removeAttribute(attribute.name);
        }
      }

      if (tag === 'a') {
        const href = element.getAttribute('href') || '';
        if (/^https?:\/\//i.test(href)) {
          element.setAttribute('target', '_blank');
          element.setAttribute('rel', 'noopener noreferrer');
        }
      }
    }
    return template.innerHTML;
  }

  return {
    render(data) {
      setContentMode('document');
      contentEl.innerHTML = `<article class="markdown-body">${sanitizeHtml(data.html)}</article>`;
      contentEl.querySelectorAll('.markdown-body table').forEach((table) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'markdown-table-scroll';
        table.before(wrapper);
        wrapper.appendChild(table);
      });
      buildOutline();
    },
  };
});
