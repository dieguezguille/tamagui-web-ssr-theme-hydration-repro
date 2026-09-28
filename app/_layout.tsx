import { Slot } from "expo-router";
import { useColorScheme } from "react-native";
import { TamaguiProvider } from "tamagui";

import tamagui from "../tamagui.config";

export default function Layout() {
  const colorScheme = useColorScheme();
  return (
    <TamaguiProvider config={tamagui} defaultTheme={colorScheme!}>
      <Slot />
    </TamaguiProvider>
  );
}
