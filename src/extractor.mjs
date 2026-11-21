const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /\.local$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i
];

const SOCIAL_DOMAINS = [
  {
    key: "github",
    pattern: /^https?:\/\/(?:www\.)?github\.com\/(?<slug>[A-Za-z0-9_.-]+)\/?$/i,
    reserved: new Set(["login", "signup", "join", "features", "pricing", "enterprise", "topics", "explore", "marketplace", "sponsors", "about", "settings", "security", "solutions", "resources", "orgs", "apps"])
  },
  {
    key: "x",
    pattern: /^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/(?<slug>[A-Za-z0-9_]+)\/?$/i,
    reserved: new Set(["intent", "share", "home", "explore", "login", "i"])
  },
  { key: "linkedin", pattern: /^https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/(?<slug>[A-Za-z0-9_.-]+)\/?$/i },
  { key: "youtube", pattern: /^https?:\/\/(?:www\.)?youtube\.com\/(?<slug>@[A-Za-z0-9_.-]+|channel\/[A-Za-z0-9_-]+)\/?$/i }
];

/**
 * Normalize and validate a domain or URL input, blocking private/internal hosts.
 */
export function normalizeDomain(input) {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error("Missing or empty domain parameter");
  }
  const raw = input.trim();
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error("Invalid domain format");
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || !hostname.includes(".")) {
    throw new Error("Invalid domain hostname");
  }
  for (const pattern of PRIVATE_HOST_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new Error("Private or internal hostnames are not allowed");
    }
  }
  return hostname;
}

function parseAttributes(tag) {
  const attrs = {};
  const attrRegex = /([a-zA-Z_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;
  while ((match = attrRegex.exec(tag)) !== null) {
    const key = match[1].toLowerCase();
    const val = match[2] ?? match[3] ?? match[4] ?? "";
    attrs[key] = val;
  }
  return attrs;
}

function resolveUrl(candidate, baseUrl) {
  if (!candidate || typeof candidate !== "string") return null;
  const trimmed = candidate.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("javascript:")) {
    return null;
  }
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return null;
  }
}

function normalizeHex(hex) {
  if (!hex) return null;
  const clean = hex.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(clean)) return clean;
  if (/^#[0-9a-f]{3}$/.test(clean)) {
    return `#${clean[1]}${clean[1]}${clean[2]}${clean[2]}${clean[3]}${clean[3]}`;
  }
  return null;
}

