# Local design assets

The two thank-you background files are unchanged copies of the originals supplied in `Car booking img.zip`. They remain the default receipt hero backgrounds and can be overridden from WordPress settings. Booking form backgrounds come from the host page or the configured Media Library image; unused prototype lobby artwork is not bundled.

| Local file | Source file | Native dimensions |
| --- | --- | --- |
| `thank-you-desktop.jpg` | `thank youpage bg .jpg` | 2160 × 717 |
| `thank-you-mobile.jpg` | `thank youpage bg phone.jpg` | 585 × 527 |

The archive does not include standalone vehicle or logo originals. The following PNG assets are lossless crops of the supplied native screenshots. Coordinates use `(left, top, right, bottom)`, with the right and bottom edges excluded. No generated replacements, rescaling, retouching, or background removal were applied.

| Local file | Source screenshot | Crop rectangle | Result |
| --- | --- | --- | --- |
| `premium-suv.png` | `step 2.png` | `(168, 720, 499, 943)` | 331 × 223 |
| `luxury-suv.png` | `step 2.png` | `(555, 720, 886, 943)` | 331 × 223 |
| `executive-suv.png` | `step 2.png` | `(941, 720, 1272, 943)` | 331 × 223 |
| `rolls-royce-ghost.png` | `step 2.png` | `(168, 1631, 499, 1854)` | 331 × 223 |
| `rolls-royce-cullinan.png` | `step 2.png` | `(555, 1631, 886, 1854)` | 331 × 223 |
| `rolls-royce-phantom.png` | `step 2.png` | `(941, 1631, 1272, 1854)` | 331 × 223 |
| `navigator-cutout.png` | `step 5.png` | `(252, 852, 448, 978)` | 196 × 126 |
| `navigator-summary.png` | `step 3.png` | `(1005, 772, 1125, 847)` | 120 × 75 |
| `tuxano-wordmark.png` | `thank you.png` | `(190, 3008, 490, 3065)` | 300 × 57 |

The Navigator crop has a white `#FFFFFF` background. The wordmark crop includes the original solid dark `#0B1220` footer background. Use that background behind the wordmark to avoid a visible rectangle. Screenshot-derived assets have the original raster-resolution limit; sharper standalone source files can replace them later without changing the layout.

## Removed unused lobby artwork

Version 2.4.3 removes `lobby-desktop.jpg`, `lobby-mobile.png` and `lobby-step-1.jpg` through `lobby-step-5.jpg`. No current CSS, JavaScript, HTML, WordPress vehicle default or template references these seven images. The form has used a transparent background since the earlier page-background update, allowing the host page design to show through. Removing this obsolete artwork saves approximately 8.5 MB from the ZIP without changing active vehicle images or the default thank-you design.

Earlier prototype releases retain these files and their reconstruction notes in Git history. The desktop variants were assembled from the supplied original photograph and photography-only screenshot regions, with no generated imagery. They matched the original mockup framing before the form switched to inherited page backgrounds. Historical design notes in `project.md` describe that earlier version and are not current asset requirements.

## Fonts

The fonts are authentic, unmodified Google Fonts variable TrueType files downloaded over verified HTTPS from the official `google/fonts` repository. They are self-hosted so the site does not require font-network requests at runtime.

| Local file | Family/style | Weight range | Source |
| --- | --- | --- | --- |
| `cormorant-garamond.ttf` | Cormorant Garamond, normal | 300–700 | [Google Fonts source](https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf) |
| `plus-jakarta-sans.ttf` | Plus Jakarta Sans, normal | 200–800 | [Google Fonts source](https://raw.githubusercontent.com/google/fonts/main/ofl/plusjakartasans/PlusJakartaSans%5Bwght%5D.ttf) |

Each font's SIL Open Font License is included as `cormorant-garamond-OFL.txt` or `plus-jakarta-sans-OFL.txt`. No italic font was needed for the supplied screenshots.

Declare `font-weight: 300 700` for the serif `@font-face` and `font-weight: 200 800` for the sans-serif `@font-face`, both with `font-style: normal` and `format('truetype')`.
