"use client";

import { ButtonLink } from "@/components/ui/Button";
import { Feedback } from "@/components/ui/Feedback";
import { Photo } from "@/components/ui/Photo";
import { TextLink } from "@/components/ui/TextButton";
import {
  type ArticleDetailData,
  showcaseItemKey,
} from "@/presentation/readingView";
import { ShowcaseRow } from "../ShowcaseRow";

/** The cover's box (EditorialFeature 348 × 193). */
const FEATURE_RATIO = 348 / 193;

/**
 * CS-06 of DT-05: the article is unpublished or missing. Neither its title
 * nor its photo is shown; the viewer goes on to VW-09 or other ways to
 * explore.
 */
export function ArticleUnavailable() {
  return (
    <div className="container article-page">
      <Feedback
        kind="empty"
        icon="book"
        headingLevel="h1"
        title="この読みものは見られません。"
        body={
          <>
            公開が終わったか、表示できなくなっています。
            <br />
            ほかの読みものを探してみてください。
          </>
        }
        action={
          <ButtonLink variant="secondary" to="/articles">
            読みもの一覧へ
          </ButtonLink>
        }
        links={
          <>
            <TextLink to="/">みつけるへ</TextLink>
            <TextLink to="/regions">まちを探す</TextLink>
          </>
        }
      />
    </div>
  );
}

/**
 * DT-05 記事 (`spec/pages/detail.md`): the article's title, photos in
 * registration order and body as written (line breaks kept), then the
 * viewable showcased targets in the editor's order (reference scene; the
 * section is left out without one), the way back to VW-09 and the
 * takedown claim (RQ-07, 「詳細の手続きの入口」). No save toggle.
 */
export function ArticleView({ article }: { article: ArticleDetailData }) {
  const [cover, ...rest] = article.photos;
  return (
    <div className="container article-page">
      <article className="article">
        <div className="feature">
          {cover === undefined ? null : (
            <Photo
              photo={cover.photo}
              alt={cover.alt}
              ratio={FEATURE_RATIO}
              className="feature__photo"
              priority
            />
          )}
          <div className="feature__foot">
            <h1 className="feature__name">{article.title}</h1>
          </div>
        </div>

        <div className="article__layout">
          <div className="article__body">
            {rest.length === 0 ? null : (
              <ul className="detail-gallery" aria-label="ほかの写真">
                {rest.map((item, index) => (
                  <li key={item.photo?.src ?? `missing-${index}`}>
                    <Photo
                      photo={item.photo}
                      alt={item.alt}
                      ratio={1}
                      className="detail-gallery__photo"
                    />
                  </li>
                ))}
              </ul>
            )}
            <p className="article__text">{article.body}</p>
          </div>

          <div className="article__aside">
            {article.showcases.length === 0 ? null : (
              <section className="targets" aria-labelledby="dt05-targets">
                <h2 className="article__heading" id="dt05-targets">
                  紹介したお店と街
                </h2>
                <ul className="targets__list">
                  {article.showcases.map((item) => (
                    <li key={showcaseItemKey(item)}>
                      <ShowcaseRow item={item} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <ButtonLink variant="secondary" to="/articles">
              読みもの一覧へ
            </ButtonLink>
            <p className="article__report">
              <TextLink
                quiet
                to="/takedown/$kind/$id"
                params={{ kind: "article", id: article.articleId }}
              >
                この読みものの取り下げを申し立てる
              </TextLink>
            </p>
          </div>
        </div>
      </article>
    </div>
  );
}
