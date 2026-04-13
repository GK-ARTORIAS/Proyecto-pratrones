// jest.config.js  (CommonJS — evita problemas con ESM + ts-jest)
/** @type {import('jest').Config} */
const config = {
    preset: "ts-jest",
    testEnvironment: "node",
    moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/$1",
    },
    transform: {
        "^.+\\.tsx?$": ["ts-jest", {
            tsconfig: "tsconfig.jest.json",
        }],
    },
    collectCoverageFrom: [
        "src/**/*.{ts,tsx}",
        "!src/**/*.test.{ts,tsx}",
        "!src/app/**",
    ],
    coverageReporters: ["text", "lcov", "html"],
    testMatch: ["**/src/lib/**/*.test.{ts,tsx}"],
};

module.exports = config;
