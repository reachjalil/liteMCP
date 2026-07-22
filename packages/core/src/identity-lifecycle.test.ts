import { describe, expect, it } from "vitest";

import type { IdentityProvider, ServicePrincipal } from "@litemcp/contracts";
import { MemoryDocumentStore } from "@litemcp/storage";

import { PlatformConflictError, PlatformService } from "./platform-service.js";
import { CredentialCipher } from "./security.js";

const createService = () => {
  const store = new MemoryDocumentStore();
  return {
    store,
    service: new PlatformService(store, {
      credentialCipher: new CredentialCipher(
        "an-identity-test-master-key-that-is-long-enough"
      ),
    }),
  };
};

describe("identity and service-principal lifecycle", () => {
  it("seeds every demo role and drops stale asserted and IdP-mapped roles", async () => {
    const { service, store } = createService();
    await service.ensureDemoTenant();

    expect((await service.listRoles("org_demo")).map((role) => role.slug)).toEqual(
      expect.arrayContaining(["owner", "admin", "member", "employee", "finance-admin"])
    );

    const provider = await store.get<IdentityProvider>(
      "org_demo",
      "identity-providers",
      "idp_entra_template"
    );
    if (!provider) throw new Error("Demo identity provider was not seeded.");
    await store.put(
      "org_demo",
      "identity-providers",
      {
        ...provider,
        status: "active",
        groupMappings: [
          ...provider.groupMappings,
          { claim: "groups", value: "employees", role: "deleted-role" },
        ],
        revision: provider.revision + 1,
      },
      { expectedRevision: provider.revision }
    );

    await expect(
      service.buildSubject("org_demo", {
        type: "user",
        id: "user_employee",
        roles: ["employee", "asserted-but-unknown"],
        groups: ["employees"],
        claims: {},
      })
    ).resolves.toMatchObject({ roles: ["employee"] });
  });

  it("blocks role deletion while an identity-provider mapping references it", async () => {
    const { service, store } = createService();
    await service.ensureDemoTenant();
    const role = await service.createRole(
      "org_demo",
      { slug: "auditor", name: "Auditor", description: "Audit access" },
      "user_admin",
      "create_auditor"
    );
    await service.createIdentityProvider(
      "org_demo",
      {
        name: "Audit identity",
        protocol: "oidc",
        issuer: "https://login.audit.example/oidc",
        domains: [" AUDIT.Example. "],
        clientId: "audit-client",
        clientSecret: "an-audit-client-secret",
        status: "active",
        groupMappings: [{ claim: "groups", value: "auditors", role: "auditor" }],
      },
      "user_admin",
      "create_audit_idp"
    );

    await expect(
      service.deleteRole("org_demo", role.id, "user_admin", "delete_auditor")
    ).rejects.toThrow("identity-provider group mapping");
    await expect(store.get("org_demo", "roles", role.id)).resolves.not.toBeNull();
    expect(
      (await service.listIdentityProviders("org_demo")).find(
        (provider) => provider.name === "Audit identity"
      )?.domains
    ).toContain("audit.example");
  });

  it("blocks role deletion while a service principal references it", async () => {
    const { service, store } = createService();
    await service.ensureDemoTenant();
    const role = await service.createRole(
      "org_demo",
      { slug: "automation", name: "Automation", description: "Robot access" },
      "user_admin",
      "create_automation"
    );
    await service.createServicePrincipal(
      "org_demo",
      { name: "Deploy bot", roles: [role.slug] },
      "user_admin",
      "create_deploy_bot"
    );

    await expect(
      service.deleteRole("org_demo", role.id, "user_admin", "delete_automation")
    ).rejects.toBeInstanceOf(PlatformConflictError);
    await expect(store.get("org_demo", "roles", role.id)).resolves.not.toBeNull();
  });

  it.each(["principal-id", "client-id"] as const)(
    "filters stale service-principal roles and deprovisions by %s",
    async (identifierKind) => {
      const { service, store } = createService();
      await service.ensureDemoTenant();
      const created = await service.createServicePrincipal(
        "org_demo",
        { name: "Finance bot", roles: ["employee"] },
        "user_admin",
        `create_finance_bot_${identifierKind}`
      );
      const principal = await store.get<ServicePrincipal>(
        "org_demo",
        "service-principals",
        created.principal.id
      );
      if (!principal) throw new Error("Service principal was not persisted.");
      await store.put(
        "org_demo",
        "service-principals",
        {
          ...principal,
          roles: ["employee", "deleted-role"],
          revision: principal.revision + 1,
        },
        { expectedRevision: principal.revision }
      );

      await expect(
        service.authenticateServicePrincipal(
          "org_demo",
          created.principal.clientId,
          created.secret
        )
      ).resolves.toMatchObject({ roles: ["employee"] });

      const identifier =
        identifierKind === "principal-id"
          ? created.principal.id
          : created.principal.clientId;
      await expect(
        service.deprovisionSubject(
          "org_demo",
          identifier,
          "user_admin",
          `deprovision_finance_bot_${identifierKind}`
        )
      ).resolves.toMatchObject({ servicePrincipalsDisabled: 1 });
      await expect(
        service.authenticateServicePrincipal(
          "org_demo",
          created.principal.clientId,
          created.secret
        )
      ).resolves.toBeNull();
      await expect(
        store.get<ServicePrincipal>(
          "org_demo",
          "service-principals",
          created.principal.id
        )
      ).resolves.toMatchObject({ status: "disabled" });
    }
  );
});
