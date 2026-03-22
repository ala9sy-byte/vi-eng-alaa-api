import { useState } from "react";
import {
  Play,
  Download,
  Search,
  Loader2,
  AlertCircle,
  ExternalLink,
  Video,
  Tv,
  CheckCircle2,
  Copy,
  Info,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface VideoLink {
  title: string;
  url: string;
  proxyUrl?: string;
  quality?: string;
  type: "stream" | "download";
  provider?: string;
  season?: string;
  episode?: string;
  isResolved?: boolean;
}

export default function App() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<VideoLink[]>([]);
  const [resolvingIndex, setResolvingIndex] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const resolveFinalLink = async (link: VideoLink, index: number) => {
    setResolvingIndex(index);

    try {
      const fetchResponse = await fetch(
        "https://vi-eng-alaa-api.vercel.app/api/fetch-url",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: link.url }),
        }
      );

      if (!fetchResponse.ok) {
        const errorData = await fetchResponse.json().catch(() => null);
        throw new Error(errorData?.details || "فشل الوصول للرابط الوسيط.");
      }

      const data = await fetchResponse.json();
      const extractedLinks: string[] = data.extractedLinks || [];
      const candidateLinks: string[] = data.candidateLinks || [];

      const finalUrl = extractedLinks[0] || candidateLinks[0];

      if (!finalUrl) {
        throw new Error("لم يتم العثور على رابط فيديو مباشر أو رابط وسيط صالح.");
      }

      setLinks((prev) =>
        prev.map((item, i) =>
          i === index
            ? {
                ...item,
                url: finalUrl,
                proxyUrl: finalUrl,
                isResolved: extractedLinks.length > 0,
              }
            : item
        )
      );
    } catch (err: any) {
      console.error(err);
      setError(err.message || "حدث خطأ أثناء استخراج الرابط النهائي.");
    } finally {
      setResolvingIndex(null);
    }
  };

  const extractLinks = async () => {
    if (!url) return;

    setLoading(true);
    setError(null);
    setLinks([]);

    try {
      const isDirectPlayer =
        url.includes("govid.live") ||
        url.includes("vidsharing") ||
        url.includes("uqload") ||
        url.includes("upstream");

      if (isDirectPlayer) {
        const dummyLink: VideoLink = {
          title: "رابط مشغل مباشر",
          url,
          type: "stream",
          provider: (() => {
            try {
              return new URL(url).hostname.replace("www.", "");
            } catch {
              return "unknown";
            }
          })(),
        };

        setLinks([dummyLink]);
        await resolveFinalLink(dummyLink, 0);
        return;
      }

      const fetchResponse = await fetch(
        "https://vi-eng-alaa-api.vercel.app/api/fetch-url",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        }
      );

      if (!fetchResponse.ok) {
        const errorData = await fetchResponse.json().catch(() => null);
        throw new Error(errorData?.details || "فشل جلب محتوى الصفحة.");
      }

      const data = await fetchResponse.json();
      const extractedLinks: string[] = data.extractedLinks || [];
      const candidateLinks: string[] = data.candidateLinks || [];

      if (!extractedLinks.length && !candidateLinks.length) {
        throw new Error("لم يتم العثور على روابط فيديو مباشرة أو روابط وسيطة.");
      }

      const directParsed: VideoLink[] = extractedLinks.map((item, idx) => ({
        title: `رابط مباشر ${idx + 1}`,
        url: item,
        proxyUrl: item,
        type: "stream",
        provider: (() => {
          try {
            return new URL(item).hostname.replace("www.", "");
          } catch {
            return "unknown";
          }
        })(),
        isResolved: true,
      }));

      const candidateParsed: VideoLink[] = candidateLinks
        .filter((item) => !extractedLinks.includes(item))
        .map((item, idx) => ({
          title: `رابط وسيط ${idx + 1}`,
          url: item,
          proxyUrl: item,
          type: "stream",
          provider: (() => {
            try {
              return new URL(item).hostname.replace("www.", "");
            } catch {
              return "unknown";
            }
          })(),
          isResolved: false,
        }));

      setLinks([...directParsed, ...candidateParsed]);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "حدث خطأ غير متوقع.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div
      className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-emerald-500/30"
      dir="rtl"
    >
      <header className="border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Video className="text-black w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">رابط نظيف</h1>
          </div>
          <div className="hidden sm:flex items-center gap-6 text-sm text-white/60">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>بدون إعلانات</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>روابط مباشرة</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        <section className="text-center mb-16">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl sm:text-5xl font-bold mb-6 bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent"
          >
            استخرج روابط الفيديو المباشرة
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-white/60 text-lg mb-10 max-w-2xl mx-auto"
          >
            ضع رابط الفيلم أو المسلسل للحصول على روابط مشاهدة وتحميل نظيفة
            وبدون إعلانات.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="relative max-w-2xl mx-auto"
          >
            <div className="relative group">
              <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full group-focus-within:bg-emerald-500/30 transition-all duration-500" />
              <div className="relative flex items-center bg-white/5 border border-white/10 rounded-2xl p-2 focus-within:border-emerald-500/50 transition-all">
                <Search className="w-6 h-6 text-white/40 mr-4" />
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="ضع الرابط هنا... https://example.com/..."
                  className="flex-1 bg-transparent border-none focus:ring-0 px-4 py-3 text-lg outline-none placeholder:text-white/20 text-right"
                  onKeyDown={(e) => e.key === "Enter" && extractLinks()}
                />
                <button
                  onClick={extractLinks}
                  disabled={loading || !url}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-white/10 disabled:text-white/20 text-black font-bold px-8 py-3 rounded-xl transition-all flex items-center gap-2 min-w-[120px] justify-center"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    "استخراج"
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </section>

        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 flex items-start gap-4 mb-8"
            >
              <AlertCircle className="w-6 h-6 text-red-500 shrink-0" />
              <div>
                <h3 className="font-bold text-red-500 mb-1 text-right">
                  فشل الاستخراج
                </h3>
                <p className="text-white/60 text-sm text-right">{error}</p>
                <div className="mt-4 p-3 bg-black/20 rounded-lg text-xs text-white/40 flex items-center gap-2 justify-end">
                  <span>
                    ملاحظة: بعض المواقع تستخدم حماية تمنع الوصول التلقائي.
                  </span>
                  <Info className="w-4 h-4" />
                </div>
              </div>
            </motion.div>
          )}

          {links.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <CheckCircle2 className="text-emerald-500 w-6 h-6" />
                  تم العثور على {links.length} رابط
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {links.map((link, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="group bg-white/5 border border-white/10 rounded-2xl p-5 hover:border-emerald-500/30 hover:bg-white/[0.08] transition-all"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-500/20 text-blue-400">
                          <Play className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-white/90 line-clamp-1">
                            {link.title}
                          </h4>
                          <div className="flex items-center gap-2 text-xs text-white/40 mt-1">
                            {link.provider && (
                              <span className="bg-white/5 px-2 py-0.5 rounded uppercase tracking-wider">
                                {link.provider}
                              </span>
                            )}
                            {link.isResolved ? (
                              <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-bold">
                                مباشر
                              </span>
                            ) : (
                              <span className="bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded font-bold">
                                وسيط
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      {!link.isResolved ? (
                        <button
                          onClick={() => resolveFinalLink(link, index)}
                          disabled={resolvingIndex === index}
                          className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
                        >
                          {resolvingIndex === index ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              محاولة استخراج الرابط المباشر
                              <Play className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 bg-blue-500 hover:bg-blue-400 text-white text-sm font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
                          >
                            مشاهدة مباشرة
                            <Play className="w-4 h-4" />
                          </a>

                          <a
                            href={link.proxyUrl || link.url}
                            download
                            className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                          >
                            تحميل الفيديو
                            <Download className="w-5 h-5" />
                          </a>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 bg-white/10 hover:bg-white/20 text-white text-sm font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
                        >
                          فتح الرابط
                          <ExternalLink className="w-4 h-4" />
                        </a>

                        <button
                          onClick={() => copyToClipboard(link.url, index)}
                          className="w-12 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-xl transition-all flex items-center justify-center"
                          title="نسخ الرابط"
                        >
                          {copiedIndex === index ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <Copy className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {!loading && links.length === 0 && !error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-3xl">
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Tv className="w-10 h-10 text-white/20" />
                </div>
                <p className="text-white/40">أدخل الرابط أعلاه لبدء الاستخراج.</p>
              </div>
            </motion.div>
          )}

          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20"
            >
              <div className="relative w-20 h-20 mx-auto mb-8">
                <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full animate-pulse" />
                <Loader2 className="w-20 h-20 text-emerald-500 animate-spin relative z-10" />
              </div>
              <h3 className="text-xl font-bold mb-2">جاري تحليل محتوى الصفحة...</h3>
              <p className="text-white/40">نبحث عن الروابط المباشرة والوسيطة.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="max-w-5xl mx-auto px-4 py-12 border-t border-white/5 mt-20">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 opacity-50">
            <Video className="w-5 h-5" />
            <span className="font-bold">رابط نظيف</span>
          </div>

          <div className="flex gap-8 text-sm text-white/40">
            <span>بدون نوافذ منبثقة</span>
            <span>بدون تحويلات</span>
            <span>جودة عالية</span>
          </div>

          <p className="text-xs text-white/20">
            © 2026 رابط نظيف. للأغراض التعليمية فقط.
          </p>
        </div>
      </footer>
    </div>
  );
}