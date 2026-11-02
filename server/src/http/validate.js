import { AppError } from "../errors.js";

// Checks request data against a zod schema. Throws a 400 with field-level details.
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Some fields are invalid",
      result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  return result.data;
}
