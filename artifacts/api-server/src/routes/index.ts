import { Router, type IRouter } from "express";
import healthRouter from "./health";
import logsRouter from "./logs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(logsRouter);

export default router;
