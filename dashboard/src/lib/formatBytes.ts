export function formatBytes(bytes: number, decimals: number = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "N/A";
  if (bytes === 0) return "0 B";

  const sizes: string[] = ["B", "KB", "MB", "GB", "TB", "PB"];
  const k: number = 1024;
  const i: number = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const d: number = Math.min(Math.max(Math.floor(decimals), 0), 20);

  return `${(bytes / Math.pow(k, i)).toFixed(d)} ${sizes[i]}`;
}
