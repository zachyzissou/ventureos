# AI Hardware Roadmap - 2026-01-30

## Current Setup (Mac Studio M2 Ultra)
- **RAM:** 48GB unified memory
- **Status:** Active, running OpenClaw + local models
- **Models downloaded today:**
  - ✅ Qwen 2.5 32B (18.78 GB) - Smart daily driver
  - ✅ Dolphin 2.2 70B (38.87 GB) - Massive uncensored beast (just completed)
  - ⏳ WizardLM 30B Uncensored - Powerful unrestricted model
  - ⏳ Nous-Hermes-2-Mixtral-8x7B-DPO - Latest cutting-edge
  - ⏳ Qwen2.5-Coder-32B-Abliterated - Programming + uncensored

## Planned Upgrade #1: Mac Studio Refresh (Expected ~2 weeks)
- **Target:** 128GB-256GB unified memory
- **Potential chips:** M4 Ultra or M4 Extreme
- **What this enables:**
  - Multiple 70B models simultaneously
  - Qwen2.5 72B at full precision (Q8_0)
  - Llama 3.3 70B + other models loaded together
  - Massive context windows (1M+ tokens)
  - Future 200B+ models ready

## Planned Upgrade #2: Unraid Server (Coming Soon)
**Absolutely Insane Specs:**
- **CPU:** AMD Threadripper 3990X (64 cores/128 threads)
- **GPUs:** 
  - 2x RTX Pro 8000 with NVLink (48GB VRAM each = 96GB total)
  - 1x RTX 3090 Ti (24GB VRAM)
  - **Total VRAM: 120GB**
- **OS:** Unraid

**What this server enables:**
- 🔥 **Llama 405B** - Full precision, biggest open model
- 🔥 **Multiple 70B models simultaneously** - Different specialists
- 🔥 **Real-time model switching** - Instant swapping
- 🔥 **vLLM with ridiculous throughput** - Serve multiple users
- 🔥 **Full precision weights** - No quantization needed
- 🔥 **Mixture of Experts models** - Massive MoE architectures
- 🔥 **Multi-modal powerhouse** - Vision + text + code simultaneously

## Architecture Strategy
- **Mac Studio:** Daily driver, mobile workstation, OpenClaw host
- **Unraid Server:** AI research lab, model serving, heavy computation
- **Integration:** API gateway from Mac to server for heavy workloads
- **Tools:** vLLM for maximum performance, LM Studio for Mac models

## Model Collection Strategy
**Uncensored Arsenal (5 models downloading):**
1. Qwen 2.5 32B - Fast, reliable baseline
2. Dolphin 2.2 70B - Maximum capability, zero guardrails  
3. WizardLM 30B Uncensored - Powerful unrestricted
4. Nous-Hermes-2-Mixtral-8x7B-DPO - Cutting-edge tech
5. Qwen2.5-Coder-32B-Abliterated - Programming specialist

**Future server models:**
- Llama 405B (when available)
- Multiple 70B specialists loaded simultaneously
- Latest research models as they release

## Timeline
- **Now:** Local models on 48GB Mac Studio
- **~2 weeks:** Apple announcement hoped for Mac refresh
- **Q1 2026:** Unraid server deployment
- **Result:** Personal AI datacenter rivaling commercial offerings

## Notes
- Total local AI investment: Moving from consumer to enterprise-grade
- Capabilities will rival GPT-4/Claude but with zero restrictions
- Full control over models, data, and inference
- Ready for any future AI developments

This represents a transition from "AI user" to "AI infrastructure owner."