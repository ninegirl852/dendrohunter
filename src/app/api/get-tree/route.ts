import { NextResponse } from "next/server";

const NAME_PATTERNS = [
  /中文名稱[^<\n]{0,24}?[:：]\s*([\u4e00-\u9fff]{2,12})/,
  /樹種[^<\n]{0,24}?[:：]\s*([\u4e00-\u9fff]{2,12})/,
  /品種[^<\n]{0,24}?[:：]\s*([\u4e00-\u9fff]{2,12})/,
  /Chinese[_\s-]*Name[^<\n]{0,40}?[:：]\s*([\u4e00-\u9fff]{2,12})/i,
  /"Chinese_Name"\s*:\s*"([\u4e00-\u9fff]{2,12})"/,
  /"name"\s*:\s*"([\u4e00-\u9fff]{2,12})"/,
];

function publicHttpUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host === "::1"
  ) {
    return null;
  }
  const ip = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ip) {
    const a = Number(ip[1]);
    const b = Number(ip[2]);
    const blocked =
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168);
    if (blocked) return null;
  }
  return url;
}

function extractTreeName(body: string, url: URL) {
  let decoded = `${url.pathname} ${[...url.searchParams.values()].join(" ")}`;
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    /* keep the raw path */
  }
  for (const source of [body, decoded]) {
    for (const pattern of NAME_PATTERNS) {
      const match = source.match(pattern);
      if (match?.[1]) return match[1];
    }
  }
  const title = body.match(/<title[^>]*>([^<]{1,80})<\/title>/i)?.[1] ?? "";
  const titled = title.match(/[\u4e00-\u9fff]{2,12}/)?.[0];
  if (titled && !/首頁|主頁|錯誤|登入|搜尋/.test(titled)) return titled;
  return null;
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url") ?? "";
  const target = publicHttpUrl(raw);
  if (!target) {
    return NextResponse.json({ name: "未知樹木" }, { status: 400 });
  }

  try {
    const response = await fetch(target, {
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "DendroHunter/1.0",
        Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) {
      return NextResponse.json({ name: "未知樹木" }, { status: 502 });
    }
    const text = (await response.text()).slice(0, 1_500_000);
    const name = extractTreeName(text, target);
    return NextResponse.json({ name: name ?? "未知樹木" });
  } catch {
    return NextResponse.json({ name: "未知樹木" }, { status: 502 });
  }
}
