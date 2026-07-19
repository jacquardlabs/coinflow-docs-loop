// The hosted card-entry page, served by the mock (the "Coinflow origin").
//
// Because the mock serves this page, the card POST below is SAME-ORIGIN to the ZA
// endpoint — no CORS — and only the resulting paymentId is postMessage'd to the parent
// app. Card data never leaves this frame, mirroring why the hosted iframe exists.

export function renderCardEntryPage(merchantId: string): string {
  const mid = JSON.stringify(merchantId);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Coinflow card entry (mock)</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 16px; }
    label { display: block; font-size: 12px; margin-top: 8px; }
    input { width: 100%; padding: 6px; box-sizing: border-box; }
    .row { display: flex; gap: 8px; }
    button { margin-top: 12px; padding: 8px 14px; }
    .err { color: #b00020; font-size: 12px; margin-top: 8px; }
  </style>
</head>
<body>
  <label>Card number<input id="card-number" data-testid="card-number" autocomplete="off" /></label>
  <div class="row">
    <label>MM<input id="card-exp-month" data-testid="card-exp-month" /></label>
    <label>YYYY<input id="card-exp-year" data-testid="card-exp-year" /></label>
    <label>CVV<input id="card-cvv" data-testid="card-cvv" /></label>
  </div>
  <button id="card-submit" data-testid="card-submit">Authorize</button>
  <div id="err" class="err"></div>
  <script>
    var merchantId = ${mid};
    function post(msg) { window.parent.postMessage(Object.assign({ source: "coinflow" }, msg), "*"); }
    document.getElementById("card-submit").addEventListener("click", async function () {
      var card = {
        number: document.getElementById("card-number").value,
        expiryMonth: document.getElementById("card-exp-month").value,
        expiryYear: document.getElementById("card-exp-year").value,
        cvv: document.getElementById("card-cvv").value
      };
      try {
        var res = await fetch("/api/checkout/zero-authorization/" + encodeURIComponent(merchantId), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ card: card })
        });
        var data = await res.json();
        if (!res.ok) {
          document.getElementById("err").textContent = data.error || "error";
          post({ type: "error", code: data.error });
          return;
        }
        post({ type: "success", paymentId: data.paymentId });
      } catch (e) {
        document.getElementById("err").textContent = String(e);
        post({ type: "error", code: "network" });
      }
    });
  </script>
</body>
</html>`;
}
