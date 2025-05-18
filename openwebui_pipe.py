"""
title: Intelligent RAG Server Pipe
author: OpenHands
version: 0.1.0

This module defines a Pipe class that connects to the Intelligent RAG Server
"""

from typing import Optional, Callable, Awaitable
from pydantic import BaseModel, Field
import os
import time
import requests
import json
from urllib.parse import urljoin


def extract_event_info(event_emitter) -> tuple[Optional[str], Optional[str]]:
    if not event_emitter or not event_emitter.__closure__:
        return None, None
    for cell in event_emitter.__closure__:
        if isinstance(request_info := cell.cell_contents, dict):
            chat_id = request_info.get("chat_id")
            message_id = request_info.get("message_id")
            return chat_id, message_id
    return None, None


class Pipe:
    class Valves(BaseModel):
        server_url: str = Field(
            default="http://localhost:3000",
            description="URL of the Intelligent RAG Server"
        )
        project_id: str = Field(
            default="default",
            description="Project ID to query against in the RAG server"
        )
        thinking_depth: int = Field(
            default=2,
            description="Depth of thinking (1-4). Higher values use more sophisticated processing",
            ge=1,
            le=4
        )
        emit_interval: float = Field(
            default=2.0,
            description="Interval in seconds between status emissions"
        )
        enable_status_indicator: bool = Field(
            default=True,
            description="Enable or disable status indicator emissions"
        )

    def __init__(self):
        self.type = "pipe"
        self.id = "intelligent_rag_pipe"
        self.name = "Intelligent RAG Pipe"
        self.valves = self.Valves()
        self.last_emit_time = 0

    async def emit_status(
        self,
        __event_emitter__: Callable[[dict], Awaitable[None]],
        level: str,
        message: str,
        done: bool,
    ):
        current_time = time.time()
        if (
            __event_emitter__
            and self.valves.enable_status_indicator
            and (
                current_time - self.last_emit_time >= self.valves.emit_interval or done
            )
        ):
            await __event_emitter__(
                {
                    "type": "status",
                    "data": {
                        "status": "complete" if done else "in_progress",
                        "level": level,
                        "description": message,
                        "done": done,
                    },
                }
            )
            self.last_emit_time = current_time

    async def pipe(
        self,
        body: dict,
        __user__: Optional[dict] = None,
        __event_emitter__: Callable[[dict], Awaitable[None]] = None,
        __event_call__: Callable[[dict], Awaitable[dict]] = None,
    ) -> Optional[dict]:
        await self.emit_status(
            __event_emitter__, "info", "Calling Intelligent RAG Server...", False
        )
        chat_id, _ = extract_event_info(__event_emitter__)
        messages = body.get("messages", [])

        # Verify a message is available
        if messages:
            question = messages[-1]["content"]
            try:
                # Build context from previous messages
                context = []
                for msg in messages[:-1]:  # Exclude the last message (current question)
                    if msg["role"] in ["assistant", "user"]:
                        context.append(f"{msg['role']}: {msg['content']}")
                
                # Prepare the query
                headers = {
                    "Content-Type": "application/json"
                }
                payload = {
                    "projectId": self.valves.project_id,
                    "query": question,
                    "thinkingDepth": self.valves.thinking_depth,
                    "context": "\n".join(context) if context else None
                }

                # Call the RAG server
                query_url = urljoin(self.valves.server_url, "/api/query")
                await self.emit_status(
                    __event_emitter__, "info", "Processing query...", False
                )
                
                response = requests.post(query_url, json=payload, headers=headers)
                
                if response.status_code == 200:
                    rag_response = response.json()
                    answer = rag_response["answer"]
                    
                    # Include reasoning in a code block if available
                    if "log" in rag_response:
                        reasoning = json.dumps(rag_response["log"], indent=2)
                        answer = f"{answer}\n\n```json\nReasoning:\n{reasoning}\n```"
                else:
                    raise Exception(f"Error: {response.status_code} - {response.text}")

                # Set assistant message with RAG reply
                body["messages"].append({"role": "assistant", "content": answer})
                
                await self.emit_status(
                    __event_emitter__, "info", "Response generated successfully", True
                )
                return answer

            except Exception as e:
                error_msg = f"Error during RAG query: {str(e)}"
                await self.emit_status(
                    __event_emitter__,
                    "error",
                    error_msg,
                    True,
                )
                return {"error": error_msg}
        else:
            error_msg = "No messages found in the request body"
            await self.emit_status(
                __event_emitter__,
                "error",
                error_msg,
                True,
            )
            body["messages"].append(
                {
                    "role": "assistant",
                    "content": error_msg,
                }
            )
            return {"error": error_msg}