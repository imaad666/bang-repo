async function loadPhotos() {
  const res = await fetch(`/api/photos?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load photos: ${res.status}`);
  const { photos } = await res.json();

  return photos.map((p) => ({ ...p, date: new Date(p.date) }));
}

let photos = [];
let isAdmin = false;
let adminMode = null; // null | "add" | "edit"
let editingPhotoId = null;
let extractedGps = null;

const archiveEl = document.getElementById("archive");
const yearSwitcherEl = document.getElementById("yearSwitcher");
const yearSwitcherTriggerEl = document.getElementById("yearSwitcherTrigger");
const yearSwitcherValueEl = document.getElementById("yearSwitcherValue");
const yearSwitcherMenuEl = document.getElementById("yearSwitcherMenu");
const adminDock = document.getElementById("adminDock");

let selectedYear = "all";
let yearSwitcherOpen = false;
const adminAddBtn = document.getElementById("adminAddBtn");
const adminLogoutBtn = document.getElementById("adminLogoutBtn");
const adminSheet = document.getElementById("adminSheet");
const adminSheetBackdrop = document.getElementById("adminSheetBackdrop");
const adminSheetClose = document.getElementById("adminSheetClose");
const adminSheetTitle = document.getElementById("adminSheetTitle");
const adminForm = document.getElementById("adminForm");
const adminFileField = document.getElementById("adminFileField");
const adminFile = document.getElementById("adminFile");
const adminPreview = document.getElementById("adminPreview");
const adminTitle = document.getElementById("adminTitle");
const adminDate = document.getElementById("adminDate");
const adminLocation = document.getElementById("adminLocation");
const adminNote = document.getElementById("adminNote");
const adminSubmitBtn = document.getElementById("adminSubmitBtn");
const adminFormMessage = document.getElementById("adminFormMessage");

let openNoteFigure = null;
let openModalPhotoId = null;
let openSourceImg = null;
let openSourceCaption = null;
let lightboxAnimating = false;
let flyBundleEl = null;
let flyEl = null;
let captionFlyEl = null;

let modalEl = null;
let modalImg = null;
let modalTopTitleEl = null;
let modalTopMetaEl = null;
let modalNoteEl = null;
let modalErrorEl = null;

function uniqueYears() {
  return Array.from(new Set(photos.map((p) => p.year))).sort((a, b) => a - b);
}

function groupByYear() {
  const map = new Map();
  for (const p of photos) {
    if (!map.has(p.year)) map.set(p.year, []);
    map.get(p.year).push(p);
  }
  for (const yearPhotos of map.values()) {
    yearPhotos.sort((a, b) => a.date - b.date);
  }
  return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
}

function yearOptionValues() {
  return ["all", ...uniqueYears().map((y) => String(y))];
}

function setYearSwitcherLabel(year) {
  if (yearSwitcherValueEl) yearSwitcherValueEl.textContent = year;
}

function syncYearSwitcherActive() {
  if (!yearSwitcherMenuEl) return;
  for (const btn of yearSwitcherMenuEl.querySelectorAll(".yearSwitcherOption")) {
    const active = btn.dataset.value === selectedYear;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  }
}

function closeYearSwitcher({ restoreFocus = false } = {}) {
  if (!yearSwitcherOpen) return;
  yearSwitcherOpen = false;
  yearSwitcherTriggerEl?.setAttribute("aria-expanded", "false");
  yearSwitcherMenuEl?.classList.add("hidden");
  if (restoreFocus) yearSwitcherTriggerEl?.focus();
}

function openYearSwitcher() {
  if (!yearSwitcherMenuEl || !yearSwitcherTriggerEl) return;
  if (!yearSwitcherMenuEl.children.length) return;
  yearSwitcherOpen = true;
  yearSwitcherTriggerEl.setAttribute("aria-expanded", "true");
  yearSwitcherMenuEl.classList.remove("hidden");
  const active =
    yearSwitcherMenuEl.querySelector(".yearSwitcherOption.is-active") ||
    yearSwitcherMenuEl.querySelector(".yearSwitcherOption");
  active?.focus();
}

function toggleYearSwitcher() {
  if (yearSwitcherOpen) closeYearSwitcher();
  else openYearSwitcher();
}

function selectYear(year, { closeUI = true } = {}) {
  selectedYear = year || "all";
  setYearSwitcherLabel(selectedYear);
  syncYearSwitcherActive();
  if (closeUI) closeUIForFilterChange();
  applyYearFilter(selectedYear);
  closeYearSwitcher();
}

