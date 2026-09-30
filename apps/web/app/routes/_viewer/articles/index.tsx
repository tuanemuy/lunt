import { createFileRoute } from "@tanstack/react-router";
import { ButtonLink } from "@/components/ui/Button";
import { Feedback } from "@/components/ui/Feedback";
import { TextLink } from "@/components/ui/TextButton";
import { buildHead } from "@/presentation/head";

/**
 * VW-09 読む before the articles' stage (S5): no article can be published
 * yet, so the screen is its CS-09 「読みものがない」, leading on to VW-01,
 * VW-04, VW-05 and VW-07. The 読む tab stays in the navigation of every
 * VW and DT screen (`spec/pages/index.md` 「ナビゲーション」).
 */
export const Route = createFileRoute("/_viewer/articles/")({
  staticData: { viewerTab: "articles" },
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return { meta: [{ title: "読みもの — Lunt" }] };
    const { meta, links } = buildHead(config, {
      title: "読みもの — Lunt",
      path: "/articles",
    });
    return { meta, links };
  },
  component: ArticlesPage,
});

function ArticlesPage() {
  return (
    <div className="container articles">
      <h1 className="sr-only">読みもの</h1>
      <Feedback
        kind="empty"
        icon="book"
        title="読みものを、準備しています。"
        body={
          <>
            新しい読みものを公開したら、
            <br />
            ここでお知らせします。
          </>
        }
        action={
          <ButtonLink variant="secondary" to="/">
            みつけるへ
          </ButtonLink>
        }
        links={
          <>
            <TextLink to="/map">地図で探す</TextLink>
            <TextLink to="/regions">まちを探す</TextLink>
            <TextLink to="/events">イベントを見る</TextLink>
          </>
        }
      />
    </div>
  );
}
