/**
 * Classic-script failsafe: if the ES module graph never settles, still leave the boot screen.
 * CSP-safe (external file). Cleared by main.js via window.__shadowkoBootClear.
 */
(function () {
  var cleared = false;
  function reveal(opts) {
    if (cleared) return;
    cleared = true;
    try {
      document.body.classList.add("is-ready");
      document.body.classList.remove("is-booting");
      var boot = document.getElementById("boot");
      if (boot) {
        boot.classList.add("is-hidden");
        boot.setAttribute("hidden", "");
        boot.setAttribute("aria-hidden", "true");
      }
      if (opts && opts.fatal) {
        var fatal = document.getElementById("fatal");
        if (fatal) {
          fatal.textContent = opts.fatal;
          fatal.classList.remove("is-hidden");
          fatal.removeAttribute("hidden");
          fatal.setAttribute("aria-hidden", "false");
        }
      }
    } catch (_) {
      /* ignore */
    }
  }

  window.__shadowkoBootClear = function () {
    cleared = true;
    if (timer) clearTimeout(timer);
  };

  var timer = setTimeout(function () {
    if (document.body.classList.contains("is-ready")) return;
    reveal({
      fatal: "SHADOWKO is taking too long to load. Check your connection and refresh.",
    });
  }, 5000);
})();
