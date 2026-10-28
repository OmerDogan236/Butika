// The JSON-LD blocks of a page, in document order. Read with Bun's HTML parser, not
// a page-wide regex, so that only a real script element's own type attribute counts:
// data-type=..., a type= written inside another attribute's value, a commented-out
// block and a <template> body are not this page's data. HTML allows an attribute
// value without quotes, and minified storefronts (jimmykey.com) write
// <script type=application/ld+json>. The body is kept exactly as served, because a
// script's content is raw text: entities and escapes there are part of the JSON.
// A block's data as the page wrote it, or undefined when it is not valid JSON.
export function parseJsonLd(block: string): unknown {
  try {
    return JSON.parse(block);
  } catch {
    return undefined;
  }
}

// Some storefronts (newinshop.co) leave raw newlines inside a JSON string, which
// makes the block invalid. Escaping those control characters is a repair the parser
// still verifies: nothing outside a string is touched, and a block broken in any
// other way (an unescaped quote, several documents in one block) stays unreadable.
// Only a block that needed the repair is returned here, because data we had to
// mend is trusted separately: it carries no weight of its own and is used only
// where identity, dates, conditions, currency and amount are all checked.
export function parseRepairedJsonLd(block: string): unknown {
  if (parseJsonLd(block) !== undefined) return undefined;
  try {
    return JSON.parse(escapeControlCharacters(block));
  } catch {
    return undefined;
  }
}

function escapeControlCharacters(block: string): string {
  const named: Record<string, string> = { '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f' };
  let out = '', inString = false, escaped = false;
  for (const char of block) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      else if (char < ' ') {
        out += named[char] ?? `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
        continue;
      }
    } else if (char === '"') inString = true;
    out += char;
  }
  return out;
}

// The parser hands an attribute back as the page wrote it, character references
// and all: lutvelizade.com.tr writes type="application/ld&#x2B;json", which a
// browser reads as application/ld+json. The type is therefore decoded first and
// matched after. Only numeric references are decoded — the form encoders emit —
// and, as HTML does in an attribute, with or without the closing ";". It is one
// pass: "&#x26;#x2B;" becomes the text "&#x2B;", which is not decoded again and is
// not the JSON-LD type. A named reference is left as written, so "&amp;#x2B;"
// stays "&amp;#x2B;": such a reference can only miss a block, never make one.
function attributeValue(raw: string): string {
  return raw.replace(/&#(?:(\d+)|[xX]([0-9a-fA-F]+));?/g, (_, decimal: string | undefined, hex: string | undefined) => {
    const code = decimal === undefined ? Number.parseInt(hex!, 16) : Number(decimal);
    // HTML reads NUL, a surrogate and anything beyond Unicode as U+FFFD.
    return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? '\uFFFD' : String.fromCodePoint(code);
  });
}

export function jsonLdBlocks(html: string): string[] {
  const blocks: string[] = [];
  let templateDepth = 0;
  let capture: { parts: string[] } | null = null;
  new HTMLRewriter().on('template', { element(el) { templateDepth++; el.onEndTag(() => { templateDepth--; }); } })
    .on('script', {
      element(el) {
        // A media type may carry parameters: "application/ld+json; charset=utf-8".
        const type = attributeValue(el.getAttribute('type') ?? '').split(';')[0]?.trim().toLowerCase();
        if (templateDepth || type !== 'application/ld+json' || !el.canHaveContent) return;
        const current = { parts: [] as string[] };
        capture = current;
        el.onEndTag(() => {
          blocks.push(current.parts.join(''));
          if (capture === current) capture = null;
        });
      },
      text(chunk) { capture?.parts.push(chunk.text); },
    })
    .transform(html);
  return blocks;
}
