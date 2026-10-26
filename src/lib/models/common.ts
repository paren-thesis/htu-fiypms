export type WithId<T> = T & { id: string };

export interface PaginationParams {
  limit?: number;
  startAfterId?: string | null;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor?: string | null;
  hasMore: boolean;
}
