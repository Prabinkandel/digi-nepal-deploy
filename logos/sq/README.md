# Square product artwork (`logos/sq/`)

One 1024×1024 square artwork per product family, composed from the family's
previous card image: uniform margins trimmed to the logo's content bounding
box, the lockup placed centred and 100% whole (never cropped) on a canvas
filled with the source's own background colour (#FFFFFF for every current
family). Pointing a product's `image_url` at its square file makes the card's
square stage fill edge-to-edge (Royal-style) with zero logo cropping.

Files: netflix-4k, prime-video, spotify-premium, canva-edu, canva-pro,
capcut-pro, chatgpt-plus, claude-ai-api, muse-ai, gemini-ai-pro,
gemini-plus-6-months, microsoft-office-windows-10-11-pro (all `.png`).

Note: prime-video, capcut-pro and chatgpt-plus are in `BRAND_LOGO_OVERRIDE`
(app.js), so their cards keep forcing the bundled SVG until that override is
repointed at these files; the other nine families take effect from the
`image_url` update alone.
