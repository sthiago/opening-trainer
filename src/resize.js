export function dispatchChessgroundResize() {
    document.body.dispatchEvent(new Event("chessground.resize"));
}

export function bindChessgroundResize(f) {
    document.body.addEventListener("chessground.resize", f);
}

export function resizeHandle(els) {
    const el = document.createElement("cg-resize");
    els.container.appendChild(el);

    const startResize = (start) => {
        start.preventDefault();

        const mousemoveEvent = start.type === "touchstart" ? "touchmove" : "mousemove",
            mouseupEvent = start.type === "touchstart" ? "touchend" : "mouseup",
            startPos = eventPosition(start),
            initialZoom = parseInt(window.getComputedStyle(document.body).getPropertyValue("---zoom"));

        let zoom = initialZoom;
        console.log(zoom);
        // const saveZoom = debounce(() => xhr.text(`/pref/zoom?v=${zoom}`, { method: "post" }), 700);

        const resize = (move) => {
            const pos = eventPosition(move),
            delta = pos[0] - startPos[0] + pos[1] - startPos[1];
            zoom = Math.round(Math.min(100, Math.max(0, initialZoom + delta / 10)));
            document.body.style.setProperty("---zoom", zoom.toString());
            window.dispatchEvent(new Event("resize"));
            // saveZoom();
        };

      document.body.classList.add("resizing");

      document.addEventListener(mousemoveEvent, resize);

      document.addEventListener(
        mouseupEvent,
        () => {
          document.removeEventListener(mousemoveEvent, resize);
          document.body.classList.remove("resizing");
        },
        { once: true },
      );
    };

    el.addEventListener("touchstart", startResize, { passive: false });
    el.addEventListener("mousedown", startResize, { passive: false });
}

function eventPosition(e) {
    if (e.clientX || e.clientX === 0) return [e.clientX, e.clientY];
    if (e.targetTouches?.[0]) return [e.targetTouches[0].clientX, e.targetTouches[0].clientY];
    return;
}