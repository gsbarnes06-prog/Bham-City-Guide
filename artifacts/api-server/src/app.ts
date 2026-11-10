import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Return useful JSON errors for requests rejected by the body parser.
const jsonErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const parserError = error as { type?: string };

  if (parserError.type === "entity.too.large") {
    res.status(413).json({ error: "Photo uploads must be 3 MB or smaller." });
    return;
  }

  if (parserError.type === "entity.parse.failed") {
    res.status(400).json({ error: "The request body must be valid JSON." });
    return;
  }

  res.status(500).json({ error: "The request could not be processed." });
};

app.use(jsonErrorHandler);

export default app;
