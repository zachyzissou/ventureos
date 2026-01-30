# Article Recategorization Report
**Date:** 2025-01-28
**Task:** Phase 4 - Recategorize misplaced articles

## Summary
- **Total files moved:** 37
- **Personal content moved out of tech folders:** 28
- **Tech content moved out of General:** 9

## Phase 1: Initial Batch (14 files)

### Personal Content → Personal Folders
| From | To |
|------|-----|
| `Development/Unity/Storage tips for THCa - Development.md` | `Personal/Hobbies/Storage tips for THCa.md` |
| `Development/JavaScript/Stylish Hats for XL Heads - Development.md` | `Personal/Fashion/Stylish Hats for XL Heads.md` |
| `DevOps/Unraid/Stylish Hats for XL Heads.md` | `Personal/Fashion/Stylish Hats for XL Heads (2).md` |
| `Development/General/Salon vs Barbershop Haircuts.md` | `Personal/Grooming/Salon vs Barbershop Haircuts.md` |
| `DevOps/Unraid/Dog Collars for Seniors.md` | `Personal/Pets/Dog Collars for Seniors.md` |

### Tech Content → Tech Folders
| From | To |
|------|-----|
| `General/7DTD Modded Server Setup.md` | `DevOps/Docker/7DTD Modded Server Setup.md` |
| `General/AI Image Generation and Flux.md` | `AI/ImageGen/AI Image Generation and Flux.md` |
| `General/Advanced Flux1 Image Generation Guide.md` | `AI/ImageGen/Advanced Flux1 Image Generation Guide.md` |
| `General/Advanced tips SwarmUI SD 1.5.md` | `AI/ImageGen/Advanced tips SwarmUI SD 1.5.md` |
| `General/Fixing faces in SwarmUI.md` | `AI/ImageGen/Fixing faces in SwarmUI.md` |
| `General/Plex Library Management with Kometa.md` | `DevOps/Docker/Plex Library Management with Kometa.md` |
| `General/Unraid Container Management Guide.md` | `DevOps/Unraid/Unraid Container Management Guide.md` |
| `General/Food/Flux steps in SwarmUI.md` | `AI/ImageGen/Flux steps in SwarmUI.md` |
| `General/Food/Webpage Builders on Unraid.md` | `DevOps/Unraid/Webpage Builders on Unraid.md` |

## Phase 2: Deep Scan (9 files)
| From | To |
|------|-----|
| `DevOps/Docker/Storing Live Rosin Carts.md` | `Personal/Hobbies/Storing Live Rosin Carts.md` |
| `DevOps/Docker/Storage tips for THCa.md` | `Personal/Hobbies/Storage tips for THCa (2).md` |
| `Development/JavaScript/Dreads maintenance challenges.md` | `Personal/Grooming/Dreads maintenance challenges.md` |
| `Development/JavaScript/Cat Fan Anxiety Help.md` | `Personal/Pets/Cat Fan Anxiety Help.md` |
| `Development/JavaScript/Modern Men's Fashion Ideas.md` | `Personal/Fashion/Modern Men's Fashion Ideas.md` |
| `DevOps/Linux/Paint touch-up drying time.md` | `General/Home/Paint touch-up drying time.md` |
| `DevOps/Unraid/Removing adhesive safely.md` | `General/Home/Removing adhesive safely.md` |
| `DevOps/Linux/NFL Viewership Stats - DevOps.md` | `General/Entertainment/NFL Viewership Stats.md` |
| `DevOps/Docker/Outsourcing Dev Work India.md` | `General/Career/Outsourcing Dev Work India.md` |

## Phase 3: Title Pattern Matching (16 files)
| From | To |
|------|-----|
| `Development/General/Dishwasher not draining.md` | `General/Home/Dishwasher not draining.md` |
| `Development/General/Stopping foreclosure payments.md` | `General/Finance/Stopping foreclosure payments.md` |
| `DevOps/Linux/Cleaning cost estimate.md` | `General/Home/Cleaning cost estimate.md` |
| `AI/ImageGen/HOA foreclosure and mortgage.md` | `General/Finance/HOA foreclosure and mortgage.md` |
| `Development/General/Responding to Texas Lawsuit.md` | `General/Legal/Responding to Texas Lawsuit.md` |
| `Development/General/Texas Front License Plate Law.md` | `General/Legal/Texas Front License Plate Law.md` |
| `Development/JavaScript/Smoking Weed After Hair Plugs.md` | `Personal/Hobbies/Smoking Weed After Hair Plugs.md` |
| `DevOps/Docker/O2 Pen and Rosin Storage.md` | `Personal/Hobbies/O2 Pen and Rosin Storage.md` |
| `Development/Python/Outsourcing Dev Work India - Development.md` | `General/Career/Outsourcing Dev Work India (2).md` |
| `Development/Python/Resume Creation Help.md` | `General/Career/Resume Creation Help.md` |
| `DevOps/Docker/Job Recommendations for Server Expertise.md` | `General/Career/Job Recommendations for Server Expertise.md` |
| `AI/ImageGen/Resume Rewrite for VP Role - AI.md` | `General/Career/Resume Rewrite for VP Role.md` |
| `AI/LLM/Cover Letter Request - AI.md` | `General/Career/Cover Letter Request.md` |
| `DevOps/Unraid/Warped Tour 2000s Bands.md` | `General/Entertainment/Warped Tour 2000s Bands.md` |
| `AI/LLM/Album Art Request - AI.md` | `General/Entertainment/Album Art Request.md` |
| `DevOps/Unraid/Healthcare Industry Regulations 2024.md` | `General/Career/Healthcare Industry Regulations 2024.md` |

## New Folders Created
- `Personal/Hobbies`
- `Personal/Grooming`
- `Personal/Pets`
- `General/Home`
- `General/Career`
- `General/Finance`
- `General/Legal`

## Final File Counts
| Folder | Count |
|--------|-------|
| Development | 127 |
| DevOps | 474 |
| AI | 202 |
| General | 120 |
| Personal | 80 |
| **Total** | **1,003** |

## Notes
- All moved files had their `category:` frontmatter updated to match new location
- Initial keyword regex matched many false positives (tech files mentioning "stash", "dab", etc.)
- Switched to title-based pattern matching for accuracy
- Some files in General have incorrect domain/stack tags but correct folder placement (separate cleanup task)

## Methodology
1. Ran initial keyword scan → found ~500+ matches (many false positives)
2. Switched to title-based pattern matching for accuracy
3. Deep scan verified content before moving
4. Updated frontmatter category field for each moved file
5. Created destination folders as needed
