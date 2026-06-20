import { compound } from "./compound.js";
import { desertBase } from "./desert-base.js";

// Level registry. Add a level here and it's selectable via ?level=<id>.
export const levels = {
  compound,
  "desert-base": desertBase,
};
export const DEFAULT_LEVEL = "compound";