function buildYearOptions() {
  if (!yearSwitcherMenuEl) return;
  const frag = document.createDocumentFragment();

  for (const value of yearOptionValues()) {
    const li = document.createElement("li");
    li.setAttribute("role", "presentation");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "yearSwitcherOption";
    btn.dataset.value = value;
    btn.textContent = value;
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-selected", value === selectedYear ? "true" : "false");
    if (value === selectedYear) btn.classList.add("is-active");

    btn.addEventListener("click", () => {
      selectYear(value);
    });

    li.appendChild(btn);
    frag.appendChild(li);
  }

  yearSwitcherMenuEl.replaceChildren(frag);
  setYearSwitcherLabel(selectedYear);
  syncYearSwitcherActive();
}

function focusYearOptionByOffset(offset) {
  const options = [...(yearSwitcherMenuEl?.querySelectorAll(".yearSwitcherOption") || [])];
  if (!options.length) return;
  const current = document.activeElement;
  let index = options.indexOf(current);
  if (index < 0) index = options.findIndex((o) => o.dataset.value === selectedYear);
  if (index < 0) index = 0;
  const next = options[(index + offset + options.length) % options.length];
  next?.focus();
}

function closeAllNotes() {
  if (!openNoteFigure) return;
  openNoteFigure.classList.remove("openNote");
  openNoteFigure = null;
}

function ensureModal() {
  if (modalEl) return;

  modalEl = document.createElement("div");
  modalEl.className = "modalOverlay hidden";
  modalEl.setAttribute("role", "dialog");
  modalEl.setAttribute("aria-modal", "true");
  modalEl.setAttribute("aria-label", "Photo");

  // Tap anywhere in the focus view to dismiss (Close still works too).
  modalEl.addEventListener("click", (e) => {
    if (e.target.closest(".modalClose")) return;
    closeModal();
  });

  const panel = document.createElement("div");
  panel.className = "modalPanel";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "modalClose";
  closeBtn.textContent = "Close";
  closeBtn.setAttribute("aria-label", "Close photo");
  closeBtn.addEventListener("click", () => closeModal());

  const imageWrap = document.createElement("div");
  imageWrap.className = "modalImageWrap";

  modalImg = document.createElement("img");
  modalImg.loading = "eager";
  modalImg.decoding = "async";
  modalImg.alt = "";

  imageWrap.appendChild(modalImg);

  modalErrorEl = document.createElement("div");
  modalErrorEl.className = "imageError hidden";
  modalErrorEl.textContent = "This photo couldn't be decoded in your browser.";
  imageWrap.appendChild(modalErrorEl);

  const caption = document.createElement("div");
  caption.className = "modalCaption";

  modalTopTitleEl = document.createElement("div");
  modalTopTitleEl.className = "modalTitle";
  modalTopMetaEl = document.createElement("div");
  modalTopMetaEl.className = "captionDate";

  caption.appendChild(modalTopTitleEl);
  caption.appendChild(modalTopMetaEl);

  modalNoteEl = document.createElement("div");
  modalNoteEl.className = "modalNote hidden";

  panel.appendChild(closeBtn);
  panel.appendChild(imageWrap);
  panel.appendChild(caption);
  panel.appendChild(modalNoteEl);

  modalEl.appendChild(panel);
  document.body.appendChild(modalEl);
}


function updateModalNoteForPhoto(photo) {
  if (!modalEl || modalEl.classList.contains("hidden")) return;

  const shouldShow = openNoteFigure && openNoteFigure.dataset.photoId === photo.id;
  if (!shouldShow) {
    modalNoteEl.classList.add("hidden");
    return;
  }

  modalNoteEl.textContent = photo.note;
  modalNoteEl.classList.remove("hidden");
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clearFly() {
  if (flyBundleEl) {
    flyBundleEl.querySelectorAll("*").forEach((el) => {
      el.getAnimations().forEach((a) => a.cancel());
    });
    flyBundleEl.getAnimations().forEach((a) => a.cancel());
    flyBundleEl.remove();
  }
  flyBundleEl = null;
  flyEl = null;
  captionFlyEl = null;
}

function lockFlyerType(flyer, sampleRoot) {
  if (!flyer || !sampleRoot) return;
  const titleEl = flyer.querySelector(".lightboxCaptionFly-title");
  const dateEl = flyer.querySelector(".lightboxCaptionFly-date");
  const titleSample =
    sampleRoot.querySelector(".titleButton, .modalTitle") || sampleRoot;
  const dateSample = sampleRoot.querySelector(".captionDate");

  if (titleEl && titleSample) {
    const cs = getComputedStyle(titleSample);
    Object.assign(titleEl.style, {
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      fontStyle: cs.fontStyle,
      letterSpacing: cs.letterSpacing,
      lineHeight: cs.lineHeight,
    });
  }
  if (dateEl && dateSample) {
    const cs = getComputedStyle(dateSample);
    Object.assign(dateEl.style, {
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      fontStyle: cs.fontStyle,
      letterSpacing: cs.letterSpacing,
      lineHeight: cs.lineHeight,
      marginTop: cs.marginTop,
    });
  }
}

function captionGap(imgRect, captionRect) {
  if (!imgRect || !captionRect) return 12;
  return Math.max(0, captionRect.top - (imgRect.top + imgRect.height));
}

function waitForImage(img) {
  if (img.complete && img.naturalWidth > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      img.removeEventListener("load", done);
      img.removeEventListener("error", done);
      resolve();
    };
    img.addEventListener("load", done);
    img.addEventListener("error", done);
  });
}

