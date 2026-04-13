import { Router, type IRouter } from "express";
import badgeRouter from "./badge";
import healthRouter from "./health";
import logsRouter from "./logs";
import governanceRouter from "./governance";

const router: IRouter = Router();

router.use(badgeRouter);
router.use(healthRouter);
router.use(logsRouter);
router.use(governanceRouter);

export default router;
