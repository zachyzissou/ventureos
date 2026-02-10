import json
import os
import re
import hashlib
import subprocess
from typing import Dict, List, Any
import logging
from datetime import datetime, timedelta

from src.config import ensure_state_file, get_config_path, get_log_path, load_config
from src.scoring.relevance import normalize_weights, resolve_draft_threshold, weighted_score
from src.scoring.approval_tiers import ApprovalTierManager
from src.state.store import load_state, update_state
from ledger import StantonTimesLedger

# Import new components
from ml_scorer import AdvancedContentScorer
from error_handler import StantonTimesErrorHandler
from permission_manager import StantonTimesPermissionManager
from system_monitor import StantonTimesSystemMonitor
from tweet_style_guide import TweetStyleGuide

class StantonTimesContentProcessor:
    def __init__(self, 
                 state_file_path=None, 
                 config_path=None):
        self.state_file_path = state_file_path or str(ensure_state_file())
        self.config_path = config_path or str(get_config_path())
        self.config = load_config()

        # Initialize advanced components
        self.ml_scorer = AdvancedContentScorer()
        self.error_handler = StantonTimesErrorHandler(self.config_path, get_log_path('content_processor_errors.log'))
        self.permission_manager = StantonTimesPermissionManager(config_path)
        self.system_monitor = StantonTimesSystemMonitor(config_path)
        self.ledger = StantonTimesLedger()
        self.style_guide = TweetStyleGuide()
        
        # Initialize approval tier manager
        auto_approve_config = (self.config.get("content_intelligence", {}) or {}).get("auto_approve", {})
        self.approval_tiers = ApprovalTierManager(auto_approve_config)

        # Load state and setup logging
        self.state = load_state(self.state_file_path)
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger(__name__)

    def _check_developer_credibility(self, content: Dict[str, Any]) -> float:
        """
        Assess the credibility of the content source
        """
        source_reliability = {
            "RSI Comm-Link": 0.95,
            "RSI Patch Notes": 0.98,
            "Star Citizen (YouTube)": 0.9,
            "StarCitizenTools News": 0.7,
            "Disco Lando (YouTube)": 0.85,
            "BoredGamer (YouTube)": 0.7,
            "Morphologis (YouTube)": 0.7,
            "Olli43 (YouTube)": 0.6,
            "RobertsSpaceInd": 0.9,
            "StarCitizen": 0.85,
            "discolando": 0.8,
            "BoredGamerUK": 0.7,
            "Morphologis": 0.7,
            "Olli43": 0.6,
            "starcitizenbot": 0.75,
            "TheRubenSaurus": 0.65
        }
        return source_reliability.get(content.get('source', ''), 0.5)

    def _estimate_community_interest(self, content: Dict[str, Any]) -> float:
        """
        Estimate potential community engagement
        """
        # Look for keywords that might indicate high interest
        high_interest_keywords = [
            'patch', 'patch notes', 'update', 'ptu', 'hotfix', 'roadmap',
            'alpha', 'beta', 'release', 'improvement', 'spectrum',
            'inside star citizen', 'star citizen live', 'behind the ships', 'tech talk',
            'ship', 'ships', 'vehicle', 'freighter', 'hauler', 'cargo', 'engineering',
            'server meshing', 'performance', 'optimization', 'invictus', 'citizencon',
            'iae', 'ship talk', 'introducing', 'new ship', 'squadron 42'
        ]

        text = " ".join(
            part for part in [
                content.get('topic'),
                content.get('title'),
                content.get('description')
            ]
            if part
        ).lower()
        matches = sum(1 for keyword in high_interest_keywords if keyword in text)
        score = min(matches * 0.2, 1.0)

        # Boost official/P0 sources slightly to avoid under-scoring high-signal updates
        priority = (content.get('priority') or '').upper()
        tier = (content.get('tier') or '').lower()
        source = content.get('source', '')
        official_sources = {
            'RSI Comm-Link',
            'RSI Patch Notes',
            'Star Citizen (YouTube)',
            'RobertsSpaceInd',
            'StarCitizen',
            'discolando'
        }
        if priority == 'P0' or tier == 'official' or source in official_sources:
            score = min(score + 0.2, 1.0)

        return score

    def _assess_information_novelty(self, content: Dict[str, Any]) -> float:
        """
        Check if the content offers new information
        """
        # Compare against previously seen content
        seen_ids = self.state.get('seen_tweet_ids', {})
        
        if content.get('id') in seen_ids.get(content.get('source', ''), []):
            return 0.1  # Low novelty if already seen
        
        return 0.8  # Assume novelty unless proven otherwise

    def _measure_technical_depth(self, content: Dict[str, Any]) -> float:
        """
        Assess the technical complexity of the content
        """
        technical_keywords = [
            'performance', 'optimization', 'networking',
            'server meshing', 'technical', 'implementation',
            'engineering', 'tech talk', 'latency', 'persistence',
            'rendering', 'physics', 'netcode'
        ]

        text = " ".join(
            part for part in [
                content.get('topic'),
                content.get('title'),
                content.get('description')
            ]
            if part
        ).lower()
        matches = sum(1 for keyword in technical_keywords if keyword in text)

        return min(matches * 0.25, 1.0)

    def _draft_mode(self) -> str:
        return (self.config.get("content_intelligence", {}) or {}).get("mode", "hybrid")

    def _content_settings(self) -> Dict[str, Any]:
        return (self.config.get("content_intelligence", {}) or {})

    def _daily_max_drafts(self) -> int:
        return int(self._content_settings().get("daily_max_drafts", 6))

    def _cluster_cooldown_hours(self) -> int:
        return int(self._content_settings().get("cluster_cooldown_hours", 12))

    def _cluster_window_days(self) -> int:
        return int(self._content_settings().get("cluster_window_days", 7))

    def _simhash_threshold(self) -> int:
        return int(self._content_settings().get("simhash_threshold", 8))

    def calculate_content_score(self, content: Dict[str, Any]) -> float:
        """
        Enhanced scoring using machine learning (or local logic if configured)
        """
        try:
            # Calculate traditional scoring
            weights = normalize_weights((self.state.get("content_intelligence", {}) or {}).get("scoring_weights"))

            traditional_scores = {
                "developer_credibility": self._check_developer_credibility(content),
                "community_engagement": self._estimate_community_interest(content),
                "information_novelty": self._assess_information_novelty(content),
                "technical_depth": self._measure_technical_depth(content)
            }

            traditional_score = weighted_score(traditional_scores, weights)

            mode = self._draft_mode()
            if mode in ("local", "logic"):
                return traditional_score

            # Use ML scorer for primary scoring
            ml_score = self.ml_scorer.score_content(content.get('description', ''))

            # Weighted combination
            final_score = (ml_score * 0.6) + (traditional_score * 0.4)

            return final_score
        except Exception as e:
            # Error handling with fallback
            error_details = self.error_handler.handle_error('content_scoring', e, content)

            if error_details['action'] == 'continue':
                # Fallback to traditional scoring
                weights = normalize_weights((self.state.get("content_intelligence", {}) or {}).get("scoring_weights"))
                traditional_scores = {
                    "developer_credibility": self._check_developer_credibility(content),
                    "community_engagement": self._estimate_community_interest(content),
                    "information_novelty": self._assess_information_novelty(content),
                    "technical_depth": self._measure_technical_depth(content),
                }
                return weighted_score(traditional_scores, weights)

            raise

    def _draft_threshold_for(self, content: Dict[str, Any]) -> float:
        return resolve_draft_threshold(
            content,
            self.config.get("content_intelligence", {}) or {},
            (self.state.get("content_intelligence", {}) or {}),
        )

    def process_content(self, content: Dict[str, Any], user_id: str = None) -> Dict[str, Any]:
        """
        Enhanced content processing with permission checks
        """
        # Optional user permission check
        if user_id and not self.permission_manager.check_permission(user_id, 'submit_draft'):
            self.logger.warning(f"Unauthorized draft submission attempt by {user_id}")
            return {
                "status": "unauthorized",
                "message": "You do not have permission to submit drafts"
            }

        try:
            # Score content
            score = self.calculate_content_score(content)

            # Check system health before processing
            health_report = self.system_monitor.generate_health_report()

            # Abort if system resources are critically low
            if health_report['system_resources']['cpu_usage'] > 90:
                return {
                    "status": "system_overload",
                    "message": "System resources too low to process content"
                }

            # Ledger ingest + clustering
            ledger_item = self.ledger.ingest_item(
                source=content.get('source', 'Unknown'),
                title=content.get('topic') or content.get('title') or 'Untitled',
                description=content.get('description', ''),
                url=content.get('link', ''),
                published_at=content.get('published_at') or content.get('timestamp'),
                priority=content.get('priority'),
                tier=content.get('tier'),
                cluster_window_days=self._cluster_window_days(),
                simhash_threshold=self._simhash_threshold(),
            )
            content['cluster_id'] = ledger_item.cluster_id
            content['ledger_item_id'] = ledger_item.item_id

            threshold = self._draft_threshold_for(content)
            should_draft = score >= threshold

            if not should_draft:
                self.logger.info(f"Content below threshold. Score: {score}")
                return {
                    "status": "below_threshold",
                    "score": score,
                    "threshold": threshold
                }

            # Enforce daily budget (P0 bypasses)
            priority = (content.get('priority') or '').upper()
            if priority != 'P0' and self.ledger.drafts_today() >= self._daily_max_drafts():
                return {
                    "status": "daily_quota_reached",
                    "score": score
                }

            # Cluster cooldown
            cluster = self.ledger.get_cluster(ledger_item.cluster_id)
            if cluster and cluster['last_draft_at']:
                last_draft = datetime.fromisoformat(cluster['last_draft_at'])
                if datetime.utcnow() - last_draft < timedelta(hours=self._cluster_cooldown_hours()):
                    return {
                        "status": "cluster_cooldown",
                        "score": score
                    }

            self.logger.info(f"Content draft generated. Score: {score}")

            # Generate tweet draft
            tweet_draft = self._generate_tweet_draft(content)
            thread_draft = self._generate_thread_draft(content)

            if thread_draft:
                first_tweet = thread_draft.split("\n\n---\n\n", 1)[0]
                if first_tweet:
                    tweet_draft = first_tweet

            # Avoid near-duplicate drafts
            if self.ledger.recent_draft_similar(tweet_draft):
                tweet_draft = f"{tweet_draft} (more soon)"

            # Check approval tier BEFORE posting for review
            approval_tier, tier_reason = self.approval_tiers.determine_tier(content, score)
            
            # Set draft status based on tier
            if approval_tier == "auto_approve":
                draft_status = "auto_approved"
                self.logger.info(f"Auto-approved: {tier_reason}")
            else:
                # Tier 2 (batch_digest) still goes to posted_for_review for now
                # The digest logic will be a separate enhancement
                draft_status = "posted_for_review"
                self.logger.info(f"Pending review: {tier_reason}")

            # Update state
            self._update_state(content, score, tweet_draft, thread_draft, draft_status, tier_reason)

            # Mark ledger
            self.ledger.mark_draft(ledger_item.item_id, ledger_item.cluster_id, tweet_draft)

            # Optional: Update ML model with successful draft
            if self._draft_mode() not in ("local", "logic"):
                self.ml_scorer.update_model([content.get('description', '')], [score])

            return {
                "status": "draft_ready",
                "score": score,
                "tweet_draft": tweet_draft,
                "thread_draft": thread_draft
            }

        except Exception as e:
            # Comprehensive error handling
            error_details = self.error_handler.handle_error('content_processing', e, content)

            # Log permission audit
            if user_id:
                self.permission_manager.audit_log(user_id, 'draft_submission', 'error')

            return {
                "status": "error",
                "error_details": error_details
            }

    def _primary_description(self, description: str) -> str:
        if not description:
            return ""
        primary = description.split('------------------------------------------')[0]
        primary = re.sub(r"\s+", " ", primary).strip()
        return primary

    def _first_sentence(self, text: str) -> str:
        if not text:
            return ""
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
        if not sentences:
            return text.strip()

        keyword_pattern = re.compile(r"(patch|alpha|ship|cargo|freighter|hauler|engineering|server|live|inside|update|event|performance)", re.I)
        keyword_hits = [s for s in sentences if keyword_pattern.search(s)]
        if keyword_hits:
            return keyword_hits[0]

        for sentence in sentences:
            if len(sentence) >= 40:
                return sentence

        return sentences[0]

    def _extract_ship_name(self, topic: str, description: str) -> str:
        for pattern in [r"Behind the Ships:\s*(.+)$", r"Introducing (?:the )?(.*)$"]:
            match = re.search(pattern, topic or "", re.I)
            if match:
                return match.group(1).strip()
        match = re.search(r"(RSI|Drake|Aegis|Anvil|Origin|Crusader|MISC|Argo|Kruger)\s+([A-Za-z0-9\- ]+)", topic or "")
        if match:
            name = f"{match.group(1)} {match.group(2)}".strip()
            stop_words = {"vehicle", "highlights", "preview", "overview", "trailer", "feature", "update"}
            words = []
            for word in name.split():
                if word.lower() in stop_words:
                    break
                words.append(word)
            return " ".join(words) if words else name
        return (topic or "").strip()

    def _extract_factoids(self, text: str, limit: int = 3) -> List[str]:
        if not text:
            return []
        snippet = text[:300]
        parts = re.split(r"[;\n•]", snippet)
        if len(parts) == 1:
            parts = re.split(r",", snippet)
        factoids = []
        for part in parts:
            if re.search(r"\b\d", part) or re.search(r"\bS\d\b", part) or 'scu' in part.lower():
                cleaned = re.sub(r"^\s*(and|plus|with)\s+", "", part, flags=re.I).strip()
                cleaned = re.sub(r"\s+", " ", cleaned).strip(" -–•")
                if ':' in cleaned:
                    prefix, suffix = cleaned.split(':', 1)
                    if re.search(r"\b\d", suffix) or 'scu' in suffix.lower():
                        cleaned = suffix.strip()
                if cleaned and cleaned not in factoids:
                    if len(cleaned) > 80:
                        cleaned = cleaned[:77].rsplit(" ", 1)[0] + "..."
                    factoids.append(cleaned)
            if len(factoids) >= limit:
                break
        return factoids

    def _infer_content_type(self, title: str, description: str) -> str:
        text = f"{title} {description}".lower()
        if any(k in text for k in ['patch notes', 'patch report', 'hotfix']):
            return 'patch'
        if 'inside star citizen' in text:
            return 'inside_sc'
        if 'star citizen live' in text or 'scl' in text or 'tech talk' in text:
            return 'live_show'
        if 'behind the ships' in text:
            return 'ship_feature'
        if 'introducing' in text or 'new ship' in text:
            return 'ship_reveal'
        if any(k in text for k in ['ship', 'ships', 'vehicle']) and any(
            maker in text for maker in ['rsi', 'drake', 'aegis', 'anvil', 'origin', 'crusader', 'misc', 'argo', 'kruger']
        ):
            return 'ship_reveal'
        if any(k in text for k in ['citizencon', 'invictus', 'iae', 'event']):
            return 'event'
        return 'general'

    def _build_hashtags(self, title: str, description: str) -> str:
        tags = self.style_guide.suggest_hashtags(f"{title} {description}")
        if '#StarCitizen' not in tags:
            tags = ['#StarCitizen'] + tags
        seen = set()
        deduped = []
        for tag in tags:
            if tag not in seen:
                deduped.append(tag)
                seen.add(tag)
        return ' '.join(deduped)

    def _thread_max_tweets(self) -> int:
        cfg = self._content_settings()
        soft_cap = int(cfg.get('thread_soft_cap', 5))
        hard_cap = int(cfg.get('thread_hard_cap', 10))
        max_tweets = int(cfg.get('thread_max_tweets', soft_cap))
        max_tweets = max(3, max_tweets)
        return max(1, min(max_tweets, hard_cap))

    def _fit_tweet(self, tweet: str, max_len: int = 275) -> str:
        if len(tweet) <= max_len:
            return tweet
        return tweet[:max_len - 3].rsplit(" ", 1)[0] + "..."

    def _headline_for_thread(self, title: str, content_type: str) -> str:
        if content_type == 'live_show':
            show_title = re.sub(r"^Star Citizen Live\s*\|\s*", "", title, flags=re.I).strip()
            return f"Star Citizen Live: {show_title}"
        if content_type == 'inside_sc':
            show_title = re.sub(r"^Inside Star Citizen\s*\|\s*", "", title, flags=re.I).strip()
            return f"Inside Star Citizen: {show_title}"
        return title

    def _fetch_transcript_content(self, url: str) -> str:
        if not url:
            return ""
        if "youtube.com" not in url and "youtu.be" not in url:
            return ""
        cmd = [
            "summarize",
            url,
            "--youtube",
            "auto",
            "--extract-only",
            "--json"
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        except Exception as e:
            self.logger.warning(f"Transcript fetch failed: {e}")
            return ""
        if result.returncode != 0:
            self.logger.warning(f"Transcript fetch returned {result.returncode}: {result.stderr.strip()}")
            return ""
        try:
            payload = json.loads(result.stdout)
        except json.JSONDecodeError:
            self.logger.warning("Transcript fetch returned invalid JSON")
            return ""
        return (payload.get("extracted", {}) or {}).get("content", "") or ""

    def _clean_transcript_text(self, text: str) -> str:
        if not text:
            return ""
        cleaned = text.replace("Transcript:", " ").replace(">>", " ")
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return cleaned

    def _clean_quote(self, text: str) -> str:
        if not text:
            return ""
        cleaned = re.sub(r"\b(uh|um|like|you know|sort of|kind of)\b", "", text, flags=re.I)
        cleaned = re.sub(r"\b(\w+)(\s+\1\b)+", r"\1", cleaned, flags=re.I)
        cleaned = re.sub(r"\b(\w+\s+\w+)\s+\1\b", r"\1", cleaned, flags=re.I)
        cleaned = re.sub(r"^It was like\s+", "", cleaned, flags=re.I)
        cleaned = cleaned.replace("New Babage", "New Babbage")
        cleaned = re.sub(r"\s*,\s*", ", ", cleaned)
        cleaned = cleaned.replace(", ,", ",")
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,.-")
        cleaned = re.sub(r"^It was\s+", "", cleaned, flags=re.I)
        cleaned = re.sub(r"^(and|but|so)\s+(so\s+)?", "", cleaned, flags=re.I)

        if " but " in cleaned:
            before, after = cleaned.split(" but ", 1)
            if re.search(r"\b\d", after):
                cleaned = after.strip()

        if len(cleaned) > 120 and " and so " in cleaned:
            cleaned = cleaned.split(" and so ", 1)[0].strip()

        if len(cleaned) > 180:
            for splitter in [" but ", " and ", " so "]:
                if splitter in cleaned:
                    cleaned = cleaned.split(splitter)[0].strip()
                    break

        if cleaned and cleaned[0].islower():
            cleaned = cleaned[0].upper() + cleaned[1:]

        if cleaned and cleaned[-1] not in ".!?":
            cleaned += "."

        return cleaned

    def _select_thread_quotes(self, transcript: str, max_quotes: int = 5) -> List[str]:
        if not transcript:
            return []
        text = self._clean_transcript_text(transcript)
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
        if not sentences:
            return []

        keyword_weights = {
            'server meshing': 3,
            'meshing': 1,
            'replication': 2,
            'crash isolation': 3,
            'crash': 2,
            'recovery': 2,
            'performance': 2,
            'stable': 2,
            'stability': 2,
            'player': 1,
            'caps': 2,
            'cap': 1,
            '400': 3,
            '600': 2,
            '700': 2,
            '800': 2,
            'pyro': 1,
            'solar system': 2,
            'systems': 1,
            'alpha': 1,
            '4.6': 2,
            '4.7': 2,
            'dynamic': 1,
            'static server': 2
        }

        topic_groups = [
            ['stable', 'stability', 'turbulence'],
            ['server recovery', 'replication', 'recover'],
            ['crash isolation'],
            ['caps', 'cap', '600', '700', '800'],
            ['400', 'party'],
            ['performance'],
            ['pyro', 'solar system', 'systems'],
            ['dynamic']
        ]

        picks: List[str] = []
        used = set()
        for keywords in topic_groups:
            best = None
            best_score = 0
            for sentence in sentences:
                lower = sentence.lower()
                if not any(k in lower for k in keywords):
                    continue
                cleaned = self._clean_quote(sentence)
                min_len = 30 if re.search(r"\b\d", cleaned) else 50
                if len(cleaned) < min_len:
                    continue
                if cleaned in used:
                    continue
                score = 0
                for keyword, weight in keyword_weights.items():
                    if keyword in lower:
                        score += weight
                if re.search(r"\b\d", lower):
                    score += 1
                if score > best_score:
                    best_score = score
                    best = cleaned
            if best:
                if len(best) > 220:
                    best = best[:217].rsplit(" ", 1)[0] + "..."
                used.add(best)
                picks.append(best)
            if len(picks) >= max_quotes:
                return picks[:max_quotes]

        scored = []
        for idx, sentence in enumerate(sentences):
            lower = sentence.lower()
            score = 0
            for keyword, weight in keyword_weights.items():
                if keyword in lower:
                    score += weight
            if score < 2:
                continue
            cleaned = self._clean_quote(sentence)
            min_len = 30 if re.search(r"\b\d", cleaned) else 50
            if len(cleaned) < min_len:
                continue
            if cleaned in used:
                continue
            if len(cleaned) > 220:
                cleaned = cleaned[:217].rsplit(" ", 1)[0] + "..."
            scored.append((score, idx, cleaned))

        scored.sort(key=lambda item: (-item[0], item[1]))
        for _, _, cleaned in scored:
            if len(picks) >= max_quotes:
                break
            if cleaned in used:
                continue
            used.add(cleaned)
            picks.append(cleaned)

        return picks[:max_quotes]

    def _generate_thread_draft(self, content: Dict[str, Any]) -> str:
        title = content.get('topic') or content.get('title') or 'Star Citizen Update'
        description = self._primary_description(content.get('description', ''))
        link = content.get('link', '')

        content_type = self._infer_content_type(title, description)
        if content_type not in ('live_show', 'inside_sc'):
            return ""

        transcript = self._fetch_transcript_content(link)
        max_quotes = max(self._thread_max_tweets() - 2, 1)
        quotes = self._select_thread_quotes(transcript, max_quotes=max_quotes)
        if not quotes:
            return ""

        headline = self._headline_for_thread(title, content_type)
        hashtags = self._build_hashtags(title, description)

        intro = f"🧵 {headline}\n\nKey takeaways + quotes. Thread ⬇️"
        tweets = [intro]
        for quote in quotes:
            tweets.append(f"“{quote}”")

        tail = f"🔗 {link}" if link else ""
        if hashtags:
            tail = f"{tail}\n\n{hashtags}" if tail else hashtags
        if tail:
            tweets.append(tail)

        total = len(tweets)
        numbered = []
        for idx, tweet in enumerate(tweets, start=1):
            cleaned = self.style_guide.clean_text(tweet)
            numbered.append(self._fit_tweet(f"{idx}/{total} {cleaned}", max_len=275))

        return "\n\n---\n\n".join(numbered)

    def _generate_tweet_draft(self, content: Dict[str, Any]) -> str:
        """
        Generate a draft tweet based on content
        """
        title = content.get('topic') or content.get('title') or 'Star Citizen Update'
        description = self._primary_description(content.get('description', ''))
        link = content.get('link', '')

        content_type = self._infer_content_type(title, description)
        summary = self._first_sentence(description)
        hashtags = self._build_hashtags(title, description)

        if content_type in ('ship_feature', 'ship_reveal'):
            ship = self._extract_ship_name(title, description) or title
            facts = self._extract_factoids(description)
            if facts:
                bullet_lines = "\n".join(f"• {fact}" for fact in facts)
                body = f"🚀 {ship}: first look\n\n{bullet_lines}"
            else:
                body = f"🚀 {ship}: first look"
                if summary:
                    body = f"{body}\n\n{summary}"
        elif content_type == 'live_show':
            show_title = re.sub(r"^Star Citizen Live\s*\|\s*", "", title, flags=re.I).strip()
            body = f"🛰️ Star Citizen Live: {show_title}"
            if summary:
                body = f"{body}\n\n{summary}"
        elif content_type == 'inside_sc':
            show_title = re.sub(r"^Inside Star Citizen\s*\|\s*", "", title, flags=re.I).strip()
            body = f"🛰️ Inside Star Citizen: {show_title}"
            if summary:
                body = f"{body}\n\n{summary}"
        elif content_type == 'patch':
            headline = re.sub(r"^Star Citizen\s*\|\s*", "", title, flags=re.I).strip()
            body = f"🔧 {headline}"
            if summary:
                body = f"{body}\n\n{summary}"
        elif content_type == 'event':
            headline = re.sub(r"^Star Citizen\s*\|\s*", "", title, flags=re.I).strip()
            body = f"📡 {headline}"
            if summary:
                body = f"{body}\n\n{summary}"
        else:
            body = f"🛰️ {title}"
            if summary:
                body = f"{body}\n\n{summary}"

        if link:
            body = f"{body}\n\n🔗 {link}"

        if hashtags:
            body = f"{body}\n\n{hashtags}"

        tweet = self.style_guide.clean_text(body)
        return self._fit_tweet(tweet)

    def _make_story_id(self, content: Dict[str, Any]) -> str:
        raw = f"{content.get('source')}|{content.get('topic')}|{content.get('id', '')}"
        return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]

    def _update_state(
        self, 
        content: Dict[str, Any], 
        score: float, 
        tweet_draft: str, 
        thread_draft: str = "",
        draft_status: str = "posted_for_review",
        tier_reason: str = ""
    ):
        """
        Update the state file with processed content
        """
        # Add to pending stories
        story = {
            "story_id": self._make_story_id(content),
            "topic": content.get('topic', 'Untitled'),
            "source": content.get('source', 'Unknown'),
            "description": content.get('description', ''),
            "link": content.get('link', ''),
            "priority": content.get('priority'),
            "tier": content.get('tier'),
            "cluster_id": content.get('cluster_id'),
            "ledger_item_id": content.get('ledger_item_id'),
            "content_score": score,
            "tweet_draft": tweet_draft,
            "draft_status": draft_status
        }

        if thread_draft:
            story["thread_draft"] = thread_draft
        
        if tier_reason:
            story["approval_tier_reason"] = tier_reason

        def _apply(state: Dict[str, Any]) -> Dict[str, Any]:
            state.setdefault("pending_stories", [])
            state["pending_stories"].append(story)
            return state

        self.state = update_state(self.state_file_path, _apply)

def main():
    processor = StantonTimesContentProcessor()
    
    # Example content with optional user ID
    test_content = {
        "source": "RobertsSpaceInd",
        "topic": "February 2026 Preview",
        "description": "Upcoming developments and community insights for February 2026 featuring server performance updates",
        "id": "2017722468195033462"
    }
    
    result = processor.process_content(test_content, user_id='956203522624462918')
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
