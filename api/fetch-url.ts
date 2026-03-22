import axios from "axios";
import { GoogleGenAI } from "@google/genai";

const ALLOWED_ORIGIN = "https://eng-alaa.com";

type DetailedLink = {
  url: string;
  host: string;
  label: string;
  sourceType: "direct" | "iframe" | "player" | "embed" | "watch" | "file" | "src" | "unknown";
  isDirect: boolean;
  depth: number;
};

function normalizeUrl(input: string, base?: string) {
  try {
    return new URL(input).toString();
  } catch {
    if (base) return new URL(input, base).toString();
    throw new Error("Invalid URL");
  }
}

function uniqueByUrl(items: DetailedLink[]) {
  const map = new Map<string, DetailedLink>();
  for (const item of items) {
    if (!map.has(item.url)) map.set(item.url, item);
  }
  return Array.from(map.values());
}

function isBlockedLink(url: string) {
  const lower = url.toLowerCase();
  return (
    lower.includes("facebook.com") ||
    lower.includes("twitter.com") ||
    lower.includes("x.com") ||
    lower.includes("instagram.com") ||
    lower.includes("youtube.com") ||
    lower.includes("youtu.be") ||
    lower.includes("t.me") ||
    lower.includes("whatsapp") ||
    lower.includes("schema.org") ||
    lower.includes("googleapis.com") ||
    lower.includes("gstatic.com") ||
    lower.includes("cloudflare.com") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".gif") ||
    lower.endsWith(".svg") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".css") ||
    lower.endsWith(".js") ||
    lower.endsWith(".woff") ||
    lower.endsWith(".woff2") ||
    lower.endsWith(".ttf")
  );
}

function scoreLink(link: DetailedLink) {
  const lower = link.url.toLowerCase();
  let score = 0;

  if (link.isDirect) score += 100;
  if (lower.includes(".m3u8")) score += 90;
  if (lower.includes(".mp4")) score += 85;
  if (lower.includes(".mpd")) score += 80;

  if (link.sourceType === "iframe") score += 40;
  if (link.sourceType === "player") score += 35;
  if (link.sourceType === "embed") score += 30;
  if (link.sourceType === "watch") score += 20;
  if (link.sourceType === "file") score += 25;
  if (link.sourceType === "src") score += 15;

  if (lower.includes("govid")) score += 50;
  if (lower.includes("vidsharing")) score += 45;
  if (lower.includes("streamhg")) score += 40;
  if (lower.includes("uqload")) score += 40;
  if (lower.includes("upstream")) score += 40;
  if (lower.includes("ok.ru")) score += 35;
  if (lower.includes("hexload")) score += 35;
  if (lower.includes("vid1sha")) score += 35;

  if (link.depth === 0) score += 8;
  if (link.depth === 1) score += 5;

  return score;
}

function buildLabel(url: string, sourceType: DetailedLink["sourceType"], isDirect: boolean) {
  const host = (() => {
    try {
      return new URL(url).hostname.replace("www.", "");
    } catch {
      return "unknown";
    }
  })();

  if (isDirect) return `رابط مباشر من ${host}`;

  switch (sourceType) {
    case "iframe":
      return `رابط iframe من ${host}`;
    case "player":
      return `رابط مشغل من ${host}`;
    case "embed":
      return `رابط embed من ${host}`;
    case "watch":
      return `رابط مشاهدة من ${host}`;
    case "file":
      return `رابط file من ${host}`;
    case "src":
      return `رابط src من ${host}`;
    default:
      return `رابط وسيط من ${host}`;
  }
}

function makeDetailedLink(
  url: string,
  sourceType: DetailedLink["sourceType"],
  isDirect: boolean,
  depth: number
): DetailedLink | null {
  try {
    const normalized = normalizeUrl(url);
    if (isBlockedLink(normalized)) return null;

    return {
      url: normalized,
      host: new URL(normalized).hostname.replace("www.", ""),
      label: buildLabel(normalized, sourceType, isDirect),
      sourceType,
      isDirect,
      depth,
    };
  } catch {
    return null;
  }
}

