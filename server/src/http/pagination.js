import { z } from "zod";

export const paginationFields = {
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
};

export const pageInfo = ({ page, limit }) => ({
  page,
  limit,
  skip: (page - 1) * limit,
});