function copyRect(r) {
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

// Keep in step with --lightbox-duration / --lightbox-ease / --lightbox-chrome.
const LIGHTBOX_MS = 460;
const LIGHTBOX_EASE = "cubic-bezier(0.33, 0, 0.2, 1)";
const LIGHTBOX_CHROME_MS = 280;

function placeFlyBundle(
  imgRect,
  src,
  alt,
  {
    soft = true,
    title = "",
    dateLabel = "",
    light = false,
    sampleRoot = null,
    gap = 12,
  } = {}
) {
  clearFly();

  flyBundleEl = document.createElement("div");
  flyBundleEl.className = "lightboxFlyBundle";

  flyEl = document.createElement("div");
  flyEl.className = "lightboxFly";
  if (!soft) flyEl.classList.add("is-full");

  const softImg = document.createElement("img");
  softImg.className = "lightboxFly-img lightboxFly-soft";
  softImg.src = src;
  softImg.alt = alt || "";
  softImg.decoding = "sync";
  softImg.draggable = false;

  const sharpImg = document.createElement("img");
  sharpImg.className = "lightboxFly-img lightboxFly-sharp";
  sharpImg.src = src;
  sharpImg.alt = "";
  sharpImg.decoding = "sync";
  sharpImg.draggable = false;
  sharpImg.setAttribute("aria-hidden", "true");

  flyEl.appendChild(sharpImg);
  flyEl.appendChild(softImg);
  flyEl.style.height = `${imgRect.height}px`;

  captionFlyEl = document.createElement("div");
  captionFlyEl.className = "lightboxCaptionFly" + (light ? " is-light" : "");

  const titleEl = document.createElement("div");
  titleEl.className = "lightboxCaptionFly-title";
  titleEl.textContent = title;

  const dateEl = document.createElement("div");
  dateEl.className = "lightboxCaptionFly-date";
  dateEl.textContent = dateLabel;

  captionFlyEl.appendChild(titleEl);
  captionFlyEl.appendChild(dateEl);
  captionFlyEl.style.marginTop = `${gap}px`;

  flyBundleEl.appendChild(flyEl);
  flyBundleEl.appendChild(captionFlyEl);

  // Bundle is laid out in pixels — the photo box grows via width/height,
  // while the caption sits under it with no transform, so type can't scale.
  Object.assign(flyBundleEl.style, {
    left: `${imgRect.left}px`,
    top: `${imgRect.top}px`,
    width: `${imgRect.width}px`,
  });

  document.body.appendChild(flyBundleEl);
  if (sampleRoot) lockFlyerType(captionFlyEl, sampleRoot);
  return flyBundleEl;
}

function fadeFlyOut() {
  if (!flyBundleEl || prefersReducedMotion()) return Promise.resolve();
  const fade = flyBundleEl.animate(
    [{ opacity: 1 }, { opacity: 0 }],
    { duration: 120, easing: "ease-out", fill: "forwards" }
  );
  return fade.finished.catch(() => { });
}

async function morphFlyBundle(
  fromRect,
  toRect,
  { revealFull = false, toLight = true, fromGap = 12, toGap = 14 } = {}
) {
  if (!flyBundleEl || !flyEl) return;

  Object.assign(flyBundleEl.style, {
    left: `${fromRect.left}px`,
    top: `${fromRect.top}px`,
    width: `${fromRect.width}px`,
  });
  flyEl.style.height = `${fromRect.height}px`;
  if (captionFlyEl) {
    captionFlyEl.style.marginTop = `${fromGap}px`;
    captionFlyEl.classList.toggle("is-light", !toLight);
  }

  if (prefersReducedMotion()) {
    Object.assign(flyBundleEl.style, {
      left: `${toRect.left}px`,
      top: `${toRect.top}px`,
      width: `${toRect.width}px`,
    });
    flyEl.style.height = `${toRect.height}px`;
    if (captionFlyEl) {
      captionFlyEl.style.marginTop = `${toGap}px`;
      captionFlyEl.classList.toggle("is-light", toLight);
    }
    flyEl.classList.toggle("is-full", revealFull);
    return;
  }

  await nextFrame();

  const opts = { duration: LIGHTBOX_MS, easing: LIGHTBOX_EASE, fill: "forwards" };
  const soft = flyEl.querySelector(".lightboxFly-soft");
  const sharp = flyEl.querySelector(".lightboxFly-sharp");

  const anims = [
    flyBundleEl.animate(
      [
        {
          left: `${fromRect.left}px`,
          top: `${fromRect.top}px`,
          width: `${fromRect.width}px`,
        },
        {
          left: `${toRect.left}px`,
          top: `${toRect.top}px`,
          width: `${toRect.width}px`,
        },
      ],
      opts
    ),
    flyEl.animate(
      [{ height: `${fromRect.height}px` }, { height: `${toRect.height}px` }],
      opts
    ),
  ];

  if (captionFlyEl) {
    anims.push(
      captionFlyEl.animate(
        [{ marginTop: `${fromGap}px` }, { marginTop: `${toGap}px` }],
        opts
      )
    );

    const titleEl = captionFlyEl.querySelector(".lightboxCaptionFly-title");
    const dateEl = captionFlyEl.querySelector(".lightboxCaptionFly-date");
    const darkTitle = "rgb(17, 17, 17)";
    const lightTitle = "rgba(255, 255, 255, 0.92)";
    const darkDate = "rgb(136, 136, 136)";
    const lightDate = "rgba(255, 255, 255, 0.5)";
    if (titleEl) {
      anims.push(
        titleEl.animate(
          [
            { color: toLight ? darkTitle : lightTitle },
            { color: toLight ? lightTitle : darkTitle },
          ],
          opts
        )
      );
    }
    if (dateEl) {
      anims.push(
        dateEl.animate(
          [
            { color: toLight ? darkDate : lightDate },
            { color: toLight ? lightDate : darkDate },
          ],
          opts
        )
      );
    }
  }

  if (soft && sharp) {
    anims.push(
      soft.animate(
        [{ opacity: revealFull ? 1 : 0 }, { opacity: revealFull ? 0 : 1 }],
        opts
      ),
      sharp.animate(
        [{ opacity: revealFull ? 0 : 1 }, { opacity: revealFull ? 1 : 0 }],
        opts
      )
    );
  }

  await Promise.all(anims.map((a) => a.finished.catch(() => { })));

  Object.assign(flyBundleEl.style, {
    left: `${toRect.left}px`,
    top: `${toRect.top}px`,
    width: `${toRect.width}px`,
  });
  flyEl.style.height = `${toRect.height}px`;
  if (captionFlyEl) {
    captionFlyEl.style.marginTop = `${toGap}px`;
    captionFlyEl.classList.toggle("is-light", toLight);
  }
  anims.forEach((a) => a.cancel());
}

async function openModalForPhoto(photo, sourceImg) {
  if (lightboxAnimating) return;
  ensureModal();

  lightboxAnimating = true;
  openModalPhotoId = photo.id;
  openSourceImg = sourceImg || null;
  openSourceCaption =
    openSourceImg?.closest("figure")?.querySelector(".caption") || null;

  const src = photo.src;
  const thumbSrc = openSourceImg?.currentSrc || openSourceImg?.src || src;

  modalTopTitleEl.textContent = photo.title;
  modalTopMetaEl.textContent = photo.dateLabel;
  modalImg.src = src;
  modalImg.alt = photo.alt;
  // Reset any previous forced size from an earlier open.
  modalImg.style.width = "";
  modalImg.style.height = "";
  modalImg.style.maxWidth = "";
  modalImg.style.maxHeight = "";
  updateModalNoteForPhoto(photo);

  if (modalErrorEl) modalErrorEl.classList.add("hidden");

  const fromRect = openSourceImg ? copyRect(openSourceImg.getBoundingClientRect()) : null;
  const fromCaptionRect = openSourceCaption
    ? copyRect(openSourceCaption.getBoundingClientRect())
    : null;

  const fromGap = captionGap(fromRect, fromCaptionRect);

  if (fromRect && openSourceImg) {
    openSourceImg.classList.add("is-lightboxSource");
    if (openSourceCaption) openSourceCaption.classList.add("is-lightboxSource");
    placeFlyBundle(fromRect, thumbSrc, photo.alt, {
      soft: true,
      title: photo.title,
      dateLabel: photo.dateLabel,
      light: false,
      sampleRoot: openSourceCaption,
      gap: fromGap,
    });
  }

  modalEl.classList.remove("hidden", "is-closing");
  modalEl.classList.add("is-expanding", "is-chrome-hidden");
  const scrollbarWidth = archiveEl
    ? archiveEl.offsetWidth - archiveEl.clientWidth
    : window.innerWidth - document.documentElement.clientWidth;
  document.body.style.overflow = "hidden";
  document.body.style.paddingRight = scrollbarWidth ? `${scrollbarWidth}px` : "";
  if (archiveEl) {
    archiveEl.style.overflow = "hidden";
    archiveEl.style.paddingRight = scrollbarWidth ? `${scrollbarWidth}px` : "";
  }

  await nextFrame();
  modalEl.classList.add("is-dimmed");

  try {
    await waitForImage(modalImg);

    // Lay out the real lightbox (image invisible) and morph INTO its actual box.
    // This avoids the end-of-animation jump from a guessed destination rect.
    modalEl.classList.add("is-open");
    await nextFrame();
    await nextFrame();

    const toRect = copyRect(modalImg.getBoundingClientRect());
    const captionEl = modalEl.querySelector(".modalCaption");
    const toCaptionRect = captionEl
      ? copyRect(captionEl.getBoundingClientRect())
      : null;
    const toGap = captionGap(toRect, toCaptionRect);

    if (!fromRect || !flyBundleEl || prefersReducedMotion() || toRect.width < 2) {
      modalEl.classList.remove("is-expanding", "is-chrome-hidden");
      clearFly();
      lightboxAnimating = false;
      return;
    }

    // Close fades in late; title/date ride under the photo in the bundle.
    const chromeTimer = window.setTimeout(() => {
      modalEl.classList.remove("is-chrome-hidden");
      if (captionEl) captionEl.style.opacity = "0";
      if (modalNoteEl) modalNoteEl.style.opacity = "0";
    }, Math.max(0, LIGHTBOX_MS - LIGHTBOX_CHROME_MS));

    try {
      await morphFlyBundle(fromRect, toRect, {
        revealFull: true,
        toLight: true,
        fromGap,
        toGap,
      });
    } finally {
      window.clearTimeout(chromeTimer);
    }

    if (captionEl) captionEl.style.opacity = "";
    if (modalNoteEl) modalNoteEl.style.opacity = "";
    modalEl.classList.remove("is-expanding", "is-chrome-hidden");
    await nextFrame();
    await fadeFlyOut();
    clearFly();
  } catch (e) {
    console.error(e);
    modalEl.classList.add("is-open");
    modalEl.classList.remove("is-expanding", "is-chrome-hidden");
    clearFly();
  }

  lightboxAnimating = false;
}

async function closeModal() {
  if (!modalEl || modalEl.classList.contains("hidden") || lightboxAnimating) return;

  const sourceImg = openSourceImg;
  const sourceCaption = openSourceCaption;
  openModalPhotoId = null;
  lightboxAnimating = true;

  const finish = () => {
    modalEl.classList.add("hidden");
    modalEl.classList.remove("is-open", "is-expanding", "is-dimmed", "is-closing", "is-chrome-hidden");
    modalImg.style.width = "";
    modalImg.style.height = "";
    modalImg.style.maxWidth = "";
    modalImg.style.maxHeight = "";
    if (modalEl.querySelector(".modalCaption")) {
      modalEl.querySelector(".modalCaption").style.opacity = "";
    }
    if (modalNoteEl) modalNoteEl.style.opacity = "";
    document.body.style.overflow = "";
    document.body.style.paddingRight = "";
    if (archiveEl) {
      archiveEl.style.overflow = "";
      archiveEl.style.paddingRight = "";
    }
    if (sourceImg) sourceImg.classList.remove("is-lightboxSource");
    if (sourceCaption) sourceCaption.classList.remove("is-lightboxSource");
    // Drop focus so the browser doesn't draw a selection ring on the thumbnail.
    const focusEl = sourceImg?.closest("button") || document.activeElement;
    if (focusEl && typeof focusEl.blur === "function") focusEl.blur();
    openSourceImg = null;
    openSourceCaption = null;
    clearFly();
    lightboxAnimating = false;
  };

  if (!sourceImg || prefersReducedMotion()) {
    modalEl.classList.remove("is-open", "is-dimmed");
    finish();
    return;
  }

  const fromRect = copyRect(modalImg.getBoundingClientRect());
  const toRect = copyRect(sourceImg.getBoundingClientRect());
  const captionEl = modalEl.querySelector(".modalCaption");
  const fromCaptionRect = captionEl
    ? copyRect(captionEl.getBoundingClientRect())
    : null;
  const toCaptionRect = sourceCaption
    ? copyRect(sourceCaption.getBoundingClientRect())
    : null;
  const src = modalImg.currentSrc || modalImg.src;
  const title = modalTopTitleEl?.textContent || "";
  const dateLabel = modalTopMetaEl?.textContent || "";

  const fromGap = captionGap(fromRect, fromCaptionRect);
  const toGap = captionGap(toRect, toCaptionRect);

  if (sourceCaption) sourceCaption.classList.add("is-lightboxSource");
  placeFlyBundle(fromRect, src, modalImg.alt, {
    soft: false,
    title,
    dateLabel,
    light: true,
    sampleRoot: captionEl,
    gap: fromGap,
  });

  // Dim and chrome ease out with the flight; photo/caption are covered by the bundle.
  modalEl.classList.add("is-expanding", "is-closing", "is-chrome-hidden");
  modalEl.classList.remove("is-open", "is-dimmed");

  try {
    await morphFlyBundle(fromRect, toRect, {
      revealFull: false,
      toLight: false,
      fromGap,
      toGap,
    });
    sourceImg.classList.remove("is-lightboxSource");
    if (sourceCaption) sourceCaption.classList.remove("is-lightboxSource");
    await fadeFlyOut();
  } catch (e) {
    // ignore
  }
  finish();
}

function createPhotoFigure(photo) {
  const figure = document.createElement("figure");
  figure.className = "photoFigure";
  figure.dataset.photoId = photo.id;

  const thumbBtn = document.createElement("button");
  thumbBtn.type = "button";
  thumbBtn.className = "thumbnailButton";
  thumbBtn.setAttribute("aria-label", `Open ${photo.title} photo`);

  const imageWrap = document.createElement("div");
  imageWrap.className = "imageWrap";

  const img = document.createElement("img");
  img.loading = "lazy";
  img.decoding = "async";
  img.src = photo.src;
  img.alt = photo.alt;

  const overlay = document.createElement("div");
  overlay.className = "noteOverlay";

  const noteInner = document.createElement("div");
  noteInner.className = "noteInner";

  const noteText = document.createElement("p");
  noteText.className = "noteText";
  noteText.textContent = photo.note;

  const noteHint = document.createElement("span");
  noteHint.className = "noteHint";
  noteHint.textContent = "Click the title to hide note";

  noteInner.appendChild(noteText);
  noteInner.appendChild(noteHint);
  overlay.appendChild(noteInner);

  const errorOverlay = document.createElement("div");
  errorOverlay.className = "imageError hidden";
  errorOverlay.textContent = "This photo couldn't be decoded in your browser.";

  imageWrap.appendChild(img);
  imageWrap.appendChild(overlay);
  imageWrap.appendChild(errorOverlay);

  thumbBtn.appendChild(imageWrap);

  const caption = document.createElement("figcaption");
  caption.className = "caption";

  const titleBtn = document.createElement("button");
  titleBtn.type = "button";
  titleBtn.className = "titleButton";
  titleBtn.textContent = photo.title;
  titleBtn.setAttribute("aria-expanded", "false");

  const date = document.createElement("div");
  date.className = "captionDate";
  date.textContent = photo.dateLabel;

  caption.appendChild(titleBtn);
  caption.appendChild(date);

  figure.appendChild(thumbBtn);
  figure.appendChild(caption);

  if (isAdmin) {
    const actions = document.createElement("div");
    actions.className = "photoAdminActions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "photoAdminBtn";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openAdminSheet("edit", photo);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "photoAdminBtn photoAdminBtnDanger";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deletePhotoFromArchive(photo);
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    figure.appendChild(actions);
  }

  thumbBtn.addEventListener("click", () => openModalForPhoto(photo, img));

  titleBtn.addEventListener("click", () => {
    const isOpen = figure.classList.contains("openNote");

    if (!isOpen && openNoteFigure && openNoteFigure !== figure) {
      openNoteFigure.classList.remove("openNote");
    }

    if (isOpen) {
      figure.classList.remove("openNote");
      if (openNoteFigure === figure) openNoteFigure = null;
      titleBtn.setAttribute("aria-expanded", "false");
    } else {
      figure.classList.add("openNote");
      openNoteFigure = figure;
      titleBtn.setAttribute("aria-expanded", "true");
    }

    // Keep modal note in sync if this photo is currently open.
    if (openModalPhotoId === photo.id) updateModalNoteForPhoto(photo);
  });

  titleBtn.addEventListener("keydown", (e) => {
    // Button handles Enter/Space by default; we keep this just to avoid surprise.
    if (e.key === "Escape") {
      closeAllNotes();
      if (openModalPhotoId === photo.id) closeModal();
    }
  });

  img.addEventListener("error", () => {
    errorOverlay.classList.remove("hidden");
    img.style.display = "none";
  });

  return figure;
}

function buildArchive() {
  const groups = groupByYear();
  const frag = document.createDocumentFragment();

  for (const [year, yearPhotos] of groups) {
    const group = document.createElement("section");
    group.className = "yearGroup";
    group.dataset.year = String(year);

    const heading = document.createElement("h2");
    heading.className = "yearHeading";
    heading.textContent = String(year);

    group.appendChild(heading);

    for (const p of yearPhotos) {
      const figure = createPhotoFigure(p);
      group.appendChild(figure);
    }

    frag.appendChild(group);
  }

  archiveEl.replaceChildren(frag);
}

function applyYearFilter(year) {
  const groups = archiveEl.querySelectorAll(".yearGroup");
  for (const g of groups) {
    const shouldShow = year === "all" || g.dataset.year === String(year);
    g.classList.toggle("hidden", !shouldShow);
  }
}

function closeUIForFilterChange() {
  closeAllNotes();
  closeModal();
}

yearSwitcherTriggerEl?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleYearSwitcher();
});

