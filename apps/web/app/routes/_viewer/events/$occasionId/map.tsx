import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type ReactNode, useTransition } from "react";
import { ParticipantsBoard } from "@/components/mapScreen/ParticipantsBoard";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Feedback } from "@/components/ui/Feedback";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextLink } from "@/components/ui/TextButton";
import { buildHead } from "@/presentation/head";
import { loadParticipantsScreenFn } from "@/presentation/map";
import { loadMapStyleFn } from "@/presentation/mapStyle";

/**
 * VW-08 参加店舗マップ. Needs no login; the browse conditions and the
 * viewer's position never apply (the reference scene). An occasion that
 * is not viewable shows CS-06, one without viewable participants CS-09.
 */
export const Route = createFileRoute("/_viewer/events/$occasionId/map")({
  staticData: {
    viewerHeader: { type: "detail", title: "参加店舗マップ" },
    viewerTab: "map",
  },
  loader: async ({ params }) => {
    const [{ styleUrl }, screen] = await Promise.all([
      loadMapStyleFn(),
      loadParticipantsScreenFn({ data: { occasionId: params.occasionId } }),
    ]);
    return { styleUrl, screen };
  },
  head: ({ match, params }) => {
    const config = match.context?.config;
    if (!config) return { meta: [{ title: "参加店舗マップ — Lunt" }] };
    const { meta, links } = buildHead(config, {
      title: "参加店舗マップ — Lunt",
      path: `/events/${encodeURIComponent(params.occasionId)}/map`,
    });
    return { meta, links };
  },
  pendingComponent: ParticipantsPending,
  component: ParticipantsPage,
  errorComponent: ParticipantsError,
});

function ParticipantsFrame({ children }: { children: ReactNode }) {
  return (
    <div className="container participants">
      <h1 className="sr-only">参加店舗マップ</h1>
      {children}
    </div>
  );
}

function ParticipantsPage() {
  const { styleUrl, screen } = Route.useLoaderData();
  const { occasionId } = Route.useParams();
  if (screen.kind === "unavailable") {
    return (
      <ParticipantsFrame>
        <Feedback
          kind="empty"
          title="このイベントは、いまは見られません。"
          body={
            <>
              ほかのイベントや街から、
              <br />
              寄り道を探してみてください。
            </>
          }
          action={
            <ButtonLink variant="secondary" to="/events">
              イベントの一覧へ
            </ButtonLink>
          }
          links={
            <>
              <TextLink to="/">みつけるへ</TextLink>
              <TextLink to="/regions">まちを探す</TextLink>
            </>
          }
        />
      </ParticipantsFrame>
    );
  }
  if (screen.extent === null) {
    return (
      <ParticipantsFrame>
        <Feedback
          kind="empty"
          icon="map"
          title="参加するお店を、準備しています。"
          body={
            <>
              参加するお店が決まったら、
              <br />
              この地図でお知らせします。
            </>
          }
          action={
            <ButtonLink
              variant="secondary"
              to="/events/$occasionId"
              params={{ occasionId }}
            >
              イベントの詳細へ戻る
            </ButtonLink>
          }
        />
      </ParticipantsFrame>
    );
  }
  return (
    <ParticipantsFrame>
      <ParticipantsBoard
        key={occasionId}
        styleUrl={styleUrl}
        occasionId={occasionId}
        extent={screen.extent}
      />
    </ParticipantsFrame>
  );
}

/** CS-01 while the participants' range is read. */
function ParticipantsPending() {
  return (
    <ParticipantsFrame>
      <div className="loading" role="status">
        <p className="loading__text">参加店舗を読み込んでいます</p>
        <Skeleton className="map-page__skeleton" />
      </div>
    </ParticipantsFrame>
  );
}

/**
 * CS-02: the participants could not be read. Retry, or find each
 * participant's address from DT-04's list.
 */
function ParticipantsError() {
  const router = useRouter();
  const { occasionId } = Route.useParams();
  const [retrying, startRetry] = useTransition();
  return (
    <ParticipantsFrame>
      <Feedback
        kind="error"
        title="うまく読み込めませんでした。"
        body={
          <>
            通信状況を確認して、
            <br />
            もう一度お試しください。
          </>
        }
        action={
          <Button
            variant="secondary"
            disabled={retrying}
            onClick={() =>
              startRetry(async () => {
                await router.invalidate({ sync: true });
              })
            }
          >
            {retrying ? "読み込んでいます…" : "もう一度読み込む"}
          </Button>
        }
        links={
          <TextLink to="/events/$occasionId" params={{ occasionId }}>
            参加店舗の一覧で所在地を見る
          </TextLink>
        }
      />
    </ParticipantsFrame>
  );
}
