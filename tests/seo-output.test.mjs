import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("seo", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  return response.text();
}

test("homepage emits independently parseable top-level JSON-LD entities", async () => {
  const html = await render();
  const blocks = [...html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )];
  const entities = blocks.map((block) => JSON.parse(block[1]));

  assert.deepEqual(
    entities.map((entity) => entity["@type"]),
    ["Organization", "WebSite", "Service", "FAQPage"],
  );
  for (const entity of entities) {
    assert.equal(entity["@context"], "https://schema.org");
    assert.doesNotMatch(JSON.stringify(entity), /undefined/);
  }
});

test("initial HTML defers the visualizer and uses readable FAQ content", async () => {
  const html = await render();
  assert.doesNotMatch(html, /Upload Your Project Views/);
  assert.match(html, /Common project questions/);
  assert.match(html, /Do I need exact measurements to start\?/);
});

test("Vercel config caches the homepage and fingerprinted assets", async () => {
  const config = JSON.parse(
    await fs.readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  );
  const headers = new Map(config.headers.map((rule) => [rule.source, rule.headers]));
  assert.match(JSON.stringify(headers.get("/")), /s-maxage=3600/);
  assert.match(JSON.stringify(headers.get("/assets\/(.*)")), /max-age=31536000/);
});
