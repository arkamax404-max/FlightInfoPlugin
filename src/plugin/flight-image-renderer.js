const DYNAMIC_STATES = new Set([1, 2, 3]);
const LINE_LAYOUT = [
  { y: 25, fontSize: 20, fontWeight: 700, color: "#ffffff" },
  { y: 57, fontSize: 22, fontWeight: 700, color: "#ffffff" },
  { y: 86, fontSize: 22, fontWeight: 700, color: "#ffffff" },
  { y: 126, fontSize: 17, fontWeight: 700, color: "#8ee7ff" },
  { y: 171, fontSize: 36, fontWeight: 700, color: "#ffffff" },
];
const UNAVAILABLE_LAYOUT = [
  { y: 25, fontSize: 20, fontWeight: 700, color: "#ffffff" },
  { y: 94, fontSize: 22, fontWeight: 700, color: "#8ee7ff" },
  { y: 139, fontSize: 32, fontWeight: 700, color: "#ffffff" },
];

function createFlightImage(view) {
  if (!view || !DYNAMIC_STATES.has(view.state) || !view.text?.trim())
    return null;

  const layout = view.state === 3 ? UNAVAILABLE_LAYOUT : LINE_LAYOUT;
  const lines = view.text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, layout.length);
  if (!lines.length) return null;

  const text = lines
    .map((line, index) => {
      const lineLayout = layout[index];
      return `<text x="98" y="${lineLayout.y}" fill="${lineLayout.color}" font-family="Arial, sans-serif" font-size="${lineLayout.fontSize}" font-weight="${lineLayout.fontWeight}" text-anchor="middle">${escapeXml(line)}</text>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="196" height="196" viewBox="0 0 196 196"><rect width="196" height="196" rx="12" fill="#101820"/>${text}</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

module.exports = { createFlightImage };
