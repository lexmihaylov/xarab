import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadMcpConfig(workspace, globalServers = {}) {
  let local = {};
  try {
    const parsed = JSON.parse(await readFile(path.join(workspace, ".xarab", "mcp.json"), "utf8"));
    local = parsed.mcp ?? {};
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error("Invalid workspace MCP configuration.");
  }
  for (const servers of [globalServers, local]) {
    if (!servers || typeof servers !== "object" || Array.isArray(servers))
      throw new Error("MCP configuration must be an object keyed by server name.");
  }
  return Object.entries({ ...globalServers, ...local }).map(([name, config]) => {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name) || !config || typeof config !== "object")
      throw new Error("Invalid MCP server entry.");
    if (config.enabled === false)
      return { name, config, workspaceDefined: Object.hasOwn(local, name) };
    if (config.type === "local") {
      if (
        !Array.isArray(config.command) ||
        !config.command.length ||
        config.command.some((s) => typeof s !== "string" || !s)
      )
        throw new Error(`MCP ${name}: command must be a nonempty string array.`);
      if (config.cwd !== undefined && typeof config.cwd !== "string")
        throw new Error(`MCP ${name}: invalid cwd.`);
    } else if (config.type === "remote") {
      const url = new URL(config.url);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
        throw new Error(`MCP ${name}: use an HTTP(S) URL without embedded credentials.`);
      if (config.transport !== undefined && !["streamable-http", "sse"].includes(config.transport))
        throw new Error(`MCP ${name}: invalid transport.`);
      if (config.oauth !== undefined && config.oauth !== false) {
        if (!config.oauth || typeof config.oauth !== "object" || Array.isArray(config.oauth))
          throw new Error(`MCP ${name}: oauth must be an object or false.`);
        for (const key of ["clientId", "clientSecret", "scope"])
          if (config.oauth[key] !== undefined && typeof config.oauth[key] !== "string")
            throw new Error(`MCP ${name}: invalid OAuth ${key}.`);
        if (
          config.oauth.callbackPort !== undefined &&
          (!Number.isInteger(config.oauth.callbackPort) ||
            config.oauth.callbackPort < 1024 ||
            config.oauth.callbackPort > 65535)
        )
          throw new Error(`MCP ${name}: invalid OAuth callbackPort.`);
      }
    } else throw new Error(`MCP ${name}: type must be local or remote.`);
    for (const key of ["environment", "headers"]) {
      const value = config[key];
      if (
        value !== undefined &&
        (!value ||
          typeof value !== "object" ||
          Array.isArray(value) ||
          Object.values(value).some((v) => typeof v !== "string"))
      )
        throw new Error(`MCP ${name}: ${key} must contain string values.`);
    }
    if (
      config.timeout !== undefined &&
      (!Number.isInteger(config.timeout) || config.timeout < 1 || config.timeout > 300000)
    )
      throw new Error(`MCP ${name}: timeout must be between 1 and 300000 ms.`);
    return { name, config, workspaceDefined: Object.hasOwn(local, name) };
  });
}
