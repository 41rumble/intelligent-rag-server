module.exports = {
  // The root directory that Jest should scan for tests and modules
  rootDir: '.',

  // The test environment that will be used for testing
  testEnvironment: 'node',

  // The glob patterns Jest uses to detect test files
  testMatch: [
    "**/__tests__/**/*.[jt]s?(x)",
    "**/?(*.)+(spec|test).[tj]s?(x)"
  ],

  // An array of regexp pattern strings that are matched against all test paths
  testPathIgnorePatterns: [
    '/node_modules/'
  ],

  // A list of paths to directories that Jest should use to search for files in
  roots: [
    '<rootDir>'
  ],

  // The directory where Jest should output its coverage files
  coverageDirectory: 'coverage',

  // An array of glob patterns indicating a set of files for which coverage information should be collected
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!**/node_modules/**'
  ],

  // The test environment setup file
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],

  // Automatically clear mock calls and instances between every test
  clearMocks: true,

  // Indicates whether each individual test should be reported during the run
  verbose: true,

  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: false,

  // An array of regexp pattern strings used to skip coverage collection
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/test/'
  ],

  // A list of reporter names that Jest uses when writing coverage reports
  coverageReporters: [
    'json',
    'text',
    'lcov',
    'clover'
  ],

  // The maximum amount of workers used to run your tests
  maxWorkers: '50%'
};