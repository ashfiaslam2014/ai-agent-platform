/**
 * AI Agent Platform — embeddable chat widget.
 *
 * Usage on any site:
 *   <script src="https://YOUR-APP.vercel.app/widget.js" data-key="PUBLIC_KEY" async></script>
 *
 * Renders a floating button that toggles an iframe pointing at /embed/<key>.
 */
(function () {
  var script = document.currentScript;
  var key = script && script.getAttribute("data-key");
  if (!key) {
    console.error("[ai-agent-widget] missing data-key attribute");
    return;
  }
  var origin = new URL(script.src).origin;

  var btn = document.createElement("button");
  btn.setAttribute("aria-label", "Chat with us");
  btn.style.cssText =
    "position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;" +
    "background:#2563eb;color:#fff;border:none;cursor:pointer;font-size:24px;z-index:2147483647;" +
    "box-shadow:0 4px 14px rgba(0,0,0,.25)";
  btn.textContent = "💬";

  var frame = document.createElement("iframe");
  frame.src = origin + "/embed/" + encodeURIComponent(key);
  frame.style.cssText =
    "position:fixed;bottom:88px;right:20px;width:370px;height:520px;max-width:calc(100vw - 40px);" +
    "max-height:calc(100vh - 120px);border:none;border-radius:16px;z-index:2147483647;display:none;" +
    "box-shadow:0 12px 40px rgba(0,0,0,.28);background:#fff";

  var open = false;
  btn.addEventListener("click", function () {
    open = !open;
    frame.style.display = open ? "block" : "none";
    btn.textContent = open ? "✕" : "💬";
  });

  document.body.appendChild(frame);
  document.body.appendChild(btn);
})();
