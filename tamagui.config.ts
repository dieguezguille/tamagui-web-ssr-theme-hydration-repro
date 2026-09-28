import { config } from "@tamagui/config/v3";
import { createTamagui } from "tamagui";

const tamagui = createTamagui(config);

export default tamagui;

export type Conf = typeof tamagui;

declare module "tamagui" {
  interface TamaguiCustomConfig extends Conf {} // eslint-disable-line @typescript-eslint/no-empty-object-type
}
