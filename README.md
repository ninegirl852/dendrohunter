# 城木獵人 Dendro-Hunter

A Hong Kong park tree-hunting game. Walk a map of LCSD major parks, step into a park in 2D or first-person 3D, scan or type a species name, and grow what you collect in a virtual garden.

Tree locations come from the Leisure and Cultural Services Department “Trees (Major Parks)” dataset (Chinese name, scientific name, and park). Progress is stored in this browser only.

## Run locally

```bash
npm install
npm run dev
```

The dev server listens on [http://127.0.0.1:47291](http://127.0.0.1:47291).

Inside the app, open **⚙️ 設定**, turn on **啟用虛擬 GPS (開發模式)**, choose a park, then tap its map marker and **進入公園**. Drag to look around, use the joystick or WASD to walk, and tap a tree to read its name. **🎒 行動選單** holds daily check-in, the garden, the card album, camera QR scan, and manual species entry.

Camera QR scanning needs a secure page (HTTPS, or localhost). If a tree label page cannot be read, the app asks you to type the Chinese name yourself.
