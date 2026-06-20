// Resolve the client IP from proxy headers, safely.
//
// X-Forwarded-For is a client-settable header — a request can prepend fake
// entries — so the LEFT-most value is the MOST attacker-controllable, not the
// least. Taking xff.split(',')[0] lets a caller forge any IP, which defeats
// per-IP caps (free-tier allowance, per-IP account-creation limits) by rotating
// the header.
//
// Behind a reverse proxy / CDN, the trustworthy entry is the one your own
// infrastructure appended: the N-th from the RIGHT, where N = the number of
// trusted proxies between the client and this app (XFF_TRUSTED_PROXY_COUNT,
// default 1 — e.g. a single CDN/load balancer). Set it to your real hop count.
// If the app is exposed with NO proxy, X-Forwarded-For cannot be trusted at all
// — ensure a proxy sets it.
const TRUSTED_HOPS = Math.max(0, Math.floor(Number(process.env.XFF_TRUSTED_PROXY_COUNT ?? 1)) || 0);

type HeaderBag = { headers: { get(name: string): string | null } };

export function clientIp(req: HeaderBag): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) {
      // The IP inserted by the outermost trusted proxy sits at index
      // (length - TRUSTED_HOPS): TRUSTED_HOPS=1 -> the right-most entry. Clamp
      // into range so a too-short (spoofed) or misconfigured header can't throw.
      const raw = parts.length - TRUSTED_HOPS;
      const idx = raw < 0 ? 0 : raw > parts.length - 1 ? parts.length - 1 : raw;
      return parts[idx];
    }
  }
  return req.headers.get('x-real-ip') || '0.0.0.0';
}
