import { useState } from "react";
import { Button, Paragraph, Sheet, YStack } from "tamagui";

export default function Home() {
  const [open, setOpen] = useState(false);
  return (
    <YStack id="screen" flex={1} minHeight="100vh" backgroundColor="background" padding="4" gap="4">
      <Paragraph color="color">screen: themed background</Paragraph>
      <Button id="open" onPress={() => setOpen(true)}>
        open sheet
      </Button>
      <Sheet modal open={open} onOpenChange={setOpen} snapPoints={[40]}>
        <Sheet.Overlay />
        <Sheet.Container id="sheet" backgroundColor="background" padding="4">
          <Paragraph color="color">sheet: themed background</Paragraph>
        </Sheet.Container>
      </Sheet>
    </YStack>
  );
}
