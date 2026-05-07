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

router.get("/v1/me/key", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

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
});

router.post("/v1/me/key", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

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
});

export default router;
