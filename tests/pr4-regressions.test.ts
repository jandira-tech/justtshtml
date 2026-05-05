import { describe, expect, test } from "vite-plus/test";

import { QUIRKY_PUBLIC_PREFIXES } from "../src/constants.js";
import { FragmentContext } from "../src/context.js";
import { serializeSerializerTokenStream } from "../src/html5lib_serializer.js";
import { Node } from "../src/node.js";
import { parseDocument } from "../src/parser.js";
import { SelectorError, query } from "../src/selector.js";
import { stream } from "../src/stream.js";
import { Tokenizer, TokenizerOpts } from "../src/tokenizer.js";

function findFirst(node: any, name: string): any {
  if (node.name === name) return node;
  for (const child of node.children || []) {
    const found = findFirst(child, name);
    if (found) return found;
  }
  const templateContent = node.templateContent ?? node.template_content;
  if (templateContent) return findFirst(templateContent, name);
  return null;
}

function errorCodes(errors: any[]) {
  return errors.map((error) => error?.code ?? error);
}

describe("PR #4 justjshtml remediation regressions", () => {
  test("quirky public doctype prefixes are unique", () => {
    expect(new Set(QUIRKY_PUBLIC_PREFIXES).size).toBe(QUIRKY_PUBLIC_PREFIXES.length);
  });

  test("injecting a meta charset keeps the full token stream", () => {
    const tokens = [
      ["StartTag", null, "html", {}],
      ["StartTag", null, "head", {}],
      ["EndTag", null, "head"],
      ["StartTag", null, "body", { id: "main" }],
      ["Characters", "roundtrip body"],
      ["EndTag", null, "body"],
      ["EndTag", null, "html"],
    ];

    const html = serializeSerializerTokenStream(tokens, {
      inject_meta_charset: true,
      encoding: "utf-8",
    });

    expect(html).toContain("<meta charset=utf-8>");
    expect(html).toContain("<body id=main>roundtrip body");
    expect(html.match(/<meta charset=utf-8>/g)).toHaveLength(1);
  });

  test("inject_meta_charset without an encoding serializes the original tokens", () => {
    const tokens = [
      ["StartTag", null, "html", {}],
      ["StartTag", null, "body", {}],
      ["Characters", "body"],
      ["EndTag", null, "body"],
      ["EndTag", null, "html"],
    ];

    expect(serializeSerializerTokenStream(tokens, { inject_meta_charset: true })).toBe("body");
  });

  test("node insertion adopts nodes and preserves single-parent invariants", () => {
    const firstParent = new Node("div");
    const secondParent = new Node("section");
    const child = new Node("span");
    const reference = new Node("em");

    firstParent.appendChild(child);
    secondParent.appendChild(reference);
    secondParent.insertBefore(child, reference);

    expect(firstParent.children).toEqual([]);
    expect(secondParent.children).toEqual([child, reference]);
    expect(child.parent).toBe(secondParent);

    secondParent.appendChild(child);
    expect(secondParent.children).toEqual([reference, child]);

    const replacementParent = new Node("article");
    const replacement = new Node("strong");
    replacementParent.appendChild(replacement);
    const removed = secondParent.replaceChild(replacement, child);

    expect(removed).toBe(child);
    expect(child.parent).toBeNull();
    expect(replacementParent.children).toEqual([]);
    expect(secondParent.children).toEqual([reference, replacement]);
    expect(replacement.parent).toBe(secondParent);
  });

  test("fragment tokenizer overrides match HTML raw-text states without mutating caller options", () => {
    const callerOpts = new TokenizerOpts();

    const title = parseDocument("a &amp; b", {
      fragmentContext: new FragmentContext("title", "html"),
      tokenizerOpts: callerOpts,
    });
    const script = parseDocument("if (a < b) c()", {
      fragmentContext: new FragmentContext("script", "html"),
    });
    const plaintext = parseDocument("a <b> c", {
      fragmentContext: new FragmentContext("plaintext", "html"),
    });

    expect(callerOpts.initialState).toBeNull();
    expect(callerOpts.initialRawtextTag).toBeNull();
    expect(title.tokenizer.opts).not.toBe(callerOpts);
    expect(title.tokenizer.opts.initialState).toBe(Tokenizer.RCDATA);
    expect(title.tokenizer.opts.initialRawtextTag).toBe("title");
    expect(script.tokenizer.opts.initialState).toBe(Tokenizer.PLAINTEXT);
    expect(script.tokenizer.opts.initialRawtextTag).toBeNull();
    expect(plaintext.tokenizer.opts.initialState).toBe(Tokenizer.PLAINTEXT);
    expect(plaintext.tokenizer.opts.initialRawtextTag).toBeNull();
  });

  test("stream tracks foreign open elements before raw-text decisions", () => {
    expect([...stream("<svg><script><b></script></svg>")]).toEqual([
      ["start", ["svg", {}]],
      ["start", ["script", {}]],
      ["start", ["b", {}]],
      ["end", "script"],
      ["end", "svg"],
    ]);
  });

  test("selector parser rejects empty selector items after commas", () => {
    const { root } = parseDocument("<div></div><span></span>");

    expect(() => query(root, "div,")).toThrow(SelectorError);
    expect(() => query(root, "div,,span")).toThrow(SelectorError);
  });

  test("collectErrors returns tokenizer parse errors", () => {
    const { errors } = parseDocument("<div a a></div>", { collectErrors: true });

    expect(errorCodes(errors)).toContain("duplicate-attribute");
  });

  test("whitespace before an attribute equals sign preserves the attribute value", () => {
    const { root } = parseDocument('<div foo = "bar"></div>');
    const div = findFirst(root, "div");

    expect(div.attrs).toEqual({ foo: "bar" });
  });

  test("doctype PUBLIC and SYSTEM keywords can follow multiple spaces", () => {
    const { root, errors } = parseDocument('<!DOCTYPE html  PUBLIC "pub" "sys"><p>x</p>', {
      collectErrors: true,
    });
    const doctype = findFirst(root, "!doctype");

    expect(doctype.data.name).toBe("html");
    expect(doctype.data.publicId).toBe("pub");
    expect(doctype.data.systemId).toBe("sys");
    expect(doctype.data.forceQuirks).toBe(false);
    expect(errorCodes(errors)).not.toContain("missing-whitespace-after-doctype-name");
  });

  test("script escaped less-than fallback does not duplicate the less-than sign", () => {
    const { root } = parseDocument("<script><!--</x</script>");
    const script = findFirst(root, "script");

    expect(script.toText({ separator: "", strip: false })).toBe("<!--</x");
  });
});
