import assert from 'node:assert/strict';

export async function assertNoHorizontalOverflow(page) {
  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    width: document.documentElement.scrollWidth,
    elements: [...document.querySelectorAll('body *')].filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.width && (rect.right > window.innerWidth + 1 || rect.left < -1);
    }).slice(0, 20).map(el => ({tag: el.tagName, id: el.id, class: el.className?.baseVal ?? el.className, right: el.getBoundingClientRect().right}))
  }));
  assert.ok(layout.width <= layout.viewport + 1, `Horizontal overflow: ${JSON.stringify(layout)}`);
}
