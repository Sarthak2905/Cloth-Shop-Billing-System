import bcrypt from "bcryptjs";

export const hashPassword = (password, cost) => bcrypt.hash(password, cost);
export const verifyPassword = (password, hash) =>
  bcrypt.compare(password, hash);
