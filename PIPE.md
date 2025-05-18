# Intelligent RAG Server Pipe for Open WebUI

This Python module provides a pipe implementation that connects Open WebUI to the Intelligent RAG Server. It follows the same interface as the N8N pipe but is specifically designed to work with the RAG server's capabilities.

## Features

- Seamless integration with Open WebUI
- Support for conversation context
- Configurable thinking depth levels
- Progress status indicators
- Detailed reasoning logs
- Error handling and reporting

## Configuration

The pipe is configured through the `Valves` class with the following parameters:

```python
class Valves(BaseModel):
    server_url: str = "http://localhost:3000"  # RAG server URL
    project_id: str = "default"                # Project to query against
    thinking_depth: int = 2                    # Processing depth (1-4)
    emit_interval: float = 2.0                 # Status update interval
    enable_status_indicator: bool = True       # Enable/disable status updates
```

### Thinking Depth Levels

1. **Level 1**: Basic RAG with vector similarity
2. **Level 2**: RAG + Database relations
3. **Level 3**: RAG + DB + Web search
4. **Level 4**: Enhanced coverage with cross-validation

## Installation

1. Copy `openwebui_pipe.py` to your Open WebUI extensions directory
2. Configure the pipe in your Open WebUI settings

## Usage

1. Start the Intelligent RAG Server:
   ```bash
   cd intelligent-rag-server
   npm start
   ```

2. Configure the pipe in Open WebUI:
   ```python
   pipe = Pipe()
   pipe.valves.server_url = "http://localhost:3000"
   pipe.valves.project_id = "your_project"
   pipe.valves.thinking_depth = 2
   ```

3. The pipe will:
   - Send queries to the RAG server
   - Include conversation context
   - Show processing status
   - Return answers with reasoning logs

## Response Format

The pipe returns responses in this format:
```json
{
    "answer": "The main response text",
    "reasoning": {
        "query": "Original query",
        "steps": [
            "Step 1: Initial search",
            "Step 2: Context analysis",
            "..."
        ]
    }
}
```

## Error Handling

The pipe includes comprehensive error handling:
- Connection issues
- Invalid responses
- Missing messages
- Server errors

Each error is:
- Logged with details
- Reported through status updates
- Returned in a consistent format

## Development

To modify or extend the pipe:

1. Update the `Valves` class for new configuration options
2. Modify the `pipe` method for different processing
3. Add new status emissions as needed
4. Test thoroughly with different message formats

## Security Notes

- The pipe uses HTTP/HTTPS based on the server_url configuration
- No authentication is currently implemented (add if needed)
- All inputs are JSON-encoded for safety
- Error messages are sanitized

## Troubleshooting

1. **Connection Issues**
   - Verify the RAG server is running
   - Check the server_url configuration
   - Ensure network connectivity

2. **Invalid Responses**
   - Check project_id exists
   - Verify thinking_depth is valid (1-4)
   - Review server logs for details

3. **Performance Issues**
   - Lower the thinking_depth
   - Increase emit_interval
   - Check server resources