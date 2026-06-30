# Customizing the Recap Video

Guide to reskinning colors, fonts, title, and other visual elements. All customization is code-based (TypeScript + React); no separate design files.

## Quick color swap

The easiest customization: change brand colors.

Edit `src/theme.ts`:

```typescript
export const theme = {
  navy: "#0a0a16",           // dark background
  surface: "#161628",        // card backgrounds
  border: "#2a2a4a",         // divider lines
  orange: "#F5C842",         // primary accent (e.g., host ring, active caption word)
  orangeHover: "#FFD95E",    // hover state for orange
  purple: "#00E5FF",         // secondary accent (e.g., waveform, guest ring)
  purpleHover: "#4DEEFF",    // hover state for purple
  cream: "#FFF8F0",          // light text (rarely used)
  textOnDark: "#e8e8f0",     // main text
  textOnDarkSecondary: "#a0a0c0",  // secondary text (hint, metadata)
  textOnDarkTertiary: "#7a7a9a",   // tertiary (very subtle)
  fontSans: "'SF Pro Display', 'SF Pro', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
} as const;
```

For example, to use a custom brand palette:

```typescript
export const theme = {
  navy: "#0d0221",           // deep purple (your brand dark)
  surface: "#1a0033",        // brand dark-medium
  border: "#330066",         // brand dark-light
  orange: "#FF6B35",         // your brand orange
  orangeHover: "#FF8555",
  purple: "#00D4FF",         // your brand cyan
  purpleHover: "#33E0FF",
  cream: "#FFF5E1",
  textOnDark: "#F5F5F5",
  textOnDarkSecondary: "#CCCCCC",
  textOnDarkTertiary: "#999999",
  fontSans: "'Inter', system-ui, sans-serif",  // change font family
} as const;
```

Then re-render:

```bash
npm run render SpaceRecap out/space-recap.mp4 -- --concurrency=2 --timeout=300000
```

All components automatically use the new theme.

## Change title and subtitle

Edit `src/Root.tsx`. The Remotion composition receives title and subtitle as props.

Look for where `SpaceRecap` is rendered:

```tsx
export const Root: React.FC = () => {
  return (
    <Composition
      id="SpaceRecap"
      component={SpaceRecap}
      durationInFrames={...}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        audioSrc: "/audio.ogg",
        title: "My Awesome Space",           // <- change this
        subtitle: "June 2024",               // <- and this
        transcript: data.transcript,
        profiles: data.profiles,
      }}
    />
  );
};
```

For dynamic titles (e.g., from data), update the default props:

```typescript
defaultProps={{
  audioSrc: "/audio.ogg",
  title: "ZABAL Gamez Workshop: Empire Builder",
  subtitle: "June 1, 2024",
  transcript: data.transcript,
  profiles: data.profiles,
}}
```

Then render. The TitleCard component (top-left) displays the title and subtitle.

## Change fonts

Edit `src/theme.ts` - the `fontSans` field:

```typescript
fontSans: "'Helvetica Neue', Helvetica, Arial, sans-serif"  // modern sans
// or
fontSans: "'Georgia', serif"  // serif (less common for video)
// or
fontSans: "'Courier New', monospace"  // monospace (unusual but possible)
```

All components use `theme.fontSans`. Change it once, apply everywhere.

Note: web fonts (Google Fonts, etc.) may not be available in the Remotion render context. Stick with system fonts or pre-load them in `src/Root.tsx`.

## Customize guest card appearance

The `GuestCard` component displays the speaker's avatar, name, and optional label (top-left).

Edit `src/components/GuestCard.tsx`:

```tsx
// Change card size
width={240}   // default 240px
height={320}  // default 320px

// Change animation (appears/fades)
opacity={interpolate(frame, [start, start+10], [0, 1])}  // fade-in duration

// Change text size
fontSize={32}  // name text
fontSize={14}  // metadata text

// Change ring color (guest card border)
strokeColor={theme.purple}  // default cyan

// Change avatar size
avatarSize={180}  // the profile picture
```

For example, to make the guest card more prominent:

```tsx
// In GuestCard.tsx, increase size + text
width={300}    // wider
height={380}   // taller
fontSize={40}  // bigger name text
strokeWidth={4}  // thicker ring
```

Then render.

## Customize host badge

The `HostBadge` component displays the host's avatar (top-right corner).

Edit `src/components/HostBadge.tsx`:

```tsx
// Change position (top-right)
right={40}    // distance from right edge
top={40}      // distance from top

// Change size
size={100}    // avatar diameter

// Change ring color
strokeColor={theme.orange}  // default gold

// Change ring thickness
strokeWidth={3}  // pixels
```

