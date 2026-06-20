import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const keys = Object.keys(process.env).filter(k => /db|database|mysql|sql|original/i.test(k));
console.log("DB相关env keys:", keys);
console.log("ORIGINAL_DATABASE_URL存在:", !!process.env.ORIGINAL_DATABASE_URL);
console.log("DATABASE_URL存在:", !!process.env.DATABASE_URL);
console.log("DEV_DATABASE_URL存在:", !!process.env.DEV_DATABASE_URL);
