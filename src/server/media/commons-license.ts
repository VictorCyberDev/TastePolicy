// Wikimedia Commons helpers shared by the legacy name-search route and the M25
// exact-image path. The license safeguards live here once: an image without a
// verified Creative Commons / public-domain license and an author is never shown.
export type MetadataField = { value?: unknown };

export type CommonsPage = {
  title?: unknown;
  imageinfo?: Array<{
    url?: unknown;
    thumburl?: unknown;
    descriptionurl?: unknown;
    extmetadata?: Record<string, MetadataField>;
  }>;
};

export function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function plainText(value: unknown) {
  return text(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function metadata(page: CommonsPage, key: string) {
  return page.imageinfo?.[0]?.extmetadata?.[key]?.value;
}

export function acceptedLicense(page: CommonsPage) {
  const license = plainText(metadata(page, "LicenseShortName"));
  const licenseUrl = text(metadata(page, "LicenseUrl"));
  const match = /^(CC BY(?:-SA)?) (1\.0|2\.0|2\.5|3\.0|4\.0)$/i.exec(license);
  const expected = match
    ? `https://creativecommons.org/licenses/${match[1].toLowerCase().replace("cc ", "")}/${match[2]}/`
    : /^(CC0|CC0 1\.0)$/i.test(license)
      ? "https://creativecommons.org/publicdomain/zero/1.0/"
      : /^Public domain$/i.test(license)
        ? "https://creativecommons.org/publicdomain/mark/1.0/"
        : null;
  if (
    !expected ||
    licenseUrl.replace(/\/$/, "") !== expected.replace(/\/$/, "")
  )
    return null;
  return { license, licenseUrl: expected };
}

export function safeUrl(value: string, host: string, prefix: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === host &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      url.pathname.startsWith(prefix)
    );
  } catch {
    return false;
  }
}
