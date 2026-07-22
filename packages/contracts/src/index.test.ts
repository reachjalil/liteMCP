import { describe, expect, it } from "vitest";

import { createIdentityProviderInputSchema } from "./index.js";

const validInput = {
  name: "Acme identity",
  protocol: "oidc" as const,
  issuer: "https://login.example.com/tenant/v2.0",
  domains: ["example.com"],
  clientId: "client-id",
  clientSecret: "a-client-secret-long-enough",
  status: "active" as const,
  groupMappings: [],
};

describe("identity-provider contracts", () => {
  it("normalizes DNS domains and permits explicit loopback development issuers", () => {
    expect(
      createIdentityProviderInputSchema.parse({
        ...validInput,
        issuer: "http://localhost:8787/oidc",
        domains: [" ACME.Example. "],
      })
    ).toMatchObject({
      issuer: "http://localhost:8787/oidc",
      domains: ["acme.example"],
    });
  });

  it.each([
    "http://login.example.com/tenant",
    "https://user:password@login.example.com/tenant",
    "https://login.example.com/tenant#keys",
  ])("rejects unsafe issuer %s", (issuer) => {
    expect(
      createIdentityProviderInputSchema.safeParse({ ...validInput, issuer }).success
    ).toBe(false);
  });

  it.each([
    "https://example.com",
    "*.example.com",
    "example.com:443",
    "127.0.0.1",
    "bad_domain.example",
    "localhost",
  ])("rejects malformed tenant domain %s", (domain) => {
    expect(
      createIdentityProviderInputSchema.safeParse({
        ...validInput,
        domains: [domain],
      }).success
    ).toBe(false);
  });
});
