import axios from "axios";
import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "https://eng-alaa.com");
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

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Referer: new URL(url).origin,
      },
      timeout: 15000,
    });

    const html = response.data as string;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY on server" });
    }

    const ai = new GoogleGenAI({ apiKey });

    const geminiResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
Extract all direct playable video links from this HTML.

Rules:
- Return only final direct video URLs if possible.
- Prefer links ending with .m3u8, .mp4, .mpd
- Also inspect iframe src, source src, file:, src:, link:, jwplayer config, player config, encoded URLs
- If multiple links exist, return all of them
- If none exist, return NO_LINKS

HTML:
${html.slice(0, 120000)}
      `,
    });

    const text = geminiResponse.text || "";

    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const urlRegex = /(https?:\/\/[^\s"'`<>]+)/g;
    const links = Array.from(
      new Set(
        lines.flatMap((line) => {
          const matches = line.match(urlRegex);
          return matches || [];
        })
      )
    );

    return res.status(200).json({
      html,
      extractedLinks: links,
      rawText: text,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: "Failed to fetch page or extract links",
      details: error?.message || "Unknown error",
    });
  }
}