# tamagui v2: root theme class from the static HTML survives hydration

Minimal Expo Router app with `web.output: "static"` and tamagui 2.7.7. The root layout follows the tamagui Expo guide and passes `defaultTheme={colorScheme!}` from `useColorScheme()`.

In a browser that prefers dark, the screens stay light but sheets (and anything else portaled to `body`) are dark:

- The static render runs in Node, where `useColorScheme()` is `light`, so `TamaguiProvider` writes `t_light` into its two root wrappers: `<span class="t_light _dsp_contents">` and `<span class=" t_light is_Theme">`.
- On the client, `useColorScheme()` is `dark` on the first render, so the provider hydrates with `defaultTheme="dark"`. React 19 does not patch mismatched attributes during hydration, and the next renders produce the same `dark` value, so React never touches those `className`s again. They stay `t_light`.
- `ThemeProvider`'s layout effect adds `t_dark` to `body`, so portals, which render outside the wrappers, are dark.

## Versions

- tamagui 2.7.7, @tamagui/config 2.7.7 (`@tamagui/config/v3`, no settings overrides)
- expo 55.0.31, expo-router 55.0.18, react / react-dom 19.2.0, react-native-web 0.21.3
- Node 24.13.0, pnpm 11.5.2, macOS 27.0 (arm64), headless Chrome 153.0.8010.54

## Steps

```sh
pnpm install
pnpm export   # TAMAGUI_DISABLE_SLIDER_INTERVAL=1 expo export --platform web
pnpm serve    # expo serve --port 4319, leave it running
pnpm check    # in another terminal
```

`pnpm export` sets `TAMAGUI_DISABLE_SLIDER_INTERVAL=1`. Without it, `expo export` writes `dist` but never exits on tamagui 2.7.7, because `@tamagui/slider` starts a module-level `setInterval` that keeps Node alive. That is a separate bug and does not affect this repro.

`pnpm check` (`scripts/check.mjs`, no dependencies) launches headless Chrome with `--remote-debugging-port=9337` and, for each of `prefers-color-scheme: dark` and `light` (set with CDP `Emulation.setEmulatedMedia`):

1. loads the page and waits for hydration (a `t_light`/`t_dark` class on `html` or `body`);
2. prints the classes of `html`, `body` and the root theme wrappers that contain the screen;
3. clicks "open sheet" and prints the computed background of the screen (`#screen`) and of the sheet (`#sheet`).

It exits with 1 when a root wrapper does not match the emulated scheme or the screen and the sheet have different backgrounds. Set `CHROME`, `URL` or `CDP_PORT` to override the defaults.

The bug only shows up in the exported build. `expo start --web` renders with `createRoot` instead of `hydrateRoot` (the dev HTML does not set `__EXPO_ROUTER_HYDRATE__`), so there the wrappers are created on the client with the right class.

## Results

### `main`: stock tamagui 2.7.7

```text
static html (before hydration)
  root wrappers: [ 't_light _dsp_contents', ' t_light is_Theme' ]

prefers-color-scheme: dark
  matchMedia dark: true
  <html class>: ""  <body class>: "t_dark"
  root wrappers after hydration: ["t_light _dsp_contents"," t_light is_Theme"]
  #screen background: rgb(255, 255, 255)
  #sheet background:  rgb(5, 5, 5)  (portal, nearest theme class: "t_sub_theme t_dark is_Theme")
  console errors/warnings: none
  => MISMATCH: root wrappers are not t_dark and the screen does not match the sheet

prefers-color-scheme: light
  <html class>: ""  <body class>: "t_light"
  root wrappers after hydration: ["t_light _dsp_contents"," t_light is_Theme"]
  #screen background: rgb(255, 255, 255)
  #sheet background:  rgb(255, 255, 255)
  => ok
```

No hydration warning is logged in the production build.

### `with-workaround`: `defaultTheme` held at the server value until hydration finishes

```tsx
const dark = useDidFinishSSR() && colorScheme === "dark";
<TamaguiProvider config={tamagui} defaultTheme={dark ? "dark" : "light"}>
```

`useDidFinishSSR()` is `false` during the server render and the hydration render, so the first client render matches the HTML. The next render switches to `dark` as a normal update, and React patches the class.

```text
prefers-color-scheme: dark
  <html class>: ""  <body class>: "t_dark"
  root wrappers after hydration: ["t_dark _dsp_contents"," t_dark is_Theme"]
  #screen background: rgb(5, 5, 5)
  #sheet background:  rgb(5, 5, 5)
  => ok

prefers-color-scheme: light
  root wrappers after hydration: ["t_light _dsp_contents"," t_light is_Theme"]
  #screen background: rgb(255, 255, 255)
  #sheet background:  rgb(255, 255, 255)
  => ok
```

### `v3-beta`: tamagui 3.0.0-beta.1479.1

`@tamagui/config/v3` no longer exists, so this branch uses `@tamagui/config/v5` plus `v5-css` animations, with `addThemeClassName` reset to `undefined` (the value it has in any config that does not set it). The beta renames `Sheet.Frame` to `Sheet.Container` and drops the `$` token prefix. Run `pnpm install` after switching.

```text
static html (before hydration)
  root wrappers: [ 't_light _dsp_contents', ' t_light is_Theme' ]

prefers-color-scheme: dark
  <html class>: ""  <body class>: "t_dark"
  root wrappers after hydration: ["t_light _dsp_contents"," t_light is_Theme"]
  #screen background: rgb(247, 247, 247)
  #sheet background:  rgb(20, 20, 20)
  => MISMATCH
```

### `v1`: tamagui 1.144.4, same app and config

`@tamagui/config/v3` in 1.x sets `themeClassNameOnRoot: true`, so the provider renders no theme class into the HTML and puts it on `html` after mount. Run `pnpm install` after switching.

```text
static html (before hydration)
  root wrappers: []

prefers-color-scheme: dark
  <html class>: "t_dark"  <body class>: ""
  root wrappers after hydration: []
  #screen background: rgb(5, 5, 5)
  #sheet background:  rgb(5, 5, 5)
  => ok
```

### Other configurations (not on a branch)

| tamagui | config | `addThemeClassName` | static HTML root wrappers | dark: screen / sheet | result |
| --- | --- | --- | --- | --- | --- |
| 2.7.7 | `@tamagui/config/v3` | unset | `t_light` | light / dark | mismatch |
| 2.7.7 | `@tamagui/config/v3` | `"html"` | none | dark / dark | ok |
| 2.7.7 | `@tamagui/config/v5` + `v5-css` | `"html"` (its default) | none | dark / dark | ok |
| 2.7.7 | `@tamagui/config/v5` + `v5-css` | reset to `undefined` | `t_light` | light / dark | mismatch |
| 3.0.0-beta.1479.1 | `@tamagui/config/v5` + `v5-css` | reset to `undefined` | `t_light` | light / dark | mismatch |
| 1.144.4 | `@tamagui/config/v3` | n/a (`themeClassNameOnRoot: true`) | none | dark / dark | ok |
