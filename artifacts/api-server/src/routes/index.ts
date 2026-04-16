import { Router, type IRouter } from "express";
import badgeRouter from "./badge";
import healthRouter from "./health";
import logsRouter from "./logs";
import governanceRouter from "./governance";
import swarmRouter from "./swarm";
import partnerRouter from "./partner";
import pulseRouter from "./pulse";
import statusRouter from "./status";
import forensicRouter from "./forensic";
import topologyRouter from "./topology";
import whitepaperRouter from "./whitepaper";
import gatewayRouter from "./gateway";
import chainReconstructRouter from "./chain_reconstruct";

const router: IRouter = Router();

router.use(badgeRouter);
router.use(healthRouter);
router.use(logsRouter);
router.use(governanceRouter);
router.use(swarmRouter);
router.use(partnerRouter);
router.use(pulseRouter);
router.use(statusRouter);
router.use(forensicRouter);
router.use(topologyRouter);
router.use(whitepaperRouter);
router.use(gatewayRouter);
router.use(chainReconstructRouter);

export default router;
