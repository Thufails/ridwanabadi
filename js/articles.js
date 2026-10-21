(() => {
  const page = document.body.dataset.articlePage;
  if (!page) return;

  const formatDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return "";
    return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(date);
  };

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);

  const articleHref = (article) => `baca-artikel.html?slug=${encodeURIComponent(article.slug)}`;

  function safeUrl(value, { image = false } = {}) {
    if (!value) return "";
    try {
      const url = new URL(value, window.location.href);
      if (["http:", "https:"].includes(url.protocol)) {
        if (image && url.origin !== window.location.origin && url.hostname !== "ridwanabadi.com" && !url.hostname.endsWith(".ridwanabadi.com")) return "";
        return url.href;
      }
      if (!image && ["mailto:", "tel:"].includes(url.protocol)) return url.href;
      if (!image && value.startsWith("#")) return value;
    } catch {
      return "";
    }
    return "";
  }

  function resolveArticleLink(href, articles) {
    const safe = safeUrl(href);
    if (!safe) return "";
    try {
      const url = new URL(safe, window.location.href);
      const isLegacySite = url.hostname === "ridwanabadi.com" || url.hostname.endsWith(".ridwanabadi.com");
      if (isLegacySite) {
        const slug = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
        const match = articles.find((article) => article.slug === slug);
        if (match) return articleHref(match);
        return url.pathname === "/" ? "index.html#top" : "";
      }
      if (url.origin === window.location.origin) return url.href;
      return url.href;
    } catch {
      return safe;
    }
  }

  const allowedTags = new Set([
    "P", "BR", "STRONG", "B", "EM", "I", "U", "S", "H2", "H3", "H4", "H5", "H6",
    "UL", "OL", "LI", "BLOCKQUOTE", "FIGURE", "FIGCAPTION", "IMG", "A", "HR", "TABLE",
    "THEAD", "TBODY", "TFOOT", "TR", "TH", "TD", "DIV", "SPAN", "PRE", "CODE", "IFRAME"
  ]);

  function sanitizeContent(html, articles, displayedCover, continueImportedLists = false) {
    const parsed = new DOMParser().parseFromString(`<body>${html || ""}</body>`, "text/html");
    const coverUrl = safeUrl(displayedCover, { image: true });

    function imageIdentity(value) {
      const safe = safeUrl(value, { image: true });
      if (!safe) return "";
      const url = new URL(safe, window.location.href);
      url.search = "";
      url.hash = "";
      return `${url.origin}${url.pathname}`;
    }

    const coverIdentity = imageIdentity(coverUrl);
    const isRepeatedCover = (value) => Boolean(coverIdentity && imageIdentity(value) === coverIdentity);

    function cleanNode(node) {
      if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || "");
      if (node.nodeType !== Node.ELEMENT_NODE) return null;

      const tag = node.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "OBJECT" || tag === "FORM" || tag === "BUTTON" || tag === "INPUT") return null;
      if (!allowedTags.has(tag)) {
        const fragment = document.createDocumentFragment();
        for (const child of node.childNodes) {
          const clean = cleanNode(child);
          if (clean) fragment.append(clean);
        }
        return fragment;
      }

      const element = document.createElement(tag.toLowerCase());
      if (tag === "OL") {
        const start = node.getAttribute("start");
        if (/^-?\d+$/.test(start || "")) element.setAttribute("start", start);
      }
      if (tag === "LI") {
        const value = node.getAttribute("value");
        if (/^-?\d+$/.test(value || "")) element.setAttribute("value", value);
      }
      if (tag === "A") {
        const href = resolveArticleLink(node.getAttribute("href"), articles);
        if (!href) return cleanChildren(node, element, articles);
        element.setAttribute("href", href);
        const external = new URL(href, window.location.href).origin !== window.location.origin;
        if (external) {
          element.setAttribute("target", "_blank");
          element.setAttribute("rel", "noopener noreferrer");
        }
      }
      if (tag === "IMG") {
        const rawSource = node.getAttribute("src") || node.getAttribute("data-src") || node.getAttribute("data-lazy-src") || "";
        const src = safeUrl(rawSource, { image: true });
        if (!src || isRepeatedCover(src)) return null;
        element.setAttribute("src", src);
        element.setAttribute("alt", node.getAttribute("alt") || "Ilustrasi artikel");
        element.setAttribute("loading", "lazy");
        element.setAttribute("decoding", "async");
        for (const dimension of ["width", "height"]) {
          const value = node.getAttribute(dimension);
          if (/^\d{1,5}$/.test(value || "")) element.setAttribute(dimension, value);
        }
        return element;
      }
      if (tag === "IFRAME") {
        let source = node.getAttribute("src") || node.getAttribute("data-src") || "";
        try {
          const url = new URL(source, window.location.href);
          const host = url.hostname.toLowerCase();
          if (!["www.youtube.com", "youtube.com", "www.youtube-nocookie.com", "youtube-nocookie.com", "player.vimeo.com"].includes(host)) return null;
          element.setAttribute("src", url.href);
          element.setAttribute("title", node.getAttribute("title") || "Video terkait artikel");
          element.setAttribute("loading", "lazy");
          element.setAttribute("allowfullscreen", "");
          element.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
          return element;
        } catch {
          return null;
        }
      }
      const figureHasRepeatedCover = tag === "FIGURE" && [...node.querySelectorAll("img")].some((image) =>
        isRepeatedCover(image.getAttribute("src") || image.getAttribute("data-src") || "")
      );
      const cleaned = cleanChildren(node, element, articles);
      if (figureHasRepeatedCover && !cleaned.querySelector("img")) return null;
      if (tag === "A" && !cleaned.textContent.trim() && !cleaned.querySelector("img, iframe")) return null;
      return cleaned;
    }

    function cleanChildren(source, destination, entries) {
      for (const child of source.childNodes) {
        const clean = cleanNode(child);
        if (clean) destination.append(clean);
      }
      return destination;
    }

    const root = document.createDocumentFragment();
    for (const child of parsed.body.childNodes) {
      const clean = cleanNode(child);
      if (clean) root.append(clean);
    }

    if (continueImportedLists) {
      let singleItemListNumber = 0;
      const blocks = root.querySelectorAll("h1, h2, h3, h4, h5, h6, p, ol");

      for (const block of blocks) {
        if (block.closest("li")) continue;

        if (/^H[1-6]$/.test(block.tagName)) {
          singleItemListNumber = 0;
          continue;
        }

        if (block.tagName === "P") {
          const children = [...block.childNodes].filter((node) =>
            node.nodeType !== Node.TEXT_NODE || node.textContent.trim()
          );
          const isStandaloneBoldHeading = children.length === 1
            && children[0].nodeType === Node.ELEMENT_NODE
            && ["STRONG", "B"].includes(children[0].tagName)
            && !block.textContent.trim().endsWith(":");

          if (isStandaloneBoldHeading) singleItemListNumber = 0;
          continue;
        }

        if (block.tagName !== "OL") continue;

        const listItems = [...block.children].filter((child) => child.tagName === "LI");
        const explicitStart = block.getAttribute("start");
        if (explicitStart !== null) {
          const start = Number(explicitStart);
          singleItemListNumber = Number.isInteger(start) && listItems.length === 1 ? start : 0;
          continue;
        }

        if (listItems.length === 1) {
          singleItemListNumber += 1;
          block.setAttribute("start", String(singleItemListNumber));
        }
      }
    }

    return root;
  }

  function buildCard(article, index) {
    const card = document.createElement("article");
    card.className = "archive-card";
    const href = articleHref(article);
    const cover = safeUrl(article.coverImage, { image: true });
    card.innerHTML = `${cover ? `<a class="archive-card-image" href="${escapeHtml(href)}" tabindex="-1" aria-hidden="true"><img src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async"></a>` : ""}
      <p class="archive-card-meta"><span>${escapeHtml(article.category || "Artikel")}</span><span>${escapeHtml(formatDate(article.date))}</span></p>
      <h2><a href="${escapeHtml(href)}">${escapeHtml(article.title || "Tanpa judul")}</a></h2>
      <p class="archive-card-excerpt">${escapeHtml(article.excerpt || "Baca catatan dan gagasan lengkap dari Coach Ridwan Abadi.")}</p>
      <a class="archive-card-link" href="${escapeHtml(href)}">Baca artikel <span aria-hidden="true">↗</span></a>`;
    card.style.setProperty("--card-order", String(index));
    return card;
  }

  async function loadArticles() {
    try {
      const response = await fetch("data/articles.json", { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`Gagal memuat arsip (${response.status})`);
      const payload = await response.json();
      if (!Array.isArray(payload.articles) || payload.articles.length === 0) throw new Error("Belum ada artikel di arsip.");
      return payload.articles.sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  function initArchive(articles) {
    const list = document.querySelector("#article-list");
    const status = document.querySelector("#article-status");
    const search = document.querySelector("#article-search");
    const yearFilter = document.querySelector("#article-year");
    const loadMore = document.querySelector("#article-load-more");
    const pageSize = 9;
    let visibleCount = pageSize;

    [...new Set(articles.map((article) => String(new Date(article.date).getFullYear())).filter((year) => year !== "NaN"))]
      .sort((a, b) => Number(b) - Number(a))
      .forEach((year) => yearFilter.add(new Option(year, year)));

    function render() {
      const query = search.value.trim().toLocaleLowerCase("id-ID");
      const selectedYear = yearFilter.value;
      const matches = articles.filter((article) => {
        const text = `${article.title} ${article.excerpt} ${article.category} ${(article.tags || []).join(" ")}`.toLocaleLowerCase("id-ID");
        const articleYear = String(new Date(article.date).getFullYear());
        return (!query || text.includes(query)) && (selectedYear === "all" || selectedYear === articleYear);
      });
      const shown = matches.slice(0, visibleCount);
      list.replaceChildren(...shown.map(buildCard));
      status.textContent = matches.length ? `Menampilkan ${shown.length} dari ${matches.length} artikel.` : "Belum ada artikel yang cocok dengan pencarian ini.";
      loadMore.hidden = shown.length >= matches.length;
    }

    search.addEventListener("input", () => { visibleCount = pageSize; render(); });
    yearFilter.addEventListener("change", () => { visibleCount = pageSize; render(); });
    loadMore.addEventListener("click", () => { visibleCount += pageSize; render(); });
    render();
  }

  function initDetail(articles) {
    const slug = new URLSearchParams(window.location.search).get("slug");
    const article = articles.find((entry) => entry.slug === slug);
    const error = document.querySelector("#detail-error");
    if (!article) {
      document.querySelector("#detail-title").textContent = "Tulisan tidak ditemukan";
      document.querySelector("#detail-breadcrumb-title").textContent = "Tidak ditemukan";
      error.hidden = false;
      error.textContent = "Artikel ini tidak tersedia. Silakan kembali ke arsip dan pilih tulisan lain.";
      return;
    }

    document.title = `${article.title} — Ridwan Abadi`;
    document.querySelector('meta[name="description"]').content = article.excerpt || article.title;
    document.querySelector("#detail-category").innerHTML = `<span class="eyebrow-line"></span> ${escapeHtml(article.category || "Artikel")}`;
    document.querySelector("#detail-title").textContent = article.title;
    document.querySelector("#detail-breadcrumb-title").textContent = article.title;
    document.querySelector("#detail-meta").textContent = formatDate(article.date);
    const cover = document.querySelector("#detail-cover");
    const coverUrl = safeUrl(article.featuredImage || article.coverImage, { image: true });
    if (coverUrl) {
      cover.src = coverUrl;
      cover.alt = article.title;
      cover.hidden = false;
    }
    document.querySelector("#detail-content").append(sanitizeContent(
      article.content,
      articles,
      article.featuredImage || article.coverImage,
      Boolean(article.sourceUrl)
    ));

    const position = articles.findIndex((entry) => entry.slug === article.slug);
    const newer = articles[position - 1];
    const older = articles[position + 1];
    const previousLink = document.querySelector("#article-previous");
    const nextLink = document.querySelector("#article-next");
    if (newer) {
      previousLink.href = articleHref(newer);
      previousLink.querySelector("strong").textContent = newer.title;
      previousLink.hidden = false;
    }
    if (older) {
      nextLink.href = articleHref(older);
      nextLink.querySelector("strong").textContent = older.title;
      nextLink.hidden = false;
    }
  }

  loadArticles().then((articles) => {
    if (page === "archive") initArchive(articles);
    if (page === "detail") initDetail(articles);
  }).catch((error) => {
    const status = document.querySelector("#article-status") || document.querySelector("#detail-error");
    if (status) {
      status.hidden = false;
      status.textContent = "Arsip artikel belum dapat dimuat. Coba segarkan halaman beberapa saat lagi.";
    }
    console.error(error);
  });
})();
