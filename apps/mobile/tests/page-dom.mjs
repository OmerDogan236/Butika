// A page as a small DOM, built with Bun's HTML parser, so that the capture script
// runs against markup instead of hand-made answers. It offers only what the
// script uses: querySelectorAll/querySelector/closest with one compound selector (a
// tag, #id, .classes, [attr] and [attr="value"]), getAttribute, textContent and
// classList. Unlike a browser, <template> content is part of the tree here.
// Attribute values and text are kept as written, entities included.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

function compound(selector) {
  const match = /^([a-z][a-z0-9-]*)?(?:#([\w-]+))?((?:\.[\w-]+)*)((?:\[[\w-]+(?:="[^"]*")?\])*)$/i.exec(selector.trim());
  if (!match) throw new Error(`Unsupported selector in test DOM: ${selector}`);
  const classes = match[3] ? match[3].slice(1).split('.') : [];
  const attributes = [...(match[4] ?? '').matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].map(m => [m[1], m[2]]);
  if (match[2]) attributes.push(['id', match[2]]);
  return node => (!match[1] || node.tagName === match[1].toLowerCase()) &&
    classes.every(c => (node.attributes.class ?? '').split(/\s+/).includes(c)) &&
    attributes.every(([name, value]) => name in node.attributes && (value === undefined || node.attributes[name] === value));
}

function descendants(node) {
  return node.children.flatMap(child => [child, ...descendants(child)]);
}

function text(node) {
  return node.parts.map(part => typeof part === 'string' ? part : text(part)).join('');
}

function wrap(node) {
  return {
    getAttribute: name => (name in node.attributes ? node.attributes[name] : null),
    get textContent() { return text(node); },
    get classList() { return { contains: c => (node.attributes.class ?? '').split(/\s+/).includes(c) }; },
    querySelectorAll: selector => descendants(node).filter(compound(selector)).map(wrap),
    querySelector: selector => { const found = descendants(node).find(compound(selector)); return found ? wrap(found) : null; },
    // The element itself or its nearest ancestor matching the selector, as in a browser.
    closest: selector => {
      const matches = compound(selector);
      for (let at = node; at && at.tagName !== '#document'; at = at.parent) if (matches(at)) return wrap(at);
      return null;
    },
  };
}

export function pageDocument(html) {
  const root = { tagName: '#document', attributes: {}, children: [], parts: [] };
  const stack = [root];
  new HTMLRewriter().on('*', {
    element(el) {
      const parent = stack.at(-1);
      const node = { tagName: el.tagName.toLowerCase(), attributes: Object.fromEntries([...el.attributes]), children: [], parts: [], parent };
      parent.children.push(node);
      parent.parts.push(node);
      if (!el.canHaveContent || VOID.has(node.tagName)) return;
      stack.push(node);
      el.onEndTag(() => { const at = stack.lastIndexOf(node); if (at > 0) stack.length = at; });
    },
  }).onDocument({ text(chunk) { stack.at(-1).parts.push(chunk.text); } }).transform(html);
  const document = wrap(root);
  const body = descendants(root).find(node => node.tagName === 'body');
  return Object.assign(document, { body: body ? wrap(body) : null });
}
