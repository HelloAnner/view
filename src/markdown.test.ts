import { describe, expect, test } from 'bun:test';
import { renderMarkdown } from './markdown.ts';

describe('Markdown links', () => {
  test('routes relative file links through the local viewer', () => {
    const result = renderMarkdown('[Guide](../guide.md#start)', 'docs/README.md');
    expect(result.html).toContain('/?file=guide.md#start');
  });

  test('leaves external and same-document links intact', () => {
    const result = renderMarkdown('[Web](https://example.com) [Section](#usage)', 'README.md');
    expect(result.html).toContain('href="https://example.com"');
    expect(result.html).toContain('href="#usage"');
  });
});
