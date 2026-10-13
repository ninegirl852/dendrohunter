# 城木獵人 Dendro-Hunter

A Hong Kong park tree-hunting game that runs as a static web page. Walk the map of LCSD major parks, step into a park in 2D or first-person 3D, scan or type a species name, and grow what you collect in a virtual garden.

Play it at [https://ninegirl852.github.io/dendrohunter/](https://ninegirl852.github.io/dendrohunter/).

Progress stays in this browser only. Daily check-in is a consecutive streak: miss a calendar day and it starts again at day 1. The seven-day fertilizer cycle is 1, 1, 2, 2, 2, 2, 3, then repeats while the streak keeps counting.

## Run locally

The page loads tree data with a relative URL, so open it through a static server (opening the file directly will block that fetch):

```bash
python3 -m http.server 51941
```

Then visit [http://127.0.0.1:51941/](http://127.0.0.1:51941/).

Tree locations are in `Trees_Major_Parks_Trees_Major_Parks_converted.geojson`, from the Leisure and Cultural Services Department “Trees (Major Parks)” dataset. Paths are relative, so the same files work at `/dendrohunter/` on GitHub Pages.

Inside the game, open **⚙️ 設定**, turn on **啟用虛擬 GPS (開發模式)**, choose a park, then tap its map marker and **進入公園**. Drag to look around, use the joystick or WASD to walk, and tap a tree to read its name. **🎒 行動選單** holds daily check-in, the garden, the card album, camera QR scan, and manual species entry.

Camera QR scanning needs HTTPS (GitHub Pages provides that). A QR code that is a plain species name is collected directly. A QR code that is a web address is looked up through the existing Dendro-Hunter helper; if that page cannot be read, type the Chinese name yourself.
