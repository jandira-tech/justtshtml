import { expect, test } from "vite-plus/test";

import { JustHTML, stream } from "../src/index.js";

test("JustHTML parses a basic document", () => {
  const html = "<html><head></head><body><p>Hello</p></body></html>";
  const doc = new JustHTML(html);

  expect(doc.errors.length).toBe(0);
  expect(doc.toText()).toBe("Hello");

  expect(doc.root.name).toBe("#document");
  expect(doc.root.children.length).toBe(1);

  const htmlNode = doc.root.children[0];
  expect(htmlNode.name).toBe("html");
  expect(htmlNode.parent).toBe(doc.root);
  expect(htmlNode.children.length).toBe(2);

  const [head, body] = htmlNode.children;
  expect(head.name).toBe("head");
  expect(body.name).toBe("body");

  const p = body.children[0];
  expect(p.name).toBe("p");
  expect(p.children[0].name).toBe("#text");
  expect(p.children[0].data).toBe("Hello");
});

test("stream emits a coalesced event sequence", () => {
  const events = Array.from(stream("<div class=\"c\">Hi <b>there</b></div>"));
  expect(events).toEqual([
    ["start", ["div", { class: "c" }]],
    ["text", "Hi "],
    ["start", ["b", {}]],
    ["text", "there"],
    ["end", "b"],
    ["end", "div"],
  ]);
});
