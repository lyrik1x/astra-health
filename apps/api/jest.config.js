// NestJS 12 se publica solo como ESM (M-3): Jest corre con
// `node --experimental-vm-modules` y ts-jest en modo ESM.
/** @type {import('jest').Config} */
export default {
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/test/**/*.spec.ts"],
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\.{1,2}/.*)\.js$": "$1",
  },
  transform: {
    "^.+\.ts$": ["ts-jest", { useESM: true, tsconfig: "<rootDir>/tsconfig.json" }],
  },
};
