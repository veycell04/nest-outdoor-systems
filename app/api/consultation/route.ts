import { getProduct } from "../../../lib/products";

export const runtime = "nodejs";
export const maxDuration = 20;

function json(body: unknown, status = 200) { return Response.json(body, { status, headers:{ "Cache-Control":"no-store" } }); }
function value(data: FormData, key: string, max = 1000) { const entry = data.get(key); return typeof entry === "string" ? entry.trim().slice(0, max) : ""; }

export async function POST(request: Request) {
  let data: FormData;
  try { data = await request.formData(); } catch { return json({ error:"The inquiry could not be read." }, 400); }
  const name = value(data,"name",120), email = value(data,"email",254), phone = value(data,"phone",40), zip = value(data,"zip",20), message = value(data,"message",2000);
  const product = getProduct(value(data,"productId",50));
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || !product) return json({ error:"Enter your name, email, and a valid product." }, 400);
  if (!process.env.RESEND_API_KEY || !process.env.CONSULTATION_FROM_EMAIL) return json({ error:"Online delivery is not configured yet. Your entries remain in this browser; please email hello@nestpergola.com." }, 503);
  const context = value(data,"projectContext",5000);
  const response = await fetch("https://api.resend.com/emails", { method:"POST", headers:{ Authorization:`Bearer ${process.env.RESEND_API_KEY}`, "Content-Type":"application/json" }, body:JSON.stringify({
    from:process.env.CONSULTATION_FROM_EMAIL,
    to:[process.env.CONSULTATION_TO_EMAIL || "hello@nestpergola.com"],
    reply_to:email,
    subject:`NEST project inquiry — ${product.label}`,
    text:[`Name: ${name}`,`Email: ${email}`,`Phone: ${phone || "Not provided"}`,`ZIP: ${zip || "Not provided"}`,`Product: ${product.label}`,`Message: ${message || "Not provided"}`,"",context ? `Visualizer details:\n${context}` : "No visualizer details provided."].join("\n"),
  }) });
  if (!response.ok) return json({ error:"Your inquiry was not accepted by the email service. Your entries remain available; please try again or email us directly." }, 502);
  const result = await response.json() as { id?: string };
  return json({ accepted:true, id:result.id || null });
}
