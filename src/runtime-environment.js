// Load before React so normal CLI runs do not collect development profiling entries.
// Preserve explicit environments for debugging and tests.
process.env.NODE_ENV ??= "production";
