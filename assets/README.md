# Local design assets

The four background files are unchanged copies of the originals supplied in `Car booking img.zip`.

| Local file | Source file | Native dimensions |
| --- | --- | --- |
| `lobby-desktop.jpg` | `used bg imge for all form.jpg` | 2160 × 3066 |
| `lobby-mobile.png` | `used bg imge for all form phone.png` | 585 × 4787 |
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

## Desktop lobby variants

The source desktop screenshot backgrounds use distinct photo framing. The supplied `lobby-desktop.jpg` matches Step 3 exactly, while other desktop screenshots reveal photo beyond that asset's cropped edges or bottom. These five assets reproduce the reference framing using the supplied original photograph and photo-only regions from the corresponding screenshot. They are asset reconstruction for the supplied design, with no generated imagery or replacement scene.

| Local file | Reference screenshot | Output dimensions |
| --- | --- | --- |
| `lobby-step-1.jpg` | `step 1.png` | 1440 × 1232 |
| `lobby-step-2.jpg` | `step 2.png` | 1440 × 2730 |
| `lobby-step-3.jpg` | `step 3.png` | 1440 × 2044 |
| `lobby-step-4.jpg` | `step 4.png` | 1440 × 1961 |
| `lobby-step-5.jpg` | `step 5.png` | 1440 × 2047 |

Each JPEG uses quality 95 and full chroma sampling. First, pixel registration determines the original photo's scale/position for each screenshot. The original photo fills the central header and every panel region, so source heading text, progress circles, labels, white panels, borders, form fields, and controls are excluded completely. Then only exposed photography from each screenshot restores the outer scene/floor. Conservative exclusion rectangles protect the full header UI zone `(300, 80, 1161, 301)` and all panel bounds, with extra padding around borders and rounded corners.

| Page | Original photo's rendered width × height | Original photo's top-left offset |
| --- | --- | --- |
| Step 1 | 1244.8 × 1664.5 | +67.2, −13.0 |
| Step 2 | 1653.1 × 2254.0 | −106.1, −11.4 |
| Step 3 | 1440.0 × 2044.0 | 0.0, 0.0 |
| Step 4 | 1244.8 × 1766.9 | +67.2, −98.6 |
| Step 5 | 1244.8 × 1766.9 | +67.2, −55.6 |

Where the supplied photo lacks pixels behind the reference's white panels, neighboring photo-only right-edge strips or the clean final 110 px of the corresponding screenshot's marble floor fill those unseen regions. Those fills contain photography only. They are behind the form surfaces at the reference dimensions and are not additional screenshot UI. The exposed background remains from the reference; naturally different page heights and widths scale the background with the live layout.

Use the matching `lobby-step-N.jpg` with `background-size: 100% 100%` on desktop. All five phone references use the unchanged portrait `lobby-mobile.png` stretched to the full page dimensions, also with `background-size: 100% 100%` and top alignment. Pixel fitting confirmed this independently for each phone reference.

## Fonts

The fonts are authentic, unmodified Google Fonts variable TrueType files downloaded over verified HTTPS from the official `google/fonts` repository. They are self-hosted so the site does not require font-network requests at runtime.

| Local file | Family/style | Weight range | Source |
| --- | --- | --- | --- |
| `cormorant-garamond.ttf` | Cormorant Garamond, normal | 300–700 | [Google Fonts source](https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf) |
| `plus-jakarta-sans.ttf` | Plus Jakarta Sans, normal | 200–800 | [Google Fonts source](https://raw.githubusercontent.com/google/fonts/main/ofl/plusjakartasans/PlusJakartaSans%5Bwght%5D.ttf) |

Each font's SIL Open Font License is included as `cormorant-garamond-OFL.txt` or `plus-jakarta-sans-OFL.txt`. No italic font was needed for the supplied screenshots.

Declare `font-weight: 300 700` for the serif `@font-face` and `font-weight: 200 800` for the sans-serif `@font-face`, both with `font-style: normal` and `format('truetype')`.
