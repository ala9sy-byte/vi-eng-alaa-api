import axios from "axios";
import { GoogleGenAI } from "@google/genai";

const ALLOWED_ORIGIN = "https://eng-alaa.com";

function normalizeUrl(input: string, base?: string) {
  try {
    return new URL(input).toString();
  } catch {
    if (base) return new URL(input, base).toString();
    throw new Error("Invalid URL");
  }
}

function unique<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function extractDirectMediaLinks(html: string, baseUrl: string): string[] {
  const patterns = [
    /https?:\/\/[^\s"'`<>]+?\.(m3u8|mp4|mpd)(\?[^\s"'`<>]*)?/gi,
    /["'](https?:\/\/[^"'<>]+?\.(m3u8|mp4|mpd)(\?[^"'<>]*)?)["']/gi,
    /file\s*:\s*["']([^"']+)["']/gi,
    /source\s*:\s*["']([^"']+)["']/gi,
    /src\s*:\s*["']([^"']+?\.(m3u8|mp4|mpd)(\?[^"']*)?)["']/gi,
  ];

  const out: string[] = [];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const raw = match[1] || match[0];
      try {
        out.push(normalizeUrl(raw, baseUrl));
      } catch {}
    }
  }

  return unique(out).filter(
    (u) => u.includes(".m3u8") || u.includes(".mp4") || u.includes(".mpd")
  );
}

function extractCandidatePageLinks(html: string, baseUrl: string): string[] {
  const patterns = [
    /<iframe[^>]+src=["']([^"']+)["']/gi,
    /<source[^>]+src=["']([^"']+)["']/gi,
    /<video[^>]+src=["']([^"']+)["']/gi,
    /["'](\/watch\/[^"']+)["']/gi,
    /["'](\/embed\/[^"']+)["']/gi,
    /["'](\/player\/[^"']+)["']/gi,
    /["'](https?:\/\/[^"']+)["']/gi,
    /link\s*:\s*["']([^"']+)["']/gi,
    /src\s*:\s*["']([^"']+)["']/gi,
  ];

  const out: string[] = [];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const raw = match[1];
      if (!raw) continue;
      try {
        out.push(normalizeUrl(raw, baseUrl));
      } catch {}
    }
  }

  return unique(out).filter((u) => {
    const lower = u.toLowerCase();
    return (
      lower.startsWith("http") &&
      !lower.endsWith(".jpg") &&
      !lower.endsWith(".jpeg") &&
      !lower.endsWith(".png") &&
      !lower.endsWith(".gif") &&
      !lower.endsWith(".svg") &&
      !lower.includes("facebook.com") &&
      !lower.includes("twitter.com") &&
      !lower.includes("t.me")
    );
  });
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

async function geminiExtractLinks(html: string, apiKey: string) {
  const ai = new GoogleGenAI({ apiKey });

  const geminiResponse = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `
Extract useful video-related URLs from this HTML.

Priority:
1. direct .m3u8
2. direct .mp4
3. direct .mpd
4. iframe/embed/player URLs only if no direct links exist

Return only URLs, one per line.
If none exist, return NO_LINKS.

HTML:
${html.slice(0, 40000)}
    `,
  });

  const text = geminiResponse.text || "";
  const urlRegex = /(https?:\/\/[^\s"'`<>]+)/g;

  return Array.from(new Set((text.match(urlRegex) || []).map((x) => x.trim())));
}

async function resolveLinksDeep(startUrl: string, apiKey?: string) {
  const visited = new Set<string>();
  const queue: { url: string; depth: number }[] = [{ url: startUrl, depth: 0 }];
  const finalMediaLinks: string[] = [];

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

    const directLinks = extractDirectMediaLinks(html, current.url);
    if (directLinks.length) {
      finalMediaLinks.push(...directLinks);
      continue;
    }

    let candidates = extractCandidatePageLinks(html, current.url);

    if (!finalMediaLinks.length && !candidates.length && apiKey && current.depth === 0) {
      try {
        const geminiLinks = await geminiExtractLinks(html, apiKey);
        candidates.push(...geminiLinks);
      } catch {}
    }

    candidates = unique(candidates);

    for (const link of candidates) {
      const lower = link.toLowerCase();
      if (
        lower.includes(".m3u8") ||
        lower.includes(".mp4") ||
        lower.includes(".mpd")
      ) {
        finalMediaLinks.push(link);
      } else if (!visited.has(link)) {
        queue.push({ url: link, depth: current.depth + 1 });
      }
    }
  }

  return unique(finalMediaLinks);
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

    const extractedLinks = await resolveLinksDeep(normalizedUrl, apiKey);

    return res.status(200).json({
      extractedLinks,
      message: extractedLinks.length ? "OK" : "NO_LINKS_FOUND",
    });
  } catch (error: any) {
    return res.status(500).json({
      error: "Failed to fetch page or extract links",
      details: error?.message || "Unknown error",
    });
  }
}