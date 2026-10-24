# Spatial Studio

Browser-local hand tracking with QR-paired phone control, spatial drawing, maths demonstrations and gesture-based pottery.

Live demo: https://spatial-studio-webcam.dearmacaw4.chatgpt.site/pottery

On the laptop choose **Connect phone** and scan the displayed QR code with the phone camera. The controller opens and connects automatically; tap **Start sensors** to enable motion. An eight-character code remains available under **Can’t scan?** The phone follows the selected desktop workspace. Codes are single-use and expire after ten minutes; paired sessions last up to 24 hours.

Camera frames are processed in the browser on the device using that camera. Laptop tracking uses MediaPipe on CPU/WASM; phone Pottery tracking tries the GPU with CPU fallback. A separate Cloudflare Worker with one Durable Object per pair relays phone motion, touch and hand landmarks over WebSockets. The timing panel reports model startup, inference and worker round trip, not physical motion-to-display latency.

Install dependencies with `npm ci`, build with `npm run build`, then run `npm start` and open http://localhost:4173/pottery. Run unit tests with `npm test` and TypeScript checks with `npm run check`. Camera access requires localhost or HTTPS.

The hosted build uses the existing public relay by default. For your own relay, update the Cloudflare account and allowed origins in `relay/wrangler.jsonc`, deploy using `npx wrangler@4.92.0 deploy --config relay/wrangler.jsonc`, and set `VITE_RELAY_URL` at build time. This checkout builds the hosted version; the original USB development workspace is maintained separately.


The **Tracking lab** at `/tracking` investigates two-camera fingertip tracking. Start the laptop webcam and the paired phone camera explicitly (front by default; rear is selectable). Each browser runs MediaPipe locally; the relay streams landmarks. Explicit board capture additionally sends one phone JPEG to the laptop. Download the 25 mm ChArUco target and capture 12–24 stationary poses with both devices fixed.

Calibration runs locally: create a Python virtual environment, install `scripts/tracking-requirements.txt`, then run `python scripts/calibrate-stereo.py captures.json --output calibration.json`. Import that JSON into the same camera sessions. The lab offers a provisional ray-intersection point and a 5-second stationary jitter test. Browser presentation timestamps and network clock estimates are not synchronized camera exposures; occluded fingers can be inferred incorrectly. This is a measurement experiment, not a validated sculpting tool.

`node tests/tracking-browser.mjs` exercises pairing, camera lifecycle, explicit capture and synthetic geometry in browser contexts. `python scripts/check-stereo-calibration.py` checks OpenCV calibration on rendered synthetic target images. Neither establishes real phone tracking accuracy.


**Pottery** at `/pottery` is a constrained form sketcher. Open two hands to choose a shaping height, close both fists to grab that band, then change hand spacing to widen/narrow it. Opening either hand stops editing. Select laptop webcam or phone camera explicitly; this uses image-space proportions, not calibrated two-camera depth. Mouse profile editing and numeric dimensions provide equivalent controls. Save three independent variations, decorate the outside with the phone pad or mouse, and inspect by holding the phone pad and tilting. Switching phases releases controls and stops camera capture. Projects save locally and export/import as JSON; GLB exports contain the hollow mesh and decoration, in metres. Manufacturing suitability and real clay forces are not simulated.
