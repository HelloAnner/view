import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import path from 'node:path';
import type { RenderResult } from './types.ts';

marked.use(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    },
  })
);

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .substring(0, 64);
}

export function renderMarkdown(source: string, filePath: string): RenderResult {
  const dir = path.dirname(filePath);
  const usedIds = new Set<string>();

  const renderer = new marked.Renderer();
  const originalImage = renderer.image;
  const originalLink = renderer.link;

  renderer.image = (token) => {
    const { href } = token;
    if (!href) return originalImage.call(renderer, token);

    let resolved = href;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith('/api/file?path=')) {
      resolved = '/api/file?path=' + encodeURIComponent(path.join(dir, href));
    }

    return originalImage.call(renderer, { ...token, href: resolved });
  };

  renderer.link = (token) => {
    const { href } = token;
    if (
      !href
      || href.startsWith('#')
      || href.startsWith('/api/')
      || /^[a-z][a-z0-9+.-]*:/i.test(href)
    ) {
      return originalLink.call(renderer, token);
    }

    const hashIndex = href.indexOf('#');
    const filePart = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
    const hash = hashIndex >= 0 ? href.slice(hashIndex + 1) : '';
    const resolved = path.normalize(filePart.startsWith('/')
      ? filePart.slice(1)
      : path.join(dir, filePart));
    const localHref = `/?file=${encodeURIComponent(resolved)}${hash ? `#${encodeURIComponent(hash)}` : ''}`;
    return originalLink.call(renderer, { ...token, href: localHref });
  };

  renderer.heading = function ({ tokens, depth }) {
    const text = this.parser.parseInline(tokens);
    const plain = text.replace(/<[^>]+>/g, '');
    let id = slugify(plain) || 'heading';
    if (usedIds.has(id)) {
      let counter = 2;
      while (usedIds.has(`${id}-${counter}`)) counter++;
      id = `${id}-${counter}`;
    }
    usedIds.add(id);
    return `<h${depth} id="${id}">${text}</h${depth}>`;
  };

  const html = marked.parse(source, { renderer }) as string;
  const titleMatch = source.match(/^#\s+(.+)$/m);

  return {
    html,
    title: titleMatch?.[1].trim(),
  };
}
