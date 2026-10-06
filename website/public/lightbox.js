// Full-screen image viewer with zoom for product galleries. Plain JS so the static preview can use it too.
// Opens from any [data-zoom] element inside a .gallery. Click, double-tap, pinch or scroll to zoom.
(() => {
  if (window.__lightbox) return;
  window.__lightbox = true;

  const MAX = 4;
  const STEP_ZOOM = 2.5;
  let box, stage, img, count, hint, opener;
  let sources = [];
  let index = 0;
  let scale = 1;
  let tx = 0;
  let ty = 0;
  const pointers = new Map();
  let pinch = null;
  let gesture = null;
  let lastTap = 0;

  const coarse = () => window.matchMedia("(pointer: coarse)").matches;

  function build() {
    box = document.createElement("div");
    box.className = "zoom";
    box.hidden = true;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Image viewer");
    box.innerHTML =
      '<div class="zoom-bar"><span class="zoom-count label" aria-live="polite"></span>' +
      '<span class="zoom-hint label"></span>' +
      '<button type="button" class="zoom-close label" data-zoom-close>Close</button></div>' +
      '<div class="zoom-stage"><img class="zoom-img" alt="" draggable="false"></div>' +
      '<button type="button" class="zoom-nav zoom-prev" data-zoom-step="-1" aria-label="Previous image">' +
      '<svg viewBox="0 0 20 20" width="22" height="22" aria-hidden="true"><path d="M12.5 3.5 6 10l6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg></button>' +
      '<button type="button" class="zoom-nav zoom-next" data-zoom-step="1" aria-label="Next image">' +
      '<svg viewBox="0 0 20 20" width="22" height="22" aria-hidden="true"><path d="M7.5 3.5 14 10l-6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg></button>';
    document.body.append(box);
    stage = box.querySelector(".zoom-stage");
    img = box.querySelector(".zoom-img");
    count = box.querySelector(".zoom-count");
    hint = box.querySelector(".zoom-hint");

    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
    stage.addEventListener("wheel", onWheel, { passive: false });
  }

  function apply(animate) {
    img.style.transition = animate ? "transform 260ms cubic-bezier(0.2, 0.7, 0.2, 1)" : "none";
    img.style.transform = "translate(" + tx + "px, " + ty + "px) scale(" + scale + ")";
    box.classList.toggle("is-zoomed", scale > 1.01);
  }

  function limits() {
    const r = stage.getBoundingClientRect();
    return {
      x: Math.max(0, (img.offsetWidth * scale - r.width) / 2),
      y: Math.max(0, (img.offsetHeight * scale - r.height) / 2),
    };
  }

  function clampPan() {
    const m = limits();
    tx = Math.min(m.x, Math.max(-m.x, tx));
    ty = Math.min(m.y, Math.max(-m.y, ty));
  }

  /** Zooms so the point under (cx, cy) stays where it is. */
  function zoomAt(next, cx, cy) {
    next = Math.min(MAX, Math.max(1, next));
    const r = stage.getBoundingClientRect();
    const ox = cx - (r.left + r.width / 2);
    const oy = cy - (r.top + r.height / 2);
    tx = ox - ((ox - tx) * next) / scale;
    ty = oy - ((oy - ty) * next) / scale;
    scale = next;
    if (scale === 1) tx = ty = 0;
    clampPan();
  }

  function toggleZoom(cx, cy) {
    zoomAt(scale > 1.01 ? 1 : STEP_ZOOM, cx, cy);
    apply(true);
  }

  function show(i) {
    index = (i + sources.length) % sources.length;
    scale = 1;
    tx = ty = 0;
    img.src = sources[index].src;
    img.alt = sources[index].alt;
    apply(false);
    count.textContent = index + 1 + " / " + sources.length;
    box.classList.toggle("single", sources.length < 2);
  }

  function open(trigger) {
    if (!box) build();
    const gallery = trigger.closest(".gallery") || trigger.parentElement;
    const triggers = [...gallery.querySelectorAll("[data-zoom]")];
    sources = triggers.map((t) => {
      const image = t.querySelector("img");
      return { src: image.currentSrc || image.src, alt: image.alt };
    });
    opener = trigger;
    hint.textContent = coarse() ? "Pinch or double-tap to zoom" : "Click or scroll to zoom";
    box.hidden = false;
    document.body.classList.add("menu-open");
    show(Math.max(0, triggers.indexOf(trigger)));
    box.querySelector("[data-zoom-close]").focus();
  }

  function close() {
    if (!box || box.hidden) return;
    box.hidden = true;
    document.body.classList.remove("menu-open");
    pointers.clear();
    pinch = gesture = null;
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
  }

  function onDown(e) {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale };
      gesture = null;
    } else if (pointers.size === 1) {
      gesture = { x: e.clientX, y: e.clientY, tx, ty, moved: false, type: e.pointerType };
    }
  }

  function onMove(e) {
    // Desktop: while zoomed, the image follows the mouse, like on luxury product pages.
    if (e.pointerType === "mouse" && !pointers.size) {
      if (scale > 1.01) {
        const r = stage.getBoundingClientRect();
        const m = limits();
        tx = -((e.clientX - (r.left + r.width / 2)) / (r.width / 2)) * m.x;
        ty = -((e.clientY - (r.top + r.height / 2)) / (r.height / 2)) * m.y;
        apply(false);
      }
      return;
    }
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      zoomAt((pinch.scale * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.dist, (a.x + b.x) / 2, (a.y + b.y) / 2);
      apply(false);
      return;
    }
    if (!gesture || e.pointerType === "mouse") return;
    const dx = e.clientX - gesture.x;
    const dy = e.clientY - gesture.y;
    if (Math.abs(dx) + Math.abs(dy) > 8) gesture.moved = true;
    if (scale > 1.01) {
      tx = gesture.tx + dx;
      ty = gesture.ty + dy;
      clampPan();
    } else {
      tx = dx; // swipe preview
    }
    apply(false);
  }

  function onUp(e) {
    pointers.delete(e.pointerId);
    if (pinch) {
      if (pointers.size < 2) pinch = null;
      if (scale < 1.05) {
        scale = 1;
        tx = ty = 0;
        apply(true);
      }
      gesture = null;
      return;
    }
    if (!gesture) return;
    const g = gesture;
    gesture = null;
    const dx = e.clientX - g.x;
    if (scale <= 1.01 && g.moved) {
      if (Math.abs(dx) > 50 && sources.length > 1) show(index + (dx < 0 ? 1 : -1));
      else {
        tx = 0;
        apply(true);
      }
      return;
    }
    if (g.moved) return;
    if (g.type === "mouse") {
      toggleZoom(e.clientX, e.clientY);
      return;
    }
    const now = Date.now();
    if (now - lastTap < 320) {
      lastTap = 0;
      toggleZoom(e.clientX, e.clientY);
    } else {
      lastTap = now;
    }
  }

  function onWheel(e) {
    e.preventDefault();
    zoomAt(scale * Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY);
    apply(false);
  }

  document.addEventListener("click", (e) => {
    const t = e.target;
    const trigger = t.closest("[data-zoom]");
    if (trigger) {
      e.preventDefault();
      open(trigger);
      return;
    }
    if (t.closest("[data-zoom-close]")) close();
    const step = t.closest("[data-zoom-step]");
    if (step) show(index + Number(step.dataset.zoomStep));
  });

  document.addEventListener("keydown", (e) => {
    if (!box || box.hidden) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight") show(index + 1);
    else if (e.key === "ArrowLeft") show(index - 1);
  });

  window.addEventListener("hashchange", close);
  window.addEventListener("popstate", close);
})();
