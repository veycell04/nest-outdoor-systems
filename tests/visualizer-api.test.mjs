import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});
let visualize, consultation;

before(async () => {
  ({ POST: visualize } = await vite.ssrLoadModule(
    "/app/api/visualize/route.ts",
  ));
  ({ POST: consultation } = await vite.ssrLoadModule(
    "/app/api/consultation/route.ts",
  ));
});
after(async () => vite.close());

function png(width, height, colorType = 6) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[25] = colorType;
  return bytes;
}

test("rejects generation cleanly when the server credential is absent", async () => {
  const old = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const response = await visualize(
    new Request("http://localhost/api/visualize", {
      method: "POST",
      body: new FormData(),
    }),
  );
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /not configured/i);
  if (old) process.env.OPENAI_API_KEY = old;
});

test("generation limits default by environment and support a bounded override", async () => {
  const { generationLimit } = await vite.ssrLoadModule(
    "/app/api/visualize/route.ts",
  );
  assert.equal(generationLimit({ VERCEL_ENV: "production" }), 3);
  assert.equal(generationLimit({ VERCEL_ENV: "preview" }), 20);
  assert.equal(generationLimit({ VERCEL_ENV: "development" }), 20);
  assert.equal(
    generationLimit({
      VERCEL_ENV: "production",
      VISUALIZER_GENERATION_LIMIT: "17",
    }),
    17,
  );
  assert.equal(
    generationLimit({
      VERCEL_ENV: "preview",
      VISUALIZER_GENERATION_LIMIT: "0",
    }),
    20,
  );
});

test("rate-limit transfer logs include request ID and current count", async () => {
  const { logTransfer } = await vite.ssrLoadModule(
      "/lib/visualizer-storage.ts",
    ),
    lines = [],
    original = console.info;
  console.info = (line) => lines.push(line);
  try {
    logTransfer({
      requestId: "rate-limit-test",
      stage: "rate_limited",
      productId: "awning",
      generationCount: 20,
      generationLimit: 20,
    });
  } finally {
    console.info = original;
  }
  const event = JSON.parse(lines[0]);
  assert.equal(event.requestId, "rate-limit-test");
  assert.equal(event.generationCount, 20);
  assert.equal(event.generationLimit, 20);
});

test("does not claim consultation delivery without provider setup", async () => {
  const old = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  const body = new FormData();
  body.append("name", "Test Customer");
  body.append("email", "customer@example.com");
  body.append("productId", "awning");
  const response = await consultation(
    new Request("http://localhost/api/consultation", { method: "POST", body }),
  );
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /not configured/i);
  if (old) process.env.RESEND_API_KEY = old;
});

