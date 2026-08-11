import express from "express";
import { rateLimit } from "./rate-limit";

const app = express();

app.use(rateLimit({ windowMs: 60_000, max: 100 }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(4000, () => {
  console.log("api listening on :4000");
});
