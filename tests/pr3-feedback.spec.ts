import { describe, expect, it } from "vite-plus/test";

import { serializeSerializerTokenStream } from "../src/html5lib_serializer.js";
import { JustHTML, StrictModeError } from "../src/justhtml.js";
import { toMarkdown } from "../src/markdown.js";
import { Node } from "../src/node.js";
import { matches } from "../src/selector.js";
import { toHTML } from "../src/serialize.js";

describe("PR #3 parser feedback regressions", () => {
  it("collects tokenizer parse errors instead of dropping _emitError calls", () => {
    const doc = new JustHTML('<!doctype html><p a="1" a="2">x</p>', {
      collectErrors: true,
    });

    expect(doc.errors.map((error) => error.code)).toContain("duplicate-attribute");
  });

  it("throws collected tokenizer errors in strict mode", () => {
    expect(() => new JustHTML('<!doctype html><p a="1" a="2">x</p>', { strict: true })).toThrow(
      StrictModeError,
    );
  });

  it("injects meta charset without dropping tokens around head content", () => {
    const html = serializeSerializerTokenStream(
      [
        ["Doctype", "html"],
        ["StartTag", null, "html", {}],
        ["StartTag", null, "head", {}],
        ["StartTag", null, "title", {}],
        ["Characters", "Title"],
        ["EndTag", null, "title"],
        ["EndTag", null, "head"],
        ["StartTag", null, "body", {}],
        ["StartTag", null, "p", {}],
        ["Characters", "Body"],
        ["EndTag", null, "p"],
        ["EndTag", null, "body"],
        ["EndTag", null, "html"],
      ],
      { encoding: "utf-8", inject_meta_charset: true, quote_attr_values: true },
    );

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain("<title>Title</title>");
    expect(html).toContain("<p>Body");
  });

  it("updates existing meta charset while preserving the full token stream", () => {
    const html = serializeSerializerTokenStream(
      [
        ["StartTag", null, "html", {}],
        ["StartTag", null, "head", {}],
        ["EmptyTag", "meta", { charset: "windows-1252" }],
        ["EndTag", null, "head"],
        ["StartTag", null, "body", {}],
        ["Characters", "After head"],
        ["EndTag", null, "body"],
        ["EndTag", null, "html"],
      ],
      { encoding: "utf-8", inject_meta_charset: true, quote_attr_values: true },
    );

    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain("After head");
    expect(html).not.toContain("windows-1252");
  });

  it("preserves leading doctype order when injecting charset without a head token", () => {
    const html = serializeSerializerTokenStream(
      [
        ["Doctype", "html"],
        ["StartTag", null, "html", {}],
        ["StartTag", null, "body", {}],
        ["Characters", "Only body"],
        ["EndTag", null, "body"],
        ["EndTag", null, "html"],
      ],
      { encoding: "utf-8", inject_meta_charset: true, quote_attr_values: true },
    );

    expect(html).toMatch(/^<!DOCTYPE html><meta charset="utf-8">/);
    expect(html).toContain("Only body");
  });

  it("keeps empty attributes quoted in toHTML and when html5lib minimization is disabled", () => {
    const node = new Node("div", { attrs: { class: "" } });

    expect(toHTML(node, { pretty: false })).toBe('<div class=""></div>');
    expect(
      serializeSerializerTokenStream([["EmptyTag", "div", { class: "" }]], {
        quote_attr_values: false,
        minimize_boolean_attributes: false,
      }),
    ).toBe('<div class="">');
    expect(
      serializeSerializerTokenStream([["EmptyTag", "div", { class: "" }]], {
        quote_attr_values: false,
      }),
    ).toBe("<div class>");
  });

  it("moves nodes when appendChild or insertBefore adopts an existing child", () => {
    const firstParent = new Node("div");
    const secondParent = new Node("section");
    const child = new Node("span");
    const reference = new Node("p");

    firstParent.appendChild(child);
    secondParent.appendChild(reference);
    secondParent.insertBefore(child, reference);

    expect(firstParent.children).toEqual([]);
    expect(secondParent.children).toEqual([child, reference]);
    expect(child.parent).toBe(secondParent);

    secondParent.insertBefore(child, reference);
    expect(secondParent.children).toEqual([child, reference]);
  });

  it("rejects empty selector fragments and empty pseudo arguments", () => {
    const node = new Node("div");

    expect(() => matches(node, "div,")).toThrow("Empty selector");
    expect(() => matches(node, ":not()")).toThrow("Empty pseudo-class argument");
  });

  it("keeps paragraph content inside list items when rendering Markdown", () => {
    const doc = new JustHTML("<!doctype html><ul><li><p>alpha</p><p>beta</p></li></ul>");

    expect(toMarkdown(doc.root)).toBe("- alpha\n\n  beta");
  });

  it("uses a longer fenced code block delimiter than code content contains", () => {
    const doc = new JustHTML("<!doctype html><pre>```inside```</pre>");

    expect(toMarkdown(doc.root)).toBe("````\n```inside```\n````");
  });

  it("rejects appendChild self-insertion to avoid cyclic trees", () => {
    const node = new Node("div");

    expect(() => node.appendChild(node)).toThrow(/itself or one of its descendants/);
  });

  it("rejects appendChild ancestor-insertion to avoid cyclic trees", () => {
    const grandparent = new Node("section");
    const parent = new Node("div");
    const child = new Node("span");

    grandparent.appendChild(parent);
    parent.appendChild(child);

    expect(() => child.appendChild(grandparent)).toThrow(/itself or one of its descendants/);
    expect(() => child.appendChild(parent)).toThrow(/itself or one of its descendants/);
  });

  it("rejects insertBefore self-insertion to avoid cyclic trees", () => {
    const parent = new Node("div");
    const reference = new Node("p");

    parent.appendChild(reference);

    expect(() => parent.insertBefore(parent, reference)).toThrow(
      /itself or one of its descendants/,
    );
  });

  it("rejects replaceChild with self/ancestor as new node", () => {
    const grandparent = new Node("section");
    const parent = new Node("div");
    const oldChild = new Node("span");

    grandparent.appendChild(parent);
    parent.appendChild(oldChild);

    expect(() => parent.replaceChild(parent, oldChild)).toThrow(/itself or one of its descendants/);
    expect(() => parent.replaceChild(grandparent, oldChild)).toThrow(
      /itself or one of its descendants/,
    );
  });
});
