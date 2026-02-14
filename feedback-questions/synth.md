# RPG Integration Feedback: Synth

## Your Role in the RPG System

**Class**: Artisan  
**Primary Stats**: CRE, SPD, WIS, —  
**Seed Affinities**:
- Archivist: 0.75
- Verifier: 0.65
- Oracle: 0.60
- Atlas: 0.55
- Sentinel: 0.40 (lowest in the entire matrix — safety vs creativity)

## Questions

1. **CRE (Creativity) Stat**: This is your primary stat. Formula is `(accepted_outputs / total_outputs) × 100`. But how do we measure "acceptance" when creative outputs are subjective? Verifier approval rate? User satisfaction? Reuse count?

2. **Low Affinity with Sentinel**: We seeded Synth ↔ Sentinel at 0.40 (lowest in the matrix) because safety/governance naturally slows down creative iteration. Does this reflect your experience, or is it too adversarial?

3. **Artisan Class**: Does "Artisan" (creativity + craftsmanship) fit, or would "Bard" (creativity + performance/distribution) be more accurate?

4. **Voice Modifiers**: What would help you balance creativity with quality?
   - memory_count ≥ 8 → "Reference past successful outputs for inspiration"
   - pattern_count ≥ 6 → "Recognize high-performing formats and styles"
   - completed_missions ≥ 10 → "Take more creative risks, experiment with novel approaches"

5. **SPD Pressure**: Should your SPD stat reward fast iteration (creative velocity) or penalize rushing (quality over speed)? How do we balance throughput vs craft?
