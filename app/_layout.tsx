import { Slot } from "expo-router";
import { useColorScheme } from "react-native";
import { TamaguiProvider, useDidFinishSSR } from "tamagui";

import tamagui from "../tamagui.config";

export default function Layout() {
  const colorScheme = useColorScheme();
  const dark = useDidFinishSSR() && colorScheme === "dark";
  return (
    <TamaguiProvider config={tamagui} defaultTheme={dark ? "dark" : "light"}>
      <Slot />
    </TamaguiProvider>
  );
}
