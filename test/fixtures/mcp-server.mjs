import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
const server = new Server({ name: "fixture", version: "1" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: "echo", description: "Echo", inputSchema: { type: "object", properties: { text: { type: "string" } } } }] }));
server.setRequestHandler(CallToolRequestSchema, async ({ params }) => ({ content: [{ type: "text", text: params.arguments.text }] }));
await server.connect(new StdioServerTransport());
