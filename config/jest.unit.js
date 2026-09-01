module.exports = {
  displayName: "test",
  rootDir: "../",
  testRegex: "\\.test\\.(js|ts|tsx)$",
  moduleFileExtensions: ["js", "tsx", "ts", "json"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "dist",
    // TODO: Add these as we can...
    "/packages/webamp/",
    "/packages/ani-cursor/",
    "/packages/winamp-eqf/",
  ],
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/packages/skin-database/jest-setup.js"],
  transform: {
    "^.+\\.(t|j)sx?$": ["@swc/jest"],
  },
};
