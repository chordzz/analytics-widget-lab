# Reference tokens — snapshot

Snapshot of the current `@SMCDAO/ui` palette, taken 2026-08-04 from `ui/packages/ui/src/components/*/colors.ts` and `ui/packages/ui/src/themes/`. This is **context, not a dependency** — the sandbox does not import from the `ui` repo (see [Analytics_Widgets_Plan.md](../Analytics_Widgets_Plan.md) §9). Re-diff this against the real library before porting widgets back; it will drift as `@SMCDAO/ui` gets its own updates.

Mapped into `src/index.css` as `--analytics-*` custom properties.

## Chart (`Chart/colors.ts`, `default` variant)

| Token | Light | Dark |
|---|---|---|
| bg | `bg-white` | `bg-gray-900` |
| grid | `stroke-gray-200` | `stroke-gray-700` |
| axis | `stroke-gray-600` | `stroke-gray-400` |
| tooltip | `bg-gray-900 text-white` | `bg-gray-100 text-gray-900` |

## InfoCard (`InfoCard/colors.ts`, `metric` variant)

| Token | Light | Dark |
|---|---|---|
| bg | `transparent` | `transparent` |
| text | `#000000` | `#F2F2F2` |
| border | `#E5E5E5` | `#333333` |
| bgHover | `#EBEBEB` | `#262626` |
| textSecondary | `#6B7280` | `#9CA3AF` |

## Pill (`Pill/colors.ts`)

| Token | Light | Dark |
|---|---|---|
| bg | `#FFFFFF` | `#202020` |
| text | `#000000` | `#F2F2F2` |
| border | `#E5E5E5` | `#333333` |
| disabled bg | `#F3F4F6` | `#111827` |

## Chart series colors (`Chart.tsx` `defaultColors`)

```
#8884d8 #82ca9d #ffc658 #ff7300 #00ff00 #ff00ff #00ffff
```

Sandbox uses a trimmed, slightly desaturated version of this set (`--analytics-series-1..6`) — close enough for prototyping, not pixel-identical.

## Not yet in the library (net new for analytics)

- Status/threshold colors (positive/warning/negative/neutral) — no equivalent component today. Sandbox values in `src/index.css` are placeholders pending a real design decision.
- Sequential/diverging palette for heatmaps/choropleths — not started.