yearSwitcherTriggerEl?.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    if (!yearSwitcherOpen) openYearSwitcher();
    else if (e.key === "ArrowDown") focusYearOptionByOffset(1);
  }
});

yearSwitcherMenuEl?.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    focusYearOptionByOffset(1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    focusYearOptionByOffset(-1);
  } else if (e.key === "Home") {
    e.preventDefault();
    yearSwitcherMenuEl.querySelector(".yearSwitcherOption")?.focus();
  } else if (e.key === "End") {
    e.preventDefault();
    const options = yearSwitcherMenuEl.querySelectorAll(".yearSwitcherOption");
    options[options.length - 1]?.focus();
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeYearSwitcher({ restoreFocus: true });
  } else if (e.key === "Tab") {
    closeYearSwitcher();
  }
});

document.addEventListener("click", (e) => {
  if (!yearSwitcherOpen) return;
  if (yearSwitcherEl?.contains(e.target)) return;
  closeYearSwitcher();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (yearSwitcherOpen) {
      closeYearSwitcher({ restoreFocus: true });
      return;
    }
    if (!adminSheet.classList.contains("hidden")) {
      closeAdminSheet();
      return;
    }
    if (openModalPhotoId) {
      closeModal();
      return;
    }
    closeAllNotes();
  }
});

