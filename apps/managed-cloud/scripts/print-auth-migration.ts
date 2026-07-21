import { createLiteMcpAuth } from "@litemcp/auth";
import { getMigrations } from "better-auth/db/migration";
import { getPlatformProxy } from "wrangler";

type MigrationAuth = {
  options: Parameters<typeof getMigrations>[0];
};

const platform = await getPlatformProxy<{ AUTH_DB: D1Database }>({
  configPath: new URL("../wrangler.jsonc", import.meta.url).pathname,
  persist: false,
  remoteBindings: false,
});

try {
  const auth = createLiteMcpAuth({
    database: platform.env.AUTH_DB,
    baseURL: "http://localhost:8787",
    secret: "local-schema-generation-secret-32-bytes-minimum",
    trustedOrigins: ["http://localhost:4321"],
    demoMode: true,
  }) as unknown as MigrationAuth;
  const migrations = await getMigrations(auth.options);
  process.stdout.write(await migrations.compileMigrations());
} finally {
  await platform.dispose();
}
