module.exports = {
  testEnvironment: "node",
  testMatch: [
    "**/unit_tests/**/*.test.js",
    "**/API_tests/**/*.test.js",
    "**/etl/tests/**/*.test.js"
  ],
  testTimeout: 30000,
  verbose: true
};
