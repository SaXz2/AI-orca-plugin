## 1. Implementation
- [ ] 1.1 Add provider protocol field to settings schema (default OpenAI), persist/load.
- [ ] 1.2 Expose protocol selector in provider config UI; migrate existing providers to default OpenAI.
- [ ] 1.3 Update API call helpers (chat stream, multi-model, extraction/portrait) to build URL/body based on protocol.
- [ ] 1.4 Verify multi-model selection respects protocol per model/provider.
- [ ] 1.5 Manual test with OpenAI-style and Anthropic-style URLs to confirm no 404 due to wrong path.
