import { appWindow } from '@tauri-apps/api/window';

export async function resizeWindowToContent(topBarHeight: number, responseBoxHeight: number | null) {
  const MIN_HEIGHT = 120; // Minimum height for just the TopBar
  const MIN_HEIGHT_WITH_RESPONSE = 350; // Minimum height with response
  const width = 640; // or your preferred width

  if (responseBoxHeight == null) {
    await appWindow.setSize({
      width,
      height: Math.max(topBarHeight, MIN_HEIGHT)
    });
    return;
  }
  // If response box is present, add its height, but never go below minimum
  await appWindow.setSize({
    width,
    height: Math.max(topBarHeight + responseBoxHeight, MIN_HEIGHT_WITH_RESPONSE)
  });
}