function showArchiveStatus(message) {
  archiveEl.replaceChildren();
  const status = document.createElement("p");
  status.className = "archiveStatus";
  status.textContent = message;
  archiveEl.appendChild(status);
}

function toDateInputValue(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isoToDateInput(iso) {
  if (!iso) return "";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dateInputToIso(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString();
}

function humanizeFilename(filename) {
  const base = filename.replace(/\.[^.]+$/, "");
  return base
    .replace(/[_-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function setAdminFormMessage(text, kind = "") {
  adminFormMessage.textContent = text;
  adminFormMessage.className = "formMessage" + (kind ? ` ${kind}` : "");
}

function openAdminSheet(mode, photo = null) {
  if (openModalPhotoId) closeModal();
  closeAllNotes();

  adminMode = mode;
  editingPhotoId = photo?.id || null;
  extractedGps = null;
  setAdminFormMessage("");
  adminForm.reset();
  adminPreview.classList.add("hidden");
  adminPreview.removeAttribute("src");

  if (mode === "add") {
    adminSheetTitle.textContent = "Add photo";
    adminSubmitBtn.textContent = "Upload";
    adminFileField.classList.remove("hidden");
    adminFile.required = true;
  } else {
    adminSheetTitle.textContent = "Edit photo";
    adminSubmitBtn.textContent = "Save";
    adminFileField.classList.add("hidden");
    adminFile.required = false;
    adminTitle.value = photo.title || "";
    adminDate.value = isoToDateInput(photo.date);
    adminLocation.value = photo.location || "";
    adminNote.value = photo.note || "";
    if (photo.src) {
      adminPreview.src = photo.src;
      adminPreview.classList.remove("hidden");
    }
  }

  adminSheet.classList.remove("hidden");
  adminSheet.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeAdminSheet() {
  adminSheet.classList.add("hidden");
  adminSheet.setAttribute("aria-hidden", "true");
  adminMode = null;
  editingPhotoId = null;
  extractedGps = null;
  if (!openModalPhotoId) document.body.style.overflow = "";
}

async function refreshArchive() {
  const previousYear = selectedYear || "all";
  photos = await loadPhotos();
  if (!photos.length) {
    showArchiveStatus("No photos yet.");
    yearSwitcherMenuEl?.replaceChildren();
    selectedYear = "all";
    setYearSwitcherLabel("all");
    closeYearSwitcher();
    return;
  }
  if (yearOptionValues().includes(previousYear)) {
    selectedYear = previousYear;
  } else {
    selectedYear = "all";
  }
  buildYearOptions();
  buildArchive();
  applyYearFilter(selectedYear);
}

async function deletePhotoFromArchive(photo) {
  if (!window.confirm(`Delete “${photo.title}”? This cannot be undone.`)) return;

  try {
    const res = await fetch("/api/delete-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicId: photo.id }),
    });
    if (!res.ok) throw new Error("Delete failed");
    if (openModalPhotoId === photo.id) closeModal();
    await refreshArchive();
  } catch (e) {
    console.error(e);
    window.alert("Couldn't delete that photo.");
  }
}

async function checkAdminAuth() {
  try {
    const res = await fetch("/api/me");
    isAdmin = res.ok;
  } catch {
    isAdmin = false;
  }
  adminDock.classList.toggle("hidden", !isAdmin);
  document.body.classList.toggle("is-admin", isAdmin);
}

adminAddBtn?.addEventListener("click", () => openAdminSheet("add"));
adminSheetClose?.addEventListener("click", () => closeAdminSheet());
adminSheetBackdrop?.addEventListener("click", () => closeAdminSheet());

adminLogoutBtn?.addEventListener("click", async () => {
  try {
    await fetch("/api/logout", { method: "POST" });
  } catch (e) {
    // still leave admin mode
  }
  isAdmin = false;
  adminDock.classList.add("hidden");
  document.body.classList.remove("is-admin");
  closeAdminSheet();
  await refreshArchive();
});

adminFile?.addEventListener("change", async () => {
  const file = adminFile.files?.[0];
  if (!file) return;

  adminPreview.src = URL.createObjectURL(file);
  adminPreview.classList.remove("hidden");

  const guessedTitle = humanizeFilename(file.name);
  if (!adminTitle.value) adminTitle.value = guessedTitle;
  extractedGps = null;

  try {
    const mod = await import("https://esm.sh/exifr");
    const exifr = mod?.default || mod;
    const output = await exifr.parse(file, { gps: true });
    const dateTaken = output?.DateTimeOriginal || output?.CreateDate || output?.ModifyDate;
    if (dateTaken instanceof Date && !Number.isNaN(dateTaken.getTime())) {
      adminDate.value = toDateInputValue(dateTaken);
    }
    if (typeof output?.latitude === "number" && typeof output?.longitude === "number") {
      extractedGps = { lat: output.latitude, lon: output.longitude };

      // Resolve place name from GPS and use it for location + title.
      try {
        const geoRes = await fetch(
          `/api/geocode?lat=${encodeURIComponent(extractedGps.lat)}&lon=${encodeURIComponent(extractedGps.lon)}`
        );
        if (geoRes.ok) {
          const geo = await geoRes.json();
          const place = (geo.name || "").trim();
          if (place) {
            if (!adminLocation.value) adminLocation.value = place;
            // Prefer location as title when title is empty or still the filename guess.
            if (!adminTitle.value || adminTitle.value === guessedTitle) {
              adminTitle.value = place;
            }
          }
        }
      } catch (geoErr) {
        console.warn("Couldn't reverse-geocode photo GPS", geoErr);
      }
    }
  } catch (e) {
    console.warn("Couldn't read EXIF data from this photo", e);
  }
});

adminForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  setAdminFormMessage("");
  adminSubmitBtn.disabled = true;

  try {
    if (adminMode === "add") {
      const file = adminFile.files?.[0];
      if (!file) throw new Error("Choose a photo");

      setAdminFormMessage("Uploading…");

      const sigRes = await fetch("/api/upload-signature");
      if (!sigRes.ok) throw new Error("Could not get upload permission");
      const { timestamp, signature, tags, apiKey, cloudName } = await sigRes.json();

      const cloudinaryForm = new FormData();
      cloudinaryForm.append("file", file);
      cloudinaryForm.append("api_key", apiKey);
      cloudinaryForm.append("timestamp", timestamp);
      cloudinaryForm.append("signature", signature);
      cloudinaryForm.append("tags", tags);

      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body: cloudinaryForm,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const uploadResult = await uploadRes.json();

      const finalizeRes = await fetch("/api/finalize-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicId: uploadResult.public_id,
          title: adminTitle.value.trim(),
          dateTaken: dateInputToIso(adminDate.value),
          lat: extractedGps?.lat,
          lon: extractedGps?.lon,
          location: adminLocation.value.trim(),
          note: adminNote.value.trim(),
        }),
      });
      if (!finalizeRes.ok) throw new Error("Couldn't save photo details");
    } else if (adminMode === "edit" && editingPhotoId) {
      setAdminFormMessage("Saving…");
      const res = await fetch("/api/update-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicId: editingPhotoId,
          title: adminTitle.value.trim(),
          dateTaken: dateInputToIso(adminDate.value),
          location: adminLocation.value.trim(),
          note: adminNote.value.trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't save changes");
    }

    closeAdminSheet();
    await refreshArchive();
  } catch (err) {
    console.error(err);
    setAdminFormMessage(err.message || "Something went wrong.", "error");
  } finally {
    adminSubmitBtn.disabled = false;
  }
});

async function init() {
  showArchiveStatus("Loading…");
  await checkAdminAuth();

  try {
    photos = await loadPhotos();
  } catch (e) {
    showArchiveStatus("Couldn't load photos. Please try reloading the page.");
    console.error(e);
    return;
  }

  if (!photos.length) {
    showArchiveStatus(isAdmin ? "No photos yet. Tap Add to upload one." : "No photos yet.");
    yearSwitcherMenuEl?.replaceChildren();
    selectedYear = "all";
    setYearSwitcherLabel("all");
    return;
  }

  selectedYear = "all";
  buildYearOptions();
  buildArchive();
  applyYearFilter(selectedYear);
}

init();

