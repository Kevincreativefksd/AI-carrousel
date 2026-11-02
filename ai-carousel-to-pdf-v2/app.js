/* AI Carousel to PDF Generator, versi editorial (4:5)
 * Agent 1: Content Planner  (Gemini -> JSON berlayout)
 * Agent 2: Slide Designer   (canvas, template tipografi)
 * Agent 3: PDF Compiler     (jsPDF)
 */
(() => {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Konfigurasi                                                         */
  /* ------------------------------------------------------------------ */
  const CONFIG = {
    defaultModel: 'gemini-3.5-flash-lite',
    geminiBase: 'https://generativelanguage.googleapis.com/v1beta/models',
    W: 1080,
    H: 1350,
    geminiTimeout: 60000,
    minSlides: 5,
    maxSlides: 12,
    keyStorage: 'cpg.apiKey',
    prefStorage: 'cpg.prefs',
  };

  const FONT = 'Arial, "Liberation Sans", Helvetica, sans-serif';
  const MARGIN = 80;
  const CONTENT_W = CONFIG.W - MARGIN * 2;
  const MAX_Y = 1190; // batas bawah konten (footer mulai di 1225)

  const THEMES = {
    light: { bg: '#F4F3EF', ink: '#151515', rule: '#8A8A8A', muted: '#151515' },
    dark: { bg: '#161616', ink: '#F4F3EF', rule: '#8A8A8A', muted: '#8C8C8C' },
  };

  const LAYOUT_NAMES = {
    cover: 'Sampul',
    content: 'Teks',
    list: 'Daftar bernomor',
    stats: 'Perbandingan',
    closing: 'Penutup',
  };

  function buildSystemPrompt(count) {
    return `Anda adalah editor media sosial senior untuk akun literasi ekonomi dan keuangan. Anda menyusun carousel editorial yang rapi, netral, dan mudah dipindai.

Buat TEPAT ${count} slide. Tulis dalam bahasa yang sama dengan topik pengguna (umumnya Bahasa Indonesia).

PERAN SLIDE
- Slide 1, layout "cover": "label" kategori singkat (mis. "Analisis Pasar"), "headline" maksimal 8 kata, "body" 1-2 kalimat yang mengutip angka kunci dari bahan sumber.
- Slide tengah, pilih salah satu layout per slide:
  - "content": "headline" berupa klaim atau pertanyaan, "body" 2-3 kalimat, "footnote" opsional.
  - "list": "headline", lalu "items" berisi 3-4 poin ringkas (maks 110 karakter per poin), "footnote" opsional.
  - "stats": "headline", lalu "rows" berisi 2-3 baris perbandingan. Setiap baris punya "title" (angka atau nama aset, maks 22 karakter) dan "detail" (satu kalimat, maks 100 karakter). Gunakan hanya jika ada beberapa data pembanding.
  Variasikan layout. Slide kesimpulan sebaiknya "list" dengan "footnote" berisi catatan kehati-hatian.
- Slide terakhir, layout "closing": "label" "Diskusi", "headline" berupa pertanyaan terbuka, "body" ajakan menulis pendapat di kolom komentar.

ATURAN ISI
- "label": 1-3 kata, kategori slide (mis. "Latar Belakang", "Pembanding", "Kesimpulan").
- "body" maksimal 170 karakter. Bungkus angka atau frasa kunci dengan **dua tanda bintang** agar tampil sebagai sorotan berwarna (maks 3 sorotan per slide). Jangan gunakan format markdown lain.
- Jika ada BAHAN SUMBER: gunakan hanya fakta, angka, dan nama dari bahan itu. Jangan menambah data dari luar.
- Jika TIDAK ada bahan sumber: jelaskan secara umum dan edukatif, dan JANGAN mengarang angka, persentase, tanggal, kutipan, atau nama pihak tertentu.
- Jangan memberi saran investasi. Nada netral dan informatif.
- Tanpa emoji dan tanpa hashtag.
- "slide_number" berurutan mulai dari 1.

Kembalikan HANYA array JSON yang valid.`;
  }

  const RESPONSE_SCHEMA = {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        slide_number: { type: 'INTEGER' },
        layout: { type: 'STRING', enum: ['cover', 'content', 'list', 'stats', 'closing'] },
        label: { type: 'STRING' },
        headline: { type: 'STRING' },
        body: { type: 'STRING' },
        items: { type: 'ARRAY', items: { type: 'STRING' } },
        rows: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { title: { type: 'STRING' }, detail: { type: 'STRING' } },
            required: ['title', 'detail'],
          },
        },
        footnote: { type: 'STRING' },
      },
      required: ['slide_number', 'layout', 'label', 'headline'],
    },
  };

  /* ------------------------------------------------------------------ */
  /* Elemen & state                                                      */
  /* ------------------------------------------------------------------ */
  const $ = (id) => document.getElementById(id);
  const el = {
    form: $('form'),
    topic: $('topic'),
    sourceText: $('sourceText'),
    apiKey: $('apiKey'),
    toggleKey: $('toggleKey'),
    brand: $('brand'),
    footer: $('footer'),
    sourceName: $('sourceName'),
    count: $('count'),
    accent: $('accent'),
    model: $('model'),
    remember: $('remember'),
    autoDownload: $('autoDownload'),
    submit: $('submit'),
    submitLabel: $('submitLabel'),
    spinner: $('spinner'),
    progress: $('progress'),
    statusText: $('statusText'),
    statusPct: $('statusPct'),
    bar: $('bar'),
    preview: $('preview'),
    previewMeta: $('previewMeta'),
    grid: $('grid'),
    downloadBtn: $('downloadBtn'),
    toasts: $('toasts'),
  };

  const state = { busy: false, pdfUrl: null, pdfName: '' };

  class AppError extends Error {}

  /* ------------------------------------------------------------------ */
  /* Utilitas UI                                                         */
  /* ------------------------------------------------------------------ */
  function toast(message, type = 'info', duration = 5000) {
    while (el.toasts.children.length >= 3) el.toasts.firstElementChild.remove();

    const node = document.createElement('div');
    node.className = `toast toast-${type}`;
    node.setAttribute('role', type === 'error' ? 'alert' : 'status');
    const dot = document.createElement('span');
    dot.className = 'toast-dot';
    const text = document.createElement('span');
    text.textContent = message;
    node.append(dot, text);
    el.toasts.appendChild(node);

    const dismiss = () => {
      node.classList.add('toast-out');
      setTimeout(() => node.remove(), 220);
    };
    node.addEventListener('click', dismiss);
    setTimeout(dismiss, duration);
  }

  function setLoading(on) {
    state.busy = on;
    el.submit.disabled = on;
    el.spinner.classList.toggle('hidden', !on);
    el.submitLabel.textContent = on ? 'Sedang membuat...' : 'Generate Carousel';
    [el.topic, el.sourceText, el.apiKey].forEach((i) => (i.disabled = on));
  }

  function setStatus(text, pct) {
    el.progress.classList.remove('hidden');
    el.statusText.textContent = text;
    if (typeof pct === 'number') {
      const p = Math.max(0, Math.min(100, Math.round(pct)));
      el.bar.style.width = `${p}%`;
      el.statusPct.textContent = `${p}%`;
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function revokePdf() {
    if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
    state.pdfUrl = null;
    state.pdfName = '';
    el.downloadBtn.classList.add('hidden');
  }

  function triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function safeFileName(topic) {
    const slug = topic
      .trim()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40)
      .replace(/_+$/g, '');
    return `Carousel_${slug || 'Untitled'}.pdf`;
  }

  async function fetchWithTimeout(url, options = {}, timeout = 30000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Agent 1: Content Planner (Gemini)                                   */
  /* ------------------------------------------------------------------ */
  async function planContent({ topic, sourceText, apiKey, model, count }) {
    const url = `${CONFIG.geminiBase}/${encodeURIComponent(model)}:generateContent`;

    const userText = [
      `TOPIK: ${topic}`,
      `JUMLAH SLIDE: ${count}`,
      sourceText
        ? `BAHAN SUMBER:\n"""\n${sourceText}\n"""`
        : 'BAHAN SUMBER: (tidak ada. Jangan mengarang angka atau fakta spesifik.)',
    ].join('\n\n');

    const body = {
      systemInstruction: { parts: [{ text: buildSystemPrompt(count) }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0.6,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    };

    let res;
    try {
      res = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(body),
        },
        CONFIG.geminiTimeout
      );
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new AppError('Gemini tidak merespons tepat waktu. Coba lagi sebentar lagi.');
      }
      throw new AppError('Tidak bisa terhubung ke Gemini. Periksa koneksi internet Anda.');
    }

    if (!res.ok) {
      let detail = '';
      let reason = '';
      try {
        const j = await res.json();
        detail = j?.error?.message || '';
        reason = (j?.error?.details || []).find((d) => d.reason)?.reason || '';
      } catch (_) { /* abaikan */ }

      if (reason === 'API_KEY_INVALID' || (res.status === 400 && /api key/i.test(detail))) {
        throw new AppError('API key tidak valid. Periksa kembali key Gemini Anda.');
      }
      if (res.status === 401 || res.status === 403) {
        throw new AppError('API key ditolak atau tidak punya akses ke model ini.');
      }
      if (res.status === 404) {
        throw new AppError(`Model "${model}" tidak ditemukan. Ubah nama model di Pengaturan lanjutan.`);
      }
      if (res.status === 429) {
        throw new AppError('Kuota Gemini habis atau terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.');
      }
      if (res.status >= 500) {
        throw new AppError('Server Gemini sedang bermasalah. Coba lagi beberapa saat lagi.');
      }
      throw new AppError(detail || `Gemini mengembalikan error ${res.status}.`);
    }

    let data;
    try {
      data = await res.json();
    } catch (_) {
      throw new AppError('Respons Gemini tidak bisa dibaca. Coba lagi.');
    }

    if (data?.promptFeedback?.blockReason) {
      throw new AppError('Topik ditolak oleh filter keamanan Gemini. Coba topik atau bahan lain.');
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const raw = parts.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('').trim();
    if (!raw) throw new AppError('Gemini tidak mengembalikan konten. Coba lagi atau ganti topik.');

    return normalizeSlides(raw, count);
  }

  function normalizeSlides(raw, count) {
    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''));
    } catch (_) {
      throw new AppError('Format JSON dari Gemini tidak valid. Coba generate ulang.');
    }

    const list = Array.isArray(parsed) ? parsed : parsed?.slides;
    if (!Array.isArray(list)) throw new AppError('Struktur slide dari Gemini tidak sesuai. Coba generate ulang.');

    const str = (v) => String(v ?? '').trim();

    let slides = list
      .map((s) => ({
        layout: str(s?.layout),
        label: str(s?.label),
        headline: str(s?.headline),
        body: str(s?.body),
        items: (Array.isArray(s?.items) ? s.items : []).map(str).filter(Boolean).slice(0, 4),
        rows: (Array.isArray(s?.rows) ? s.rows : [])
          .map((r) => ({ title: str(r?.title), detail: str(r?.detail) }))
          .filter((r) => r.title)
          .slice(0, 3),
        footnote: str(s?.footnote),
      }))
      .filter((s) => s.headline)
      .slice(0, count);

    if (slides.length < 3) throw new AppError('Gemini hanya menghasilkan sedikit slide. Coba generate ulang.');

    slides = slides.map((s, i) => {
      let layout = s.layout;
      if (i === 0) layout = 'cover';
      else if (i === slides.length - 1) layout = 'closing';
      else if (layout === 'list' && !s.items.length) layout = 'content';
      else if (layout === 'stats' && !s.rows.length) layout = 'content';
      else if (!['content', 'list', 'stats'].includes(layout)) layout = 'content';
      return { ...s, layout, slide_number: i + 1 };
    });

    return slides;
  }

  /* ------------------------------------------------------------------ */
  /* Agent 2: Slide Designer (canvas)                                    */
  /* ------------------------------------------------------------------ */
  const stripMd = (t) => String(t).replace(/\*\*/g, '');

  function fontStr({ size, weight = 400, italic = false }) {
    return `${italic ? 'italic ' : ''}${weight} ${size}px ${FONT}`;
  }

  // Teks huruf kapital dengan jarak antarhuruf (tidak bergantung ctx.letterSpacing)
  function drawSpaced(ctx, text, x, y, spacing, align = 'left') {
    const chars = [...text];
    const widths = chars.map((c) => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
    let cx = align === 'right' ? x - total : x;
    ctx.textAlign = 'left';
    chars.forEach((c, i) => {
      ctx.fillText(c, cx, y);
      cx += widths[i] + spacing;
    });
    return total;
  }

  // **sorotan** -> kata-kata bertanda bold
  function parseRich(text) {
    const words = [];
    let pendingSpace = false;
    String(text).split('**').forEach((part, i) => {
      const bold = i % 2 === 1;
      part.split(/(\s+)/).forEach((piece) => {
        if (!piece) return;
        if (/^\s+$/.test(piece)) {
          pendingSpace = true;
          return;
        }
        words.push({ text: piece, bold, space: pendingSpace && words.length > 0 });
        pendingSpace = false;
      });
    });
    return words;
  }

  function layoutText(ctx, text, { size, weight = 400, italic = false, maxWidth }) {
    const words = parseRich(text);
    ctx.font = fontStr({ size, weight, italic });
    const spaceW = ctx.measureText(' ').width;
    const lines = [];
    let cur = [];
    let w = 0;
    for (const word of words) {
      ctx.font = fontStr({ size, weight: word.bold ? 700 : weight, italic });
      const ww = ctx.measureText(word.text).width;
      const gap = cur.length && word.space ? spaceW : 0;
      if (cur.length && w + gap + ww > maxWidth) {
        lines.push(cur);
        cur = [];
        w = 0;
      }
      const g = cur.length && word.space ? spaceW : 0;
      cur.push({ ...word, w: ww, gap: g });
      w += g + ww;
    }
    if (cur.length) lines.push(cur);
    return lines;
  }

  // Menggambar baris; mengembalikan baseline baris terakhir
  function drawLines(ctx, lines, x, y, { size, weight = 400, italic = false, lh, color, accent, plain = false }) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    lines.forEach((line, i) => {
      let cx = x;
      const by = y + i * lh;
      line.forEach((wd) => {
        cx += wd.gap;
        const hl = wd.bold && !plain;
        ctx.font = fontStr({ size, weight: hl ? 700 : weight, italic });
        ctx.fillStyle = hl ? accent : color;
        ctx.fillText(wd.text, cx, by);
        cx += wd.w;
      });
    });
    return y + (lines.length - 1) * lh;
  }

  function fitHeadline(ctx, text, maxWidth, startSize, minSize, maxLines) {
    const clean = stripMd(text);
    for (let size = Math.round(startSize); size >= minSize; size -= 2) {
      const lines = layoutText(ctx, clean, { size, weight: 700, maxWidth });
      if (lines.length <= maxLines) return { size, lines };
    }
    return { size: minSize, lines: layoutText(ctx, clean, { size: minSize, weight: 700, maxWidth }) };
  }

  function drawFootnote(ctx, t, text, afterY, k, meta) {
    if (!text) return afterY;
    const ruleY = afterY + 54 * k;
    ctx.fillStyle = t.rule;
    ctx.fillRect(MARGIN, ruleY, CONTENT_W, 1.5);
    const size = 30 * k;
    const lines = layoutText(ctx, text, { size, italic: true, maxWidth: CONTENT_W });
    return drawLines(ctx, lines, MARGIN, ruleY + 52 * k, {
      size, italic: true, lh: 42 * k, color: t.ink, accent: meta.accent, plain: true,
    });
  }

  function drawFrame(ctx, t, slide, meta) {
    const { W, H } = CONFIG;
    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic';

    // Header
    ctx.fillStyle = t.ink;
    ctx.font = fontStr({ size: 28, weight: 700 });
    drawSpaced(ctx, meta.brand.toUpperCase(), MARGIN, 101, 5.6);
    ctx.font = fontStr({ size: 28, weight: 400 });
    const pad = (n) => String(n).padStart(2, '0');
    drawSpaced(ctx, `${pad(slide.slide_number)} / ${pad(meta.total)}`, W - MARGIN, 101, 2.8, 'right');
    ctx.fillStyle = t.rule;
    ctx.fillRect(MARGIN, 131, CONTENT_W, 2);

    // Bar aksen + label kategori
    ctx.fillStyle = meta.accent;
    ctx.fillRect(MARGIN, 188, 64, 8);
    ctx.fillStyle = t.ink;
    ctx.font = fontStr({ size: 28, weight: 700 });
    drawSpaced(ctx, (slide.label || '').toUpperCase(), MARGIN, 247, 5.6);

    // Footer
    ctx.fillStyle = t.rule;
    ctx.fillRect(MARGIN, 1224, CONTENT_W, 2);
    ctx.fillStyle = slide.layout === 'closing' ? t.muted : t.ink;
    ctx.font = fontStr({ size: 25, weight: 400 });
    ctx.textAlign = 'left';
    ctx.fillText(meta.footer, MARGIN, 1280);
    if (slide.layout !== 'closing') {
      ctx.fillStyle = t.ink;
      ctx.font = fontStr({ size: 26, weight: 700 });
      ctx.textAlign = 'right';
      ctx.fillText('Geser  >', W - MARGIN, 1280);
      ctx.textAlign = 'left';
    }
  }

  /* --- Template per layout. Masing-masing mengembalikan baseline terakhir --- */
  const LAYOUTS = {
    cover(ctx, t, s, meta, k) {
      const { size, lines } = fitHeadline(ctx, s.headline, CONTENT_W, 106 * k, 60, 3);
      const lh = size * 1.07;
      const last = drawLines(ctx, lines, MARGIN, 500, { size, weight: 700, lh, color: t.ink, accent: meta.accent, plain: true });
      const barY = last + 52;
      ctx.fillStyle = meta.accent;
      ctx.fillRect(MARGIN, barY, 120, 8);
      if (!s.body) return barY + 8;
      const bs = 42 * k;
      const bl = layoutText(ctx, s.body, { size: bs, maxWidth: CONTENT_W });
      return drawLines(ctx, bl, MARGIN, barY + 95, { size: bs, lh: 60 * k, color: t.ink, accent: meta.accent });
    },

    content(ctx, t, s, meta, k) {
      const { size, lines } = fitHeadline(ctx, s.headline, CONTENT_W, 64 * k, 42, 3);
      const last = drawLines(ctx, lines, MARGIN, 392, { size, weight: 700, lh: size * 1.22, color: t.ink, accent: meta.accent, plain: true });
      let end = last;
      if (s.body) {
        const barY = last + 50;
        ctx.fillStyle = meta.accent;
        ctx.fillRect(MARGIN, barY, 120, 8);
        const bs = 38 * k;
        const bl = layoutText(ctx, s.body, { size: bs, maxWidth: CONTENT_W });
        end = drawLines(ctx, bl, MARGIN, barY + 90, { size: bs, lh: 56 * k, color: t.ink, accent: meta.accent });
      }
      return drawFootnote(ctx, t, s.footnote, end, k, meta);
    },

    list(ctx, t, s, meta, k) {
      const { size, lines } = fitHeadline(ctx, s.headline, CONTENT_W, 64 * k, 42, 3);
      const last = drawLines(ctx, lines, MARGIN, 392, { size, weight: 700, lh: size * 1.22, color: t.ink, accent: meta.accent, plain: true });

      const ts = 32 * k;
      const textX = 160;
      const textW = CONFIG.W - MARGIN - textX;
      let y = last + 100;
      let end = last;
      s.items.forEach((item, i) => {
        ctx.fillStyle = meta.accent;
        ctx.font = fontStr({ size: 62 * k, weight: 700 });
        ctx.textAlign = 'left';
        ctx.fillText(String(i + 1), MARGIN, y + 9 * k);
        const il = layoutText(ctx, item, { size: ts, maxWidth: textW });
        end = drawLines(ctx, il, textX, y, { size: ts, lh: 47 * k, color: t.ink, accent: meta.accent });
        y = end + 47 * k + 42 * k;
      });
      return drawFootnote(ctx, t, s.footnote, end, k, meta);
    },

    stats(ctx, t, s, meta, k) {
      const { size, lines } = fitHeadline(ctx, s.headline, CONTENT_W, 64 * k, 42, 3);
      const last = drawLines(ctx, lines, MARGIN, 392, { size, weight: 700, lh: size * 1.22, color: t.ink, accent: meta.accent, plain: true });

      let ruleY = last + 60;
      let end = last;
      s.rows.forEach((row, i) => {
        ctx.fillStyle = t.rule;
        ctx.fillRect(MARGIN, ruleY, CONTENT_W, 1.5);

        const titleSize = 52 * k;
        const titleY = ruleY + 80 * k;
        const tl = layoutText(ctx, row.title, { size: titleSize, weight: 700, maxWidth: CONTENT_W });
        drawLines(ctx, tl, MARGIN, titleY, {
          size: titleSize, weight: 700, lh: titleSize * 1.1, color: i === 0 ? meta.accent : t.ink, accent: meta.accent, plain: true,
        });

        const ds = 32 * k;
        const dl = layoutText(ctx, row.detail, { size: ds, maxWidth: CONTENT_W });
        end = drawLines(ctx, dl, MARGIN, titleY + 52 * k, { size: ds, lh: 44 * k, color: t.ink, accent: meta.accent });
        ruleY = end + 46 * k;
      });
      return drawFootnote(ctx, t, s.footnote, end, k, meta);
    },

    closing(ctx, t, s, meta, k) {
      const { size, lines } = fitHeadline(ctx, s.headline, CONTENT_W, 100 * k, 56, 3);
      const last = drawLines(ctx, lines, MARGIN, 480, { size, weight: 700, lh: size * 1.07, color: t.ink, accent: meta.accent, plain: true });
      const barY = last + 52;
      ctx.fillStyle = meta.accent;
      ctx.fillRect(MARGIN, barY, 120, 8);

      let end = barY + 8;
      if (s.body) {
        const bs = 40 * k;
        const bl = layoutText(ctx, s.body, { size: bs, maxWidth: CONTENT_W });
        end = drawLines(ctx, bl, MARGIN, barY + 90, { size: bs, lh: 52 * k, color: t.ink, accent: meta.accent });
      }

      // Blok sumber hanya muncul jika nama sumber diisi
      if (!meta.sourceName) return end;

      const labelY = end + 110 * k;
      ctx.fillStyle = t.ink;
      ctx.font = fontStr({ size: 26, weight: 700 });
      drawSpaced(ctx, 'SUMBER', MARGIN, labelY, 5);

      const ss = 30 * k;
      const sl = layoutText(ctx, meta.sourceName, { size: ss, maxWidth: CONTENT_W });
      return drawLines(ctx, sl, MARGIN, labelY + 48, {
        size: ss, lh: 40 * k, color: t.ink, accent: meta.accent, plain: true,
      });
    },
  };

  function renderSlide(slide, meta) {
    const t = slide.layout === 'closing' ? THEMES.dark : THEMES.light;
    let k = 1;
    let canvas;
    for (let attempt = 0; attempt < 6; attempt++) {
      canvas = document.createElement('canvas');
      canvas.width = CONFIG.W;
      canvas.height = CONFIG.H;
      const ctx = canvas.getContext('2d');
      drawFrame(ctx, t, slide, meta);
      const endY = LAYOUTS[slide.layout](ctx, t, slide, meta, k);
      if (endY <= MAX_Y || k <= 0.62) break;
      k *= 0.92; // teks terlalu panjang: kecilkan sedikit lalu gambar ulang
    }
    return canvas.toDataURL('image/jpeg', 0.93);
  }

  /* ------------------------------------------------------------------ */
  /* Pratinjau                                                           */
  /* ------------------------------------------------------------------ */
  function renderSkeletons(slides) {
    el.grid.replaceChildren();
    slides.forEach((s) => {
      const fig = document.createElement('figure');
      fig.dataset.slide = s.slide_number;

      const frame = document.createElement('div');
      frame.className = 'slide-frame';
      const sk = document.createElement('div');
      sk.className = 'skeleton';
      const p = document.createElement('p');
      p.textContent = stripMd(s.headline);
      sk.appendChild(p);
      frame.appendChild(sk);

      const cap = document.createElement('figcaption');
      cap.className = 'mt-3 flex items-baseline justify-between gap-3';
      const title = document.createElement('span');
      title.className = 'text-sm font-semibold';
      title.textContent = `Slide ${s.slide_number}`;
      const kind = document.createElement('span');
      kind.className = 'text-xs text-muted';
      kind.textContent = LAYOUT_NAMES[s.layout] || '';
      cap.append(title, kind);

      fig.append(frame, cap);
      el.grid.appendChild(fig);
    });
    el.preview.classList.remove('hidden');
  }

  function fillPreview(n, dataUrl, headline) {
    const frame = el.grid.querySelector(`figure[data-slide="${n}"] .slide-frame`);
    if (!frame) return;
    const img = document.createElement('img');
    img.alt = stripMd(headline);
    img.src = dataUrl;
    frame.replaceChildren(img);
  }

  /* ------------------------------------------------------------------ */
  /* Agent 3: PDF Compiler (jsPDF)                                       */
  /* ------------------------------------------------------------------ */
  function buildPdf(pages, title) {
    const lib = window.jspdf && window.jspdf.jsPDF;
    if (!lib) throw new AppError('Library jsPDF gagal dimuat. Muat ulang halaman dan coba lagi.');

    const { W, H } = CONFIG;
    const pdf = new lib({ orientation: 'portrait', unit: 'px', format: [W, H], hotfixes: ['px_scaling'], compress: true });
    pdf.setProperties({ title: `Carousel - ${title}`, creator: 'AI Carousel to PDF Generator' });

    pages.forEach((dataUrl, i) => {
      if (i > 0) pdf.addPage([W, H], 'portrait');
      pdf.addImage(dataUrl, 'JPEG', 0, 0, W, H, undefined, 'FAST');
    });
    return pdf.output('blob');
  }

  /* ------------------------------------------------------------------ */
  /* Alur utama                                                          */
  /* ------------------------------------------------------------------ */
  async function run() {
    if (state.busy) return;

    const topic = el.topic.value.trim();
    const apiKey = el.apiKey.value.trim();
    const sourceText = el.sourceText.value.trim();
    const model = el.model.value.trim() || CONFIG.defaultModel;
    const count = Math.min(CONFIG.maxSlides, Math.max(CONFIG.minSlides, parseInt(el.count.value, 10) || 11));
    el.count.value = count;

    if (topic.length < 3) {
      toast('Isi topik carousel dulu, minimal 3 karakter.', 'error');
      el.topic.focus();
      return;
    }
    if (!apiKey) {
      toast('Gemini API key wajib diisi.', 'error');
      el.apiKey.focus();
      return;
    }
    if (!navigator.onLine) {
      toast('Anda sedang offline. Sambungkan internet lalu coba lagi.', 'error');
      return;
    }

    persist(apiKey);
    revokePdf();
    el.preview.classList.add('hidden');
    el.grid.replaceChildren();
    setLoading(true);

    try {
      // Agent 1
      setStatus('Menyusun isi slide dengan Gemini...', 5);
      const slides = await planContent({ topic, sourceText, apiKey, model, count });
      const total = slides.length;

      const meta = {
        total,
        brand: el.brand.value.trim() || 'Carousel',
        footer: el.footer.value.trim(),
        sourceName: el.sourceName.value.trim(),
        accent: /^#[0-9a-f]{6}$/i.test(el.accent.value) ? el.accent.value : '#C62828',
      };

      el.previewMeta.textContent = `${total} slide, rasio 4:5 (1080 x 1350)`;
      renderSkeletons(slides);

      // Agent 2
      const pages = [];
      for (let i = 0; i < total; i++) {
        setStatus(`Mendesain slide ${i + 1} dari ${total}...`, 15 + (i / total) * 72);
        await sleep(60); // beri waktu UI memperbarui pratinjau satu per satu
        const dataUrl = renderSlide(slides[i], meta);
        pages.push(dataUrl);
        fillPreview(slides[i].slide_number, dataUrl, slides[i].headline);
      }

      // Agent 3
      setStatus('Menyusun PDF...', 92);
      await sleep(50);
      const blob = buildPdf(pages, topic);
      state.pdfName = safeFileName(topic);
      state.pdfUrl = URL.createObjectURL(blob);
      el.downloadBtn.classList.remove('hidden');

      setStatus('Selesai', 100);
      if (el.autoDownload.checked) {
        triggerDownload(state.pdfUrl, state.pdfName);
        toast(`PDF diunduh: ${state.pdfName}`, 'success');
      } else {
        toast('PDF siap. Klik Unduh PDF untuk menyimpan.', 'success');
      }
      el.preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error(err);
      toast(err instanceof AppError ? err.message : 'Terjadi kesalahan tak terduga. Coba lagi.', 'error', 7000);
      setStatus('Dihentikan karena error', 0);
    } finally {
      setLoading(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Penyimpanan preferensi                                              */
  /* ------------------------------------------------------------------ */
  const PREF_FIELDS = ['brand', 'footer', 'sourceName', 'count', 'accent', 'model'];

  function persist(apiKey) {
    try {
      if (el.remember.checked) localStorage.setItem(CONFIG.keyStorage, apiKey);
      else localStorage.removeItem(CONFIG.keyStorage);
      const prefs = {};
      PREF_FIELDS.forEach((f) => (prefs[f] = el[f].value));
      localStorage.setItem(CONFIG.prefStorage, JSON.stringify(prefs));
    } catch (_) { /* storage diblokir */ }
  }

  function restore() {
    try {
      const saved = localStorage.getItem(CONFIG.keyStorage);
      if (saved) {
        el.apiKey.value = saved;
        el.remember.checked = true;
      }
      const prefs = JSON.parse(localStorage.getItem(CONFIG.prefStorage) || 'null');
      if (prefs) PREF_FIELDS.forEach((f) => { if (typeof prefs[f] === 'string' && prefs[f]) el[f].value = prefs[f]; });
    } catch (_) { /* abaikan */ }
  }

  /* ------------------------------------------------------------------ */
  /* Event                                                               */
  /* ------------------------------------------------------------------ */
  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    run();
  });

  el.toggleKey.addEventListener('click', () => {
    const show = el.apiKey.type === 'password';
    el.apiKey.type = show ? 'text' : 'password';
    el.toggleKey.textContent = show ? 'Sembunyikan' : 'Tampilkan';
  });

  el.downloadBtn.addEventListener('click', () => {
    if (state.pdfUrl) triggerDownload(state.pdfUrl, state.pdfName);
  });

  el.remember.addEventListener('change', () => {
    if (!el.remember.checked) {
      try { localStorage.removeItem(CONFIG.keyStorage); } catch (_) { /* abaikan */ }
    }
  });

  window.addEventListener('offline', () => toast('Koneksi internet terputus.', 'error'));

  restore();
})();
