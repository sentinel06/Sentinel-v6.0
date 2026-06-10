/**
 * GET /v1/whitepaper
 *
 * Generates and returns the MaroShield v6.0 Technical White Paper
 * dynamically from live system state. Accepts an optional ?format=markdown
 * query parameter (default) or ?format=json (returns structured data).
 *
 * No authentication required — the white paper is a public-facing document.
 */

import { Router, type IRouter } from "express";
import { collectWhitepaperData, generateWhitepaperMarkdown } from "../services/whitepaper_gen.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

router.get("/v1/whitepaper", async (req, res): Promise<void> => {
  try {
    const format = (req.query["format"] as string | undefined) ?? "json";

    const data     = await collectWhitepaperData();
    const markdown = generateWhitepaperMarkdown(data);

    if (format === "markdown") {
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="MaroShield-v4-White-Paper-${data.documentId}.md"`,
      );
      res.send(markdown);
      return;
    }

    res.json({
      documentId:           data.documentId,
      generatedAt:          data.generatedAt,
      signatureFingerprint: data.signatureFingerprint,
      hmacSeal:             data.hmacSeal,
      pulseSeal: {
        globalIntegrityIndex:  data.pulseSeal.globalIntegrityIndex,
        totalEvents:           data.pulseSeal.totalEvents,
        verifiedEvents:        data.pulseSeal.verifiedEvents,
        status:                data.pulseSeal.status,
        quantumThroughputBits: data.pulseSeal.quantumThroughputBits,
        activeSwarms:          data.pulseSeal.activeSwarms,
        revokedSwarms:         data.pulseSeal.revokedSwarms,
      },
      quantumManifest: {
        algorithm:      data.quantumManifest.algorithm,
        fipsStandard:   data.quantumManifest.fipsStandard,
        securityLevel:  data.quantumManifest.securityLevel,
        params:         data.quantumManifest.params,
      },
      driftSnippetCount:  data.driftSnippets.length,
      surgeSnippetCount:  data.surgeSnippets.length,
      markdown,
    });
  } catch (err) {
    logger.error({ err }, "Whitepaper generation failed");
    res.status(500).json({ error: "Whitepaper generation failed", detail: String(err) });
  }
});

export default router;
