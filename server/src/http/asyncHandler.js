// Lets a route use async/await: any error is passed on to the error handler.
export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