function extractDirectMediaLinks(html: string, baseUrl: string, depth: number): DetailedLink[] {
  const out: DetailedLink[] = [];

  const patterns: Array<{ regex: RegExp; sourceType: DetailedLink["sourceType"] }> = [
    { regex: /https?:\/\/[^\s"'`<>]+?\.(m3u8|mp4|mpd)(\?[^\s"'`<>]*)?/gi, sourceType: "direct" },
    { regex: /["'](https?:\/\/[^"'<>]+?\.(m3u8|mp4|mpd)(\?[^"'<>]*)?)["']/gi, sourceType: "direct" },
    { regex: /file\s*:\s*["']([^"']+)["']/gi, sourceType: "file" },
    { regex: /source\s*:\s*["']([^"']+)["']/gi, sourceType: "file" },
    { regex: /src\s*:\s*["']([^"']+?\.(m3u8|mp4|mpd)(\?[^"']*)?)["']/gi, sourceType: "src" },
  ];

  for (const item of patterns) {
    let match;
    while ((match = item.regex.exec(html)) !== null) {
      const raw = match[1] || match[0];
      try {
        const abs = normalizeUrl(raw, baseUrl);
        const link = makeDetailedLink(abs, item.sourceType, true, depth);
        if (link) out.push(link);
      } catch {}
    }
  }

  return uniqueByUrl(out);
}

function extractCandidatePageLinks(html: string, baseUrl: string, depth: number): DetailedLink[] {
  const out: DetailedLink[] = [];

  const patterns: Array<{ regex: RegExp; sourceType: DetailedLink["sourceType"] }> = [
    { regex: /<iframe[^>]+src=["']([^"']+)["']/gi, sourceType: "iframe" },
    { regex: /["'](\/watch\/[^"']+)["']/gi, sourceType: "watch" },
    { regex: /["'](\/embed\/[^"']+)["']/gi, sourceType: "embed" },
    { regex: /["'](\/player\/[^"']+)["']/gi, sourceType: "player" },
    { regex: /link\s*:\s*["']([^"']+)["']/gi, sourceType: "unknown" },
    { regex: /src\s*:\s*["']([^"']+)["']/gi, sourceType: "src" },
    { regex: /["'](https?:\/\/[^"']+)["']/gi, sourceType: "unknown" },
  ];

  for (const item of patterns) {
    let match;
    while ((match = item.regex.exec(html)) !== null) {
      const raw = match[1];
      if (!raw) continue;

      try {
        const abs = normalizeUrl(raw, baseUrl);
        const lower = abs.toLowerCase();

        if (
          lower.includes(".m3u8") ||
          lower.includes(".mp4") ||
          lower.includes(".mpd")
        ) {
          const direct = makeDetailedLink(abs, "direct", true, depth);
          if (direct) out.push(direct);
        } else {
          const candidate = makeDetailedLink(abs, item.sourceType, false, depth);
          if (candidate) out.push(candidate);
        }
      } catch {}
    }
  }

  return uniqueByUrl(out);
}

async function fetchHtml(targetUrl: string) {
  const response = await axios.get(targetUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      Referer: new URL(targetUrl).origin,
    },
    timeout: 8000,
    maxRedirects: 3,
  });

  return typeof response.data === "string"
    ? response.data
    : JSON.stringify(response.data);
}

async function geminiExtractLinks(html: string, apiKey: string, depth: number): Promise<DetailedLink[]> {
  const ai = new GoogleGenAI({ apiKey });

  const geminiResponse = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `
Extract only useful video-related URLs from this HTML.

Priority:
1. direct .m3u8
2. direct .mp4
3. direct .mpd
4. iframe/player/embed/watch links

Return only URLs, one per line.
If none exist, return NO_LINKS.

HTML:
${html.slice(0, 40000)}
    `,
  });

  const text = geminiResponse.text || "";
  const urlRegex = /(https?:\/\/[^\s"'`<>]+)/g;
  const rawLinks = Array.from(new Set((text.match(urlRegex) || []).map((x) => x.trim())));

  const results: DetailedLink[] = [];

  for (const raw of rawLinks) {
    const lower = raw.toLowerCase();
    const isDirect =
      lower.includes(".m3u8") || lower.includes(".mp4") || lower.includes(".mpd");

    const link = makeDetailedLink(raw, isDirect ? "direct" : "unknown", isDirect, depth);
    if (link) results.push(link);
  }

  return uniqueByUrl(results);
}

async function resolveLinksDeep(startUrl: string, apiKey?: string) {
  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];

  let directLinks: DetailedLink[] = [];
  let candidateLinks: DetailedLink[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.url)) continue;
    if (current.depth > 1) continue;

    visited.add(current.url);

    let html = "";
    try {
      html = await fetchHtml(current.url);
    } catch {
      continue;
    }

    const direct = extractDirectMediaLinks(html, current.url, current.depth);
    if (direct.length) {
      directLinks.push(...direct);
      continue;
    }

    let candidates = extractCandidatePageLinks(html, current.url, current.depth);

    if (!candidates.length && apiKey && current.depth === 0) {
      try {
        const geminiLinks = await geminiExtractLinks(html, apiKey, current.depth);
        candidates.push(...geminiLinks);
      } catch {}
    }

    candidates = uniqueByUrl(candidates);
    candidateLinks.push(...candidates);

    for (const item of candidates) {
      if (item.isDirect) {
        directLinks.push(item);
      } else if (!visited.has(item.url)) {
        queue.push({ url: item.url, depth: current.depth + 1 });
      }
    }
  }

  directLinks = uniqueByUrl(directLinks)
    .sort((a, b) => scoreLink(b) - scoreLink(a))
    .slice(0, 10);

  candidateLinks = uniqueByUrl(candidateLinks)
    .filter((x) => !directLinks.some((d) => d.url === x.url))
    .sort((a, b) => scoreLink(b) - scoreLink(a))
    .slice(0, 20);

  return {
    directLinks,
    candidateLinks,
  };
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { url } = req.body || {};

    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL is required" });
    }

    const normalizedUrl = normalizeUrl(url.trim());
    const apiKey = process.env.GEMINI_API_KEY;

    const result = await resolveLinksDeep(normalizedUrl, apiKey);

    return res.status(200).json({
      extractedLinks: result.directLinks,
      candidateLinks: result.candidateLinks,
      message: result.directLinks.length
        ? "DIRECT_LINKS_FOUND"
        : result.candidateLinks.length
        ? "CANDIDATE_LINKS_FOUND"
        : "NO_LINKS_FOUND",
    });
  } catch (error: any) {
    return res.status(500).json({
      error: "Failed to fetch page or extract links",
      details: error?.message || "Unknown error",
    });
  }
}