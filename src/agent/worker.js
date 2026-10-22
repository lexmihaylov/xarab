export function createWorker({ adapter }) {
  if (!adapter || typeof adapter.run !== "function")
    throw new TypeError("A worker adapter with a run function is required.");

  async function run(request) {
    return adapter.run(request);
  }

  return { run };
}
