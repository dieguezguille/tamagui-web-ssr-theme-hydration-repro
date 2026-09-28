import { defaultConfig } from "@tamagui/config/v5";
import { animations } from "@tamagui/config/v5-css";
import { createTamagui } from "tamagui";

const tamagui = createTamagui({ ...defaultConfig, animations, settings: { ...defaultConfig.settings, addThemeClassName: undefined } });

export default tamagui;

export type Conf = typeof tamagui;

declare module "tamagui" {
  interface TamaguiCustomConfig extends Conf {} // eslint-disable-line @typescript-eslint/no-empty-object-type
}
