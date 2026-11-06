// keeps the game playable offline once it has been opened.
// files with ?v= in their name never change, so they come straight from the cache.
// the page itself always tries the network first so updates show up.
const V = '21';
const CACHE = `musical-sudoku-${V}`;
const NOTES = ['E4', 'F4', 'Fs4', 'G4', 'Gs4', 'A4', 'As4', 'B4', 'C5', 'Cs5', 'D5', 'Ds5', 'E5', 'F5', 'Fs5', 'G5', 'Gs5', 'A5', 'As5', 'B5', 'C6', 'Cs6', 'D6'];
const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'icons/favicon-32.png', 'icons/favicon-64.png', 'icons/icon-192.png',
  `style.css?v=${V}`, `js/app.js?v=${V}`, `js/audio.js?v=${V}`, `js/sudoku.js?v=${V}`,
  `js/generator.js?v=${V}`, `js/worker.js?v=${V}`,
  `js/solvers/dlx.js?v=${V}`, `js/solvers/backtrack.js?v=${V}`, `js/solvers/logic.js?v=${V}`,
  ...['treble-clef', 'bass-clef', 'half-note', 'quarter-note', 'eighth-note', 'sixteenth-note', 'sharp', 'flat', 'fermata'].map((f) => `symbols/${f}.png`),
  ...NOTES.map((n) => `samples/vsco/piano/${n}.mp3`),
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      caches.open(CACHE).then((c) => c.put('index.html', res.clone()));
      return res;
    }).catch(() => caches.match('index.html')));
    return;
  }
  // everything else (code, sounds, fonts): cache first, and remember anything new
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok || res.type === 'opaque') {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  })));
});
