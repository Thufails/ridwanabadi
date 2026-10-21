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
  const preview = {
    title: document.querySelector("#preview-title"),
    meta: document.querySelector("#preview-meta"),
    excerpt: document.querySelector("#preview-excerpt"),
    cover: document.querySelector("#preview-cover"),
    content: document.querySelector("#preview-content")
  };

  let coverDataUrl = "";
  let coverObjectUrl = "";
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

    if (coverObjectUrl || coverDataUrl) {
      preview.cover.src = coverObjectUrl || coverDataUrl;
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
          status.textContent = "Simpan akan langsung menambahkan artikel ke arsip lokal.";
        }
      }, 9000);
    }
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
    coverDataUrl = await makeCoverDataUrl(file);
    coverPreview.src = coverObjectUrl;
    coverPreviewWrap.hidden = false;
    updatePreview();
    showStatus("Sampul siap disimpan di folder aset lokal.");
  });

  document.querySelector("#remove-cover").addEventListener("click", () => {
    coverInput.value = "";
    coverDataUrl = "";
    if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
    coverObjectUrl = "";
    coverPreview.removeAttribute("src");
    coverPreviewWrap.hidden = true;
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
    showStatus("Menyimpan artikel ke arsip lokal…");
    try {
      const response = await fetch("/api/articles", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          title: titleInput.value.trim(),
          slug: slugInput.value.trim(),
          date: dateInput.value,
          category: categoryInput.value.trim() || "Artikel",
          tags: tagsInput.value.split(",").map((tag) => tag.trim()).filter(Boolean),
          excerpt: excerptInput.value.trim() || makeExcerpt(),
          content,
          coverDataUrl
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Artikel gagal disimpan.");

      showStatus(`Artikel tersimpan di arsip lokal. ${result.coverImage ? "Sampul juga tersimpan di assets/articles." : ""}`, "success");
      const viewLink = document.createElement("a");
      viewLink.href = `baca-artikel.html?slug=${encodeURIComponent(result.slug)}`;
      viewLink.className = "text-link";
      viewLink.textContent = "Lihat artikel ↗";
      viewLink.target = "_blank";
      viewLink.rel = "noopener noreferrer";
      const existing = document.querySelector("#saved-article-link");
      if (existing) existing.remove();
      viewLink.id = "saved-article-link";
      status.insertAdjacentElement("afterend", viewLink);
      form.reset();
      slugWasEdited = false;
      categoryInput.value = "Artikel";
      contentEditor.replaceChildren();
      coverInput.value = "";
      coverDataUrl = "";
      if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
      coverObjectUrl = "";
      coverPreviewWrap.hidden = true;
      coverPreview.removeAttribute("src");
      const now = new Date();
      dateInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      updatePreview();
    } catch (error) {
      showStatus(error.message || "Editor tidak bisa menyimpan. Pastikan server lokal sedang berjalan.", "error");
    } finally {
      saveButton.disabled = false;
    }
  });

  const today = new Date();
  dateInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  updatePreview();

  if (!new Set(["localhost", "127.0.0.1"]).has(window.location.hostname)) {
    form.hidden = true;
    showStatus("Editor artikel hanya tersedia lewat server lokal di komputer pemilik situs.", "error");
  }
})();
