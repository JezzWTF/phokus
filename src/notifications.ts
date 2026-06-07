import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

let permissionPromise: Promise<boolean> | null = null;

export function initializeNotifications(): Promise<boolean> {
  permissionPromise ??= (async () => {
    try {
      if (await isPermissionGranted()) return true;
      return (await requestPermission()) === "granted";
    } catch (error) {
      console.warn("Windows notifications are unavailable:", error);
      return false;
    }
  })();

  return permissionPromise;
}

export async function notifyTaskComplete(title: string, body: string): Promise<void> {
  if (!(await initializeNotifications())) return;

  try {
    sendNotification({ title, body });
  } catch (error) {
    console.warn("Could not send task completion notification:", error);
  }
}
