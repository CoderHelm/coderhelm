import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdownProse, rawSyntax, visibleText } from './lib/raw-syntax.mjs';

const rules = (text) => rawSyntax(text).map((f) => f.rule);

test('an MDX comment printed on a page is caught', () => {
  const html = '<html><body><h1>Backups</h1><p>{/* Imported from x at abc. Edit it there. */}</p></body></html>';
  assert.deepEqual(rules(visibleText(html)), ['mdx-comment']);
});

test('a component printed as text is caught, escaped or not', () => {
  assert.deepEqual(rules(visibleText('<body><p>&lt;Callout type="warn"&gt;Careful&lt;/Callout&gt;</p></body>')), ['jsx-tag']);
  assert.deepEqual(rules(visibleText('<body><p>&#x3C;Steps></p></body>')), ['jsx-tag']);
});

test('escaped braces, admonition markers and double-escaped entities are caught', () => {
  assert.deepEqual(rules(visibleText('<body><p>Set \\{name\\}</p></body>')), ['escaped-brace']);
  assert.deepEqual(rules(visibleText('<body><p>:::warning Do not</p></body>')), ['admonition']);
  assert.deepEqual(rules(visibleText('<body><blockquote>[!NOTE] Read this</blockquote></body>')), ['admonition']);
  assert.deepEqual(rules(visibleText('<body><p>a &amp;amp; b</p></body>')), ['html-entity']);
});

test('syntax inside code, scripts and styles is not visible text', () => {
  const html = '<body><pre><code>{/* fine */} &lt;Callout&gt;</code></pre><p>Use <code>&lt;Tabs&gt;</code> here &amp; there.</p><script>self.__next_f.push("{/*")</script><style>a::after{content:"*/}"}</style></body>';
  assert.deepEqual(rules(visibleText(html)), []);
});

test('Markdown twins are checked outside fenced and inline code', () => {
  const md = '# A\n\nUse `{/* x */}` like this:\n\n```mdx\n<Callout>hi</Callout>\n```\n\nDone.\n';
  assert.deepEqual(rules(markdownProse(md)), []);
  assert.deepEqual(rules(markdownProse('# A\n\n{/* Imported from x. */}\n\nBody.\n')), ['mdx-comment']);
});
