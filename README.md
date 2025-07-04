# GraphDB MCP Server Gateway

> **Forked from [`lightconetech/mcp-gateway`](https://github.com/lightconetech/mcp-gateway)**

> This version adds support for passing an `Authorization` header to the backend MCP server.  
> Renamed to `graphdb-mcphub-gateway` to distinguish GraphDB-specific adaptations.

A gateway service that bridges the stdio-based Model Context Protocol (MCP) implementation in Claude Desktop with HTTP/SSE-based MCP servers. This solves the protocol compatibility gap since Claude Desktop currently only supports stdio-based MCP servers. See the discussion [here](https://github.com/orgs/modelcontextprotocol/discussions/16).

## Why This Gateway?

Claude Desktop App currently only supports stdio protocol for MCP servers, while many MCP servers use HTTP with Server-Sent Events (SSE) transport. This gateway acts as a protocol translator, allowing Claude Desktop to communicate with any HTTP/SSE MCP server by:
1. Accepting stdio input from Claude Desktop
2. Converting and forwarding requests to HTTP/SSE MCP servers
3. Converting SSE responses back to stdio format for Claude Desktop

This fork adds support for passing an `Authorization` header via environment variable, useful for secured backends like GraphDB.

## Installation

Install the gateway globally using npm:

```bash
npm install -g graphdb-mcphub-gateway
```

By default, the original gateway connects to the public MCP Hub at https://server.mcphub.ai/api/mcp, which provides access to various pre-configured MCP services.

In this fork, the default endpoint has been changed to http://localhost:7200/mcp, which corresponds to the default GraphDB MCP server URL (assuming GraphDB is running on its default port).

```bash
export MCPHUB_SERVER_URL=https://your-secured-mcp-server.com/mcp
```

Authorization Header for Secured GraphDB MCP Server
If the gateway will communicate with a secured GraphDB MCP server, set the following environment variable to pass an authorization token (e.g., Bearer token or API key) via the Authorization header:

```bash
export MCPHUB_AUTHORIZATION_HEADER="YOUR_TOKEN_HERE"
```
