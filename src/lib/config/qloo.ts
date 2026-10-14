export const QLOO_HOSTS = [
  "https://api.qloo.com",
  "https://hackathon.api.qloo.com",
] as const;
export type QlooHost = (typeof QLOO_HOSTS)[number];
export function isQlooHost(value: unknown): value is QlooHost {
  return typeof value === "string" && QLOO_HOSTS.some((host) => host === value);
}
