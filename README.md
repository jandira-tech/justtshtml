# justtshtml

Dependency-free **TypeScript** HTML5 parser (browser + Node.js + Bun). TypeScript port of [justjshtml](https://github.com/simonw/justjshtml) by Simon Willison, itself a JavaScript port of the Python [JustHTML](https://github.com/EmilStenstrom/justhtml) by Emil Stenström.

Primary goal: pass the full [html5lib-tests](https://github.com/html5lib/html5lib-tests) suite (tokenizer, tree-construction, encoding, serializer fixtures) using only plain TypeScript — no runtime dependencies.

## Status

- No runtime dependencies
- Works in modern browsers (built ESM), Node.js (ESM) and Bun
- html5lib-tests:
  - Tokenizer: passing
  - Tree construction: passing (skips `#script-on` fixtures; no JS execution)
  - Encoding: passing (skips the `encoding/scripted` fixture that requires JS execution)
  - Serializer fixtures: passing

## Install

```bash
bun add justtshtml
# or
npm install justtshtml
```

## Quickstart

```ts
import { JustHTML, stream } from "justtshtml";

const doc = new JustHTML("<p class='intro'>Hello <b>world</b></p>");

console.log(doc.toText()); // "Hello world"
console.log(doc.query("p.intro")[0].to_html()); // pretty-printed HTML for the matching node

for (const [event, data] of stream("<div>Hi</div>")) {
  console.log(event, data);
}
```

## API overview

### `new JustHTML(input, options?)`

```ts
import { JustHTML } from "justtshtml";

const doc = new JustHTML("<p>Hello</p>");
console.log(doc.root.name); // "#document"
```

Input can be:

- `string`
- `Uint8Array` / `ArrayBuffer` (bytes are decoded using HTML encoding sniffing; `options.encoding` can override transport encoding)

Useful options (see `src/justhtml.ts`):

- `strict: boolean` – throws `StrictModeError` on the first collected parse error
- `collectErrors: boolean` – populate `doc.errors`
- `encoding: string | null` – transport override for byte input
- `fragmentContext: FragmentContext | null` – fragment parsing context
- `iframeSrcdoc: boolean` – test directive support
- `tokenizerOpts: object | null` – advanced options (primarily for tests/debugging)

### Nodes

Nodes are simple plain objects with a small DOM-like API:

- Properties: `name`, `attrs`, `children`, `parent`, `data`, `namespace`
- Template support: `templateContent` for `<template>` in the HTML namespace
- Methods:
  - `node.query(selector)`
  - `node.toText({ separator, strip })`
  - `node.toHTML({ indent, indentSize, pretty })` / `node.to_html(...)`
  - `node.toMarkdown()` / `node.to_markdown()`

### CSS selectors

```ts
import { JustHTML } from "justtshtml";

const doc = new JustHTML("<ul><li>One</li><li>Two</li></ul>");
console.log(doc.query("li:first-child")[0].toText()); // "One"
```

Standalone helpers:

```ts
import { matches, query } from "justtshtml";

const nodes = query(doc.root, "li");
console.log(matches(nodes[0], "li:first-child"));
```

### Streaming

`stream(html)` yields a simplified event stream from the tokenizer:

```ts
import { stream } from "justtshtml";

for (const [event, data] of stream("<div>Hello</div>")) {
  console.log(event, data);
}
```

Events:

- `["start", [tagName, attrs]]`
- `["end", tagName]`
- `["text", text]` (coalesced)
- `["comment", text]`
- `["doctype", [name, publicId, systemId]]`

## Development

This project uses [vite-plus](https://viteplus.dev) for build/test/lint and [Bun](https://bun.sh) to run the html5lib conformance scripts.

```bash
bun install
bun run test            # vp test (vitest-style unit tests under tests/)
bun run build           # vp pack
```

## Running the html5lib-tests conformance suite locally

Check out the fixtures into the repo root:

```bash
git clone https://github.com/html5lib/html5lib-tests
```

Then:

```bash
bun run test:html5lib   # runs all of the scripts below in order
```

Or individually:

```bash
bun run test:smoke
bun run test:selector
bun run test:stream
bun run test:markdown
bun run test:encoding
bun run test:tokenizer
bun run test:tree
bun run test:serializer
```

To point at an existing checkout elsewhere:

```bash
HTML5LIB_TESTS_DIR=/path/to/html5lib-tests bun run test:tokenizer
```

## Attribution / Acknowledgements

- **JustHTML** (Python) by Emil Stenström — the original library `justtshtml` is descended from.
- **justjshtml** (JavaScript) by Simon Willison — the direct upstream of this TypeScript port.
- **html5lib-tests** by the html5lib project — used as the primary conformance test suite.
- **html5ever** by the Servo project — JustHTML started as a Python port of html5ever, and that architecture heavily influenced this port as well.
