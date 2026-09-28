import { RehydrationError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { expectBusinessError } from "../../common/__tests__/expectBusinessError";
import { InfoReport, type InfoReportInput } from "../infoReport";
import { moderationSamples } from "../testing/samples";

const NOW = new Date("2026-09-10T00:00:00.000Z");
const LATER = new Date("2026-09-11T00:00:00.000Z");

function setup() {
  const s = moderationSamples();
  const placeId = s.ids.place();
  const reporter = { accountId: s.ids.account() };
  const input = (over: Partial<InfoReportInput> = {}): InfoReportInput => ({
    id: s.ids.report(),
    target: { kind: "place", placeId },
    category: "closure",
    content: " 閉店しました ",
    ...over,
  });
  const available = {
    kind: "available",
    placeId,
    placeHasSteward: true,
  } as const;
  return { s, placeId, reporter, input, available };
}

describe("InfoReport.submit", () => {
  it("receives an open report about a place", () => {
    const { placeId, reporter, input, available } = setup();
    const given = input();
    const { entity, eventDrafts } = InfoReport.submit(
      given,
      reporter,
      available,
      NOW,
    );
    expect(entity).toEqual({
      id: given.id,
      target: { kind: "place", placeId },
      category: "closure",
      content: "閉店しました",
      reporter: reporter.accountId,
      receivedAt: NOW,
      version: 0,
      status: "open",
    });
    expect(eventDrafts).toEqual([
      {
        type: "info_report.submitted",
        payload: { reportId: given.id },
        occurredAt: NOW,
        aggregateId: given.id,
      },
    ]);
  });

  it("takes a listing target's place from the facts", () => {
    const { s, reporter, input } = setup();
    const listingId = s.ids.listing();
    const ownPlace = s.ids.place();
    const { entity } = InfoReport.submit(
      input({ target: { kind: "listing", listingId } }),
      reporter,
      { kind: "available", placeId: ownPlace, placeHasSteward: true },
      NOW,
    );
    expect(entity.target).toEqual({
      kind: "listing",
      placeId: ownPlace,
      listingId,
    });
  });

  it("checks category, content, availability, then the steward", () => {
    const { reporter, input, available } = setup();
    const unavailable = { kind: "unavailable" } as const;
    expectBusinessError(
      () =>
        InfoReport.submit(
          input({ category: "spam", content: "" }),
          reporter,
          unavailable,
          NOW,
        ),
      "MODERATION_INVALID_INFO_REPORT_CATEGORY",
    );
    expectBusinessError(
      () =>
        InfoReport.submit(input({ content: " " }), reporter, unavailable, NOW),
      "MODERATION_INVALID_INFO_REPORT_CONTENT",
    );
    expectBusinessError(
      () => InfoReport.submit(input(), reporter, unavailable, NOW),
      "MODERATION_INFO_REPORT_TARGET_UNAVAILABLE",
    );
    expectBusinessError(
      () =>
        InfoReport.submit(
          input(),
          reporter,
          { ...available, placeHasSteward: false },
          NOW,
        ),
      "MODERATION_INFO_REPORT_PLACE_WITHOUT_STEWARD",
    );
  });
});

describe("InfoReport transitions", () => {
  it("requests a confirmation on an open report only, state first", () => {
    const { s } = setup();
    const open = s.openReport();
    const { entity, eventDrafts } = InfoReport.requestConfirmation(
      open,
      { placeHasSteward: true },
      LATER,
    );
    expect(entity).toEqual({
      ...open,
      status: "confirmationRequested",
      request: { requestedAt: LATER },
      version: 1,
    });
    expect(eventDrafts).toEqual([
      {
        type: "info_report.confirmation_requested",
        payload: { reportId: open.id, target: open.target },
        occurredAt: LATER,
        aggregateId: open.id,
      },
    ]);
    expectBusinessError(
      () =>
        InfoReport.requestConfirmation(
          entity,
          { placeHasSteward: false },
          LATER,
        ),
      "MODERATION_INFO_REPORT_NOT_OPEN",
    );
    expectBusinessError(
      () =>
        InfoReport.requestConfirmation(
          s.openReport(),
          { placeHasSteward: false },
          LATER,
        ),
      "MODERATION_INFO_REPORT_PLACE_WITHOUT_STEWARD",
    );
  });

  it("resolves open and requested reports, keeping the request", () => {
    const { s } = setup();
    const open = s.openReport();
    expect(InfoReport.resolve(open)).toEqual({
      ...open,
      status: "resolved",
      request: null,
      version: 1,
    });
    const requested = s.requested(s.openReport());
    const resolved = InfoReport.resolve(requested);
    expect(resolved.request).toEqual(requested.request);
    expect(InfoReport.confirmationRequestOf(resolved)).toEqual(
      requested.request,
    );
    expect(InfoReport.confirmationRequestOf(open)).toBeNull();
    expectBusinessError(
      () => InfoReport.resolve(resolved),
      "MODERATION_INFO_REPORT_ALREADY_RESOLVED",
    );
  });
});

describe("InfoReport.sameSubmission", () => {
  it("compares reporter, target, category and content", () => {
    const { s, reporter, input, available } = setup();
    const given = input();
    const { entity } = InfoReport.submit(given, reporter, available, NOW);
    expect(
      InfoReport.sameSubmission(
        entity,
        { ...given, content: "閉店しました" },
        reporter,
      ),
    ).toBe(true);
    expect(
      InfoReport.sameSubmission(entity, given, { accountId: s.ids.account() }),
    ).toBe(false);
    expect(
      InfoReport.sameSubmission(
        entity,
        { ...given, category: "incorrectInfo" },
        reporter,
      ),
    ).toBe(false);
    expect(
      InfoReport.sameSubmission(
        entity,
        { ...given, target: { kind: "place", placeId: s.ids.place() } },
        reporter,
      ),
    ).toBe(false);
  });
});

describe("InfoReport.reconstruct", () => {
  it("round-trips every status", () => {
    const { s } = setup();
    const listingReport = s.openReport({
      target: {
        kind: "listing",
        placeId: s.ids.place(),
        listingId: s.ids.listing(),
      },
    });
    for (const report of [
      listingReport,
      s.requested(s.openReport()),
      s.resolvedReport(s.requested(s.openReport())),
      s.resolvedReport(s.openReport()),
    ]) {
      expect(InfoReport.reconstruct(InfoReport.snapshot(report))).toEqual(
        report,
      );
    }
  });

  it("rejects a request that does not match the status", () => {
    const { s } = setup();
    const open = InfoReport.snapshot(s.openReport());
    expect(() => InfoReport.reconstruct({ ...open, requestedAt: NOW })).toThrow(
      RehydrationError,
    );
    expect(() =>
      InfoReport.reconstruct({ ...open, status: "confirmationRequested" }),
    ).toThrow(RehydrationError);
    expect(() =>
      InfoReport.reconstruct({
        ...open,
        target: { ...open.target, kind: "listing" },
      }),
    ).toThrow(RehydrationError);
  });
});