## Customize captions

The `CaptionTrack` component displays word-by-word captions (lower-third).

Edit `src/components/CaptionTrack.tsx`:

```tsx
// Change position
bottom={160}  // distance from bottom
left={40}     // distance from left
right={40}    // distance from right

// Change text size
fontSize={32}  // pixels (words)
lineHeight={1.4}  // space between lines

// Change background
background={rgba(0, 0, 0, 0.6)}  // semi-transparent dark

// Change active word color (current speaker's words)
activeColor={theme.orange}  // default gold

// Change inactive color
inactiveColor={theme.textOnDark}  // default light gray

// Change underline
borderBottom={`3px solid ${theme.purple}`}  // color of active word underline
```

For example, larger, more visible captions:

```tsx
fontSize={40}  // bigger
lineHeight={1.6}  // more space
padding: "12px 20px"  // more padding around text
background={rgba(0, 0, 0, 0.8)}  // more opaque
```

## Customize waveform

The `Waveform` component visualizes audio frequency spectrum (right side).

Edit `src/components/Waveform.tsx`:

```tsx
// Change position (right-side)
x={width * 0.55}   // distance from left
y={220}            // distance from top

// Change size
width={width * 0.4}  // width (percent of video)
height={520}         // height in pixels

// Change colors
primaryColor={theme.purple}   // main waveform bars
secondaryColor={theme.orange}  // secondary bars
glowColor={rgba(0, 229, 255, 0.5)}  // glow effect

// Change bar style
barWidth={4}       // pixel width of each bar
gapWidth={2}       // gap between bars
cornerRadius={2}   // rounded corners on bars

// Change animation
smoothing={0.8}    // FFT smoothing (0-1)
```

For example, a larger waveform with bold colors:

```tsx
width={width * 0.45}  // bigger
height={600}
barWidth={6}  // thicker bars
primaryColor={theme.orange}  // swap colors
secondaryColor={theme.purple}
glowColor={rgba(255, 107, 53, 0.6)}  // match orange glow
```

## Customize progress bar

The `ProgressBar` component shows a playhead indicator at the bottom.

Edit `src/components/ProgressBar.tsx`:

```tsx
// Change position
bottom={0}        // distance from bottom
height={6}        // pixel height

// Change colors
filledColor={theme.purple}  // color of progress
backgroundColor={rgba(255, 255, 255, 0.1)}  // unfilled background

// Change style
borderRadius={3}  // rounded corners
```

For example, a thicker, more prominent progress bar:

```tsx
height={10}  // bigger
filledColor={theme.orange}  // gold instead of cyan
backgroundColor={rgba(0, 0, 0, 0.3)}  // darker background
```

## Customize title card

The `TitleCard` component (top-left "Space name").

Edit `src/components/TitleCard.tsx`:

```tsx
// Change position
left={40}   // distance from left
top={40}    // distance from top

// Change text size
fontSize={48}    // title
fontSize={24}    // subtitle

// Change colors
color={theme.textOnDark}  // text color
```

For example, fancier title:

```tsx
fontSize={56}  // bigger title
fontWeight={700}  // bold
color={theme.orange}  // gold instead of white
```

## Customize time badge

The `TimeBadge` component (bottom-right "HH:MM / HH:MM").

Edit `src/components/TimeBadge.tsx`:

```tsx
// Change position
right={40}   // distance from right
bottom={40}  // distance from bottom

// Change style
fontSize={20}  // text size
fontWeight={600}  // weight
color={theme.textOnDarkSecondary}  // color (default: dim gray)
```

## Customize footer caveat

The footer message "Some guests not pictured..." appears at the bottom-left.

Edit `src/compositions/SpaceRecap.tsx`:

```tsx
<div
  style={{
    position: "absolute",
    bottom: 32,
    left: 40,
    color: theme.textOnDarkTertiary,
    fontSize: 14,
    // change the text or remove the div entirely
  }}
>
  Some guests not pictured - apologies for any we missed.
</div>
```

To customize:

```tsx
<div style={{ ... }}>
  Thanks for watching. Guests shown may not include everyone who spoke.
</div>
```

Or remove the caveat:

```tsx
{/* Remove this div or set display: none */}
```

## Customize layout

The main composition in `src/compositions/SpaceRecap.tsx` controls which components appear and where.

Example: remove the waveform, expand guest card:

