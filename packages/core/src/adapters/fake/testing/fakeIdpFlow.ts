import {
  ExternalLoginProof,
  type ExternalLoginStarter,
} from "@repo/core/application/account/externalLogin";
import type { ExternalProviderKey } from "@repo/core/domain/account/externalIdentity";
import {
  type FakeIdpChoice,
  fakeIdpAuthorizeRequestSchema,
  fakeIdpCallbackUrl,
} from "../fakeIdp";

export const TEST_REDIRECT_URI =
  "http://localhost:3000/login/external/google/callback";

/**
 * Runs the whole browser round trip against the fake provider, as the
 * presentation layer and the `/__dev/idp/authorize` page would: start,
 * pick `choice` on the provider's screen, come back, pack the proof.
 */
export async function fakeIdpProof(
  args: Readonly<{
    starter: ExternalLoginStarter;
    provider: ExternalProviderKey;
    secret: string;
    now: Date;
    choice: FakeIdpChoice;
  }>,
): Promise<string> {
  const { authorizationUrl, pending } = await args.starter.begin(
    args.provider,
    TEST_REDIRECT_URI,
  );
  const request = fakeIdpAuthorizeRequestSchema.parse(
    Object.fromEntries(new URL(authorizationUrl).searchParams),
  );
  const callback = await fakeIdpCallbackUrl({
    secret: args.secret,
    now: args.now,
    request,
    choice: args.choice,
  });
  return ExternalLoginProof.encode(pending, new URL(callback).search);
}
