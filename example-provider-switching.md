# AI Provider Switching Guide

This project now supports switching between OpenAI's direct API and the AI SDK for better flexibility and future-proofing.

## Environment Variables

### For OpenAI Provider (Default):
```bash
OPENAI_API_KEY=your_openai_api_key_here
AI_PROVIDER=openai
AI_MODEL=gpt-4o  # optional, defaults to gpt-4o
```

### For AI SDK Provider:
```bash
OPENAI_API_KEY=your_openai_api_key_here  # still needed for OpenAI models
AI_PROVIDER=ai-sdk
AI_MODEL=gpt-4o  # optional, defaults to gpt-4o
```

## How to Switch

1. **Update your .env file** with the desired `AI_PROVIDER` value:
   - `openai` = Uses OpenAI SDK directly (original implementation)
   - `ai-sdk` = Uses Vercel AI SDK (new implementation)

2. **Restart your application** for the changes to take effect.

## Benefits of AI SDK

- **Provider flexibility**: Easy to switch to other providers (Anthropic, Google, etc.) in future
- **Better streaming**: More robust streaming implementation
- **Modern API**: Cleaner, more intuitive interface
- **Better type safety**: Improved TypeScript support
- **Tool calling improvements**: Enhanced function calling capabilities

## Reverting Back

To revert to the original OpenAI implementation, simply set:
```bash
AI_PROVIDER=openai
```

## Testing Both Providers

You can easily test both implementations:

1. Start with OpenAI provider: `AI_PROVIDER=openai npm run dev`
2. Test your queries and observe behavior
3. Switch to AI SDK: `AI_PROVIDER=ai-sdk npm run dev`  
4. Test the same queries to compare functionality

Both providers should behave identically from a user perspective while using different underlying implementations.