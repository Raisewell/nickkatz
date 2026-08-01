import { buildApp } from "./app.js";

const app = buildApp();

// PORT is the near-universal PaaS convention (Railway, Fly, Heroku, Render all
// inject it and expect the app to bind to it); API_PORT is the local-dev name
// this repo used before deployment was a concern. Prefer PORT when a platform
// sets it, fall back to API_PORT for local dev, then 4000.
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);

app
  .listen({ port, host: "0.0.0.0" })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