```tsx
<AbsoluteFill ...>
  {/* Remove or comment out the Waveform */}
  {/* <Waveform ... /> */}
  
  {/* Expand GuestCard to fill right side */}
  <GuestCard guest={guest} changedAtFrame={changedAtFrame} width={900} height={700} />
</AbsoluteFill>
```

Or move the caption track to the center:

```tsx
<CaptionTrack
  utterances={utterances}
  x={200}    // new position
  y={540}
  width={1520}  // wider
/>
```

## Add custom components

You can add new components. Create a file like `src/components/CustomBadge.tsx`:

```tsx
import React from "react";
import { AbsoluteFill } from "remotion";
import { theme } from "../theme";

export const CustomBadge: React.FC<{ text: string }> = ({ text }) => (
  <AbsoluteFill
    style={{
      position: "absolute",
      top: 100,
      left: 100,
      width: 200,
      height: 80,
      background: theme.surface,
      border: `2px solid ${theme.border}`,
      borderRadius: 12,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: theme.orange,
      fontSize: 24,
      fontWeight: 600,
    }}
  >
    {text}
  </AbsoluteFill>
);
```

Then import and use in `SpaceRecap.tsx`:

```tsx
import { CustomBadge } from "../components/CustomBadge";

export const SpaceRecap: React.FC<SpaceRecapProps> = ({ ... }) => (
  <AbsoluteFill ...>
    <CustomBadge text="LIVE" />
    {/* rest of components */}
  </AbsoluteFill>
);
```

## Add intro/outro templates

To splice branded intro/outro videos onto the final render:

1. Create or download intro.mp4 and outro.mp4 (1920x1080, H264 + AAC)
2. Place in `out/parts/intro-norm.mp4` and `out/parts/outro-norm.mp4`
3. Use the dashboard (Step 3) or run manually:

```bash
ffmpeg -i out/parts/intro-norm.mp4 -i out/space-recap.mp4 -i out/parts/outro-norm.mp4 \
  -filter_complex "[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[v][a]" \
  -map "[v]" -map "[a]" -c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p \
  -c:a aac -ar 48000 -b:a 192k -movflags +faststart \
  out/space-recap-bookended.mp4
```

## Background gradient

The main background is a radial gradient. Edit `SpaceRecap.tsx`:

```tsx
<AbsoluteFill
  style={{
    background: `radial-gradient(
      ellipse at 30% 20%,
      ${theme.surface} 0%,
      ${theme.navy} 55%,
      #050309 100%
    )`,
    fontFamily: theme.fontSans,
  }}
>
```

Change the gradient:

```tsx
// Solid color background
background: theme.navy

// Darker gradient
background: `radial-gradient(ellipse at 20% 10%, ${theme.surface} 0%, #000000 100%)`

// Lighter background
background: `linear-gradient(180deg, ${theme.surface} 0%, ${theme.navy} 100%)`
```

## Text styling

All text uses `theme.fontSans`. For per-component fonts:

```tsx
// Sans-serif (default)
fontFamily: theme.fontSans

// Monospace (captions, metadata)
fontFamily: "'Courier New', monospace"

// Serif (fancy titles)
fontFamily: "'Georgia', serif"
```

Example: make captions monospace:

```tsx
// In CaptionTrack.tsx
<span style={{ fontFamily: "'Menlo', monospace" }}>
  {word}
</span>
```

## Opacity and transparency

Use RGBA for transparency:

```tsx
backgroundColor: "rgba(0, 0, 0, 0.5)"  // 50% opacity
borderColor: `rgba(${255}, ${107}, ${53}, 0.8)`  // 80% opacity

// Or use CSS filters
filter: "opacity(0.8)"
```

Example: semi-transparent guest card background:

```tsx
background: `rgba(0, 0, 0, 0.3)`  // 30% opaque dark
borderColor: `rgba(${0}, ${229}, ${255}, 0.6)`  // 60% opaque cyan ring
```

## Performance tips

- Avoid per-frame calculations on large lists (captions, bars)
- Use `React.memo()` for components that don't need frequent re-renders
- Keep component trees shallow (avoid deep nesting)
- Pre-compute animations (interpolate, not spring per-frame)

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for per-frame animation performance issues.

## Testing changes

Use Remotion Studio for instant preview:

```bash
npm start   # http://localhost:3000
```

Scrub through frames to see your changes before rendering the full video (which takes hours).

## See also

- [README.md](../README.md) - overview
- [PIPELINE.md](PIPELINE.md) - full workflow
- src/theme.ts - the color/font source of truth
- src/components/ - all visual components
