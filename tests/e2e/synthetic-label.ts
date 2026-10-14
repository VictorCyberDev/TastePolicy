import type { Page } from "@playwright/test";
// Test-only DOM labeling for intercepted responses. No production switch/fallback.
export async function labelSynthetic(page: Page) {
  await page.evaluate(() => {
    const banner = document.createElement("div");
    banner.textContent = "SYNTHETIC TEST DATA — TEST ONLY";
    banner.style.cssText =
      "padding:16px;background:#ffe5a3;color:#172723;font-weight:bold;text-align:center";
    document.body.prepend(banner);
    const label = () =>
      document
        .querySelectorAll<HTMLElement>('[data-evidence-source="live"]')
        .forEach((e) => {
          e.dataset.evidenceSource = "synthetic";
          e.textContent = "SYNTHETIC TEST DATA";
        });
    label();
    new MutationObserver(label).observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
}
