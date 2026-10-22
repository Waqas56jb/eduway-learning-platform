# EDUWAY — Design Quality Bar v2 (internal, for builders)

The client tested v1 on a real iPhone and rejected it: "unresponsive, not aligned, not well structured, not beautiful,
splash screens too bad, buttons unresponsive / not elegant / not aligned". v2 must look like a top-10 App Store
education app (think Masterclass × Apple Fitness+ × Headspace), with a warm-luxury navy + gold identity.

## Root issues found in v1 (fix wherever you see them)
1. **RTL**: the app starts in Arabic. The root view sets `direction: rtl` (no native forceRTL, no reload).
   Under native RTL, `flexDirection: 'row'`, `start/end`, `marginStart` etc. flip AUTOMATICALLY. Do **not** also
   flip manually with `isAr ? 'row-reverse' : 'row'`, `isAr ? -x : x` on layout, or `scaleX: -1` on whole rows —
   that double-flips and misaligns. Use `isRTL()` from `@/utils/rtl` (the root view sets Yoga `direction`; native I18nManager RTL is kept OFF) for any geometry
   (translateX directions, chart axes, pager offsets). `isAr` is only for choosing fonts/strings.
   Never use `textAlign: 'left'|'right'` on Text; our `Text` handles alignment (`align="start|center|end"`).
2. **Responsiveness**: layouts were built for one size. Every screen must look great at 320pt (iPhone SE 1st gen)
   up to 430pt (Pro Max) wide and short/tall heights. Use `useWindowDimensions()`, flex, `aspectRatio`, percentage
   widths; no hard-coded widths wider than ~280; no fixed heights for text containers; `numberOfLines` +
   `adjustsFontSizeToFit` (with `minimumFontScale`) only for single-line labels like prices/stats. Grids compute
   column width from the window width. Nothing may clip or overflow horizontally.
3. **Touch feedback**: every tappable element must respond instantly — pressed state (scale 0.97 + opacity/overlay),
   44×44pt minimum hit area (`hitSlop` on small icons), haptic on primary actions. No nested Pressables that steal
   touches, no absolute overlays (gradients, glows, decorative views) without `pointerEvents="none"`.
   ScrollViews with buttons need `keyboardShouldPersistTaps="handled"`.
4. **Performance** (Expo Go dev mode on device): avoid many simultaneous infinite animations, avoid rendering many
   WebViews (MathText) in lists — use plain text previews in lists, KaTeX only on detail views. Memoize list rows.
   Use `FadeInDown.duration(350).delay(min(i*60, 300))` style entrances — never long chains.

## Visual system
- **Grid & rhythm**: 4-pt grid. Screen gutter 20. Vertical rhythm between sections 28–32; inside cards 16–20.
  Align everything to the same start edge; icons optically centered with text (row `alignItems: 'center'`).
- **Type hierarchy**: one display title per screen (Playfair 28–34 / Tajawal 800 in AR), section titles h3,
  body 15/22, captions 12–13 muted. Max 2 font weights per card. Letter-spaced overline labels in gold for sections.
  Never all-caps Arabic.
- **Color**: cream background, white cards with hairline `colors.border` + soft shadow, navy hero areas, gold only
  for accents/primary CTA/active states (never large gold text blocks). Dark mode: navy surfaces, same gold.
- **Buttons**: primary = gold gradient pill/rounded-14, 52–56pt tall, full width at screen bottom with safe-area
  padding, navy label semibold 16; secondary = navy solid; tertiary = text button with gold label. Icon+label gap 8.
  One primary CTA per screen. Buttons align to the gutter; side-by-side buttons share width equally with 12 gap.
- **Cards**: radius 20, padding 16–20, consistent across the app. Images radius 16 inside cards.
- **Headers**: consistent `Header` component everywhere: 44pt circular back button, centered title on detail
  screens; large Playfair title on tab roots.
- **Motion**: purposeful and smooth — screen content fade/slide-up 300ms staggered; press scale; progress fills
  animate once; skeletons while loading. Spring configs: damping 18, stiffness 220.
- **Imagery**: HD Unsplash, always with a gradient scrim for text legibility (`gradients.imageOverlay`).
- **Empty/loading states**: never blank — skeletons and EmptyState.

## Process
- Read `CONTRACT.md` (SDK 57 notes at the top) and this file first. Keep exported component APIs stable
  (you may add optional props). Only edit the files you own.
- A dev server is already running with fast refresh. Do NOT start another server, install packages or edit
  package.json/app.json.
- Before finishing: type-check with `node node_modules/typescript/bin/tsc --noEmit` (set
  `NODE_OPTIONS=--max-old-space-size=4096`), run from `app/user` — your files must have zero errors. Keep en/ar
  i18n keys identical for your namespaces.