test("visualizer source includes download and consultation handoff actions", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(
      new URL("../app/project-visualizer.tsx", import.meta.url),
      "utf8",
    ),
  );
  assert.match(source, /\.download\s*=\s*`nest-/);
  assert.match(source, /onRequestProject\(\{/);
  assert.match(source, /Request consultation/);
  assert.doesNotMatch(source, /setMeasurements\(\{\}\).*setResult\(null\)/);
  assert.doesNotMatch(source, /setGenerating\(true\);setResult\(null\)/);
  assert.match(source, /Provided measurements —/);
});

test("large phone uploads are normalized and measured before generation", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(
      new URL("../app/project-visualizer.tsx", import.meta.url),
      "utf8",
    ),
  );
  assert.match(source, /1536\s*\/\s*Math\.max/);
  assert.match(source, /quality\s*=\s*0\.82/);
  assert.match(source, /2\s*\*\s*1024\s*\*\s*1024/);
  assert.match(source, /imageOrientation:\s*"from-image"/);
  assert.match(source, /new Response\(diagnostic\)\.arrayBuffer/);
  assert.match(source, /3\.8\s*\*\s*1024\s*\*\s*1024/);
  assert.match(
    source,
    /This photo is too large to process\. Please choose another photo\./,
  );
  assert.doesNotMatch(source, /upload\([^,]+,\s*file,/);
  assert.match(source, /photo\.normalized/);
  const form = new FormData();
  form.append(
    "photo",
    new Blob([new Uint8Array(2 * 1024 * 1024)], { type: "image/jpeg" }),
    "project.jpg",
  );
  form.append(
    "mask",
    new Blob([new Uint8Array(220 * 1024)], { type: "image/png" }),
    "mask.png",
  );
  form.append("productId", "awning");
  form.append(
    "specs",
    JSON.stringify({ measurements: { width: "12", depth: "9" }, unit: "ft" }),
  );
  assert.ok(
    (await new Response(form).arrayBuffer()).byteLength < 3.8 * 1024 * 1024,
  );
});

test("one visualizer flow removes manual painting and embeds synchronized 3D controls", async () => {
  const fs = await import("node:fs/promises"),
    source = await fs.readFile(
      new URL("../app/project-visualizer.tsx", import.meta.url),
      "utf8",
    ),
    page = await fs.readFile(
      new URL("../app/page.tsx", import.meta.url),
      "utf8",
    );
  assert.doesNotMatch(
    source,
    /brush-size|Erase mask|Reset mask|Paint the installation/i,
  );
  assert.match(source, /Customize in 3D/);
  assert.match(source, /<PergolaViewer/);
  assert.match(source, /Generate My Concept/);
  assert.match(source, /Create Higher-Quality Version/);
  assert.match(source, /90_000/);
  assert.doesNotMatch(page, /<PergolaViewer/);
  assert.doesNotMatch(page, /id="estimate"/);
});

test("uploaded photos and canvas composition use centered contain geometry", async () => {
  const fs = await import("node:fs/promises"),
    [{ containRect }, source, css, legacy] = await Promise.all([
      vite.ssrLoadModule("/app/project-visualizer.tsx"),
      fs.readFile(
        new URL("../app/project-visualizer.tsx", import.meta.url),
        "utf8",
      ),
      fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
      fs.readFile(
        new URL(
          "../nest-outdoor-systems-visualizer-source/app/project-visualizer.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);
  assert.deepEqual(containRect(1000, 500, 400, 400), {
    x: 250,
    y: 0,
    width: 500,
    height: 500,
  });
  assert.deepEqual(containRect(500, 1000, 1000, 500), {
    x: 0,
    y: 375,
    width: 500,
    height: 250,
  });
  assert.equal(containRect(0, 500, 400, 400), null);
  assert.match(source, /function drawContain/);
  assert.doesNotMatch(source, /drawCover/);
  assert.match(source, /new ResizeObserver\(recalculateDisplayBounds\)/);
  assert.match(source, /orientationchange/);
  assert.match(
    source,
    /context\.clearRect\([\s\S]{0,260}area\.height \* bounds\.height/,
  );
  assert.match(
    css,
    /\.prepared-photo[\s\S]{0,180}object-fit:\s*contain;[\s\S]{0,100}object-position:\s*center;/,
  );
  assert.match(legacy, /function drawContain/);
  assert.doesNotMatch(legacy, /drawCover/);
});

test("result UI keeps the upload as Original and never renders catalog references", async () => {
  const fs = await import("node:fs/promises"),
    client = await fs.readFile(
      new URL("../app/project-visualizer.tsx", import.meta.url),
      "utf8",
    ),
    route = await fs.readFile(
      new URL("../app/api/visualize/route.ts", import.meta.url),
      "utf8",
    );
  assert.match(
    client,
    /activeView === "original" \? photo\.url : result\.image/,
  );
  assert.match(client, /Original Photo/);
  assert.match(client, /Your Concept/);
  assert.match(client, /setActiveView\("concept"\)/);
  assert.doesNotMatch(
    client,
    /Before and after comparison|type="range"[\s\S]{0,120}compare/,
  );
  assert.doesNotMatch(client, /<img[^>]+referenceImages/);
  assert.match(
    route,
    /Edit Image 1 only\. Install the selected product inside the marked area\./,
  );
  assert.match(
    route,
    /Image 3 is reference-only and must never replace the customer's property or background\./,
  );
  assert.match(
    route,
    /Generated output exactly matched a catalog reference image/,
  );
  assert.match(client, /isGeneratedResultUrl\(/);
  assert.match(
    client,
    /setResult\(null\);[\s\S]{0,500}setActiveView\("original"\)/,
  );
  assert.match(
    route,
    /Edit the customer photo only\. Install a Solidroll motorized vertical glass enclosure inside the marked storefront opening\./,
  );
  assert.match(route, /pink vertical height line/);
  assert.match(route, /green horizontal width line/);
  assert.doesNotMatch(route, /input_fidelity/);
  assert.match(route, /responseUrl: payload\.imageUrl/);
  assert.match(route, /image-1-customer-edit-target\.jpg/);
  assert.match(route, /image-2-placement-mask\.png/);
  assert.match(route, /product-reference-only/);
  assert.match(
    client,
    /Optional: drag over the photo to mark the installation area/,
  );
  assert.match(
    client,
    /const element = event\.currentTarget,[\s\S]{0,100}getBoundingClientRect\(\)/,
  );
  assert.match(
    client,
    /context\.fillRect\(0, 0, canvas\.width, canvas\.height\)/,
  );
});

test("server cache keys the optimized photo and synchronized configuration", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(
      new URL("../app/api/visualize/route.ts", import.meta.url),
      "utf8",
    ),
  );
  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /Buffer\.from\(photoBytes\)/);
  assert.match(source, /cache\/\$\{cacheKey\}\/result\.jpg/);
  assert.match(source, /stage:\s*"cache_hit"/);
  assert.match(source, /cached:\s*true/);
  assert.match(source, /OPENAI_IMAGE_PREVIEW_QUALITY\s*\|\|\s*"low"/);
});

test("visualize exchanges private object IDs and never returns base64 image JSON", async () => {
  const fs = await import("node:fs/promises"),
    route = await fs.readFile(
      new URL("../app/api/visualize/route.ts", import.meta.url),
      "utf8",
    ),
    client = await fs.readFile(
      new URL("../app/project-visualizer.tsx", import.meta.url),
      "utf8",
    );
  assert.doesNotMatch(route, /request\.formData\(/);
  assert.match(route, /photoObjectId/);
  assert.match(route, /fetch\(new URL\(path, request\.url\)\)/);
  assert.match(route, /Buffer\.from\(await reference\.arrayBuffer\(\)\)/);
  assert.doesNotMatch(route, /node:fs|node:path|readFile\(/);
  assert.doesNotMatch(route, /Product has no verified reference image/);
  assert.match(route, /put\(/);
  assert.match(route, /imageUrl:\s*signedResultUrl/);
  assert.doesNotMatch(route, /data:image\/jpeg;base64/);
  assert.match(client, /@vercel\/blob\/client/);
});

test("large generated results are stored before a small JSON response", async () => {
  const fs = await import("node:fs/promises"),
    route = await fs.readFile(
      new URL("../app/api/visualize/route.ts", import.meta.url),
      "utf8",
    ),
    storage = await fs.readFile(
      new URL("../lib/visualizer-storage.ts", import.meta.url),
      "utf8",
    );
  assert.match(
    route,
    /Buffer\.from\(result\.data\[0\]\.b64_json,\s*"base64"\)/,
  );
  assert.match(route, /resultBytes\.byteLength\s*>\s*RESULT_MAX_BYTES/);
  assert.match(route, /await put\(/);
  assert.match(storage, /RESULT_MAX_BYTES\s*=\s*20\s*\*\s*1024\s*\*\s*1024/);
});

test("private object ownership and expiring result links are enforced", async () => {
  const old = process.env.VISUALIZER_SESSION_SECRET;
  process.env.VISUALIZER_SESSION_SECRET =
    "test-secret-that-is-longer-than-thirty-two-characters";
  const storage = await vite.ssrLoadModule("/lib/visualizer-storage.ts"),
    session = storage.createSessionCookie(),
    photo = storage.uploadPath(session.id, "request-1234", "photo", "jpg");
  assert.equal(storage.ownsObject(session.id, photo), true);
  assert.equal(storage.ownsObject(crypto.randomUUID(), photo), false);
  const url = new URL(storage.signedResultUrl(photo), "http://localhost");
  assert.equal(
    storage.verifyResultSignature(
      photo,
      url.searchParams.get("expires"),
      url.searchParams.get("signature"),
    ),
    true,
  );
  if (old) process.env.VISUALIZER_SESSION_SECRET = old;
  else delete process.env.VISUALIZER_SESSION_SECRET;
});

test("Cassette Awning maps to width and projection", async () => {
  const { products } = await vite.ssrLoadModule("/lib/products.ts");
  const awning = products.find((product) => product.id === "awning");
  assert.equal(awning.label, "Cassette Awning");
  assert.deepEqual(awning.dimensions, ["width", "projection"]);
  assert.deepEqual(awning.referenceImages, [
    "/projects/elevated-cassette-awning.jpeg",
  ]);
});

test("Sliding Glass uses its deployed concept visualization reference", async () => {
  const { products } = await vite.ssrLoadModule("/lib/products.ts"),
    sliding = products.find((product) => product.id === "sliding_glass");
  assert.equal(sliding.label, "Sliding Glass — Concept Visualization");
  assert.deepEqual(sliding.referenceImages, [
    "/projects/elevated-sliding-glass.png",
  ]);
  assert.equal(sliding.missingReference, undefined);
  assert.match(
    sliding.details,
    /concept visualization, not a completed project/i,
  );
});

test("Guillotine Glass and Solidroll keep distinct IDs and references", async () => {
  const fs = await import("node:fs/promises"),
    [{ products }, page, layout, route] = await Promise.all([
      vite.ssrLoadModule("/lib/products.ts"),
      fs.readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
      fs.readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
      fs.readFile(new URL("../app/api/visualize/route.ts", import.meta.url), "utf8"),
    ]);
  const guillotine = products.find((item) => item.id === "guillotine"),
    solidroll = products.find((item) => item.id === "solidroll");

  assert.equal(guillotine.label, "Guillotine Glass");
  assert.deepEqual(guillotine.referenceImages, [
    "/projects/elevated-guillotine-glass.jpeg",
  ]);
  assert.equal(solidroll.label, "Solidroll");
  assert.deepEqual(solidroll.referenceImages, [
    "/projects/elevated-solidroll.jpg",
  ]);
  assert.equal(guillotine.viewer, "guillotine");
  assert.equal(solidroll.viewer, "solidroll");
  assert.match(route, /productId === "solidroll"/);
  assert.match(route, /productId === "guillotine"/);
  assert.match(route, /Reference mapping mismatch/);
  assert.match(page, /elevated-solidroll\.jpg/);
  assert.match(page, /02 · Guillotine Glass/);
  assert.match(page, /03 · Solidroll/);
  assert.doesNotMatch(page, /02 · Integrated lighting/i);
  assert.match(layout, /Guillotine Glass and Solidroll/);
  assert.match(route, /fetch\(new URL\(path, request\.url\)\)/);
  assert.match(route, /projects\|media/);
  assert.doesNotMatch(route, /node:fs|readFile\(/);
});

test("every catalog product has a deployed visualizer reference", async () => {
  const { products } = await vite.ssrLoadModule("/lib/products.ts");
  const expected = {
    bioclimatic_double: "/projects/elevated-bioclimatic-double.png",
    rolling_roof: "/projects/elevated-rolling-roof.png",
    tilt: "/projects/elevated-tilt-system.png",
    flat: "/projects/elevated-flat-pergola.png",
    ceiling_zip: "/projects/elevated-ceiling-zip.png",
    sliding_glass: "/projects/elevated-sliding-glass.png",
    wintent: "/projects/elevated-wintent.png",
    solidroll: "/projects/elevated-solidroll.jpg",
  };
  for (const product of products) {
    assert.ok(product.referenceImages.length, `missing reference ${product.id}`);
    assert.equal(product.missingReference, undefined);
  }
  for (const [id, path] of Object.entries(expected))
    assert.deepEqual(products.find((item) => item.id === id).referenceImages, [
      path,
    ]);
});

test("a generated result URL cannot equal its product reference URL", async () => {
  const { isGeneratedResultUrl } = await vite.ssrLoadModule(
    "/lib/products.ts",
  );
  const reference = "/projects/elevated-solidroll.jpg";
  assert.equal(
    isGeneratedResultUrl(reference, [reference], "https://nestpergola.com/"),
    false,
  );
  assert.equal(
    isGeneratedResultUrl(
      "/api/visualize/result?objectId=visualizer%2Fresult.jpg",
      [reference],
      "https://nestpergola.com/",
    ),
    true,
  );
});

test("Solidroll selection sends its own product ID and sunburst omits input fidelity", async () => {
  const fs = await import("node:fs/promises"),
    [client, route] = await Promise.all([
      fs.readFile(new URL("../app/project-visualizer.tsx", import.meta.url), "utf8"),
      fs.readFile(new URL("../app/api/visualize/route.ts", import.meta.url), "utf8"),
    ]);
  assert.match(client, /<option key=\{product\.id\} value=\{product\.id\}>/);
  assert.match(client, /productId: selected\.id/);
  assert.match(route, /gpt-image-2\.5-sunburst/);
  assert.doesNotMatch(route, /input_fidelity/);
});

test("Wintent is complete across catalog, visualization, gallery and video", async () => {
  const fs = await import("node:fs/promises"),
    [{ products }, page, layout, visualizer, route] =
      await Promise.all([
        vite.ssrLoadModule("/lib/products.ts"),
        fs.readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
        fs.readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
        fs.readFile(
          new URL("../app/project-visualizer.tsx", import.meta.url),
          "utf8",
        ),
        fs.readFile(
          new URL("../app/api/visualize/route.ts", import.meta.url),
          "utf8",
        ),
      ]);
  const product = products.find((item) => item.id === "wintent");
  assert.equal(product.label, "Wintent Window Awning");
  assert.deepEqual(product.dimensions, ["width", "projection"]);
  assert.deepEqual(product.referenceImages, ["/projects/elevated-wintent.png"]);
  assert.match(page, /elevated-wintent\.png/);
  assert.match(page, /nest-wintent-showcase\.mp4/);
  assert.match(page, /aria-label="Wintent Window Awning in operation"/);
  assert.match(layout, /Wintent window awnings/);
  assert.match(visualizer, /selected\.id === "wintent"/);
  assert.match(route, /fetch\(new URL\(path, request\.url\)\)/);
  assert.doesNotMatch(route, /node:fs|readFile\(/);
});

test("pricing data and consultation pricing content are removed", async () => {
  const fs = await import("node:fs/promises");
  await assert.rejects(fs.access(new URL("../app/pricing.ts", import.meta.url)));
  const [products, visualizer, page, consultation] = await Promise.all([
    fs.readFile(new URL("../lib/products.ts", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/project-visualizer.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/api/consultation/route.ts", import.meta.url), "utf8"),
  ]);
  for (const source of [products, visualizer, page, consultation]) {
    assert.doesNotMatch(source, /pricingNote|pricedSystems|getFactoryPrice/);
  }
  assert.doesNotMatch(consultation, /`Pricing:/);
  assert.match(page, /Discuss My Project/);
});

