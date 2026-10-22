(() => {
  const form = document.querySelector("#article-form");
  if (!form) return;

  const titleInput = document.querySelector("#article-title");
  const slugInput = document.querySelector("#article-slug");
  const dateInput = document.querySelector("#article-date");
  const categoryInput = document.querySelector("#article-category");
  const tagsInput = document.querySelector("#article-tags");
  const excerptInput = document.querySelector("#article-excerpt");
  const coverInput = document.querySelector("#article-cover");
  const coverPreviewWrap = document.querySelector("#cover-preview-wrap");
  const coverPreview = document.querySelector("#cover-preview");
  const contentEditor = document.querySelector("#article-content");
  const status = document.querySelector("#editor-status");
  const saveButton = document.querySelector("#save-article");
  const existingArticleSelect = document.querySelector("#existing-article");
  const newArticleButton = document.querySelector("#new-article");
  const articleStatusInput = document.querySelector("#article-status-select");
  const preview = {
    title: document.querySelector("#preview-title"),
    meta: document.querySelector("#preview-meta"),
    excerpt: document.querySelector("#preview-excerpt"),
    cover: document.querySelector("#preview-cover"),
    content: document.querySelector("#preview-content")
  };

  let coverDataUrl = "";
  let coverObjectUrl = "";
  let currentCoverPath = "";
  let removeCurrentCover = false;
  let editingSlug = "";
  let articleCatalog = [];
  let slugWasEdited = false;
  let statusTimer;

  const plainText = (html) => {
    const parsed = new DOMParser().parseFromString(html || "", "text/html");
    return (parsed.body.textContent || "").replace(/\s+/g, " ").trim();
  };

  const slugify = (value) => value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const formatDate = (value) => {
    if (!value) return "TANGGAL";
    return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" })
      .format(new Date(`${value}T12:00:00`)).toLocaleUpperCase("id-ID");
  };

  function cleanPreview(html) {
    const allowed = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "S", "H2", "H3", "UL", "OL", "LI", "BLOCKQUOTE", "A", "HR", "PRE", "CODE"]);
    const parsed = new DOMParser().parseFromString(`<body>${html || ""}</body>`, "text/html");

    function clean(node) {
      if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || "");
      if (node.nodeType !== Node.ELEMENT_NODE || !allowed.has(node.tagName)) {
        const fragment = document.createDocumentFragment();
        for (const child of node.childNodes || []) {
          const safeChild = clean(child);
          if (safeChild) fragment.append(safeChild);
        }
        return fragment;
      }

      const element = document.createElement(node.tagName.toLowerCase());
      if (node.tagName === "A") {
        try {
          const url = new URL(node.getAttribute("href") || "", window.location.href);
          if (["http:", "https:"].includes(url.protocol)) {
            element.href = url.href;
            element.target = "_blank";
            element.rel = "noopener noreferrer";
          }
        } catch {
          // Keep the preview link as plain text if its URL is invalid.
        }
      }
      for (const child of node.childNodes) {
        const safeChild = clean(child);
        if (safeChild) element.append(safeChild);
      }
      return element;
    }

    const fragment = document.createDocumentFragment();
    for (const child of parsed.body.childNodes) {
      const safeChild = clean(child);
      if (safeChild) fragment.append(safeChild);
    }
    return fragment;
  }

  function sanitizeForEditor(html) {
    const allowed = new Set([
      "P", "BR", "STRONG", "B", "EM", "I", "U", "S", "H2", "H3", "H4", "H5", "H6",
      "UL", "OL", "LI", "BLOCKQUOTE", "FIGURE", "FIGCAPTION", "IMG", "A", "HR", "TABLE",
      "THEAD", "TBODY", "TFOOT", "TR", "TH", "TD", "DIV", "SPAN", "PRE", "CODE", "IFRAME"
    ]);
    const parsed = new DOMParser().parseFromString(`<body>${html || ""}</body>`, "text/html");

    function clean(node) {
      if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || "");
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      if (["SCRIPT", "STYLE", "OBJECT", "FORM", "BUTTON", "INPUT"].includes(node.tagName)) return null;
      if (!allowed.has(node.tagName)) {
        const fragment = document.createDocumentFragment();
        for (const child of node.childNodes) {
          const safeChild = clean(child);
          if (safeChild) fragment.append(safeChild);
        }
        return fragment;
      }

      const element = document.createElement(node.tagName.toLowerCase());
      if (node.tagName === "OL" && /^-?\d+$/.test(node.getAttribute("start") || "")) {
        element.start = Number(node.getAttribute("start"));
      }
      if (node.tagName === "LI" && /^-?\d+$/.test(node.getAttribute("value") || "")) {
        element.value = Number(node.getAttribute("value"));
      }
      if (node.tagName === "A") {
        const href = (node.getAttribute("href") || "").trim();
        const isRelative = /^(?:#|\/|\.\.?\/|[a-z0-9_-]+\.html(?:[?#]|$))/i.test(href);
        try {
          const url = new URL(href, window.location.href);
          if (["http:", "https:", "mailto:", "tel:"].includes(url.protocol) || isRelative) element.setAttribute("href", href);
        } catch {
          // Invalid links are kept as readable text only.
        }
      }
      if (node.tagName === "IMG") {
        const src = (node.getAttribute("src") || "").trim();
        try {
          const url = new URL(src, window.location.href);
          const isLocal = !/^[a-z][a-z\d+.-]*:/i.test(src) || ["http:", "https:"].includes(url.protocol);
          if (!isLocal) return null;
          element.setAttribute("src", src);
          element.setAttribute("alt", node.getAttribute("alt") || "Ilustrasi artikel");
          element.setAttribute("loading", "lazy");
        } catch {
          return null;
        }
      }
      if (node.tagName === "IFRAME") {
        try {
          const url = new URL(node.getAttribute("src") || "", window.location.href);
          if (!["www.youtube.com", "youtube.com", "www.youtube-nocookie.com", "youtube-nocookie.com", "player.vimeo.com"].includes(url.hostname.toLowerCase())) return null;
          element.setAttribute("src", url.href);
          element.setAttribute("title", node.getAttribute("title") || "Video terkait artikel");
          element.setAttribute("loading", "lazy");
          element.setAttribute("allowfullscreen", "");
        } catch {
          return null;
        }
      }
      for (const child of node.childNodes) {
        const safeChild = clean(child);
        if (safeChild) element.append(safeChild);
      }
      if (node.tagName === "A" && !element.hasAttribute("href")) {
        const fragment = document.createDocumentFragment();
        while (element.firstChild) fragment.append(element.firstChild);
        return fragment;
      }
      return element;
    }

    const container = document.createElement("div");
    for (const child of parsed.body.childNodes) {
      const safeChild = clean(child);
      if (Array.isArray(safeChild)) container.append(...safeChild);
      else if (safeChild) container.append(safeChild);
    }
    return container.innerHTML;
  }

  function updatePreview() {
    const category = categoryInput.value.trim() || "Artikel";
    preview.title.textContent = titleInput.value.trim() || "Judul artikel akan muncul di sini";
    preview.meta.innerHTML = "";
    const categoryText = document.createTextNode(category.toLocaleUpperCase("id-ID"));
    const separator = document.createElement("span");
    separator.textContent = "·";
    const dateText = document.createTextNode(formatDate(dateInput.value));
    preview.meta.append(categoryText, separator, dateText);
    preview.excerpt.textContent = excerptInput.value.trim() || plainText(contentEditor.innerHTML).slice(0, 200) || "Ringkasan artikel akan terlihat di arsip.";
    preview.content.replaceChildren(cleanPreview(contentEditor.innerHTML));
    if (!preview.content.textContent.trim()) preview.content.innerHTML = "<p>Pratinjau isi akan muncul di sini saat kamu mulai menulis.</p>";

    if (coverObjectUrl || coverDataUrl || currentCoverPath) {
      preview.cover.src = coverObjectUrl || coverDataUrl || new URL(currentCoverPath, window.location.href).href;
      preview.cover.hidden = false;
    } else {
      preview.cover.removeAttribute("src");
      preview.cover.hidden = true;
    }
  }

  function showStatus(message, state = "") {
    window.clearTimeout(statusTimer);
    status.textContent = message;
    status.dataset.state = state;
    if (state === "success") {
      statusTimer = window.setTimeout(() => {
        if (status.dataset.state === "success") {
          status.dataset.state = "";
          status.textContent = "Pratinjau selalu tersedia sebelum artikel diterbitkan.";
        }
      }, 9000);
    }
  }

  function refreshSaveButton() {
    if (articleStatusInput.value === "draft") {
      saveButton.innerHTML = "Simpan draf <span aria-hidden=\"true\">↗</span>";
    } else if (editingSlug) {
      saveButton.innerHTML = "Simpan perubahan <span aria-hidden=\"true\">↗</span>";
    } else {
      saveButton.innerHTML = "Terbitkan artikel <span aria-hidden=\"true\">↗</span>";
    }
  }

  function refreshArticlePicker(selectedSlug = "") {
    existingArticleSelect.replaceChildren(new Option("Artikel baru", ""));
    for (const article of articleCatalog) {
      const currentStatus = article.status === "draft" ? "Draf" : "Terbit";
      existingArticleSelect.add(new Option(`${currentStatus} · ${article.title}`, article.slug));
    }
    existingArticleSelect.value = selectedSlug;
  }

  function clearCoverState() {
    coverInput.value = "";
    coverDataUrl = "";
    currentCoverPath = "";
    removeCurrentCover = false;
    if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
    coverObjectUrl = "";
    coverPreview.removeAttribute("src");
    coverPreviewWrap.hidden = true;
  }

  function loadArticleIntoForm(article) {
    editingSlug = article.slug;
    existingArticleSelect.value = article.slug;
    titleInput.value = article.title || "";
    slugInput.value = article.slug || "";
    slugInput.readOnly = true;
    dateInput.value = String(article.date || "").slice(0, 10);
    categoryInput.value = article.category || "Artikel";
    tagsInput.value = Array.isArray(article.tags) ? article.tags.join(", ") : "";
    excerptInput.value = article.excerpt || "";
    contentEditor.innerHTML = sanitizeForEditor(article.content || "");
    articleStatusInput.value = article.status === "draft" ? "draft" : "published";
    clearCoverState();
    currentCoverPath = article.coverImage || article.featuredImage || "";
    if (currentCoverPath) {
      coverPreview.src = new URL(currentCoverPath, window.location.href).href;
      coverPreviewWrap.hidden = false;
    }
    slugWasEdited = true;
    document.querySelector(".editor-heading h1").textContent = "Kelola artikel.";
    document.querySelector("#excerpt-hint").textContent = "Ringkasan ini tampil di kartu artikel dan hasil pencarian.";
    showStatus(`Mengedit artikel ${article.status === "draft" ? "draf" : "terbit"} dari arsip lokal.`);
    refreshSaveButton();
    updatePreview();
  }

  function resetForNewArticle() {
    form.reset();
    editingSlug = "";
    slugWasEdited = false;
    slugInput.readOnly = false;
    categoryInput.value = "Artikel";
    articleStatusInput.value = "draft";
    contentEditor.replaceChildren();
    clearCoverState();
    existingArticleSelect.value = "";
    document.querySelector(".editor-heading h1").textContent = "Tulis artikel baru.";
    document.querySelector("#excerpt-hint").textContent = "Boleh dikosongkan; ringkasan bisa dibuat dari isi artikel.";
    setToday();
    showStatus("Draf baru tersimpan lokal dan belum tampil di situs.");
    refreshSaveButton();
    updatePreview();
  }

  async function fetchArticleCatalog(selectedSlug = "") {
    const response = await fetch("/api/articles", { headers: { accept: "application/json" }, cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Arsip lokal tidak dapat dibaca.");
    articleCatalog = Array.isArray(result.articles) ? result.articles : [];
    refreshArticlePicker(selectedSlug);
    return articleCatalog;
  }

  function setToday() {
    const now = new Date();
    dateInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function makeExcerpt() {
    return plainText(contentEditor.innerHTML).slice(0, 220);
  }

  function makeCoverDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Gambar sampul gagal dibaca."));
      reader.readAsDataURL(file);
    });
  }

  titleInput.addEventListener("input", () => {
    if (!slugWasEdited) slugInput.value = slugify(titleInput.value);
    updatePreview();
  });
  slugInput.addEventListener("input", () => {
    slugWasEdited = slugInput.value.length > 0;
    slugInput.value = slugify(slugInput.value);
  });
  articleStatusInput.addEventListener("change", refreshSaveButton);
  existingArticleSelect.addEventListener("change", () => {
    if (!existingArticleSelect.value) {
      resetForNewArticle();
      return;
    }
    const article = articleCatalog.find((entry) => entry.slug === existingArticleSelect.value);
    if (article) loadArticleIntoForm(article);
  });
  newArticleButton.addEventListener("click", resetForNewArticle);
  for (const field of [dateInput, categoryInput, excerptInput]) field.addEventListener("input", updatePreview);
  contentEditor.addEventListener("input", () => {
    if (!excerptInput.value.trim()) updatePreview();
    else updatePreview();
  });

  document.querySelectorAll(".editor-toolbar [data-command]").forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      contentEditor.focus();
      const command = button.dataset.command;
      const value = button.dataset.value || null;
      document.execCommand(command, false, value);
      updatePreview();
    });
  });

  document.querySelector("#insert-link").addEventListener("mousedown", (event) => event.preventDefault());
  document.querySelector("#insert-link").addEventListener("click", () => {
    const href = window.prompt("Tempel URL tautan:", "https://");
    if (!href) return;
    try {
      const url = new URL(href);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Skema URL tidak didukung.");
      contentEditor.focus();
      document.execCommand("createLink", false, url.href);
      updatePreview();
    } catch {
      showStatus("Tautan harus menggunakan alamat http atau https.", "error");
    }
  });

  coverInput.addEventListener("change", async () => {
    const file = coverInput.files?.[0];
    if (!file) return;
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) {
      coverInput.value = "";
      showStatus("Gunakan gambar JPG, PNG, atau WebP.", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      coverInput.value = "";
      showStatus("Ukuran gambar maksimal 5 MB.", "error");
      return;
    }
    if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
    coverObjectUrl = URL.createObjectURL(file);
    try {
      coverDataUrl = await makeCoverDataUrl(file);
    } catch (error) {
      coverInput.value = "";
      showStatus(error.message || "Gambar sampul gagal dibaca.", "error");
      return;
    }
    currentCoverPath = "";
    removeCurrentCover = false;
    coverPreview.src = coverObjectUrl;
    coverPreviewWrap.hidden = false;
    updatePreview();
    showStatus("Sampul siap disimpan di folder aset lokal.");
  });

  document.querySelector("#remove-cover").addEventListener("click", () => {
    clearCoverState();
    removeCurrentCover = Boolean(editingSlug);
    updatePreview();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const content = contentEditor.innerHTML.trim();
    if (!plainText(content)) {
      showStatus("Isi artikel belum diisi.", "error");
      contentEditor.focus();
      return;
    }

    saveButton.disabled = true;
    showStatus(editingSlug ? "Menyimpan perubahan ke arsip lokal…" : "Menyimpan artikel ke arsip lokal…");
    try {
      const response = await fetch(editingSlug ? `/api/articles/${encodeURIComponent(editingSlug)}` : "/api/articles", {
        method: editingSlug ? "PUT" : "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          title: titleInput.value.trim(),
          slug: slugInput.value.trim(),
          date: dateInput.value,
          category: categoryInput.value.trim() || "Artikel",
          tags: tagsInput.value.split(",").map((tag) => tag.trim()).filter(Boolean),
          excerpt: excerptInput.value.trim() || makeExcerpt(),
          content,
          coverDataUrl,
          removeCover: removeCurrentCover,
          status: articleStatusInput.value
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Artikel gagal disimpan.");

      editingSlug = result.slug;
      slugInput.readOnly = true;
      existingArticleSelect.value = result.slug;
      currentCoverPath = result.coverImage || currentCoverPath;
      coverDataUrl = "";
      removeCurrentCover = false;
      if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
      coverObjectUrl = "";
      coverInput.value = "";
      if (currentCoverPath) {
        coverPreview.src = new URL(currentCoverPath, window.location.href).href;
        coverPreviewWrap.hidden = false;
      }
      await fetchArticleCatalog(result.slug);
      document.querySelector(".editor-heading h1").textContent = "Kelola artikel.";
      refreshSaveButton();
      const savedLink = document.querySelector("#saved-article-link");
      if (savedLink) savedLink.remove();
      if (result.status === "published") {
        const viewLink = document.createElement("a");
        viewLink.href = `baca-artikel.html?slug=${encodeURIComponent(result.slug)}`;
        viewLink.className = "text-link";
        viewLink.textContent = "Lihat artikel ↗";
        viewLink.target = "_blank";
        viewLink.rel = "noopener noreferrer";
        viewLink.id = "saved-article-link";
        status.insertAdjacentElement("afterend", viewLink);
      }
      showStatus(result.status === "draft"
        ? "Draf tersimpan di arsip lokal dan belum tampil di halaman publik."
        : `Artikel terbit di arsip lokal. ${result.coverImage ? "Sampul tersimpan di assets/articles." : ""}`, "success");
      updatePreview();
    } catch (error) {
      showStatus(error.message || "Editor tidak bisa menyimpan. Pastikan server lokal sedang berjalan.", "error");
    } finally {
      saveButton.disabled = false;
    }
  });

  setToday();
  refreshSaveButton();
  updatePreview();

  if (!new Set(["localhost", "127.0.0.1"]).has(window.location.hostname)) {
    form.hidden = true;
    showStatus("Editor artikel hanya tersedia lewat server lokal di komputer pemilik situs.", "error");
  } else {
    fetchArticleCatalog().catch((error) => {
      form.hidden = true;
      showStatus(`${error.message} Jalankan node scripts/article-editor-server.mjs lalu buka editor pada alamat yang ditampilkan.`, "error");
    });
  }
})();
