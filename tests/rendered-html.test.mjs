import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(await response.text(), developmentPreviewMeta);
});

test("renders only the approved customer-facing louvered product names", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("labels", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
  const html = await response.text();
  assert.doesNotMatch(html, /Bioclimatic/);
  assert.match(html, /Louvered Pergola — Double Retracting/);
  assert.match(html, /Louvered Pergola — Retracting Roof/);
  assert.match(html, /Louvered Pergola — Tilting Louvers/);
  assert.match(html, /Wintent Window Awning/);
  assert.match(html, /\/projects\/elevated-wintent\.png/);
  assert.match(html, /\/media\/nest-wintent-showcase\.mp4/);
  assert.match(html, /Guillotine Glass/);
  assert.match(html, /Solidroll/);
  assert.match(html, /elevated-solidroll\.jpg/);
  assert.doesNotMatch(html, /02 · Integrated lighting/i);
});
