"""
title: Intelligent RAG Pipe
author: OpenHands
version: 0.1.0

This module defines a Pipe class that utilizes the intelligent-rag-server
"""

from typing import Optional, Callable, Awaitable
from pydantic import BaseModel, Field
import time
import requests


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
            description="URL of the intelligent-rag-server"
        )
        project_id: str = Field(
            default="default",
            description="Project ID to query against"
        )
        thinking_depth: int = Field(
            default=2,
            description="Depth of thinking (1-4)",
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
            __event_emitter__, "info", "Querying intelligent RAG server...", False
        )
        chat_id, _ = extract_event_info(__event_emitter__)
        messages = body.get("messages", [])

        # Verify a message is available
        if messages:
            question = messages[-1]["content"]
            try:
                # Query the intelligent RAG server
                headers = {
                    "Content-Type": "application/json"
                }
                payload = {
                    "projectId": self.valves.project_id,
                    "query": question,
                    "thinkingDepth": self.valves.thinking_depth
                }
                response = requests.post(
                    f"{self.valves.server_url}/api/query",
                    json=payload,
                    headers=headers
                )
                
                if response.status_code == 200:
                    rag_response = response.json()
                    answer = rag_response.get("answer", "")
                    log = rag_response.get("log", "")
                    
                    # Add thinking process as system message if available
                    if log:
                        body["messages"].append({
                            "role": "system",
                            "content": f"Thinking process:\n{log}"
                        })
                    
                    # Add final answer as assistant message
                    body["messages"].append({
                        "role": "assistant",
                        "content": answer
                    })
                    
                else:
                    raise Exception(f"Error: {response.status_code} - {response.text}")

            except Exception as e:
                await self.emit_status(
                    __event_emitter__,
                    "error",
                    f"Error during RAG query: {str(e)}",
                    True,
                )
                return {"error": str(e)}
        else:
            await self.emit_status(
                __event_emitter__,
                "error",
                "No messages found in the request body",
                True,
            )
            body["messages"].append(
                {
                    "role": "assistant",
                    "content": "No messages found in the request body",
                }
            )

        await self.emit_status(__event_emitter__, "info", "Complete", True)
        return answer