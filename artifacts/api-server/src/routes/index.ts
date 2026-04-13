import { Router, type IRouter } from "express";
import badgeRouter from "./badge";
import healthRouter from "./health";
import logsRouter from "./logs";
import governanceRouter from "./governance";
import swarmRouter from "./swarm";
import partnerRouter from "./partner";

const router: IRouter = Router();

router.use(badgeRouter);
router.use(healthRouter);
router.use(logsRouter);
router.use(governanceRouter);
router.use(swarmRouter);
router.use(partnerRouter);

export default router;
