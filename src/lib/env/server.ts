import "server-only";
import { validateEnvironment } from "./schema";
export const serverEnvironment = validateEnvironment(process.env);
