import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  // The vendored Floorplan viewer is third-party code, never edited; the
  // viewer parts are generated from it (dashboard/scripts/floorplan-frame.mjs).
  { ignores: [".next/", "docs/", "dashboard/vendor/", "dashboard/public/app-map/viewer.js"] },
  ...compat.extends("next/core-web-vitals"),
];

export default eslintConfig;
