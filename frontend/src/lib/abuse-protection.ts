import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { env } from "~/env";

const defaultDisposableDomains = [
  "10minutemail.com",
  "dispostable.com",
  "emailondeck.com",
  "fakeinbox.com",
  "getnada.com",
  "guerrillamail.com",
  "maildrop.cc",
  "mailinator.com",
  "minuteinbox.com",
  "sharklasers.com",
  "temp-mail.org",
  "tempmail.com",
  "throwawaymail.com",
  "trashmail.com",
  "yopmail.com",
];

export function normalizeEmail(email: string) {
  const [rawLocalPart, rawDomain] = email.trim().toLowerCase().split("@");
  if (!rawLocalPart || !rawDomain) {
    throw new Error("Enter a valid email address.");
  }

  const domain = rawDomain === "googlemail.com" ? "gmail.com" : rawDomain;
  if (domain !== "gmail.com") return `${rawLocalPart}@${domain}`;

  const localPart = rawLocalPart.split("+", 1)[0]!.replaceAll(".", "");
  if (!localPart) throw new Error("Enter a valid email address.");
  return `${localPart}@gmail.com`;
}

export function isDisposableEmail(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return true;

  const configuredDomains = env.DISPOSABLE_EMAIL_DOMAINS?.split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const domains = new Set([
    ...defaultDisposableDomains,
    ...(configuredDomains ?? []),
  ]);
  return domains.has(domain);
}

function parseIpAddress(value: string) {
  let candidate = value.trim().replace(/^"|"$/g, "");
  if (candidate.startsWith("[")) {
    candidate = candidate.slice(1, candidate.indexOf("]"));
  } else if (candidate.includes(".") && candidate.includes(":")) {
    candidate = candidate.slice(0, candidate.lastIndexOf(":"));
  }
  return isIP(candidate) ? candidate.toLowerCase() : null;
}

function ipv6Network64(address: string) {
  const withoutZone = address.split("%")[0]!;
  const ipv4Separator = withoutZone.lastIndexOf(":");
  let normalized = withoutZone;
  if (withoutZone.includes(".") && ipv4Separator >= 0) {
    const ipv4 = withoutZone
      .slice(ipv4Separator + 1)
      .split(".")
      .map(Number);
    if (ipv4.length !== 4) return null;
    const tail = [
      ((ipv4[0]! << 8) | ipv4[1]!).toString(16),
      ((ipv4[2]! << 8) | ipv4[3]!).toString(16),
    ];
    normalized = `${withoutZone.slice(0, ipv4Separator)}:${tail.join(":")}`;
  }

  const [left = "", right = ""] = normalized.split("::");
  const leftGroups = left ? left.split(":") : [];
  const rightGroups = right ? right.split(":") : [];
  const missingGroups = 8 - leftGroups.length - rightGroups.length;
  if (
    missingGroups < 0 ||
    (!normalized.includes("::") && missingGroups !== 0)
  ) {
    return null;
  }
  const groups = [
    ...leftGroups,
    ...Array.from({ length: missingGroups }, () => "0"),
    ...rightGroups,
  ];
  if (groups.length !== 8) return null;
  return `${groups
    .slice(0, 4)
    .map((group) => Number.parseInt(group ?? "0", 16).toString(16))
    .join(":")}::/64`;
}

export function getClientIp(headers: Headers) {
  const realIp = headers.get("x-real-ip");
  if (realIp) {
    const parsed = parseIpAddress(realIp);
    if (parsed) return parsed;
  }

  const forwardedFor = headers.get("x-forwarded-for");
  if (!forwardedFor) return null;
  const addresses = forwardedFor
    .split(",")
    .map(parseIpAddress)
    .filter((address): address is string => address !== null);
  return addresses.at(-1) ?? null;
}

export function getIpBucketKey(ip: string) {
  const version = isIP(ip);
  if (!version) throw new Error("Invalid client IP address.");
  const network = version === 6 ? ipv6Network64(ip) : ip;
  if (!network) throw new Error("Invalid client IP address.");
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(network)
    .digest("hex");
}

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string,
  expectedAction?: string,
) {
  if (!env.TURNSTILE_SECRET_KEY) {
    throw new Error("Turnstile is not configured on the server.");
  }

  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: token,
  });
  if (remoteIp) body.set("remoteip", remoteIp);

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok) {
    throw new Error(`Turnstile verification failed (${response.status}).`);
  }

  const result = (await response.json()) as {
    success: boolean;
    action?: string;
    hostname?: string;
    "error-codes"?: string[];
  };
  const expectedHostname = new URL(env.BETTER_AUTH_URL).hostname;
  if (
    !result.success ||
    (expectedAction && result.action !== expectedAction) ||
    result.hostname !== expectedHostname
  ) {
    throw new Error("Turnstile verification was rejected.");
  }
}
