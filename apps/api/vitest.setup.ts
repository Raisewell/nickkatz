import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Point tests at a dedicated test database instead of the dev one, and make
// sure this wins over the .env that @prisma/client auto-loads on import.
config({ path: path.resolve(dir, ".env.test"), override: true });
