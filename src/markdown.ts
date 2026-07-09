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
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 64);
}

export function renderMarkdown(source: string, filePath: string): RenderResult {
  const dir = path.dirname(filePath);

  const renderer = new marked.Renderer();
  const originalImage = renderer.image;

  renderer.image = ({ href, title, text }) => {
    if (!href) return originalImage.call(renderer, { href, title, text });

    let resolved = href;
    if (!/^https?:\/\//i.test(href) && !href.startsWith('/api/file?path=')) {
      resolved = '/api/file?path=' + encodeURIComponent(path.join(dir, href));
    }

    return originalImage.call(renderer, { href: resolved, title, text });
  };

  renderer.heading = function ({ tokens, depth }) {
    const text = this.parser.parseInline(tokens);
    const plain = text.replace(/<[^>]+>/g, '');
    const id = slugify(plain);
    return `<h${depth} id="${id}">${text}</h${depth}>`;
  };

  const html = marked.parse(source, { renderer }) as string;
  const titleMatch = source.match(/^#\s+(.+)$/m);

  return {
    html,
    title: titleMatch?.[1].trim(),
  };
}