test("customer-facing product labels use the approved louvered names", async () => {
  const { products } = await vite.ssrLoadModule("/lib/products.ts");
  assert.equal(
    products.find((item) => item.id === "bioclimatic_double").label,
    "Louvered Pergola — Double Retracting",
  );
  assert.equal(
    products.find((item) => item.id === "rolling_roof").label,
    "Louvered Pergola — Retracting Roof",
  );
  assert.equal(
    products.find((item) => item.id === "tilt").label,
    "Louvered Pergola — Tilting Louvers",
  );
  assert.equal(
    products.some((item) => /Bioclimatic/.test(item.label)),
    false,
  );
});

test("concept references are labeled separately in the website gallery", async () => {
  const fs = await import("node:fs/promises"),
    page = await fs.readFile(
      new URL("../app/page.tsx", import.meta.url),
      "utf8",
    );
  for (const image of [
    "elevated-bioclimatic-double.png",
    "elevated-rolling-roof.png",
    "elevated-tilt-system.png",
    "elevated-flat-pergola.png",
    "elevated-ceiling-zip.png",
    "elevated-sliding-glass.png",
  ]) {
    assert.match(
      page,
      new RegExp(
        `${image.replace(".", "\\.")}[\\s\\S]{0,220}Concept Visualization`,
      ),
    );
  }
  assert.match(page, /design concepts, not completed customer projects/);
  assert.match(page, /Concept visualization of/);
});

