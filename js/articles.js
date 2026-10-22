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

  function tagsFor(article) {
    if (Array.isArray(article.tags) && article.tags.length) return article.tags.map((tag) => String(tag).trim()).filter(Boolean);
    const plainText = new DOMParser().parseFromString(article.content || "", "text/html").body.textContent || "";
    return [...new Set((plainText.match(/#[\p{L}\p{N}_-]{2,}/gu) || []).map((tag) => tag.replace(/^#/, "")))];
  }

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
      const articles = payload.articles
        .filter((article) => article.status !== "draft")
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      articles.forEach((article) => { article.displayTags = tagsFor(article); });
      return articles;
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
    const categoryFilter = document.querySelector("#article-category-filter");
    const tagFilter = document.querySelector("#article-tag-filter");
    const loadMore = document.querySelector("#article-load-more");
    const pageSize = 9;
    let visibleCount = pageSize;

    [...new Set(articles.map((article) => String(new Date(article.date).getFullYear())).filter((year) => year !== "NaN"))]
      .sort((a, b) => Number(b) - Number(a))
      .forEach((year) => yearFilter.add(new Option(year, year)));

    [...new Set(articles.map((article) => String(article.category || "Artikel").trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "id"))
      .forEach((category) => categoryFilter.add(new Option(category, category)));

    [...new Set(articles.flatMap((article) => article.displayTags))]
      .sort((a, b) => a.localeCompare(b, "id"))
      .forEach((tag) => tagFilter.add(new Option(tag, tag)));

    function render() {
      const query = search.value.trim().toLocaleLowerCase("id-ID");
      const selectedYear = yearFilter.value;
      const selectedCategory = categoryFilter.value;
      const selectedTag = tagFilter.value.toLocaleLowerCase("id-ID");
      const matches = articles.filter((article) => {
        const tags = article.displayTags;
        const text = `${article.title} ${article.excerpt} ${article.category} ${tags.join(" ")}`.toLocaleLowerCase("id-ID");
        const articleYear = String(new Date(article.date).getFullYear());
        return (!query || text.includes(query))
          && (selectedYear === "all" || selectedYear === articleYear)
          && (selectedCategory === "all" || article.category === selectedCategory)
          && (selectedTag === "all" || tags.some((tag) => String(tag).toLocaleLowerCase("id-ID") === selectedTag));
      });
      const shown = matches.slice(0, visibleCount);
      list.replaceChildren(...shown.map(buildCard));
      status.textContent = matches.length ? `Menampilkan ${shown.length} dari ${matches.length} artikel.` : "Belum ada artikel yang cocok dengan pencarian ini.";
      loadMore.hidden = shown.length >= matches.length;
    }

    search.addEventListener("input", () => { visibleCount = pageSize; render(); });
    yearFilter.addEventListener("change", () => { visibleCount = pageSize; render(); });
    categoryFilter.addEventListener("change", () => { visibleCount = pageSize; render(); });
    tagFilter.addEventListener("change", () => { visibleCount = pageSize; render(); });
    loadMore.addEventListener("click", () => { visibleCount += pageSize; render(); });
    render();
  }

  function slugifyHeading(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("id-ID")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "bagian";
  }

  function createTableOfContents(content) {
    const toc = document.querySelector("#article-toc");
    const list = document.querySelector("#article-toc-list");
    const headings = [...content.querySelectorAll("h2, h3")].filter((heading) => heading.textContent.trim());
    if (headings.length < 3) {
      const boldParagraphs = [...content.querySelectorAll("p")].filter((paragraph) => {
        const children = [...paragraph.childNodes].filter((node) => node.nodeType !== Node.TEXT_NODE || node.textContent.trim());
        if (children.length !== 1 || children[0].nodeType !== Node.ELEMENT_NODE || !["STRONG", "B"].includes(children[0].tagName)) return false;
        const text = paragraph.textContent.trim();
        return text.length >= 4 && text.length <= 90 && !/[.:;]$/.test(text);
      });
      for (const paragraph of boldParagraphs) {
        paragraph.classList.add("article-toc-derived-heading");
        headings.push(paragraph);
      }
    }
    if (headings.length < 3) return;

    const usedIds = new Set();
    for (const heading of headings) {
      const baseId = slugifyHeading(heading.textContent);
      let id = baseId;
      let suffix = 2;
      while (usedIds.has(id) || document.getElementById(id)) id = `${baseId}-${suffix++}`;
      usedIds.add(id);
      heading.id = id;

      const item = document.createElement("li");
      if (heading.tagName === "H3") item.className = "article-toc-subitem";
      const link = document.createElement("a");
      link.href = `#${id}`;
      link.textContent = heading.textContent.trim();
      item.append(link);
      list.append(item);
    }
    toc.hidden = false;
  }

  function readingTime(content) {
    const words = (content.textContent || "").trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 200));
  }

  function buildRelatedCard(article, index) {
    const card = document.createElement("article");
    card.className = "related-article-card";
    const href = articleHref(article);
    const cover = safeUrl(article.coverImage || article.featuredImage, { image: true });
    card.innerHTML = `${cover ? `<a class="related-article-image" href="${escapeHtml(href)}" tabindex="-1" aria-hidden="true"><img src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async"></a>` : ""}
      <p class="archive-card-meta"><span>${escapeHtml(article.category || "Artikel")}</span><span>${escapeHtml(formatDate(article.date))}</span></p>
      <h3><a href="${escapeHtml(href)}">${escapeHtml(article.title || "Tanpa judul")}</a></h3>
      <p>${escapeHtml(article.excerpt || "Baca gagasan lengkap dari Coach Ridwan Abadi.")}</p>
      <a class="archive-card-link" href="${escapeHtml(href)}">Baca artikel <span aria-hidden="true">↗</span></a>`;
    card.style.setProperty("--card-order", String(index));
    return card;
  }

  function showRelatedArticles(article, articles) {
    const section = document.querySelector("#related-articles");
    const list = document.querySelector("#related-articles-list");
    const articleTags = new Set(article.displayTags.map((tag) => String(tag).toLocaleLowerCase("id-ID")));
    const related = articles
      .filter((entry) => entry.slug !== article.slug)
      .map((entry) => {
        const sharedTags = entry.displayTags
          .filter((tag) => articleTags.has(String(tag).toLocaleLowerCase("id-ID"))).length;
        const sameCategory = Boolean(article.category && entry.category === article.category);
        return { entry, score: sharedTags * 3 + (sameCategory ? 1 : 0) };
      })
      .sort((a, b) => b.score - a.score || new Date(b.entry.date) - new Date(a.entry.date))
      .slice(0, 3)
      .map(({ entry }) => entry);
    if (!related.length) return;
    list.replaceChildren(...related.map(buildRelatedCard));
    section.hidden = false;
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
    document.querySelector("#detail-date").textContent = formatDate(article.date);
    const cover = document.querySelector("#detail-cover");
    const coverUrl = safeUrl(article.featuredImage || article.coverImage, { image: true });
    if (coverUrl) {
      cover.src = coverUrl;
      cover.alt = article.title;
      cover.hidden = false;
    }
    const content = document.querySelector("#detail-content");
    content.append(sanitizeContent(
      article.content,
      articles,
      article.featuredImage || article.coverImage,
      Boolean(article.sourceUrl)
    ));
    const minutes = readingTime(content);
    document.querySelector("#detail-reading-time").textContent = `${minutes} menit baca`;
    createTableOfContents(content);
    showRelatedArticles(article, articles);

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
