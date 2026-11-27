import { fileURLToPath } from "node:url";

// Standalone offline frontend regression entry; the repository default only includes server tests.
export default {
  root: fileURLToPath(new URL("../../../", import.meta.url)),
  test: {
    environment: "node",
    include: ["client/src/hooks/useDemandCryptoQuotes.frontend.test.ts"],
  },
};