test("structured logs redact credentials, images, and contact details", async () => {
  const { logFailure } = await vite.ssrLoadModule("/lib/server-log.ts"),
    lines = [],
    original = console.error;
  console.error = (...args) => lines.push(args.join(" "));
  try {
    logFailure({
      requestId: "controlled-log-test",
      stage: "image_generation",
      productId: "awning",
      startedAt: Date.now() - 12,
      status: 502,
      error: new Error(
        "Bearer secret-token sk-test123 customer@example.com +1 312 555 0100 data:image/png;base64,AAAA",
      ),
      providerCode: "provider_test",
      providerRequestId: "req_provider_123",
    });
  } finally {
    console.error = original;
  }
  const event = JSON.parse(lines[0]);
  assert.equal(event.requestId, "controlled-log-test");
  assert.equal(event.stage, "image_generation");
  assert.equal(event.productId, "awning");
  assert.equal(event.httpStatus, 502);
  assert.equal(event.providerCode, "provider_test");
  assert.equal(event.providerRequestId, "req_provider_123");
  assert.doesNotMatch(
    lines.join("\n"),
    /secret-token|sk-test123|customer@example|312 555|base64,AAAA/,
  );
  assert.match(lines[1], /server stack/);
});

test("client render logs retain sanitized original and component stacks", async () => {
  const { logFailure } = await vite.ssrLoadModule("/lib/server-log.ts"),
    lines = [],
    original = console.error;
  console.error = (...args) => lines.push(args.join(" "));
  try {
    logFailure({
      requestId: "client-stack-test",
      stage: "client_render",
      startedAt: Date.now(),
      status: 500,
      error: "render failed",
      originalStack: "Error: user@example.com\n at Visualizer (app.js:1)",
      componentStack: "at ProjectVisualizer (+1 312 555 0100)",
    });
  } finally {
    console.error = original;
  }
  assert.equal(lines.length, 1);
  const event = JSON.parse(lines[0]);
  assert.match(event.clientStack, /Visualizer/);
  assert.match(event.componentStack, /ProjectVisualizer/);
  assert.doesNotMatch(lines[0], /user@example|312 555/);
});
