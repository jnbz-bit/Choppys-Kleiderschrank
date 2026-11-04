// Neutrale Figur, solange noch kein Ganzkörperfoto hinterlegt ist.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 1000">
<g fill="#d3d7cf">
<ellipse cx="200" cy="82" rx="42" ry="52"/>
<path d="M184 128h32l4 50h-40z"/>
<path d="M128 196c10-20 40-26 72-26s62 6 72 26l14 112c2 14-2 30-6 44l-8 30c-4 20-8 60-6 84l2 50H132l2-50c2-24-2-64-6-84l-8-30c-4-14-8-30-6-44z"/>
<path d="M128 198c-18 6-26 22-28 42l-8 150c-2 40 0 80 6 118l8 40c2 10 16 10 18-2l-2-42c-2-30 0-74 4-112l10-120z"/>
<path d="M272 198c18 6 26 22 28 42l8 150c2 40 0 80-6 118l-8 40c-2 10-16 10-18-2l2-42c2-30 0-74-4-112l-10-120z"/>
<path d="M134 500h64l-6 190c-2 60-4 150-8 238h-30c-6-88-14-178-18-238z"/>
<path d="M266 500h-64l6 190c2 60 4 150 8 238h30c6-88 14-178 18-238z"/>
<path d="M156 926h30l2 46c0 8-6 12-14 12h-38c-10 0-12-10-4-16z"/>
<path d="M244 926h-30l-2 46c0 8 6 12 14 12h38c10 0 12-10 4-16z"/>
</g></svg>`;

export const SILHOUETTE = {
  src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
  w: 400,
  h: 1000,
  guides: { s: 0.19, h: 0.5, a: 0.93, floor: 0.984, cx: 0.5, w: 0.5 },
  placeholder: true
};
