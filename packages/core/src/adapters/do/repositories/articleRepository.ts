import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import {
  Article,
  type ArticleStatus,
  type PublishedArticle,
} from "@repo/core/domain/article/article";
import type { ArticleRepository } from "@repo/core/domain/article/ports/articleRepository";
import type { ArticleId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { ShowcaseRef } from "@repo/core/domain/common/refs";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import { isRehydrationError } from "@repo/core/domain/error";
import { mapDoError } from "../helpers";
import type { ArticleRecord } from "../protocol/article";
import type { LuntStateClient } from "../protocol/client";
import type { WriteCommand } from "../protocol/commands";

const integrityError = (message: string, cause?: unknown) =>
  new SystemError(SystemErrorCode.DataIntegrityError, message, cause);

/**
 * `ArticleRepository` over the Lunt state object. Reads query the object
 * immediately; writes append commands to the unit of work's buffer, which
 * the object applies — with the id-uniqueness and optimistic-lock checks —
 * when the unit of work commits.
 */
export class DoArticleRepository implements ArticleRepository {
  constructor(
    private readonly client: LuntStateClient,
    private readonly writes: WriteCommand[],
    private readonly idGenerator: IdGenerator,
  ) {}

  /** A stored record as an `Article`; `DATA_INTEGRITY_ERROR` when it is not one. */
  static toArticle(record: ArticleRecord, idGenerator: IdGenerator): Article {
    // The store passes the JSON columns through unchecked.
    const photoIds: unknown = record.content.photoIds;
    const showcases: unknown = record.content.showcases;
    if (!Array.isArray(photoIds) || !Array.isArray(showcases)) {
      throw integrityError(`Stored article ${record.id} has malformed content`);
    }
    const showcaseIds = showcases.map((showcase: unknown) =>
      typeof showcase === "object" &&
      showcase !== null &&
      "kind" in showcase &&
      "id" in showcase &&
      typeof showcase.kind === "string"
        ? showcase.id
        : null,
    );
    const malformed = [record.id, ...photoIds, ...showcaseIds].find(
      (id: unknown) => typeof id !== "string" || idGenerator.parse(id) === null,
    );
    if (malformed !== undefined) {
      throw integrityError(
        `Stored article has malformed id: ${String(malformed)}`,
      );
    }
    const { firstPublishedAt } = record.publication;
    try {
      return Article.reconstruct({
        ...record,
        publication: {
          ...record.publication,
          firstPublishedAt:
            firstPublishedAt === null ? null : new Date(firstPublishedAt),
        },
        updatedAt: new Date(record.updatedAt),
      });
    } catch (error) {
      if (isRehydrationError(error)) {
        throw integrityError("Stored article violates invariants", error);
      }
      throw error;
    }
  }

  static toRecord(article: Article): ArticleRecord {
    const snapshot = Article.snapshot(article);
    return {
      ...snapshot,
      publication: {
        ...snapshot.publication,
        firstPublishedAt:
          snapshot.publication.firstPublishedAt?.getTime() ?? null,
      },
      updatedAt: snapshot.updatedAt.getTime(),
    };
  }

  private toArticle(record: ArticleRecord): Article {
    return DoArticleRepository.toArticle(record, this.idGenerator);
  }

  findById(id: ArticleId): Promise<Versioned<Article> | null> {
    return mapDoError("Failed to find article", async () => {
      const record = await this.client.query("article.findById", { id });
      return record === null
        ? null
        : {
            entity: this.toArticle(record),
            expectedVersion: record.version as ExpectedVersion<Article>,
          };
    });
  }

  findPage(
    filter: Readonly<{ status: ArticleStatus | null }>,
    pagination: Pagination,
  ): Promise<PaginationResult<Article>> {
    return mapDoError("Failed to list articles", async () => {
      const page = await this.client.query("article.findPage", {
        status: filter.status,
        page: pagination.page,
        limit: pagination.limit,
      });
      return {
        items: page.items.map((record) => this.toArticle(record)),
        count: page.count,
      };
    });
  }

  findPublishedByShowcases(
    refs: readonly ShowcaseRef[],
    pagination: Pagination,
  ): Promise<PaginationResult<PublishedArticle>> {
    if (refs.length === 0) return Promise.resolve({ items: [], count: 0 });
    return mapDoError("Failed to list articles by showcase", async () => {
      const page = await this.client.query("article.findPublishedByShowcases", {
        refs: refs.map((ref) => ({ kind: ref.kind, id: ref.id })),
        page: pagination.page,
        limit: pagination.limit,
      });
      return {
        items: page.items.map((record) => {
          const article = this.toArticle(record);
          if (!Article.isPublished(article)) {
            throw integrityError(
              `Article ${article.id} read as published is ${article.publication.status}`,
            );
          }
          return article;
        }),
        count: page.count,
      };
    });
  }

  async insert(article: Article): Promise<void> {
    this.writes.push({
      kind: "article.insert",
      record: DoArticleRepository.toRecord(article),
    });
  }

  async save(
    article: Article,
    expectedVersion: ExpectedVersion<Article>,
  ): Promise<void> {
    this.writes.push({
      kind: "article.save",
      record: DoArticleRepository.toRecord(article),
      expectedVersion,
    });
  }
}
