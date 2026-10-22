# Spatial Studio

Hosted browser-local CPU hand tracking with QR-paired Android phone control.

On the laptop choose **Connect phone** and scan the displayed QR code with the phone camera. The controller opens and connects automatically; tap **Start sensors** to enable motion. An eight-character code remains available under **Can’t scan?** The phone follows the selected desktop workspace. Codes are single-use and expire after ten minutes; paired sessions last up to 24 hours.

Webcam frames stay in the laptop browser. A separate Cloudflare Worker with one Durable Object per pair relays phone motion/touch over WebSockets. The timing panel reports model startup, inference and worker round trip, not physical motion-to-display latency.

Build the website with `npm ci` and `npm run build`. Deploy the relay using `npx wrangler@4.92.0 deploy --config relay/wrangler.jsonc` in the configured Cloudflare account. Set `VITE_RELAY_URL` at build time to override the default relay. The normal USB build is maintained in the sibling section-studio directory.
