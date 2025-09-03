#!/usr/bin/env node

import EventSource from "eventsource";

// Configuration
const MCP_SERVER_URL = process.env.MCPHUB_SERVER_URL ?? "http://localhost:7200/mcp";
const MCP_SERVER_AUTHORIZATION_HEADER: string | null = process.env.MCPHUB_AUTHORIZATION_HEADER ?? null;

const baseUrl = MCP_SERVER_URL;
const backendUrlSse = `${baseUrl}/sse`;
const backendUrlMsg = `${baseUrl}/message`;

// Debug and response channels
const debug = console.error;
const respond = console.log;

class MCPHubGateway {
    private sessionId: string | null = null;
    private eventSource: EventSource | null = null;
    private isReady: boolean = false;
    private messageQueue: Buffer[] = [];
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private reconnectAttempts: number = 0;
    private readonly MAX_RECONNECT_ATTEMPTS = 3;
    private readonly RECONNECT_DELAY = 1000;
    private lastParsedMessage: any = null;

    async connect() {
        if (this.eventSource) {
            debug("Closing existing EventSource connection");
            this.eventSource.close();
        }

        debug(`Connecting to SSE endpoint: ${backendUrlSse}`);

        return new Promise((resolve, reject) => {
            const headers: Record<string, string> = {
                'Accept': 'text/event-stream',
                'User-Agent': 'graphdb-mcp-gateway'
            };

            if (MCP_SERVER_AUTHORIZATION_HEADER) {
                headers['Authorization'] = MCP_SERVER_AUTHORIZATION_HEADER;
            }

            this.eventSource = new EventSource(backendUrlSse, { headers });
            
            this.eventSource.onopen = () => {
                debug(`--- SSE backend connected`);
                this.reconnectAttempts = 0;
                resolve(true);
            };
            
            this.eventSource.onerror = (error) => {
                const errorMsg = (error as any)?.message;
                debug(`--- SSE backend error: ${errorMsg}`);
                this.handleConnectionError(error);
                reject(error);
            };

            this.eventSource.addEventListener("endpoint", (event) => {
                const match = event.data.match(/sessionId=([^&]+)/);
                if (match) {
                    const newSessionId = match[1];
                    this.sessionId = newSessionId;
                    this.isReady = true;
                    debug(`Session established: ${this.sessionId}`);
                    this.processQueuedMessages();
                }
            });
            
            this.eventSource.addEventListener("reconnect", (event) => {
                this.reconnect();
            });

            this.eventSource.addEventListener("message", (e) => {
                try {
                    // Parse and log the message for debugging
                    const parsed = JSON.parse(e.data);
                    this.lastParsedMessage = parsed;                    
                    // Log specific message types
                    /*
                    if (parsed.method === "initialize") {
                        debug("Received initialize message");
                        debug(`Server capabilities: ${JSON.stringify(parsed.params?.capabilities, null, 2)}`);
                    } else if (parsed.result?.capabilities) {
                        debug("Received capabilities in result");
                        debug(`Server capabilities: ${JSON.stringify(parsed.result.capabilities, null, 2)}`);
                    }*/
                    
                    respond(e.data);
                } catch (error) {
                    debug(`Error parsing message: ${error}`);
                    debug(`Raw message data: ${e.data}`);
                    respond(e.data);
                }
            });
        });
    }

    private handleConnectionError(error: any) {
        debug(`Connection error details: ${JSON.stringify(error, null, 2)}`);
        if (this.eventSource?.readyState === EventSource.CLOSED) {
            debug("EventSource connection closed");
            this.reconnect();
        }
    }

    private async reconnect() {
        if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
            debug(`Max reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached, exiting...`);
            debug(`Last parsed message: ${JSON.stringify(this.lastParsedMessage, null, 2)}`);
            process.exit(1);
            return;
        }

        this.reconnectAttempts++;
        this.isReady = false;
        // debug(`Attempting to reconnect (${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})...`);

        try {
            await new Promise(resolve => setTimeout(resolve, this.RECONNECT_DELAY));
            await this.connect();
        } catch (error) {
            debug(`Reconnection failed: ${error}`);
            debug(`Last parsed message before failure: ${JSON.stringify(this.lastParsedMessage, null, 2)}`);
        }
    }

    async processMessage(input: Buffer) {
        if (!this.isReady || !this.sessionId) {
            // debug("Session not ready, queuing message");
            // debug(`Current session state - ID: ${this.sessionId}, Ready: ${this.isReady}`);
            this.messageQueue.push(input);
            return;
        }

        const message = input.toString();
        try {
            const parsed = JSON.parse(message);
            // debug(`Processing outgoing message: ${JSON.stringify(parsed, null, 2)}`);
        } catch (error) {
            debug(`Failed to parse outgoing message: ${error}`);
        }

        const messages = message
            .split('\n')
            .filter(msg => msg.trim())
            .map(msg => msg.trim());

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'User-Agent': 'graphdb-mcp-gateway'
        };

        if (MCP_SERVER_AUTHORIZATION_HEADER) {
            headers['Authorization'] = MCP_SERVER_AUTHORIZATION_HEADER;
        }

        for (const msgStr of messages) {
            try {
                const url = `${backendUrlMsg}?sessionId=${this.sessionId}`;
                // debug(`Sending message to: ${url}`);

                const response = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: msgStr
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    debug(`Error from MCPHub: ${response.status} ${response.statusText}`);
                    debug(`Error details: ${errorText}`);
                    
                    if (response.status === 503) {
                        debug("Service unavailable - attempting reconnect");
                        this.reconnect();
                    }
                } else {
                    const responseText = await response.text();
                    // debug(`Server response: ${responseText}`);
                }
            } catch (error) {
                debug(`Request error: ${error}`);
            }
        }
    }

    private async processQueuedMessages() {
        // debug(`Processing ${this.messageQueue.length} queued messages`);
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            if (message) {
                await this.processMessage(message);
            }
        }
    }

    cleanup() {
        debug("Starting cleanup...");
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
        if (this.eventSource) {
            this.eventSource.close();
        }
        debug("Cleanup completed");
    }
}

async function main() {
    debug(`Starting MCPHub Gateway...`);
    debug(`Using MCP Server URL: ${baseUrl}`);
    
    const gateway = new MCPHubGateway();

    try {
        await gateway.connect();
        
        process.stdin.on("data", (data) => gateway.processMessage(data));
        
        process.on('SIGINT', () => {
            debug("Shutting down MCPHub Gateway...");
            gateway.cleanup();
            process.exit(0);
        });
        
        process.on('SIGTERM', () => {
            debug("Shutting down MCPHub Gateway...");
            gateway.cleanup();
            process.exit(0);
        });
        
        debug("MCPHub Gateway is running");
    } catch (error) {
        debug(`Fatal error: ${(error as Error).message}`);
        debug(`Error stack: ${(error as Error).stack}`);
        process.exit(1);
    }
}

main();