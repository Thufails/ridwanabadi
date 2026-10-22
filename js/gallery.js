(() => {
  const dialog = document.querySelector("#gallery-lightbox");
  if (!dialog) return;

  const cards = [...document.querySelectorAll(".gallery-card")];
  const openers = cards.map((card) => card.querySelector("[data-gallery-open]")).filter(Boolean);
  const image = dialog.querySelector("#lightbox-image");
  const category = dialog.querySelector("#lightbox-category");
  const title = dialog.querySelector("#lightbox-title");
  const description = dialog.querySelector("#lightbox-description");
  const count = dialog.querySelector("#lightbox-count");
  let activeIndex = 0;
  let lastOpener = null;

  function showImage(index) {
    activeIndex = (index + openers.length) % openers.length;
    const card = cards[activeIndex];
    const opener = openers[activeIndex];
    const source = opener.querySelector("img");
    const caption = card.querySelector("figcaption");
    image.src = source.currentSrc || source.src;
    image.alt = source.alt || "Foto galeri";
    category.textContent = caption.querySelector("span")?.textContent.trim() || "Galeri";
    title.textContent = caption.querySelector("h2")?.textContent.trim() || "Dokumentasi";
    description.textContent = caption.querySelector("p")?.textContent.trim() || "";
    count.textContent = `${String(activeIndex + 1).padStart(2, "0")} / ${String(openers.length).padStart(2, "0")}`;
  }

  function openImage(index, opener) {
    lastOpener = opener;
    showImage(index);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    dialog.querySelector("[data-lightbox-close]").focus();
  }

  openers.forEach((opener, index) => {
    opener.addEventListener("click", () => openImage(index, opener));
  });

  dialog.querySelector("[data-lightbox-close]").addEventListener("click", () => dialog.close());
  dialog.querySelector("[data-lightbox-previous]").addEventListener("click", () => showImage(activeIndex - 1));
  dialog.querySelector("[data-lightbox-next]").addEventListener("click", () => showImage(activeIndex + 1));

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showImage(activeIndex - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      showImage(activeIndex + 1);
    }
  });

  dialog.addEventListener("close", () => {
    if (lastOpener?.isConnected) lastOpener.focus();
  });
})();
