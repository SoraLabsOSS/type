import { Hono } from "hono";
import { cors } from "hono/cors";
import { cleanupExpiredSessions } from "./lib/cleanup-expired-sessions";
import { sessionsRouter } from "./routes/sessions";

const ALLOWED_ORIGINS = new Set([
  "https://type.soralabs.studio",
  "http://localhost:3000",
]);

const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  cors({
    origin: (origin) => (ALLOWED_ORIGINS.has(origin) ? origin : ""),
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  })
);

app.get("/", (c) => c.json({ status: "ok" }));

app.route("/sessions", sessionsRouter);

export default {
  fetch: app.fetch,
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext
  ) {
    const result = await cleanupExpiredSessions(env);
    console.log(`cleanup: deleted ${result.deleted} sessions`);
  },
};