function isNeutralGray(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max - min < 16;
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Extract structured brand assets and metadata from HTML and optional web app manifest.
 */
export function extractBrandFromHtml(html, baseUrl, manifest = null) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const pageTitle = titleMatch ? decodeHtmlEntities(titleMatch[1].replace(/\s+/g, " ")) : null;

  const metaMap = new Map();
  const metaRegex = /<meta\b[^>]*>/gi;
  let m;
  while ((m = metaRegex.exec(html)) !== null) {
    const attrs = parseAttributes(m[0]);
    const key = (attrs.name || attrs.property || "").toLowerCase();
    if (key && attrs.content !== undefined && !metaMap.has(key)) {
      metaMap.set(key, decodeHtmlEntities(attrs.content));
    }
  }

  const icons = [];
  const seenIconUrls = new Set();
  let manifestUrl = null;
  const fonts = new Set();

  const linkRegex = /<link\b[^>]*>/gi;
  while ((m = linkRegex.exec(html)) !== null) {
    const attrs = parseAttributes(m[0]);
    const rel = (attrs.rel || "").toLowerCase();
    const href = resolveUrl(attrs.href, baseUrl);
    if (!href) continue;

    if (rel === "manifest" && !manifestUrl) {
      manifestUrl = href;
      continue;
    }

    if (rel.includes("stylesheet") && href.includes("fonts.googleapis.com")) {
      const famMatch = href.match(/family=([^&]+)/);
      if (famMatch) {
        for (const part of decodeURIComponent(famMatch[1]).split("|")) {
          const familyName = part.split(":")[0].replace(/\+/g, " ").trim();
          if (familyName) fonts.add(familyName);
        }
      }
    }

    if (
      rel.includes("icon") ||
      rel.includes("apple-touch-icon") ||
      rel.includes("mask-icon") ||
      rel.includes("fluid-icon")
    ) {
      if (!seenIconUrls.has(href)) {
        seenIconUrls.add(href);
        icons.push({
          url: href,
          rel,
          sizes: attrs.sizes || null,
          type: attrs.type || null,
          source: "html"
        });
      }
    }
  }

  if (manifest && Array.isArray(manifest.icons)) {
    for (const item of manifest.icons) {
      const href = resolveUrl(item?.src, manifestUrl || baseUrl);
      if (href && !seenIconUrls.has(href)) {
        seenIconUrls.add(href);
        icons.push({
          url: href,
          rel: "manifest-icon",
          sizes: item.sizes || null,
          type: item.type || null,
          source: "manifest"
        });
      }
    }
  }

  const logos = [];
  const ogImage = resolveUrl(metaMap.get("og:image") || metaMap.get("twitter:image"), baseUrl);
  if (ogImage) {
    logos.push({ url: ogImage, kind: "social-preview", source: "meta" });
  }
  for (const icon of icons) {
    if (
      icon.type === "image/svg+xml" ||
      icon.rel.includes("apple-touch-icon") ||
      icon.source === "manifest" ||
      (icon.sizes && parseInt(icon.sizes, 10) >= 64)
    ) {
      logos.push({ url: icon.url, kind: "brand-icon", sizes: icon.sizes, source: icon.source });
    }
  }

  const colorCounts = new Map();
  const addColor = (raw, weight = 1) => {
    const hex = normalizeHex(raw);
    if (!hex) return;
    colorCounts.set(hex, (colorCounts.get(hex) || 0) + weight);
  };

  addColor(metaMap.get("theme-color"), 10);
  addColor(metaMap.get("msapplication-tilecolor"), 8);
  if (manifest?.theme_color) addColor(manifest.theme_color, 10);
  if (manifest?.background_color) addColor(manifest.background_color, 4);

  const styleRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  while ((m = styleRegex.exec(html)) !== null) {
    const css = m[1];
    const varColorRegex = /--[a-z0-9-]*(?:brand|primary|accent|theme)[a-z0-9-]*\s*:\s*(#[0-9a-f]{3,6})/gi;
    let vm;
    while ((vm = varColorRegex.exec(css)) !== null) {
      addColor(vm[1], 6);
    }
    const hexRegex = /#[0-9a-f]{3,6}\b/gi;
    let hm;
    while ((hm = hexRegex.exec(css)) !== null) {
      const normalized = normalizeHex(hm[0]);
      if (normalized && !isNeutralGray(normalized)) {
        addColor(normalized, 1);
      }
    }
    const fontRegex = /font-family\s*:\s*([^;}]+)/gi;
    let fm;
    while ((fm = fontRegex.exec(css)) !== null) {
      const firstFont = fm[1].split(",")[0].replace(/["']/g, "").trim();
      if (firstFont && !/^(sans-serif|serif|monospace|system-ui|inherit)$/i.test(firstFont)) {
        fonts.add(firstFont);
      }
    }
  }

  const colors = [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([hex]) => hex);

  const socialLinks = {};
  const anchorRegex = /<a\b[^>]*>/gi;
  while ((m = anchorRegex.exec(html)) !== null) {
    const attrs = parseAttributes(m[0]);
    const href = resolveUrl(attrs.href, baseUrl);
    if (!href) continue;
    for (const rule of SOCIAL_DOMAINS) {
      if (!socialLinks[rule.key]) {
        const matched = href.match(rule.pattern);
        if (matched) {
          const slug = (matched.groups?.slug || "").toLowerCase();
          if (!rule.reserved || !rule.reserved.has(slug)) {
            socialLinks[rule.key] = href;
          }
        }
      }
    }
  }

  const name =
    metaMap.get("og:site_name") ||
    manifest?.name ||
    manifest?.short_name ||
    pageTitle ||
    null;

  const description =
    metaMap.get("description") ||
    metaMap.get("og:description") ||
    manifest?.description ||
    null;

  return {
    name,
    description,
    manifestUrl,
    logos,
    icons,
    colors,
    fonts: [...fonts],
    socialLinks,
    meta: {
      title: pageTitle,
      themeColor: normalizeHex(metaMap.get("theme-color") || manifest?.theme_color)
    }
  };
}

/**
 * Fetch a domain's public homepage and manifest to extract brand assets.
 */
export async function fetchBrandAssets(domainInput, options = {}) {
  const domain = normalizeDomain(domainInput);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 8000;
  const targetUrl = `https://${domain}/`;

  const response = await fetchImpl(targetUrl, {
    headers: {
      "User-Agent": "BrandAssetAPI/1.0 (+https://rapidapi.com)",
      "Accept": "text/html,application/xhtml+xml"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    throw new Error(`Upstream site returned HTTP ${response.status}`);
  }

  const finalUrl = response.url || targetUrl;
  const html = await response.text();
  const initial = extractBrandFromHtml(html, finalUrl);

  let manifest = null;
  if (initial.manifestUrl) {
    try {
      const mRes = await fetchImpl(initial.manifestUrl, {
        headers: { "User-Agent": "BrandAssetAPI/1.0" },
        signal: AbortSignal.timeout(Math.min(timeoutMs, 4000))
      });
      if (mRes.ok) {
        manifest = await mRes.json();
      }
    } catch {
      // Manifest fetch is best-effort.
    }
  }

  const result = manifest ? extractBrandFromHtml(html, finalUrl, manifest) : initial;

  if (result.icons.length === 0) {
    const fallbackIco = new URL("/favicon.ico", finalUrl).toString();
    try {
      const icoRes = await fetchImpl(fallbackIco, {
        method: "HEAD",
        signal: AbortSignal.timeout(3000)
      });
      if (icoRes.ok) {
        result.icons.push({
          url: fallbackIco,
          rel: "icon",
          sizes: null,
          type: "image/x-icon",
          source: "fallback"
        });
      }
    } catch {
      // Ignore fallback probe failure.
    }
  }

  const { manifestUrl: _omit, ...cleanResult } = result;
  return {
    domain,
    resolvedUrl: finalUrl,
    ...cleanResult
  };
}
