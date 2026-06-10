import { Router, type IRouter } from "express";
import { randomBytes } from "crypto";
import { getAuth, clerkClient } from "@clerk/express";
import { db, partnerKeysTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";

const router: IRouter = Router();

const TIER = "Core";
const KEY_PREFIX = "sk_sent_core_";
const DEFAULT_LABEL = "Default agent key";

function generateKey(): string {
  return `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
}

function maskKey(value: string): string {
  return `${value.substring(0, 20)}${"\u2022".repeat(8)}`;
}

async function getPrimaryEmail(userId: string): Promise<string | null> {
  try {
    const user = await clerkClient.users.getUser(userId);
    const primary = user.emailAddresses.find(
      (e) => e.id === user.primaryEmailAddressId,
    );
    return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
  } catch {
    return null;
  }
}

async function findActiveKey(userId: string) {
  const [row] = await db
    .select()
    .from(partnerKeysTable)
    .where(
      and(
        eq(partnerKeysTable.partnerId, userId),
        eq(partnerKeysTable.isActive, true),
      ),
    )
    .orderBy(desc(partnerKeysTable.createdAt))
    .limit(1);
  return row ?? null;
}

// ── GET /v1/me/key — returns masked key or 404 ────────────────────────────
router.get("/v1/me/key", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  try {
    const existing = await findActiveKey(auth.userId);
    if (!existing) {
      res.status(404).json({ error: "no_key", hasKey: false });
      return;
    }

    res.json({
      hasKey: true,
      key: {
        id: existing.id,
        keyValue: maskKey(existing.keyValue),
        keyPrefix: existing.keyValue.substring(0, KEY_PREFIX.length + 4),
        label: existing.label,
        tier: existing.tier,
        createdAt: existing.createdAt,
        lastUsedAt: existing.lastUsedAt,
      },
    });
  } catch (err) {
    req.log.error({ err }, "GET /v1/me/key failed");
    res.status(500).json({ error: "internal_error", message: "Failed to retrieve key." });
  }
});

// ── POST /v1/me/key — idempotent provision: returns existing or creates new ─
router.post("/v1/me/key", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  try {
    const existing = await findActiveKey(auth.userId);
    if (existing) {
      res.status(200).json({
        created: false,
        hasKey: true,
        key: {
          id: existing.id,
          keyValue: existing.keyValue,
          keyPrefix: existing.keyValue.substring(0, KEY_PREFIX.length + 4),
          label: existing.label,
          tier: existing.tier,
          createdAt: existing.createdAt,
          lastUsedAt: existing.lastUsedAt,
        },
      });
      return;
    }

    const email = (await getPrimaryEmail(auth.userId)) ?? `${auth.userId}@clerk.unknown`;
    const keyValue = generateKey();

    const [created] = await db
      .insert(partnerKeysTable)
      .values({
        keyValue,
        partnerId: auth.userId,
        partnerEmail: email,
        label: DEFAULT_LABEL,
        tier: TIER,
        swarmScope: null,
      })
      .returning();

    res.status(201).json({
      created: true,
      hasKey: true,
      key: {
        id: created.id,
        keyValue,
        keyPrefix: keyValue.substring(0, KEY_PREFIX.length + 4),
        label: created.label,
        tier: created.tier,
        createdAt: created.createdAt,
        lastUsedAt: created.lastUsedAt,
      },
      message: "Store this key securely \u2014 it will not be shown again.",
    });
  } catch (err) {
    req.log.error({ err }, "POST /v1/me/key failed");
    res.status(500).json({ error: "internal_error", message: "Failed to provision key." });
  }
});

// ── POST /v1/me/key/regenerate — revoke current key and issue a fresh one ─
router.post("/v1/me/key/regenerate", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  try {
    const existing = await findActiveKey(auth.userId);
    if (existing) {
      await db
        .update(partnerKeysTable)
        .set({ isActive: false })
        .where(eq(partnerKeysTable.id, existing.id));
    }

    const email =
      (await getPrimaryEmail(auth.userId)) ?? `${auth.userId}@clerk.unknown`;
    const keyValue = generateKey();

    const [created] = await db
      .insert(partnerKeysTable)
      .values({
        keyValue,
        partnerId: auth.userId,
        partnerEmail: email,
        label: DEFAULT_LABEL,
        tier: TIER,
        swarmScope: null,
      })
      .returning();

    res.status(201).json({
      regenerated: true,
      hasKey: true,
      key: {
        id: created.id,
        keyValue,
        keyPrefix: keyValue.substring(0, KEY_PREFIX.length + 4),
        label: created.label,
        tier: created.tier,
        createdAt: created.createdAt,
        lastUsedAt: created.lastUsedAt,
      },
      message: "Old key revoked. Store this new key securely — it will not be shown again.",
    });
  } catch (err) {
    req.log.error({ err }, "POST /v1/me/key/regenerate failed");
    res.status(500).json({ error: "internal_error", message: "Failed to regenerate key." });
  }
});

// ── POST /v1/auth/verify — SDK handshake ──────────────────────────────────
// Called by the SDK on initialisation to confirm the key is live in the
// MaroShield ledger before starting a run. Validates X-Sentinel-Key against
// partner_keys and returns key metadata. Does NOT write a log entry.
//
// Response shape:
//   200 { valid: true, tier, label, keyPrefix, ownerEmail, status: "live" }
//   401 { valid: false, error: "missing_key" | "invalid_format" | "invalid_key" }
//   500 { valid: false, error: "internal_error" }
router.post("/v1/auth/verify", async (req, res): Promise<void> => {
  const raw = req.headers["x-sentinel-key"];
  const keyValue = typeof raw === "string" ? raw.trim() : "";

  if (!keyValue) {
    res.status(401).json({
      valid: false,
      error: "missing_key",
      message: "X-Sentinel-Key header is required.",
    });
    return;
  }

  if (!keyValue.startsWith("sk_sent_")) {
    res.status(401).json({
      valid: false,
      error: "invalid_format",
      message: "Key must start with sk_sent_. Obtain a key from the onboarding page.",
    });
    return;
  }

  try {
    const [row] = await db
      .select({
        id:           partnerKeysTable.id,
        partnerId:    partnerKeysTable.partnerId,
        partnerEmail: partnerKeysTable.partnerEmail,
        label:        partnerKeysTable.label,
        tier:         partnerKeysTable.tier,
        keyValue:     partnerKeysTable.keyValue,
        createdAt:    partnerKeysTable.createdAt,
        lastUsedAt:   partnerKeysTable.lastUsedAt,
      })
      .from(partnerKeysTable)
      .where(
        and(
          eq(partnerKeysTable.keyValue, keyValue),
          eq(partnerKeysTable.isActive, true),
        ),
      )
      .limit(1);

    if (!row) {
      res.status(401).json({
        valid: false,
        error: "invalid_key",
        message: "Key not found or has been revoked. Obtain a new key from /settings.",
      });
      return;
    }

    // Stamp lastUsedAt — fire-and-forget (mirrors resolveOwnerFromKey).
    db.update(partnerKeysTable)
      .set({ lastUsedAt: new Date() })
      .where(eq(partnerKeysTable.id, row.id))
      .catch(() => { /* non-critical */ });

    res.json({
      valid: true,
      status: "live",
      keyPrefix:  row.keyValue.substring(0, KEY_PREFIX.length + 4),
      label:      row.label,
      tier:       row.tier,
      ownerEmail: row.partnerEmail,
      createdAt:  row.createdAt,
      lastUsedAt: row.lastUsedAt,
      message: "Key verified — MaroShield ledger is ready to accept events.",
    });
  } catch (err) {
    req.log.error({ err }, "POST /v1/auth/verify failed");
    res.status(500).json({
      valid: false,
      error: "internal_error",
      message: "Verification failed. Please try again.",
    });
  }
});

export default router;
